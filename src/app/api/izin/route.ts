import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import {
  KesalahanAbsen, pastikanLogin, ambilKonfigurasiServer, waktuLokal,
} from "@/server/absensi";
import { catatJejak } from "@/server/jejak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JENIS = ["izin", "sakit"] as const;
const MAKS_HARI = 30;

/** Foto sudah dikecilkan di browser; batas ini menjaga dari kiriman tak wajar. */
const MAKS_BUKTI_BYTE = 260_000;

/**
 * Mulai berapa hari sakit surat dokter menjadi wajib.
 *
 * Sakit sehari tidak diminta surat: menyuruh orang demam pergi ke klinik demi
 * selembar kertas lebih menyusahkan daripada risiko yang ditutupnya. Dua hari
 * ke atas sudah cukup panjang untuk perlu keterangan pihak ketiga, dan itu
 * pula yang lazim diminta institusi.
 */
const WAJIB_SURAT_SEJAK_HARI = 2;

/**
 * Pengajuan dan pemrosesan izin/sakit.
 *
 * body.aksi = "ajukan" | "lampirkan" | "hapusBukti" | "proses" | "batal"
 *
 * Saat disetujui, sistem sekaligus menuliskan catatan absensi untuk setiap
 * tanggal dalam rentang. Itu sebabnya penulisannya harus lewat server:
 * koleksi absensi tertutup dari browser.
 *
 * Foto surat dokter disimpan di koleksi terpisah `izinBukti`, tidak menempel
 * pada dokumen pengajuannya. Daftar izin dibaca utuh setiap kali halaman
 * dibuka — kalau fotonya ikut, membuka daftar berisi tiga puluh pengajuan
 * berarti mengunduh berpuluh megabita gambar yang belum tentu dilihat.
 */
export async function POST(req: Request) {
  try {
    const uid = await pastikanLogin(req);
    const body = await req.json().catch(() => ({}));

    if (body?.aksi === "ajukan") return await ajukan(uid, body);
    if (body?.aksi === "lampirkan") return await lampirkan(uid, body);
    if (body?.aksi === "hapusBukti") return await hapusBukti(uid, body);
    if (body?.aksi === "proses") return await proses(uid, body);
    if (body?.aksi === "batal") return await batal(uid, body);

    throw new KesalahanAbsen("Aksi tidak dikenal.");
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/izin]", e);
    return NextResponse.json({ pesan }, { status });
  }
}

// ---------- Daftar tanggal dalam rentang ----------
function rentangTanggal(mulai: string, selesai: string): string[] {
  const a = new Date(mulai + "T00:00:00Z");
  const b = new Date(selesai + "T00:00:00Z");
  if (isNaN(a.getTime()) || isNaN(b.getTime())) {
    throw new KesalahanAbsen("Format tanggal tidak valid.");
  }
  if (b < a) throw new KesalahanAbsen("Tanggal selesai lebih awal dari tanggal mulai.");

  const keluar: string[] = [];
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    keluar.push(d.toISOString().slice(0, 10));
    if (keluar.length > MAKS_HARI) {
      throw new KesalahanAbsen(`Pengajuan maksimal ${MAKS_HARI} hari sekaligus.`);
    }
  }
  return keluar;
}

// ---------- Bukti surat dokter ----------

/** Terima hanya gambar, dan hanya yang seukuran wajar. */
function periksaBukti(nilai: unknown): string {
  const bukti = typeof nilai === "string" ? nilai.trim() : "";
  if (!bukti) return "";
  if (!bukti.startsWith("data:image/")) {
    throw new KesalahanAbsen("Bukti harus berupa foto. Berkas PDF belum didukung.");
  }
  if (bukti.length > MAKS_BUKTI_BYTE) {
    throw new KesalahanAbsen(
      "Foto surat terlalu besar. Ambil ulang dengan kualitas lebih rendah."
    );
  }
  return bukti;
}

/**
 * Apakah pengajuan ini menuntut surat dokter.
 *
 * Diletakkan di server, bukan hanya di tombol, karena aturan yang cuma hidup
 * di antarmuka bisa dilewati siapa pun yang memanggil API-nya langsung.
 */
function wajibSurat(jenis: string, jumlahHari: number): boolean {
  return jenis === "sakit" && jumlahHari >= WAJIB_SURAT_SEJAK_HARI;
}

