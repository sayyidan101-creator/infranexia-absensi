import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import {
  KesalahanAbsen, pastikanLogin, pastikanAdmin, ambilKonfigurasiServer,
  waktuLokal, keMenit, jarakMeter,
} from "@/server/absensi";
import { buatKode, hashKode, kodeValid, labelAman, normalkanKode } from "@/server/kartu";
import { catatJejak, namaUser } from "@/server/jejak";
import { dalamPeriode, labelPeriode } from "@/lib/periode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pindaian berulang dalam jendela ini dianggap satu kali. */
const DETIK_ANTI_GANDA = 20;

/**
 * Jarak minimum antara absen masuk dan absen pulang, dalam menit.
 *
 * Ini lantai yang tidak bisa diturunkan admin, dan alasannya kejadian nyata:
 * kartu yang disandarkan di depan kamera kios terus terbaca, kios mengirimnya
 * ulang tiap beberapa detik, dan begitu jendela anti-ganda lewat, kiriman
 * berikutnya dianggap absen pulang. Peserta tercatat bekerja dua puluh detik,
 * lalu absen pulangnya yang sungguhan ditolak karena harinya sudah "lengkap".
 *
 * Tidak ada orang yang pulang lima menit setelah datang. Kalau pindaian kedua
 * masuk dalam rentang ini, sebabnya hampir pasti "kartunya masih di situ" —
 * jadi diperlakukan sebagai pindaian berulang, bukan absen pulang.
 *
 * `minJedaMenit` dari Pengaturan Absensi tetap dihormati bila lebih besar,
 * dengan perlakuan berbeda: itu aturan yang admin sengaja pasang, jadi
 * pelanggarannya dijawab pesan yang menjelaskan, bukan didiamkan.
 */
const MIN_MENIT_PULANG = 5;

/**
 * Sejauh mana sebuah pindaian boleh dicatat mundur.
 *
 * Dipakai antrean offline di kios: kalau koneksi tersendat saat jam sibuk,
 * pindaiannya disimpan di perangkat lalu dikirim ulang. Yang dikirim adalah
 * **selisih waktu**, bukan jam perangkat — selisih dari satu jam yang sama
 * tetap benar meski jam itu sendiri disetel salah.
 */
const MAKS_MUNDUR_DETIK = 30 * 60;

/**
 * Kartu magang ber-QR.
 *
 * body.aksi = "terbitkan" | "cabut" | "cetak" | "absen" | "manual"
 *
 * Pencatatan lewat "absen" hanya boleh dilakukan admin atau pembimbing —
 * yaitu perangkat kios di kantor. Peserta tidak bisa memanggilnya dari
 * ponselnya sendiri, sehingga absen dari rumah tidak mungkin.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body?.aksi === "terbitkan") return await terbitkan(req, body);
    if (body?.aksi === "cabut") return await cabut(req, body);
    if (body?.aksi === "cetak") return await cetak(req, body);
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

// ---------- Terbitkan kartu QR untuk peserta ----------
async function terbitkan(req: Request, d: any) {
  const pelaku = await pastikanAdmin(req);

  const target = String(d?.uid || "");
  if (!target) throw new KesalahanAbsen("Peserta belum dipilih.");

  const userSnap = await adminDb().doc(`users/${target}`).get();
  if (!userSnap.exists) throw new KesalahanAbsen("Peserta tidak ditemukan.", 404);

  const user = userSnap.data() as any;
  if (user.role !== "magang") {
    throw new KesalahanAbsen("Kartu absen hanya untuk peserta magang.", 400);
  }

  // Kode dibuat ulang sampai dapat yang belum terpakai. Peluang tabrakan
  // sangat kecil, tapi menabrak kartu orang lain akibatnya fatal.
  let kode = "";
  let ref = adminDb().doc("kartu/x");
  for (let coba = 0; coba < 5; coba++) {
    kode = buatKode();
    ref = adminDb().doc(`kartu/${hashKode(kode)}`);
    if (!(await ref.get()).exists) break;
    kode = "";
  }
  if (!kode) throw new KesalahanAbsen("Gagal menerbitkan kode kartu. Coba lagi.", 500);

  // Satu orang satu kartu — yang lama langsung tidak berlaku
  await lepasKartuLama(target);

  await ref.set({
    userId: target,
    kode,
    label: labelAman(kode),
    dibuatPada: FieldValue.serverTimestamp(),
  });

  await adminDb().doc(`users/${target}`).set(
    {
      kartuLabel: labelAman(kode),
      kartuTerdaftar: true,
      kartuDidaftarkanPada: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await catatJejak({
    aksi: "kartu.terbit", pelaku, namaPelaku: await namaUser(pelaku),
    sasaran: target, namaSasaran: user.name || "",
    rincian: user.kartuTerdaftar ? "kartu lama otomatis dicabut" : "kartu pertama",
  });

  return NextResponse.json({ ok: true, kode, label: labelAman(kode) });
}

// ---------- Cabut kartu ----------
async function cabut(req: Request, d: any) {
  const pelaku = await pastikanAdmin(req);
  const target = String(d?.uid || "");
  if (!target) throw new KesalahanAbsen("Peserta belum dipilih.");

  await lepasKartuLama(target);
  await adminDb().doc(`users/${target}`).set(
    { kartuLabel: FieldValue.delete(), kartuTerdaftar: false },
    { merge: true }
  );

  await catatJejak({
    aksi: "kartu.cabut", pelaku, namaPelaku: await namaUser(pelaku),
    sasaran: target, namaSasaran: await namaUser(target),
  });

  return NextResponse.json({ ok: true });
}

// ---------- Ambil kode untuk dicetak ----------
/**
 * Kode aslinya disimpan supaya kartu yang rusak atau hilang bisa dicetak
 * ulang tanpa menerbitkan kode baru — kalau harus terbit ulang, kartu lama
 * yang mungkin masih dipegang peserta jadi mati percuma.
 */
