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
export async function GET() {
  const hasil: Record<string, any> = {
    waktuServer: new Date().toISOString(),
    zonaServer: Intl.DateTimeFormat().resolvedOptions().timeZone,
    projectIdAplikasi: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
    emailTerkonfigurasi: emailAktif(),
  };

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
