// Helper Firestore untuk data wajah, konfigurasi, & absensi.
//
// Catatan keamanan: sejak versi ini, dokumen `absensi` TIDAK BOLEH ditulis
// dari browser (dikunci Firestore Rules). Absen masuk/pulang dilakukan lewat
// Cloud Function `absen`, sehingga jam, status, pencocokan wajah, dan
// validasi lokasi seluruhnya ditentukan server.
import {
  doc, getDoc, setDoc, collection, query, where,
  getDocs, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { panggilApi } from "@/lib/api";

// ---- Tanggal lokal format YYYY-MM-DD ----
export function tanggalHariIni(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// ================= Konfigurasi =================

export interface Konfigurasi {
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

export const KONFIG_DEFAULT: Konfigurasi = {
  jamMasuk: process.env.NEXT_PUBLIC_JAM_MASUK || "08:00",
  jamPulang: process.env.NEXT_PUBLIC_JAM_PULANG || "16:00",
  toleransiMenit: parseInt(process.env.NEXT_PUBLIC_TOLERANSI_MENIT || "15", 10),
  faceThreshold: parseFloat(process.env.NEXT_PUBLIC_FACE_THRESHOLD || "0.5"),
  geofenceAktif: false,
  kantorLat: null,
  kantorLng: null,
  radiusMeter: 150,
  minJedaMenit: 0,
  zonaWaktu: "Asia/Jakarta",
};

/** Konfigurasi tersimpan di Firestore agar admin bisa mengubah tanpa deploy ulang. */
export async function ambilKonfigurasi(): Promise<Konfigurasi> {
  try {
    const snap = await getDoc(doc(db, "config", "absensi"));
    return snap.exists()
      ? { ...KONFIG_DEFAULT, ...(snap.data() as Partial<Konfigurasi>) }
      : KONFIG_DEFAULT;
  } catch {
    return KONFIG_DEFAULT;
  }
}

export async function simpanKonfigurasi(nilai: Partial<Konfigurasi>) {
  await setDoc(doc(db, "config", "absensi"), { ...nilai, diperbaruiPada: serverTimestamp() }, { merge: true });
}

// ================= Data wajah =================

/** Pendaftaran wajah dikirim ke server; koleksi faceData tertutup dari browser. */
export async function simpanWajah(descriptors: number[][]) {
  await panggilApi<{ ok: boolean; jumlah: number }>("/api/wajah", { descriptors });
}

/**
 * Descriptor tidak bisa dibaca dari browser (Rules menutupnya), jadi status
 * pendaftaran wajah dibaca dari penanda `wajahTerdaftar` pada dokumen user
 * yang diisi otomatis oleh Cloud Function `onFaceDataWritten`.
 */
export async function sudahEnroll(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() && (snap.data() as any).wajahTerdaftar === true;
}

// ================= Absensi =================

export interface Absensi {
  id: string;
  userId: string;
  tanggal: string;
  jamMasuk?: Timestamp;
  jamPulang?: Timestamp;
  status: string;
  matchScoreMasuk?: number;
  matchScorePulang?: number;
  latitude?: number;
  longitude?: number;
  jarakKantorMasuk?: number;
  jarakKantorPulang?: number;
}

export interface HasilAbsen {
  mode: "masuk" | "pulang";
  status: string;
  jam: string;
  tanggal: string;
  skor: number;
}

/**
 * Kirim descriptor wajah ke server untuk diverifikasi dan dicatat.
 * Server yang memutuskan ini absen masuk atau pulang, jamnya, dan statusnya.
 */
export async function absenSekarang(
  descriptor: number[],
  lat?: number | null,
  lng?: number | null,
  akurasi?: number | null
): Promise<HasilAbsen> {
  return panggilApi<HasilAbsen>("/api/absen", {
    descriptor,
    lat: lat ?? null,
    lng: lng ?? null,
    akurasi: akurasi ?? null,
  });
}

export async function absensiHariIni(uid: string): Promise<Absensi | null> {
  const id = `${uid}_${tanggalHariIni()}`;
  const snap = await getDoc(doc(db, "absensi", id));
  return snap.exists() ? ({ id, ...(snap.data() as any) }) : null;
}

// Riwayat absensi milik user (tanpa orderBy agar tak butuh composite index)
export async function riwayatAbsensi(uid: string): Promise<Absensi[]> {
  const q = query(collection(db, "absensi"), where("userId", "==", uid));
  const snap = await getDocs(q);
  const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  arr.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  return arr;
}

// Absensi sejak tanggal tertentu (semua user) untuk grafik/aktivitas admin
export async function absensiSejak(tanggalMulai: string): Promise<Absensi[]> {
  const q = query(collection(db, "absensi"), where("tanggal", ">=", tanggalMulai));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

// Peta userId -> nama (untuk admin/pembimbing)
export async function petaNamaUser(): Promise<Record<string, string>> {
  const snap = await getDocs(collection(db, "users"));
  const map: Record<string, string> = {};
  snap.forEach((d) => { map[d.id] = (d.data() as any).name || "Tanpa Nama"; });
  return map;
}

// Peta userId -> detail lengkap (nama, nim, jurusan, kampus)
export async function petaUserDetail(): Promise<Record<string, any>> {
  const snap = await getDocs(collection(db, "users"));
  const map: Record<string, any> = {};
  snap.forEach((d) => { map[d.id] = d.data(); });
  return map;
}

// Semua absensi (admin/pembimbing) diurutkan terbaru
export async function semuaAbsensi(): Promise<Absensi[]> {
  const snap = await getDocs(collection(db, "absensi"));
  const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  arr.sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""));
  return arr;
}

// Jumlah user per role
export async function jumlahMagang(): Promise<number> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "magang")));
  return snap.size;
}

// Semua absensi hari ini (admin/pembimbing)
export async function absensiSemuaHariIni(): Promise<Absensi[]> {
  const q = query(collection(db, "absensi"), where("tanggal", "==", tanggalHariIni()));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

// ---- Jarak dua koordinat dalam meter (untuk indikator di UI) ----
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
