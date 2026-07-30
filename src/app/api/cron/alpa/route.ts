import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import { ambilKonfigurasiServer, waktuLokal } from "@/server/absensi";
import { dalamPeriode } from "@/lib/periode";

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
/**
 * Sampai berapa hari ke belakang penandaan susulan masih boleh diminta.
 *
 * Tanpa batas ini, satu permintaan bisa menuliskan alpa untuk tanggal
 * bertahun-tahun lalu — dan tidak ada route yang bisa menghapus catatan
 * absensi kembali.
 */
const MAKS_HARI_SUSULAN = 14;

function selisihHari(dari: string, sampai: string): number {
  const a = new Date(dari + "T00:00:00Z").getTime();
  const b = new Date(sampai + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

export async function GET(req: Request) {
  /**
   * Penjagaan gagal-tertutup.
   *
   * Sebelumnya penjagaan ini dibungkus `if (rahasia)` — kalau env-nya tidak
   * diisi, pintunya terbuka untuk siapa pun. Padahal satu permintaan GET di
   * sini bisa menonaktifkan seluruh peserta sekaligus. Kalau rahasianya belum
   * dipasang, yang benar adalah menolak semua permintaan, bukan menerima
   * semuanya.
   */
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) {
    console.error("[/api/cron/alpa] CRON_SECRET belum diatur — permintaan ditolak.");
    return NextResponse.json(
      { pesan: "Endpoint ini belum dikonfigurasi. Atur CRON_SECRET terlebih dahulu." },
      { status: 503 }
    );
  }
  if ((req.headers.get("authorization") || "") !== `Bearer ${rahasia}`) {
    return NextResponse.json({ pesan: "Tidak berwenang." }, { status: 401 });
  }

  try {
    const cfg = await ambilKonfigurasiServer();
    const hariIni = waktuLokal(cfg.zonaWaktu).tanggal;

    // Boleh menandai tanggal lain lewat ?tanggal=YYYY-MM-DD (untuk susulan)
    const url = new URL(req.url);
    const diminta = url.searchParams.get("tanggal");
    const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(diminta || "")
      ? (diminta as string)
      : hariIni;

    // Hanya hari yang sudah lewat, dan tidak terlalu jauh ke belakang.
    // Tanggal masa depan tidak masuk akal — orangnya belum sempat datang.
    const jarak = selisihHari(tanggal, hariIni);
    if (jarak < 0) {
      return NextResponse.json(
        { pesan: "Tanggal belum tiba; tidak ada yang bisa ditandai alpa." },
        { status: 400 }
      );
    }
    if (jarak > MAKS_HARI_SUSULAN) {
      return NextResponse.json(
        { pesan: `Penandaan susulan maksimal ${MAKS_HARI_SUSULAN} hari ke belakang.` },
        { status: 400 }
      );
    }

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
      if ((u.status || "aktif") !== "aktif") return false;
      if (sudahAda.has(d.id)) return false;
      // Peserta yang belum mulai atau sudah selesai magang bukan "alpa" —
      // dia memang tidak seharusnya ada di kantor hari itu.
      return dalamPeriode(u, tanggal);
    });

    // Penonaktifan diukur dari HARI INI, bukan dari tanggal yang diminta.
    // Menandai alpa susulan minggu lalu tidak boleh memutar balik status
    // orang yang periodenya baru berakhir sesudah tanggal itu.
    const dinonaktifkan = await tutupPeriodeSelesai(usersSnap, hariIni);

    if (sasaran.length === 0) {
      return NextResponse.json({
        tanggal, ditandai: 0, dinonaktifkan,
        pesan: "Semua peserta sudah punya catatan.",
      });
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
      dinonaktifkan,
      nama: sasaran.map((d) => (d.data() as any).name || d.id),
    });
  } catch (e: any) {
    console.error("[/api/cron/alpa]", e);
    return NextResponse.json({ pesan: e?.message || "Gagal menandai alpa." }, { status: 500 });
  }
}

/**
 * Nonaktifkan peserta yang periode magangnya sudah lewat.
 *
 * Dikerjakan di sini, bukan lewat penjadwalan terpisah, karena cron harian ini
 * sudah berjalan tiap sore dan sudah memuat seluruh daftar peserta. Menambah
 * satu jadwal lagi hanya untuk ini berarti satu hal lagi yang bisa lupa
 * dipasang saat proyeknya dipindah.
 */
async function tutupPeriodeSelesai(usersSnap: any, tanggal: string): Promise<string[]> {
  const habis = usersSnap.docs.filter((d: any) => {
    const u = d.data() as any;
    return (u.status || "aktif") === "aktif" && u.selesaiPada && u.selesaiPada < tanggal;
  });
  if (habis.length === 0) return [];

  const batch = adminDb().batch();
  habis.forEach((d: any) => {
    batch.set(
      d.ref,
      { status: "nonaktif", dinonaktifkanPada: FieldValue.serverTimestamp(), alasanNonaktif: "periode magang selesai" },
      { merge: true }
    );
  });
  await batch.commit();

  return habis.map((d: any) => (d.data() as any).name || d.id);
}
