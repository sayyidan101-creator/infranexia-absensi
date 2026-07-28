// Helper Firestore untuk konfigurasi & absensi.
//
// Catatan keamanan: dokumen `absensi` TIDAK BOLEH ditulis dari browser
// (dikunci Firestore Rules). Pencatatan dilakukan lewat API route saat kartu
// dipindai di perangkat kios, sehingga jam, status, dan validasi lokasi
// seluruhnya ditentukan server.
import {
  doc, getDoc, setDoc, collection, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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

// ================= Absensi =================

export interface Absensi {
  id: string;
  userId: string;
  tanggal: string;
  jamMasuk?: Timestamp;
  jamPulang?: Timestamp;
  status: string;
  sumber?: string;
  namaOperator?: string;
  latitude?: number;
  longitude?: number;
  jarakKantorMasuk?: number;
  jarakKantorPulang?: number;
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

/**
 * Absensi seluruh peserta dalam rentang tanggal.
 *
 * Menggantikan pengambilan seluruh koleksi: dengan 20 peserta selama enam
 * bulan itu ribuan dokumen setiap halaman dibuka — lambat dan boros kuota.
 */
export async function absensiRentang(dari: string, sampai: string): Promise<Absensi[]> {
  const q = query(
    collection(db, "absensi"),
    where("tanggal", ">=", dari),
    where("tanggal", "<=", sampai),
    orderBy("tanggal", "desc"),
    limit(2000)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** Absensi satu peserta dalam rentang tanggal. */
export async function riwayatRentang(uid: string, dari: string, sampai: string): Promise<Absensi[]> {
  const q = query(
    collection(db, "absensi"),
    where("userId", "==", uid),
    where("tanggal", ">=", dari),
    where("tanggal", "<=", sampai),
    orderBy("tanggal", "desc"),
    limit(500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** Pantau absensi hari ini secara langsung, tanpa perlu muat ulang halaman. */
export function pantauAbsensiHariIni(
  saatBerubah: (data: Absensi[]) => void,
  saatGagal?: (e: unknown) => void
) {
  const q = query(collection(db, "absensi"), where("tanggal", "==", tanggalHariIni()));
  return onSnapshot(
    q,
    (snap) => saatBerubah(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    (e) => saatGagal?.(e)
  );
}

// ---- Rekap ----
export interface Rekap {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
  hariKerja: number;
  persenKehadiran: number;
}

export function hitungRekap(data: Absensi[]): Rekap {
  const n = (s: string) => data.filter((a) => a.status === s).length;
  const hadir = n("hadir");
  const terlambat = n("terlambat");
  const izin = n("izin");
  const sakit = n("sakit");
  const alpha = n("alpha");
  const hariKerja = hadir + terlambat + izin + sakit + alpha;
  return {
    hadir, terlambat, izin, sakit, alpha, hariKerja,
    persenKehadiran: hariKerja ? Math.round(((hadir + terlambat) / hariKerja) * 100) : 0,
  };
}

/** Tanggal awal & akhir sebuah bulan, format YYYY-MM-DD. */
export function batasBulan(tahun: number, bulan: number): { dari: string; sampai: string } {
  const dua = (n: number) => String(n).padStart(2, "0");
  const akhir = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  return { dari: `${tahun}-${dua(bulan)}-01`, sampai: `${tahun}-${dua(bulan)}-${dua(akhir)}` };
}

/** Geser tanggal sejumlah hari, hasil format YYYY-MM-DD. */
export function geserHari(tanggal: string, hari: number): string {
  const d = new Date(tanggal + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
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
