import "server-only";
import { createHash } from "crypto";
import { adminDb, adminAuth } from "@/server/firebaseAdmin";

// ============================ Konfigurasi ============================

export interface KonfigurasiServer {
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  faceThreshold: number;
  geofenceAktif: boolean;
  kantorLat: number | null;
  kantorLng: number | null;
  radiusMeter: number;
  minJedaMenit: number;
  zonaWaktu: string;
}

export const DEFAULT_KONFIG: KonfigurasiServer = {
  jamMasuk: "08:00",
  jamPulang: "16:00",
  toleransiMenit: 15,
  faceThreshold: 0.5,
  geofenceAktif: false,
  kantorLat: null,
  kantorLng: null,
  radiusMeter: 150,
  minJedaMenit: 0,
  zonaWaktu: "Asia/Jakarta",
};

export async function ambilKonfigurasiServer(): Promise<KonfigurasiServer> {
  const snap = await adminDb().doc("config/absensi").get();
  return { ...DEFAULT_KONFIG, ...(snap.exists ? (snap.data() as Partial<KonfigurasiServer>) : {}) };
}

// ============================ Kesalahan terkendali ============================

export class KesalahanAbsen extends Error {
  status: number;
  constructor(pesan: string, status = 400) {
    super(pesan);
    this.status = status;
  }
}

// ============================ Autentikasi ============================

/** Verifikasi ID token dari header Authorization: Bearer <token>. */
export async function pastikanLogin(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new KesalahanAbsen("Sesi kamu berakhir. Silakan login ulang.", 401);

  // Kesalahan konfigurasi server dipisahkan dari kesalahan sesi pengguna.
  // Kalau keduanya dicampur, kredensial yang salah pasang akan terbaca
  // seolah-olah pengguna yang bermasalah — dan itu menyesatkan.
  let sdk;
  try {
    sdk = adminAuth();
  } catch (e: any) {
    console.error("[konfigurasi admin]", e);
    throw new KesalahanAbsen(
      e?.message || "Kredensial server belum terpasang. Periksa FIREBASE_SERVICE_ACCOUNT.",
      500
    );
  }

  try {
    const hasil = await sdk.verifyIdToken(token);
    return hasil.uid;
  } catch (e: any) {
    const kode = String(e?.code || "");
    const pesan = String(e?.message || "");

    if (/incorrect .?aud|audience/i.test(pesan)) {
      throw new KesalahanAbsen(
        "Service account berasal dari project Firebase yang berbeda dengan aplikasi. " +
          "Pastikan FIREBASE_SERVICE_ACCOUNT diunduh dari project yang sama.",
        500
      );
    }
    if (/expired/i.test(pesan) || kode === "auth/id-token-expired") {
      throw new KesalahanAbsen("Sesi kamu kedaluwarsa. Silakan login ulang.", 401);
    }
    if (/used too early|issued at/i.test(pesan)) {
      throw new KesalahanAbsen(
        "Jam perangkat atau server meleset dari waktu sebenarnya, sehingga sesi ditolak. " +
          "Sinkronkan jam sistem lalu coba lagi.",
        500
      );
    }
    console.error("[verifikasi token]", e);
    throw new KesalahanAbsen("Sesi kamu tidak valid. Silakan login ulang.", 401);
  }
}

export async function pastikanAdmin(req: Request): Promise<string> {
  const uid = await pastikanLogin(req);
  const snap = await adminDb().doc(`users/${uid}`).get();
  if (!snap.exists || (snap.data() as any).role !== "admin") {
    throw new KesalahanAbsen("Hanya admin yang boleh melakukan ini.", 403);
  }
  return uid;
}

// ============================ Utilitas waktu ============================

/** Pecah waktu server ke tanggal & menit lokal sesuai zona waktu kantor. */
export function waktuLokal(zona: string, saat = new Date()) {
  const bagian = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(saat);

  const p: Record<string, string> = {};
  for (const b of bagian) p[b.type] = b.value;

  return {
    tanggal: `${p.year}-${p.month}-${p.day}`,
    menit: Number(p.hour) * 60 + Number(p.minute),
    jam: `${p.hour}:${p.minute}`,
  };
}

export function keMenit(jam: string): number {
  const [h, m] = jam.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ============================ Utilitas wajah & lokasi ============================

export function jarakEuclid(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    total += d * d;
  }
  return Math.sqrt(total);
}

/** Jarak dua koordinat dalam meter (haversine). */
export function jarakMeter(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Sidik jari descriptor untuk mendeteksi pengiriman ulang (replay).
 * Kamera sungguhan tidak pernah menghasilkan dua descriptor identik,
 * jadi nilai yang sama persis = payload lama yang dikirim ulang.
 */
export function sidikJari(descriptor: number[]): string {
  const dibulatkan = descriptor.map((n) => n.toFixed(6)).join(",");
  return createHash("sha256").update(dibulatkan).digest("hex").slice(0, 32);
}

export function validasiDescriptor(nilai: unknown): number[] {
  if (!Array.isArray(nilai) || nilai.length !== 128) {
    throw new KesalahanAbsen("Data wajah tidak valid.");
  }
  const angka = nilai.map(Number);
  if (angka.some((n) => !Number.isFinite(n))) {
    throw new KesalahanAbsen("Data wajah tidak valid.");
  }
  return angka;
}
