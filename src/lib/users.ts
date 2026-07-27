// Pembuatan & penghapusan akun dijalankan di server (API route Next.js)
// memakai Firebase Admin SDK, sehingga Firestore Rules bisa menutup rapat
// operasi create/delete pada koleksi `users`.
import { panggilApi } from "@/lib/api";

export interface UserBaru {
  name: string;
  email: string;
  password: string;
  role: "magang" | "pembimbing" | "admin";
  nim?: string;
  kampus?: string;
  jurusan?: string;
  telepon?: string;
}

export interface HasilBuatUser {
  uid: string;
  emailTerkirim: boolean;
  alasanEmail: string | null;
}

export async function buatUser(data: UserBaru): Promise<HasilBuatUser> {
  return panggilApi<HasilBuatUser>("/api/users", { aksi: "buat", ...data });
}

export interface UserUbah {
  uid: string;
  name: string;
  email?: string;
  password?: string;
  role: "magang" | "pembimbing" | "admin";
  nim?: string;
  kampus?: string;
  jurusan?: string;
  telepon?: string;
  status?: string;
}

/**
 * Memperbarui profil sekaligus akun login. Email dan nama tersimpan di
 * Firebase Auth dan Firestore, jadi keduanya diperbarui bersamaan di server.
 */
export async function ubahUser(data: UserUbah): Promise<{ emailBerubah: boolean; passwordBerubah: boolean }> {
  return panggilApi<{ ok: boolean; emailBerubah: boolean; passwordBerubah: boolean }>(
    "/api/users",
    { aksi: "ubah", ...data }
  );
}

/** Menghapus akun Auth, profil, data wajah, dan seluruh riwayat absensinya. */
export async function hapusUser(uid: string): Promise<number> {
  const res = await panggilApi<{ ok: boolean; absensiDihapus: number }>("/api/users", {
    aksi: "hapus",
    uid,
  });
  return res.absensiDihapus;
}

/**
 * Sinkronisasi sekali jalan setelah upgrade: mengisi penanda status
 * pendaftaran wajah untuk peserta yang mendaftar sebelum versi ini.
 */
export async function sinkronWajah(): Promise<{ diperiksa: number; diperbarui: number }> {
  return panggilApi<{ diperiksa: number; diperbarui: number }>("/api/users", { aksi: "sinkron" });
}

/** Pesan error dari API sudah ramah dibaca; fungsi ini hanya berjaga-jaga. */
export function pesanError(e: any): string {
  return e?.message || "Terjadi kesalahan.";
}
