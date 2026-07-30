import { NextResponse } from "next/server";
import { adminAuth } from "@/server/firebaseAdmin";
import { KesalahanAbsen, pastikanAdmin } from "@/server/absensi";
import { emailAktif } from "@/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnosa konfigurasi server.
 *
 * Dulu seluruh laporan ini terbuka tanpa login, dengan alasan yang sebenarnya
 * masuk akal: kalau kredensial servernya rusak, justru login-lah yang tidak
 * bisa diverifikasi — jadi diagnosa yang menuntut login akan mati bersama hal
 * yang mau didiagnosa.
 *
 * Alasan itu benar, tapi harganya terlalu mahal: siapa pun di internet bisa
 * membaca project id, pesan commit terakhir, dan nama-nama variabel server,
 * sekaligus memicu panggilan ke Firebase Auth pada setiap permintaan sehingga
 * kuotanya bisa dihabiskan orang luar.
 *
 * Sekarang keduanya dipisah menurut siapa yang bertanya:
 *
 *   GET  tanpa apa pun            → hanya "server hidup", tanpa satu pun rincian
 *   GET  Bearer <CRON_SECRET>     → laporan penuh; jalan keluar darurat yang
 *                                   tidak bergantung pada Firebase sama sekali
 *   POST dengan token admin       → laporan penuh; dipakai panel Sistem
 *
 * Jalan darurat itu yang membuat alasan lama tetap terhormat: waktu Firebase
 * tumbang dan tidak ada yang bisa login, `CRON_SECRET` masih cukup untuk
 * membaca laporan ini dari terminal.
 */

/**
 * Laporan keberadaan sebuah variabel lingkungan — tanpa nilainya.
 *
 * Yang dilaporkan hanya ada/tidak dan panjangnya. Panjang saja sudah cukup
 * membedakan tiga keadaan yang dari luar tampak sama: belum diisi sama sekali,
 * diisi tapi kosong, dan diisi benar. Ketiga keadaan itu pernah menghabiskan
 * setengah jam justru karena tidak bisa dibedakan.
 */
function periksaEnv(nama: string) {
  const nilai = process.env[nama];
  if (nilai === undefined) return { terpasang: false, kosong: null, panjang: 0 };
  return { terpasang: true, kosong: nilai.trim().length === 0, panjang: nilai.length };
}

/** Apakah pemanggil membawa CRON_SECRET yang benar. */
function bawaRahasia(req: Request): boolean {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${rahasia}`;
}

async function laporanPenuh() {
  const hasil: Record<string, any> = {
    waktuServer: new Date().toISOString(),
    zonaServer: Intl.DateTimeFormat().resolvedOptions().timeZone,
    projectIdAplikasi: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    emailTerkonfigurasi: emailAktif(),
  };

  /**
   * Deployment mana yang sebenarnya melayani alamat ini.
   *
   * Setiap deployment membawa cuplikan variabel lingkungan dari saat ia
   * dibangun. Kalau sebuah variabel baru ditambahkan tapi alamat produksinya
   * masih dilayani deployment lama, variabelnya tidak akan pernah terlihat —
   * dan dari luar keadaan itu tidak bisa dibedakan dari "variabelnya salah
   * nama". Nomor commit di bawah ini yang membedakan keduanya.
   *
   * Semua nilai di sini disediakan Vercel sendiri dan bukan rahasia.
   */
  hasil.deployment = {
    lingkungan: process.env.VERCEL_ENV || "lokal",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
    pesanCommit: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    wilayah: process.env.VERCEL_REGION || null,
  };

  /** Variabel yang dibutuhkan aplikasi ini — nama dan panjangnya saja. */
  hasil.env = {
    CRON_SECRET: periksaEnv("CRON_SECRET"),
    FIREBASE_SERVICE_ACCOUNT: periksaEnv("FIREBASE_SERVICE_ACCOUNT"),
    ANDROID_FINGERPRINTS: periksaEnv("ANDROID_FINGERPRINTS"),
    NEXT_PUBLIC_ZONA_WAKTU: periksaEnv("NEXT_PUBLIC_ZONA_WAKTU"),
  };

  // Nama apa pun yang mirip. Kalau ada salah ketik atau spasi tersembunyi, ia
  // muncul di sini lengkap dengan kurung siku yang memperlihatkan batasnya —
  // satu spasi di ujung kolom Key tidak terlihat di antarmuka mana pun.
  hasil.namaMiripCron = Object.keys(process.env)
    .filter((k) => /cron|secret/i.test(k))
    .map((k) => `[${k}]`)
    .sort();

  // --- Service account ---
  const mentah = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!mentah) {
    hasil.serviceAccount = {
      terpasang: false,
      masalah: "FIREBASE_SERVICE_ACCOUNT belum ada di environment.",
    };
    return hasil;
  }

  try {
    const teks = mentah.trim().startsWith("{")
      ? mentah
      : Buffer.from(mentah, "base64").toString("utf8");
    const akun = JSON.parse(teks);

    const cocok = akun.project_id === process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    hasil.serviceAccount = {
      terpasang: true,
      formatValid: true,
      projectId: akun.project_id || null,
      cocokDenganAplikasi: cocok,
      punyaPrivateKey: typeof akun.private_key === "string" && akun.private_key.includes("PRIVATE KEY"),
      masalah: cocok
        ? null
        : "Project service account berbeda dengan project aplikasi. Unduh ulang kunci dari project yang benar.",
    };
  } catch {
    hasil.serviceAccount = {
      terpasang: true,
      formatValid: false,
      masalah:
        "Isi FIREBASE_SERVICE_ACCOUNT tidak bisa dibaca. Biasanya karena base64 terpotong, " +
        "ada spasi/baris baru di tengah, atau terbungkus tanda kutip.",
    };
    return hasil;
  }

  // --- Uji koneksi sungguhan ke Firebase Auth ---
  try {
    await adminAuth().listUsers(1);
    hasil.koneksiFirebase = { ok: true, masalah: null };
  } catch (e: any) {
    hasil.koneksiFirebase = {
      ok: false,
      kode: e?.errorInfo?.code || e?.code || null,
      masalah: e?.message || "Gagal menghubungi Firebase Auth.",
    };
  }

  return hasil;
}

/**
 * Pemeriksaan hidup-mati untuk umum, dan jalan darurat bagi yang membawa
 * `CRON_SECRET`.
 *
 * Jawaban tanpa rahasia sengaja sangat pendek. Ia cukup untuk memastikan
 * aplikasinya menyala, dan tidak cukup untuk apa pun selain itu.
 */
export async function GET(req: Request) {
  if (bawaRahasia(req)) {
    return NextResponse.json(await laporanPenuh(), { status: 200 });
  }
  return NextResponse.json(
    {
      ok: true,
      waktuServer: new Date().toISOString(),
      keterangan: "Laporan lengkap hanya untuk admin — buka panel Sistem di halaman Kelola.",
    },
    { status: 200 }
  );
}

/** Laporan penuh untuk panel Sistem. Hanya admin. */
export async function POST(req: Request) {
  try {
    await pastikanAdmin(req);
    return NextResponse.json(await laporanPenuh(), { status: 200 });
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/status]", e);
    return NextResponse.json({ pesan }, { status });
  }
}
