import {
  collection, doc, getDoc, getDocs, query, where, limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { panggilApi } from "@/lib/api";

export type StatusKegiatan = "dikirim" | "diperiksa";

export interface Kegiatan {
  id: string;
  userId: string;
  nama?: string;
  tanggal: string;
  kegiatan: string;
  kendala?: string;
  adaFoto?: boolean;
  status: StatusKegiatan;
  catatanPembimbing?: string;
  namaPemeriksa?: string;
}

export const GAYA_KEGIATAN: Record<StatusKegiatan, { teks: string; kelas: string }> = {
  dikirim: { teks: "MENUNGGU DIPERIKSA", kelas: "bg-amber-100 text-amber-700" },
  diperiksa: { teks: "SUDAH DIPERIKSA", kelas: "bg-emerald-100 text-emerald-700" },
};

/** Batas menulis mundur; dipakai antarmuka agar sama dengan aturan di server. */
export const MAKS_HARI_MUNDUR = 7;

// ---------------- Penulisan (lewat API) ----------------

export async function simpanKegiatan(d: {
  tanggal: string;
  kegiatan: string;
  kendala?: string;
  foto?: string;
}): Promise<{ adaFoto: boolean }> {
  return panggilApi("/api/aktivitas", { aksi: "simpan", ...d });
}

export async function hapusFotoKegiatan(tanggal: string): Promise<void> {
  await panggilApi("/api/aktivitas", { aksi: "hapusFoto", tanggal });
}

export async function periksaKegiatan(
  uid: string,
  tanggal: string,
  catatan = "",
  batal = false
): Promise<{ status: StatusKegiatan }> {
  return panggilApi("/api/aktivitas", { aksi: "periksa", uid, tanggal, catatan, batal });
}

// ---------------- Pembacaan (langsung dari Firestore) ----------------

function petakan(d: any): Kegiatan {
  return { id: d.id, ...(d.data() as any) };
}

/** Catatan milik satu peserta dalam rentang tanggal. */
export async function kegiatanPeserta(
  uid: string,
  dari: string,
  sampai: string
): Promise<Kegiatan[]> {
  const q = query(
    collection(db, "aktivitas"),
    where("userId", "==", uid),
    where("tanggal", ">=", dari),
    where("tanggal", "<=", sampai),
    limit(400)
  );
  const snap = await getDocs(q);
  return snap.docs.map(petakan).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/** Seluruh catatan pada rentang tanggal — untuk pembimbing. */
export async function kegiatanSemua(dari: string, sampai: string): Promise<Kegiatan[]> {
  const q = query(
    collection(db, "aktivitas"),
    where("tanggal", ">=", dari),
    where("tanggal", "<=", sampai),
    limit(1000)
  );
  const snap = await getDocs(q);
  return snap.docs.map(petakan).sort(
    (a, b) => b.tanggal.localeCompare(a.tanggal) || (a.nama || "").localeCompare(b.nama || "")
  );
}

/**
 * Foto satu catatan, diambil hanya saat catatannya dibuka.
 * Inilah alasan foto disimpan di koleksi terpisah.
 */
export async function fotoKegiatan(uid: string, tanggal: string): Promise<string> {
  const snap = await getDoc(doc(db, "aktivitasFoto", `${uid}_${tanggal}`));
  return snap.exists() ? String((snap.data() as any).foto || "") : "";
}
