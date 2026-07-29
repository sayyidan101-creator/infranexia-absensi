import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";

/**
 * Jejak audit: siapa mengubah apa, kapan.
 *
 * Absensi sudah mencatat operatornya, tapi perubahan akun tidak meninggalkan
 * bekas sama sekali — siapa mengubah peran siapa, siapa menghapus siapa.
 * Pada sistem yang menentukan nilai magang orang, itu tidak memadai.
 *
 * Ditulis dari server saja, dan koleksinya tertutup dari browser: catatan
 * audit yang bisa disunting pelakunya sendiri tidak ada gunanya. Admin
 * membacanya lewat API, bukan langsung dari Firestore.
 */

export type AksiJejak =
  | "akun.buat" | "akun.ubah" | "akun.hapus"
  | "kartu.terbit" | "kartu.cabut"
  | "izin.setujui" | "izin.tolak"
  | "config.ubah"
  | "data.bersihkan";

export interface Jejak {
  id: string;
  aksi: AksiJejak;
  pelaku: string;
  namaPelaku: string;
  sasaran?: string;
  namaSasaran?: string;
  rincian?: string;
  padaMs: number;
}

/**
 * Kegagalan menulis jejak tidak boleh menggagalkan tindakan aslinya.
 * Akun yang berhasil dibuat lalu dilaporkan gagal hanya karena catatannya
 * tidak tertulis akan membuat admin membuat akun kembar.
 */
export async function catatJejak(d: {
  aksi: AksiJejak;
  pelaku: string;
  namaPelaku?: string;
  sasaran?: string;
  namaSasaran?: string;
  rincian?: string;
}): Promise<void> {
  try {
    await adminDb().collection("jejak").add({
      aksi: d.aksi,
      pelaku: d.pelaku,
      namaPelaku: d.namaPelaku || "",
      sasaran: d.sasaran || "",
      namaSasaran: d.namaSasaran || "",
      rincian: (d.rincian || "").slice(0, 300),
      pada: FieldValue.serverTimestamp(),
      padaMs: Date.now(),
    });
  } catch (e) {
    console.error("[jejak]", e);
  }
}

/** Ambil nama seseorang untuk dicatat, tanpa membuat pemanggil repot. */
export async function namaUser(uid: string): Promise<string> {
  try {
    const snap = await adminDb().doc(`users/${uid}`).get();
    return snap.exists ? (snap.data() as any).name || "" : "";
  } catch {
    return "";
  }
}

export const LABEL_AKSI: Record<AksiJejak, string> = {
  "akun.buat": "membuat akun",
  "akun.ubah": "mengubah data",
  "akun.hapus": "menghapus akun",
  "kartu.terbit": "menerbitkan kartu",
  "kartu.cabut": "mencabut kartu",
  "izin.setujui": "menyetujui izin",
  "izin.tolak": "menolak izin",
  "config.ubah": "mengubah pengaturan absensi",
  "data.bersihkan": "membersihkan data yatim",
};
