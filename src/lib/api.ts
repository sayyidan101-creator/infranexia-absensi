"use client";
import { auth } from "@/lib/firebase";

/**
 * Pemanggil API internal Next.js. Setiap permintaan membawa ID token Firebase
 * agar server bisa memastikan siapa yang meminta dan apa perannya.
 *
 * Token bisa mendadak tidak berlaku di tengah sesi — misalnya setelah email
 * atau password akun diubah, Firebase mencabut token lama. Karena itu bila
 * server menjawab 401, permintaan diulang sekali dengan token yang dipaksa
 * segar sebelum benar-benar menyerah.
 */
export async function panggilApi<T>(jalur: string, body?: any): Promise<T> {
  const pengguna = auth.currentUser;
  if (!pengguna) throw new Error("Sesi kamu berakhir. Silakan login ulang.");

  const kirim = async (paksaSegar: boolean): Promise<Response> => {
    let token: string;
    try {
      token = await pengguna.getIdToken(paksaSegar);
    } catch {
      throw new Error("Gagal memperbarui sesi. Silakan login ulang.");
    }
    try {
      return await fetch(jalur, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      throw new Error("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
    }
  };

  let res = await kirim(false);
  if (res.status === 401) res = await kirim(true);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.pesan || "Terjadi kesalahan di server.");
  return data as T;
}
