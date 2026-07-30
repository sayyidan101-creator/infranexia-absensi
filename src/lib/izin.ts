import {
  collection, doc, getDoc, getDocs, query, where, limit, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { panggilApi } from "@/lib/api";

export type JenisIzin = "izin" | "sakit";
export type StatusIzin = "menunggu" | "disetujui" | "ditolak";

export interface Izin {
  id: string;
  userId: string;
  nama: string;
  jenis: JenisIzin;
  alasan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  tanggal: string[];
  jumlahHari: number;
  /** Ada foto surat dokter di koleksi `izinBukti`. Fotonya sendiri tidak di sini. */
  adaBukti?: boolean;
  status: StatusIzin;
  catatan?: string;
  namaPemroses?: string;
  diajukanPada?: Timestamp;
  diprosesPada?: Timestamp;
}

/**
 * Mulai berapa hari sakit surat dokter menjadi wajib.
 * Harus sama dengan angka di `/api/izin`; ini hanya untuk memberi tahu lebih
 * awal, bukan untuk menegakkan aturannya.
 */
export const WAJIB_SURAT_SEJAK_HARI = 2;

export function wajibSurat(jenis: JenisIzin, jumlahHari: number): boolean {
  return jenis === "sakit" && jumlahHari >= WAJIB_SURAT_SEJAK_HARI;
}

export async function ajukanIzin(data: {
  jenis: JenisIzin;
  alasan: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  /** Data URL foto surat dokter, sudah dikecilkan di browser. */
  bukti?: string;
}): Promise<{ id: string; jumlahHari: number; adaBukti: boolean }> {
  return panggilApi("/api/izin", { aksi: "ajukan", ...data });
}

/** Menambah atau mengganti surat pada pengajuan yang masih menunggu. */
export async function lampirkanBukti(id: string, bukti: string): Promise<void> {
  await panggilApi("/api/izin", { aksi: "lampirkan", id, bukti });
}

export async function hapusBuktiIzin(id: string): Promise<void> {
  await panggilApi("/api/izin", { aksi: "hapusBukti", id });
}

/**
 * Foto surat satu pengajuan, diambil hanya saat pengajuannya dibuka.
 * Inilah alasan fotonya disimpan di koleksi terpisah.
 */
export async function buktiIzin(id: string): Promise<string> {
  const snap = await getDoc(doc(db, "izinBukti", id));
  return snap.exists() ? String((snap.data() as any).foto || "") : "";
}

export async function prosesIzin(
  id: string,
  keputusan: "disetujui" | "ditolak",
  catatan = ""
): Promise<{ dicatat: number }> {
  return panggilApi("/api/izin", { aksi: "proses", id, keputusan, catatan });
}

export async function batalkanIzin(id: string): Promise<void> {
  await panggilApi("/api/izin", { aksi: "batal", id });
}

/** Pengajuan milik satu peserta. */
export async function izinSaya(uid: string): Promise<Izin[]> {
  const snap = await getDocs(query(collection(db, "izin"), where("userId", "==", uid)));
  return urut(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
}

/** Seluruh pengajuan (admin & pembimbing). */
export async function semuaIzin(): Promise<Izin[]> {
  const snap = await getDocs(query(collection(db, "izin"), limit(500)));
  return urut(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
}

/**
 * Hanya pengajuan yang menunggu keputusan.
 *
 * Dashboard pembimbing cuma perlu tahu berapa yang tertahan, bukan seluruh
 * riwayat pengajuan sejak awal magang. Setelah beberapa bulan berjalan,
 * selisih keduanya besar.
 */
export async function izinMenunggu(): Promise<Izin[]> {
  const snap = await getDocs(
    query(collection(db, "izin"), where("status", "==", "menunggu"), limit(200))
  );
  return urut(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
}

function urut(arr: Izin[]): Izin[] {
  // Menunggu selalu di atas, sisanya menurut tanggal mulai terbaru
  const bobot = (s: StatusIzin) => (s === "menunggu" ? 0 : 1);
  return arr.sort(
    (a, b) =>
      bobot(a.status) - bobot(b.status) ||
      (b.tanggalMulai || "").localeCompare(a.tanggalMulai || "")
  );
}

export const LABEL_JENIS: Record<JenisIzin, string> = { izin: "Izin", sakit: "Sakit" };

export const GAYA_STATUS: Record<StatusIzin, { teks: string; kelas: string }> = {
  menunggu: { teks: "MENUNGGU", kelas: "bg-amber-100 text-amber-700" },
  disetujui: { teks: "DISETUJUI", kelas: "bg-emerald-100 text-emerald-700" },
  ditolak: { teks: "DITOLAK", kelas: "bg-red-100 text-red-700" },
};

/** Format "12 Agu" atau "12–14 Agu 2026" untuk rentang. */
export function labelRentang(mulai: string, selesai: string): string {
  const a = new Date(mulai + "T00:00:00");
  const b = new Date(selesai + "T00:00:00");
  if (isNaN(a.getTime())) return mulai;
  const opsi: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (mulai === selesai) return a.toLocaleDateString("id-ID", opsi);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${a.getDate()}–${b.toLocaleDateString("id-ID", opsi)}`
    : `${a.toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${b.toLocaleDateString("id-ID", opsi)}`;
}