async function simpanBukti(izinId: string, pemilik: string, bukti: string) {
  await adminDb().doc(`izinBukti/${izinId}`).set({
    izinId,
    userId: pemilik,
    foto: bukti,
    diunggahPada: FieldValue.serverTimestamp(),
  });
}

// ---------- Ajukan ----------
async function ajukan(uid: string, d: any) {
  const jenis = String(d?.jenis || "");
  if (!JENIS.includes(jenis as any)) throw new KesalahanAbsen("Jenis harus izin atau sakit.");

  const alasan = String(d?.alasan || "").trim();
  if (alasan.length < 5) throw new KesalahanAbsen("Alasan minimal 5 karakter.");
  if (alasan.length > 500) throw new KesalahanAbsen("Alasan maksimal 500 karakter.");

  const mulai = String(d?.tanggalMulai || "");
  const selesai = String(d?.tanggalSelesai || mulai);
  const tanggal = rentangTanggal(mulai, selesai);

  const userSnap = await adminDb().doc(`users/${uid}`).get();
  if (!userSnap.exists) throw new KesalahanAbsen("Profil tidak ditemukan.", 403);
  const user = userSnap.data() as any;
  if (user.role !== "magang") {
    throw new KesalahanAbsen("Hanya peserta magang yang mengajukan izin.", 403);
  }
  if ((user.status || "aktif") !== "aktif") {
    throw new KesalahanAbsen("Akun kamu tidak aktif. Hubungi admin.", 403);
  }

  // Tolak bila sudah ada pengajuan menunggu/disetujui yang tanggalnya bertabrakan
  const adaSnap = await adminDb()
    .collection("izin")
    .where("userId", "==", uid)
    .where("status", "in", ["menunggu", "disetujui"])
    .get();

  for (const dok of adaSnap.docs) {
    const p = dok.data() as any;
    const tabrakan = (p.tanggal || []).some((t: string) => tanggal.includes(t));
    if (tabrakan) {
      throw new KesalahanAbsen(
        "Sudah ada pengajuan pada tanggal yang sama. Batalkan dulu pengajuan lama.",
        409
      );
    }
  }

  const bukti = periksaBukti(d?.bukti);
  if (!bukti && wajibSurat(jenis, tanggal.length)) {
    throw new KesalahanAbsen(
      `Sakit ${tanggal.length} hari wajib melampirkan foto surat dokter.`,
      412
    );
  }

  // Ref dibuat lebih dulu supaya foto dan pengajuannya memakai id yang sama
  const ref = adminDb().collection("izin").doc();
  if (bukti) await simpanBukti(ref.id, uid, bukti);

  await ref.set({
    userId: uid,
    nama: user.name || "Pengguna",
    jenis,
    alasan,
    tanggalMulai: tanggal[0],
    tanggalSelesai: tanggal[tanggal.length - 1],
    tanggal,
    jumlahHari: tanggal.length,
    adaBukti: !!bukti,
    status: "menunggu",
    diajukanPada: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id, jumlahHari: tanggal.length, adaBukti: !!bukti });
}

// ---------- Lampirkan susulan ----------

/**
 * Menambah atau mengganti surat selama pengajuan belum diputus.
 *
 * Tanpa ini, peserta yang lupa melampirkan harus membatalkan lalu mengajukan
 * ulang — dan pembatalan menghapus riwayatnya, sehingga pembimbing kehilangan
 * jejak bahwa pengajuan itu pernah ada.
 */
async function lampirkan(uid: string, d: any) {
  const { ref, izin } = await miliknyaDanMenunggu(uid, d);
  const bukti = periksaBukti(d?.bukti);
  if (!bukti) throw new KesalahanAbsen("Tidak ada foto yang dikirim.");

  await simpanBukti(ref.id, izin.userId, bukti);
  await ref.set({ adaBukti: true }, { merge: true });

  return NextResponse.json({ ok: true, adaBukti: true });
}

// ---------- Hapus bukti ----------
async function hapusBukti(uid: string, d: any) {
  const { ref, izin } = await miliknyaDanMenunggu(uid, d);
  if (wajibSurat(izin.jenis, izin.jumlahHari || 0)) {
    throw new KesalahanAbsen(
      "Surat dokter wajib untuk pengajuan ini. Ganti fotonya, jangan dihapus.",
      412
    );
  }

  await adminDb().doc(`izinBukti/${ref.id}`).delete();
  await ref.set({ adaBukti: false }, { merge: true });

  return NextResponse.json({ ok: true, adaBukti: false });
}

