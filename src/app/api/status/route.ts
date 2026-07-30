import { NextResponse } from "next/server";
import { adminAuth } from "@/server/firebaseAdmin";
import { emailAktif } from "@/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Halaman diagnosa konfigurasi server.
 * Sengaja tidak memerlukan login — kalau kredensial servernya bermasalah,
 * justru login-lah yang tidak bisa diverifikasi.
 *
 * Hanya menampilkan informasi yang memang sudah publik (project id) dan
 * status berupa ya/tidak. Kunci privat tidak pernah ikut ditampilkan.
 */
/**
 * Laporan keberadaan sebuah variabel lingkungan — tanpa nilainya.
 *
 * Yang dilaporkan hanya ada/tidak dan panjangnya. Panjang saja sudah cukup
 * membedakan tiga keadaan yang dari luar tampak sama: belum diisi sama sekali,
 * diisi tapi kosong, dan diisi benar.
 */
function periksaEnv(nama: string) {
  const nilai = process.env[nama];
  if (nilai === undefined) return { terpasang: false, kosong: null, panjang: 0 };
  return { terpasang: true, kosong: nilai.trim().length === 0, panjang: nilai.length };
}

export async function GET() {
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

  /**
   * Variabel yang dibutuhkan aplikasi ini — nama dan panjangnya saja.
   *
   * Nama variabel bukan rahasia, dan justru nama inilah yang paling sering jadi
   * biang masalah: satu spasi di ujung kolom Key tidak terlihat di antarmuka
   * mana pun.
   */
  hasil.env = {
    CRON_SECRET: periksaEnv("CRON_SECRET"),
    FIREBASE_SERVICE_ACCOUNT: periksaEnv("FIREBASE_SERVICE_ACCOUNT"),
    ANDROID_FINGERPRINTS: periksaEnv("ANDROID_FINGERPRINTS"),
    NEXT_PUBLIC_ZONA_WAKTU: periksaEnv("NEXT_PUBLIC_ZONA_WAKTU"),
  };

  // Nama apa pun yang mirip. Kalau ada salah ketik atau spasi tersembunyi, ia
  // muncul di sini lengkap dengan kurung siku yang memperlihatkan batasnya.
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
    return NextResponse.json(hasil, { status: 200 });
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
  } catch (e: any) {
    hasil.serviceAccount = {
      terpasang: true,
      formatValid: false,
      masalah:
        "Isi FIREBASE_SERVICE_ACCOUNT tidak bisa dibaca. Biasanya karena base64 terpotong, " +
        "ada spasi/baris baru di tengah, atau terbungkus tanda kutip.",
    };
    return NextResponse.json(hasil, { status: 200 });
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

  return NextResponse.json(hasil, { status: 200 });
}
