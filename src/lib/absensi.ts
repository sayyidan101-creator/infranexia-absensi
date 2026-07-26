// Helper Firestore untuk data wajah & absensi
import {
  doc, getDoc, setDoc, collection, query, where,
  getDocs, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ---- Tanggal lokal format YYYY-MM-DD ----
export function tanggalHariIni(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

// ---- Face data ----
export async function simpanWajah(uid: string, descriptors: number[][]) {
  await setDoc(doc(db, "faceData", uid), {
    descriptors,
    updatedAt: serverTimestamp(),
  });
}

export async function ambilWajah(uid: string): Promise<number[][] | null> {
  const snap = await getDoc(doc(db, "faceData", uid));
  return snap.exists() ? (snap.data().descriptors as number[][]) : null;
}

export async function sudahEnroll(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "faceData", uid));
  return snap.exists() && (snap.data().descriptors?.length ?? 0) > 0;
}

// ---- Konfigurasi jam kerja (dari env, bisa dipindah ke Firestore) ----
export function konfigurasi() {
  return {
    jamMasuk: process.env.NEXT_PUBLIC_JAM_MASUK || "08:00",
    jamPulang: process.env.NEXT_PUBLIC_JAM_PULANG || "16:00",
    toleransi: parseInt(process.env.NEXT_PUBLIC_TOLERANSI_MENIT || "15", 10),
    threshold: parseFloat(process.env.NEXT_PUBLIC_FACE_THRESHOLD || "0.5"),
  };
}

// Tentukan status berdasarkan jam masuk + toleransi
export function hitungStatus(jamMasukStr: string, toleransiMenit: number): "hadir" | "terlambat" {
  const now = new Date();
  const [h, m] = jamMasukStr.split(":").map(Number);
  const batas = new Date();
  batas.setHours(h, m + toleransiMenit, 0, 0);
  return now <= batas ? "hadir" : "terlambat";
}

// ---- Absensi ----
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
}

export async function absensiHariIni(uid: string): Promise<Absensi | null> {
  const id = `${uid}_${tanggalHariIni()}`;
  const snap = await getDoc(doc(db, "absensi", id));
  return snap.exists() ? ({ id, ...(snap.data() as any) }) : null;
}

export async function catatMasuk(
  uid: string, status: string, score: number,
  lat?: number, lng?: number
) {
  const tgl = tanggalHariIni();
  const id = `${uid}_${tgl}`;
  await setDoc(doc(db, "absensi", id), {
    userId: uid,
    tanggal: tgl,
    jamMasuk: serverTimestamp(),
    status,
    matchScoreMasuk: score,
    latitude: lat ?? null,
    longitude: lng ?? null,
  }, { merge: true });
}

export async function catatPulang(uid: string, score: number, lat?: number, lng?: number) {
  const id = `${uid}_${tanggalHariIni()}`;
  await setDoc(doc(db, "absensi", id), {
    jamPulang: serverTimestamp(),
    matchScorePulang: score,
    latitudePulang: lat ?? null,
    longitudePulang: lng ?? null,
  }, { merge: true });
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