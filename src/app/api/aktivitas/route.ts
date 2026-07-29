import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import {
  KesalahanAbsen, pastikanLogin, ambilKonfigurasiServer, waktuLokal,
} from "@/server/absensi";
import { catatJejak } from "@/server/jejak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sampai berapa hari ke belakang catatan masih boleh ditulis atau diperbaiki. */
const MAKS_HARI_MUNDUR = 7;
const MAKS_KEGIATAN = 1500;
const MAKS_KENDALA = 500;
/** Foto sudah dikecilkan di browser; batas ini menjaga dari kiriman yang tidak wajar. */
const MAKS_FOTO_BYTE = 220_000;

/**
 * Catatan kegiatan harian peserta magang.
 *
 * body.aksi = "simpan" | "hapusFoto" | "periksa"
 *
 * Fotonya disimpan di koleksi terpisah `aktivitasFoto`, bukan menyatu dengan
 * catatannya. Alasannya sederhana: daftar kegiatan sebulan berisi 20-an entri,
 * dan kalau fotonya ikut menempel, membuka daftar itu berarti mengunduh
 * berpuluh megabita gambar yang belum tentu dilihat. Dipisah, daftarnya ringan
 * dan foto baru diambil saat satu catatan benar-benar dibuka.
 */
export async function POST(req: Request) {
  try {
    const uid = await pastikanLogin(req);
    const body = await req.json().catch(() => ({}));

    if (body?.aksi === "simpan") return await simpan(uid, body);
    if (body?.aksi === "hapusFoto") return await hapusFoto(uid, body);
    if (body?.aksi === "periksa") return await periksa(uid, body);

    throw new KesalahanAbsen("Aksi tidak dikenal.");
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/aktivitas]", e);
    return NextResponse.json({ pesan }, { status });
  }
}

function idCatatan(uid: string, tanggal: string) {
  return `${uid}_${tanggal}`;
}

