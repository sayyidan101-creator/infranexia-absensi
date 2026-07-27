import "server-only";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

/**
 * Firebase Admin SDK — HANYA berjalan di server (API route Next.js).
 * Kredensial diambil dari env `FIREBASE_SERVICE_ACCOUNT`, boleh diisi
 * JSON mentah maupun hasil encode base64 (lebih rapi untuk variabel Vercel).
 *
 * Inisialisasi sengaja dibuat malas (lazy) agar `next build` tetap jalan
 * di mesin yang belum punya kredensial — koneksi baru dibuat saat request
 * pertama benar-benar masuk.
 */
function kredensial() {
  const mentah = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!mentah) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT belum diatur di environment. Lihat README bagian 'Service account'."
    );
  }
  const teks = mentah.trim().startsWith("{")
    ? mentah
    : Buffer.from(mentah, "base64").toString("utf8");

  let akun: any;
  try {
    akun = JSON.parse(teks);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid.");
  }
  // Private key sering tersimpan dengan \n literal saat ditempel ke env
  if (typeof akun.private_key === "string") {
    akun.private_key = akun.private_key.replace(/\\n/g, "\n");
  }
  return akun;
}

let aplikasi: App | null = null;
function app(): App {
  if (aplikasi) return aplikasi;
  aplikasi = getApps().length ? getApps()[0] : initializeApp({ credential: cert(kredensial()) });
  return aplikasi;
}

export function adminDb(): Firestore {
  return getFirestore(app());
}

export function adminAuth(): Auth {
  return getAuth(app());
}
