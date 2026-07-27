import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import {
  KesalahanAbsen, pastikanLogin, ambilKonfigurasiServer, waktuLokal, keMenit,
  jarakEuclid, jarakMeter, sidikJari, validasiDescriptor,
} from "@/server/absensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Satu-satunya pintu pencatatan absensi.
 * Server yang menentukan ini absen masuk atau pulang, jam berapa,
 * dan statusnya apa — bukan perangkat pengguna.
 */
export async function POST(req: Request) {
  try {
    const uid = await pastikanLogin(req);
    const body = await req.json().catch(() => ({}));
    const descriptor = validasiDescriptor(body?.descriptor);
    const cfg = await ambilKonfigurasiServer();

    // --- Pastikan akun berhak & masih aktif ---
    const userSnap = await adminDb().doc(`users/${uid}`).get();
    if (!userSnap.exists) throw new KesalahanAbsen("Profil tidak ditemukan.", 403);
    const user = userSnap.data() as any;
    if (user.role !== "magang") {
      throw new KesalahanAbsen("Hanya peserta magang yang melakukan absensi.", 403);
    }
    if ((user.status || "aktif") !== "aktif") {
      throw new KesalahanAbsen("Akun kamu tidak aktif. Hubungi admin.", 403);
    }

    // --- Cocokkan wajah di server ---
    const wajahSnap = await adminDb().doc(`faceData/${uid}`).get();
    if (!wajahSnap.exists) throw new KesalahanAbsen("Kamu belum mendaftarkan wajah.", 412);
    const wajah = wajahSnap.data() as any;
    const tersimpan: number[][] = wajah.descriptors || [];
    if (tersimpan.length === 0) {
      throw new KesalahanAbsen("Data wajah kosong. Silakan daftar ulang.", 412);
    }

    let jarakTerbaik = Infinity;
    for (const d of tersimpan) {
      if (!Array.isArray(d) || d.length !== 128) continue;
      const j = jarakEuclid(descriptor, d);
      if (j < jarakTerbaik) jarakTerbaik = j;
    }
    if (jarakTerbaik > cfg.faceThreshold) {
      throw new KesalahanAbsen(
        `Wajah tidak cocok (skor ${jarakTerbaik.toFixed(3)}). Pastikan pencahayaan cukup lalu coba lagi.`,
        403
      );
    }

    // --- Tolak pengiriman ulang descriptor yang sama persis ---
    const sidik = sidikJari(descriptor);
    const riwayatSidik: string[] = wajah.sidikTerakhir || [];
    if (riwayatSidik.includes(sidik)) {
      throw new KesalahanAbsen(
        "Verifikasi gagal. Silakan ulangi pemindaian wajah secara langsung.",
        412
      );
    }

    // --- Geofencing ---
    const lat = typeof body?.lat === "number" ? body.lat : null;
    const lng = typeof body?.lng === "number" ? body.lng : null;
    let jarakKantor: number | null = null;

    if (cfg.geofenceAktif) {
      if (cfg.kantorLat == null || cfg.kantorLng == null) {
        throw new KesalahanAbsen("Lokasi kantor belum diatur admin.", 412);
      }
      if (lat == null || lng == null) {
        throw new KesalahanAbsen("Lokasi tidak terdeteksi. Aktifkan izin lokasi lalu coba lagi.", 412);
      }
      jarakKantor = jarakMeter(lat, lng, cfg.kantorLat, cfg.kantorLng);
      if (jarakKantor > cfg.radiusMeter) {
        throw new KesalahanAbsen(
          `Kamu berada ${Math.round(jarakKantor)} m dari kantor. Absen hanya bisa dalam radius ${cfg.radiusMeter} m.`,
          403
        );
      }
    } else if (lat != null && lng != null && cfg.kantorLat != null && cfg.kantorLng != null) {
      jarakKantor = jarakMeter(lat, lng, cfg.kantorLat, cfg.kantorLng);
    }

    // --- Waktu server ---
    const { tanggal, menit, jam } = waktuLokal(cfg.zonaWaktu);
    const ref = adminDb().doc(`absensi/${uid}_${tanggal}`);
    const adaSnap = await ref.get();
    const ada = adaSnap.exists ? (adaSnap.data() as any) : null;

    let mode: "masuk" | "pulang";
    let status: string;

    if (!ada?.jamMasuk) {
      mode = "masuk";
      status = menit <= keMenit(cfg.jamMasuk) + cfg.toleransiMenit ? "hadir" : "terlambat";
      await ref.set(
        {
          userId: uid,
          tanggal,
          jamMasuk: FieldValue.serverTimestamp(),
          status,
          matchScoreMasuk: Number(jarakTerbaik.toFixed(4)),
          latitude: lat,
          longitude: lng,
          jarakKantorMasuk: jarakKantor == null ? null : Math.round(jarakKantor),
          dicatatOleh: "server",
        },
        { merge: true }
      );
    } else if (!ada?.jamPulang) {
      const menitMasuk = ada.jamMasuk?.toDate
        ? waktuLokal(cfg.zonaWaktu, ada.jamMasuk.toDate()).menit
        : 0;
      if (cfg.minJedaMenit > 0 && menit - menitMasuk < cfg.minJedaMenit) {
        throw new KesalahanAbsen(
          `Absen pulang baru bisa dilakukan ${cfg.minJedaMenit} menit setelah absen masuk.`,
          412
        );
      }
      mode = "pulang";
      status = ada.status || "hadir";
      await ref.set(
        {
          jamPulang: FieldValue.serverTimestamp(),
          matchScorePulang: Number(jarakTerbaik.toFixed(4)),
          latitudePulang: lat,
          longitudePulang: lng,
          jarakKantorPulang: jarakKantor == null ? null : Math.round(jarakKantor),
        },
        { merge: true }
      );
    } else {
      throw new KesalahanAbsen("Absensi hari ini sudah lengkap.", 412);
    }

    // Simpan maksimal 20 sidik terakhir
    await adminDb().doc(`faceData/${uid}`).set(
      { sidikTerakhir: [sidik, ...riwayatSidik].slice(0, 20) },
      { merge: true }
    );

    return NextResponse.json({ mode, status, jam, tanggal, skor: Number(jarakTerbaik.toFixed(4)) });
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/absen]", e);
    return NextResponse.json({ pesan }, { status });
  }
}