/** Selisih hari antara dua tanggal YYYY-MM-DD. */
function selisihHari(dari: string, sampai: string): number {
  const a = new Date(dari + "T00:00:00Z").getTime();
  const b = new Date(sampai + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

// ---------- Peserta menulis kegiatannya ----------
async function simpan(uid: string, d: any) {
  const snapUser = await adminDb().doc(`users/${uid}`).get();
  if (!snapUser.exists) throw new KesalahanAbsen("Profil tidak ditemukan.", 403);
  const user = snapUser.data() as any;
  if (user.role !== "magang") {
    throw new KesalahanAbsen("Hanya peserta magang yang mengisi catatan kegiatan.", 403);
  }

  const cfg = await ambilKonfigurasiServer();
  const { tanggal: hariIni } = waktuLokal(cfg.zonaWaktu);
  const tanggal = String(d?.tanggal || hariIni);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    throw new KesalahanAbsen("Format tanggal tidak valid.");
  }

  const jarak = selisihHari(tanggal, hariIni);
  if (jarak < 0) throw new KesalahanAbsen("Belum bisa menulis catatan untuk tanggal yang belum tiba.");
  if (jarak > MAKS_HARI_MUNDUR) {
    // Batas ini yang membuat logbook bermakna. Tanpanya, catatan sebulan bisa
    // dikarang dalam satu malam di minggu terakhir — persis kebiasaan yang
    // membuat logbook kehilangan gunanya.
    throw new KesalahanAbsen(
      `Catatan hanya bisa ditulis untuk ${MAKS_HARI_MUNDUR} hari terakhir. Tanggal ini sudah lewat ${jarak} hari.`,
      412
    );
  }

  const kegiatan = String(d?.kegiatan || "").trim();
  if (kegiatan.length < 10) throw new KesalahanAbsen("Uraian kegiatan minimal 10 karakter.");
  if (kegiatan.length > MAKS_KEGIATAN) {
    throw new KesalahanAbsen(`Uraian kegiatan maksimal ${MAKS_KEGIATAN} karakter.`);
  }
  const kendala = String(d?.kendala || "").trim().slice(0, MAKS_KENDALA);

  const ref = adminDb().doc(`aktivitas/${idCatatan(uid, tanggal)}`);
  const ada = await ref.get();
  if (ada.exists && (ada.data() as any).status === "diperiksa") {
    throw new KesalahanAbsen(
      "Catatan ini sudah diperiksa pembimbing dan tidak bisa diubah lagi.",
      409
    );
  }

  // --- Foto (opsional), disimpan terpisah ---
  const foto = typeof d?.foto === "string" ? d.foto : "";
  let adaFoto = ada.exists ? !!(ada.data() as any).adaFoto : false;

  if (foto) {
    if (!foto.startsWith("data:image/")) {
      throw new KesalahanAbsen("Berkas foto tidak dikenali.");
    }
    if (foto.length > MAKS_FOTO_BYTE) {
      throw new KesalahanAbsen("Foto terlalu besar. Coba ambil ulang dengan kualitas lebih rendah.");
    }
    await adminDb().doc(`aktivitasFoto/${idCatatan(uid, tanggal)}`).set({
      userId: uid,
      tanggal,
      foto,
      diperbaruiPada: FieldValue.serverTimestamp(),
    });
    adaFoto = true;
  }

  await ref.set(
    {
      userId: uid,
      nama: user.name || "",
      tanggal,
      kegiatan,
      kendala,
      adaFoto,
      status: "dikirim",
      // Catatan pembimbing sengaja tidak disentuh di sini — memperbaiki
      // uraian tidak boleh menghapus umpan balik yang sudah diberikan.
      dibuatPada: ada.exists ? (ada.data() as any).dibuatPada : FieldValue.serverTimestamp(),
      diperbaruiPada: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, tanggal, adaFoto });
}

// ---------- Peserta menghapus fotonya ----------
async function hapusFoto(uid: string, d: any) {
  const tanggal = String(d?.tanggal || "");
  if (!tanggal) throw new KesalahanAbsen("Tanggal wajib diisi.");

  const ref = adminDb().doc(`aktivitas/${idCatatan(uid, tanggal)}`);
  const ada = await ref.get();
  if (!ada.exists) throw new KesalahanAbsen("Catatan tidak ditemukan.", 404);
  if ((ada.data() as any).status === "diperiksa") {
    throw new KesalahanAbsen("Catatan ini sudah diperiksa dan tidak bisa diubah.", 409);
  }

  await adminDb().doc(`aktivitasFoto/${idCatatan(uid, tanggal)}`).delete();
  await ref.set({ adaFoto: false, diperbaruiPada: FieldValue.serverTimestamp() }, { merge: true });

  return NextResponse.json({ ok: true });
}

// ---------- Pembimbing memeriksa ----------
async function periksa(uid: string, d: any) {
  const snapPembina = await adminDb().doc(`users/${uid}`).get();
  const role = snapPembina.exists ? (snapPembina.data() as any).role : null;
  if (!["admin", "pembimbing"].includes(role)) {
    throw new KesalahanAbsen("Hanya admin atau pembimbing yang memeriksa catatan.", 403);
  }

  const target = String(d?.uid || "");
  const tanggal = String(d?.tanggal || "");
  if (!target || !tanggal) throw new KesalahanAbsen("Peserta dan tanggal wajib diisi.");

  const ref = adminDb().doc(`aktivitas/${idCatatan(target, tanggal)}`);
  const ada = await ref.get();
  if (!ada.exists) throw new KesalahanAbsen("Catatan tidak ditemukan.", 404);

  const catatan = String(d?.catatan || "").trim().slice(0, 500);
  // Pemeriksaan bisa dicabut kembali, misalnya kalau pembimbing salah tekan
  const tandai = d?.batal ? "dikirim" : "diperiksa";

  await ref.set(
    {
      status: tandai,
      catatanPembimbing: catatan,
      diperiksaOleh: tandai === "diperiksa" ? uid : "",
      namaPemeriksa: tandai === "diperiksa" ? (snapPembina.data() as any).name || "" : "",
      diperiksaPada: tandai === "diperiksa" ? FieldValue.serverTimestamp() : null,
    },
    { merge: true }
  );

  if (tandai === "diperiksa") {
    await catatJejak({
      aksi: "kegiatan.periksa",
      pelaku: uid,
      namaPelaku: (snapPembina.data() as any).name || "",
      sasaran: target,
      namaSasaran: (ada.data() as any).nama || "",
      rincian: `catatan kegiatan ${tanggal}`,
    });
  }

  return NextResponse.json({ ok: true, status: tandai });
}