async function cetak(req: Request, d: any) {
  await pastikanAdmin(req);

  const diminta: string[] = Array.isArray(d?.uids) ? d.uids.map(String) : [];
  const semua = diminta.length === 0;

  const snap = await adminDb().collection("kartu").get();
  const kartu = snap.docs
    .map((x) => x.data() as any)
    .filter((k) => semua || diminta.includes(String(k.userId)));

  if (kartu.length === 0) return NextResponse.json({ kartu: [] });

  const orang = await adminDb().getAll(
    ...kartu.map((k) => adminDb().doc(`users/${k.userId}`))
  );
  const peta = new Map(orang.filter((o) => o.exists).map((o) => [o.id, o.data() as any]));

  const hasil = kartu
    .filter((k) => peta.has(String(k.userId)))
    .map((k) => {
      const u = peta.get(String(k.userId))!;
      return {
        uid: String(k.userId),
        kode: String(k.kode || ""),
        nama: u.name || "",
        nim: u.nim || "",
        jurusan: u.jurusan || "",
        kampus: u.kampus || "",
        foto: u.foto || "",
        // Stempel Firestore tidak bisa dikirim apa adanya; diubah ke milidetik
        terbitMs: k.dibuatPada?.toDate ? k.dibuatPada.toDate().getTime() : 0,
      };
    })
    .filter((x) => x.kode)
    .sort((a, b) => a.nama.localeCompare(b.nama));

  return NextResponse.json({ kartu: hasil });
}

// ---------- Absen dengan memindai kartu ----------
async function absenKartu(req: Request, d: any) {
  const pembina = await pastikanPembina(req);
  const kode = normalkanKode(d?.kode);
  if (!kodeValid(kode)) {
    throw new KesalahanAbsen("Ini bukan kartu absen InfraNexia.", 400);
  }

  const kartuSnap = await adminDb().doc(`kartu/${hashKode(kode)}`).get();
  if (!kartuSnap.exists) {
    throw new KesalahanAbsen("Kartu ini sudah tidak berlaku. Terbitkan kartu baru lewat menu Kelola.", 404);
  }

  const pemilik = String((kartuSnap.data() as any).userId || "");
  const userSnap = await adminDb().doc(`users/${pemilik}`).get();
  if (!userSnap.exists) {
    throw new KesalahanAbsen("Pemilik kartu tidak ditemukan. Daftarkan ulang kartunya.", 404);
  }

  return await catat(pemilik, userSnap.data() as any, d, pembina, "kartu");
}

// ---------- Pencatatan manual (cadangan bila kartu tertinggal) ----------
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

  const mundur = Math.min(
    Math.max(0, Math.floor(Number(d?.mundurDetik) || 0)),
    MAKS_MUNDUR_DETIK
  );
  const saat = mundur > 0 ? new Date(Date.now() - mundur * 1000) : new Date();
  const { tanggal, menit, jam } = waktuLokal(cfg.zonaWaktu, saat);

  // --- Periode magang ---
  if (!dalamPeriode(user, tanggal)) {
    throw new KesalahanAbsen(
      user.selesaiPada && tanggal > user.selesaiPada
        ? `Masa magang ${user.name || "peserta ini"} sudah berakhir (${labelPeriode(user)}).`
        : `Masa magang ${user.name || "peserta ini"} belum dimulai (${labelPeriode(user)}).`,
      403
    );
  }

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
    const selisih = (saat.getTime() - terakhir.toDate().getTime()) / 1000;
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
    // Ditandai supaya terlihat mana yang masuk lewat antrean offline
    tertunda: mundur > 0,
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
        jamMasuk: mundur > 0 ? Timestamp.fromDate(saat) : FieldValue.serverTimestamp(),
        status,
        latitude: lat,
        longitude: lng,
        jarakKantorMasuk: jarakKantor == null ? null : Math.round(jarakKantor),
      },
      { merge: true }
    );
  } else if (!ada?.jamPulang) {
    // Dihitung dari stempel waktunya, bukan dari menit-ke-berapa dalam sehari,
    // supaya tetap benar untuk pindaian yang dikirim mundur dari antrean.
    const detikSejakMasuk = ada.jamMasuk?.toDate
      ? (saat.getTime() - ada.jamMasuk.toDate().getTime()) / 1000
      : Infinity;

    // Lantai yang tidak bisa diturunkan: kartu yang tertinggal di depan kamera
    // tidak boleh berakhir sebagai absen pulang. Dijawab seperti pindaian
    // berulang — operator tidak perlu tahu, karena tidak ada yang salah.
    if (detikSejakMasuk < MIN_MENIT_PULANG * 60) {
      return NextResponse.json({
        mode: "masuk",
        status: ada.status,
        jam: waktuLokal(cfg.zonaWaktu, ada.jamMasuk.toDate()).jam,
        nama: user.name || "Peserta",
        foto: user.foto || null,
        diulang: true,
      });
    }

    // Aturan yang admin pasang sendiri: dijelaskan, bukan didiamkan.
    if (cfg.minJedaMenit > 0 && detikSejakMasuk < cfg.minJedaMenit * 60) {
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
        jamPulang: mundur > 0 ? Timestamp.fromDate(saat) : FieldValue.serverTimestamp(),
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
    tertunda: mundur > 0,
    tanggal,
    nama: user.name || "Peserta",
    foto: user.foto || null,
    divisi: user.jurusan || user.kampus || "",
    diulang: false,
  });
}
