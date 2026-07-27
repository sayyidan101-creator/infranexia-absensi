import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import { ambilKonfigurasiServer, waktuLokal } from "@/server/absensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Menandai peserta yang tidak punya catatan apa pun hari itu sebagai ALPA.
 *
 * Tanpa ini, "belum absen" dan "tidak masuk tanpa keterangan" terlihat sama:
 * dua-duanya kosong. Rekap bulanan jadi tidak bisa dipertanggungjawabkan.
 *
 * Dijadwalkan lewat vercel.json (17.00 WIB). Bisa juga dipanggil manual
 * dengan header Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: Request) {
  // Vercel Cron mengirim CRON_SECRET sebagai bearer token bila env-nya diatur.
  const rahasia = process.env.CRON_SECRET;
  if (rahasia) {
    const header = req.headers.get("authorization") || "";
    if (header !== `Bearer ${rahasia}`) {
      return NextResponse.json({ pesan: "Tidak berwenang." }, { status: 401 });
    }
  }

  try {
    const cfg = await ambilKonfigurasiServer();

    // Boleh menandai tanggal lain lewat ?tanggal=YYYY-MM-DD (untuk susulan)
    const url = new URL(req.url);
    const diminta = url.searchParams.get("tanggal");
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(diminta || "")
      ? (diminta as string)
      : waktuLokal(cfg.zonaWaktu).tanggal;

    // Lewati akhir pekan
    const hari = new Date(tanggal + "T00:00:00Z").getUTCDay();
    if (hari === 0 || hari === 6) {
      return NextResponse.json({ tanggal, dilewati: "akhir pekan", ditandai: 0 });
    }

    const [usersSnap, absenSnap] = await Promise.all([
      adminDb().collection("users").where("role", "==", "magang").get(),
      adminDb().collection("absensi").where("tanggal", "==", tanggal).get(),
    ]);

    const sudahAda = new Set(absenSnap.docs.map((d) => (d.data() as any).userId));

    const sasaran = usersSnap.docs.filter((d) => {
      const u = d.data() as any;
      return (u.status || "aktif") === "aktif" && !sudahAda.has(d.id);
    });

    if (sasaran.length === 0) {
      return NextResponse.json({ tanggal, ditandai: 0, pesan: "Semua peserta sudah punya catatan." });
    }

    const batch = adminDb().batch();
    for (const d of sasaran) {
      batch.set(
        adminDb().doc(`absensi/${d.id}_${tanggal}`),
        {
          userId: d.id,
          tanggal,
          status: "alpha",
          sumber: "otomatis",
          dicatatOleh: "server",
          diperbaruiPada: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();

    return NextResponse.json({
      tanggal,
      ditandai: sasaran.length,
      nama: sasaran.map((d) => (d.data() as any).name || d.id),
    });
  } catch (e: any) {
    console.error("[/api/cron/alpa]", e);
    return NextResponse.json({ pesan: e?.message || "Gagal menandai alpa." }, { status: 500 });
  }
}