/** Pengajuan milik pemanggil yang statusnya masih menunggu. */
async function miliknyaDanMenunggu(uid: string, d: any) {
  const id = String(d?.id || "");
  if (!id) throw new KesalahanAbsen("ID pengajuan wajib diisi.");

  const ref = adminDb().doc(`izin/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new KesalahanAbsen("Pengajuan tidak ditemukan.", 404);
  const izin = snap.data() as any;

  if (izin.userId !== uid) throw new KesalahanAbsen("Ini bukan pengajuanmu.", 403);
  if (izin.status !== "menunggu") {
    throw new KesalahanAbsen("Pengajuan yang sudah diproses tidak bisa diubah.", 409);
  }
  return { ref, izin };
}

// ---------- Proses (setujui / tolak) ----------
async function proses(uid: string, d: any) {
  const pembina = await adminDb().doc(`users/${uid}`).get();
  const role = pembina.exists ? (pembina.data() as any).role : null;
  if (!["admin", "pembimbing"].includes(role)) {
    throw new KesalahanAbsen("Hanya admin atau pembimbing yang memproses izin.", 403);
  }

  const id = String(d?.id || "");
  const keputusan = String(d?.keputusan || "");
  if (!id) throw new KesalahanAbsen("ID pengajuan wajib diisi.");
  if (!["disetujui", "ditolak"].includes(keputusan)) {
    throw new KesalahanAbsen("Keputusan harus disetujui atau ditolak.");
  }

  const ref = adminDb().doc(`izin/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new KesalahanAbsen("Pengajuan tidak ditemukan.", 404);
  const izin = snap.data() as any;
  if (izin.status !== "menunggu") {
    throw new KesalahanAbsen(`Pengajuan ini sudah ${izin.status}.`, 409);
  }

  const cfg = await ambilKonfigurasiServer();
  const { tanggal: hariIni } = waktuLokal(cfg.zonaWaktu);

  await ref.set(
    {
      status: keputusan,
      catatan: String(d?.catatan || "").slice(0, 300),
      diprosesOleh: uid,
      namaPemroses: (pembina.data() as any).name || "",
      diprosesPada: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let dicatat = 0;
  if (keputusan === "disetujui") {
    // Tulis catatan absensi untuk tiap tanggal, tanpa menimpa kehadiran nyata
    const batch = adminDb().batch();
    for (const t of izin.tanggal || []) {
      const aRef = adminDb().doc(`absensi/${izin.userId}_${t}`);
      const aSnap = await aRef.get();
      if (aSnap.exists && (aSnap.data() as any).jamMasuk) continue; // sudah absen betulan
      batch.set(
        aRef,
        {
          userId: izin.userId,
          tanggal: t,
          status: izin.jenis,
          sumber: "izin",
          izinId: id,
          dicatatOleh: "server",
          diperbaruiPada: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      dicatat++;
    }
    await batch.commit();
  }

  await catatJejak({
    aksi: keputusan === "disetujui" ? "izin.setujui" : "izin.tolak",
    pelaku: uid,
    namaPelaku: (pembina.data() as any).name || "",
    sasaran: izin.userId,
    namaSasaran: izin.nama || "",
    rincian:
      `${izin.jenis} ${izin.tanggalMulai}–${izin.tanggalSelesai} (${izin.jumlahHari} hari)` +
      (izin.jenis === "sakit" ? (izin.adaBukti ? ", ada surat dokter" : ", tanpa surat") : ""),
  });

  return NextResponse.json({ ok: true, keputusan, dicatat, hariIni });
}

// ---------- Batalkan pengajuan sendiri ----------
async function batal(uid: string, d: any) {
  const { ref } = await miliknyaDanMenunggu(uid, d);

  // Fotonya ikut dibuang. Kalau ditinggal, dokumen surat dokter menumpuk tanpa
  // pemilik — dan itu data kesehatan orang, bukan sisa berkas biasa.
  await adminDb().doc(`izinBukti/${ref.id}`).delete();
  await ref.delete();
  return NextResponse.json({ ok: true });
}
