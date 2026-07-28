import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import {
  KesalahanAbsen, pastikanLogin, pastikanAdmin, ambilKonfigurasiServer,
  waktuLokal, keMenit, jarakMeter,
} from "@/server/absensi";
import { hashSerial, labelAman, serialValid } from "@/server/kartu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ketukan berulang dalam jendela ini dianggap satu kali. */
const DETIK_ANTI_GANDA = 20;

/**
 * Kartu magang.
 *
 * body.aksi = "daftar" | "cabut" | "absen" | "manual"
 *
 * Pencatatan lewat "absen" hanya boleh dilakukan admin atau pembimbing —
 * yaitu perangkat kios di kantor. Peserta tidak bisa memanggilnya dari
 * ponselnya sendiri, sehingga absen dari rumah tidak mungkin.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body?.aksi === "daftar") return await daftar(req, body);
    if (body?.aksi === "cabut") return await cabut(req, body);
    if (body?.aksi === "absen") return await absenKartu(req, body);
    if (body?.aksi === "manual") return await absenManual(req, body);

    throw new KesalahanAbsen("Aksi tidak dikenal.");
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/kartu]", e);
    return NextResponse.json({ pesan }, { status });
  }
}

/** Hapus pemetaan kartu lama milik seorang peserta. */
async function lepasKartuLama(uid: string) {
  const lama = await adminDb().collection("kartu").where("userId", "==", uid).get();
  if (lama.empty) return;
  const batch = adminDb().batch();
  lama.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ---------- Pastikan pemanggil adalah pembina ----------
async function pastikanPembina(req: Request): Promise<{ uid: string; nama: string }> {
  const uid = await pastikanLogin(req);
  const snap = await adminDb().doc(`users/${uid}`).get();
  const data = snap.exists ? (snap.data() as any) : null;
  if (!data || !["admin", "pembimbing"].includes(data.role)) {
    throw new KesalahanAbsen("Hanya admin atau pembimbing yang boleh menjalankan mesin absen.", 403);
  }
  return { uid, nama: data.name || "" };
}

// ---------- Daftarkan kartu ke peserta ----------
async function daftar(req: Request, d: any) {
  await pastikanAdmin(req);

  const target = String(d?.uid || "");
  const serial = String(d?.serial || "");
  if (!target) throw new KesalahanAbsen("Peserta belum dipilih.");
  if (!serialValid(serial)) throw new KesalahanAbsen("Nomor seri kartu tidak valid.");

  const hash = hashSerial(serial);

  const userSnap = await adminDb().doc(`users/${target}`).get();
  if (!userSnap.exists) throw new KesalahanAbsen("Peserta tidak ditemukan.", 404);

  // Satu kartu hanya boleh dimiliki satu orang
  const kartuRef = adminDb().doc(`kartu/${hash}`);
  const adaKartu = await kartuRef.get();
  if (adaKartu.exists && (adaKartu.data() as any).userId !== target) {
    const pemilik = await adminDb().doc(`users/${(adaKartu.data() as any).userId}`).get();
    throw new KesalahanAbsen(
      `Kartu ini sudah terdaftar atas nama ${
        pemilik.exists ? (pemilik.data() as any).name : "peserta lain"
      }. Cabut dulu dari sana.`,
      409
    );
  }

  // Lepas kartu lama milik peserta ini, satu orang satu kartu
  await lepasKartuLama(target);

  await kartuRef.set({
    userId: target,
    label: labelAman(serial),
    dibuatPada: FieldValue.serverTimestamp(),
  });

  await adminDb().doc(`users/${target}`).set(
    {
      kartuLabel: labelAman(serial),
      kartuTerdaftar: true,
      kartuDidaftarkanPada: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, label: labelAman(serial) });
}

// ---------- Cabut kartu ----------
async function cabut(req: Request, d: any) {
  await pastikanAdmin(req);
  const target = String(d?.uid || "");
  if (!target) throw new KesalahanAbsen("Peserta belum dipilih.");

  await lepasKartuLama(target);
  await adminDb().doc(`users/${target}`).set(
    { kartuLabel: FieldValue.delete(), kartuTerdaftar: false },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}

// ---------- Absen dengan menempelkan kartu ----------
async function absenKartu(req: Request, d: any) {
  const pembina = await pastikanPembina(req);
  const serial = String(d?.serial || "");
  if (!serialValid(serial)) throw new KesalahanAbsen("Nomor seri kartu tidak valid.");

  const kartuSnap = await adminDb().doc(`kartu/${hashSerial(serial)}`).get();
  if (!kartuSnap.exists) {
    throw new KesalahanAbsen("Kartu belum terdaftar. Daftarkan dulu lewat menu Kelola.", 404);
  }

  const pemilik = String((kartuSnap.data() as any).userId || "");
  const userSnap = await adminDb().doc(`users/${pemilik}`).get();
  if (!userSnap.exists) {
    throw new KesalahanAbsen("Pemilik kartu tidak ditemukan. Daftarkan ulang kartunya.", 404);
  }

  return await catat(pemilik, userSnap.data() as any, d, pembina, "kartu");
}

// ---------- Pencatatan manual (cadangan bila NFC bermasalah) ----------
async function absenManual(req: Request, d: any) {
  const pembina = await pastikanPembina(req);
  const target = String(d?.uid || "");
  if (!target) throw new KesalahanAbsen("Peserta belum dipilih.");

  const snap = await adminDb().doc(`users/${target}`).get();
  if (!snap.exists) throw new KesalahanAbsen("Peserta tidak ditemukan.", 404);

  return await catat(target, snap.data() as any, d, pembina, "manual");
}

// ---------- Inti pencatatan ----------
async function catat(
  uid: string,
  user: any,
  d: any,
  pembina: { uid: string; nama: string },
  sumber: "kartu" | "manual"
) {
  if (user.role !== "magang") {
    throw new KesalahanAbsen("Kartu ini bukan milik peserta magang.", 403);
  }
  if ((user.status || "aktif") !== "aktif") {
    throw new KesalahanAbsen(`${user.name || "Peserta"} berstatus tidak aktif.`, 403);
  }

  const cfg = await ambilKonfigurasiServer();
  const { tanggal, menit, jam } = waktuLokal(cfg.zonaWaktu);

  // --- Geofencing, bila diaktifkan ---
  const lat = typeof d?.lat === "number" ? d.lat : null;
  const lng = typeof d?.lng === "number" ? d.lng : null;
  let jarakKantor: number | null = null;

  if (cfg.geofenceAktif && cfg.kantorLat != null && cfg.kantorLng != null) {
    if (lat == null || lng == null) {
      throw new KesalahanAbsen("Lokasi perangkat tidak terdeteksi. Aktifkan izin lokasi.", 412);
    }
    jarakKantor = jarakMeter(lat, lng, cfg.kantorLat, cfg.kantorLng);
    if (jarakKantor > cfg.radiusMeter) {
      throw new KesalahanAbsen(
        `Perangkat berada ${Math.round(jarakKantor)} m dari kantor, di luar radius ${cfg.radiusMeter} m.`,
        403
      );
    }
  }

  const ref = adminDb().doc(`absensi/${uid}_${tanggal}`);
  const adaSnap = await ref.get();
  const ada = adaSnap.exists ? (adaSnap.data() as any) : null;

  // --- Anti ketuk ganda ---
  const terakhir = ada?.jamPulang || ada?.jamMasuk;
  if (terakhir?.toDate) {
    const selisih = (Date.now() - terakhir.toDate().getTime()) / 1000;
    if (selisih < DETIK_ANTI_GANDA) {
      return NextResponse.json({
        mode: ada.jamPulang ? "pulang" : "masuk",
        status: ada.status,
        jam: waktuLokal(cfg.zonaWaktu, terakhir.toDate()).jam,
        nama: user.name || "Peserta",
        foto: user.foto || null,
        diulang: true,
      });
    }
  }

  const dasar = {
    dicatatOleh: "server",
    sumber,
    operator: pembina.uid,
    namaOperator: pembina.nama,
  };

  let mode: "masuk" | "pulang";
  let status: string;

  if (!ada?.jamMasuk) {
    mode = "masuk";
    status = menit <= keMenit(cfg.jamMasuk) + cfg.toleransiMenit ? "hadir" : "terlambat";
    await ref.set(
      {
        ...dasar,
        userId: uid,
        tanggal,
        jamMasuk: FieldValue.serverTimestamp(),
        status,
        latitude: lat,
        longitude: lng,
        jarakKantorMasuk: jarakKantor == null ? null : Math.round(jarakKantor),
      },
      { merge: true }
    );
  } else if (!ada?.jamPulang) {
    const menitMasuk = ada.jamMasuk?.toDate
      ? waktuLokal(cfg.zonaWaktu, ada.jamMasuk.toDate()).menit
      : 0;
    if (cfg.minJedaMenit > 0 && menit - menitMasuk < cfg.minJedaMenit) {
      throw new KesalahanAbsen(
        `${user.name || "Peserta"} baru masuk. Absen pulang bisa dilakukan ${cfg.minJedaMenit} menit setelah masuk.`,
        412
      );
    }
    mode = "pulang";
    status = ada.status || "hadir";
    await ref.set(
      {
        ...dasar,
        jamPulang: FieldValue.serverTimestamp(),
        latitudePulang: lat,
        longitudePulang: lng,
        jarakKantorPulang: jarakKantor == null ? null : Math.round(jarakKantor),
      },
      { merge: true }
    );
  } else {
    throw new KesalahanAbsen(`${user.name || "Peserta"} sudah absen masuk dan pulang hari ini.`, 412);
  }

  return NextResponse.json({
    mode,
    status,
    jam,
    tanggal,
    nama: user.name || "Peserta",
    foto: user.foto || null,
    divisi: user.jurusan || user.kampus || "",
    diulang: false,
  });
}
