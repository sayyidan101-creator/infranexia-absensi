"use client";
import { auth } from "@/lib/firebase";

/**
 * Galat dari API, beserta kode statusnya.
 *
 * Kodenya dibawa serta karena ada keputusan yang bergantung padanya:
 * antrean offline harus bisa membedakan "server sedang tersendat, coba lagi"
 * dari "kartu ini memang tidak sah, berapa kali pun dicoba". Sebelumnya
 * keduanya hanya berupa teks, dan pembedaannya dilakukan dengan mencocokkan
 * kalimat — yang berarti satu galat tak terduga menghapus seluruh antrean.
 *
 * `status` 0 berarti permintaannya tidak pernah sampai ke server.
 */
export class KesalahanApi extends Error {
  constructor(pesan: string, public status = 0) {
    super(pesan);
    this.name = "KesalahanApi";
  }
}

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
  if (!pengguna) throw new KesalahanApi("Sesi kamu berakhir. Silakan login ulang.", 401);

  const kirim = async (paksaSegar: boolean): Promise<Response> => {
    let token: string;
    try {
      token = await pengguna.getIdToken(paksaSegar);
    } catch {
      // Menyegarkan token butuh jaringan, jadi kegagalannya sering berarti
      // koneksi putus — bukan sesi yang benar-benar dicabut. Statusnya 0.
      throw new KesalahanApi("Gagal memperbarui sesi. Silakan login ulang.", 0);
    }
    try {
      return await fetch(jalur, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      throw new KesalahanApi("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.", 0);
    }
  };

  let res = await kirim(false);
  if (res.status === 401) res = await kirim(true);

  // Badan jawaban dibaca sebagai teks lebih dulu, bukan langsung JSON.
  //
  // Ketika fungsi di server benar-benar tumbang — modul gagal dimuat, memori
  // habis, atau waktunya melewati batas — yang kembali bukan JSON buatan kita,
  // melainkan halaman galat dari platform. Kalau langsung di-JSON-kan, isinya
  // hilang dan berganti kalimat cadangan yang tidak menunjuk apa pun.
  const mentah = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = mentah ? JSON.parse(mentah) : {};
  } catch {
    if (!res.ok) {
      const cuplikan = mentah.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
      throw new KesalahanApi(
        `Server menjawab ${res.status} bukan dalam bentuk JSON` +
        (cuplikan ? ` — ${cuplikan}` : ". Fungsi di server kemungkinan tumbang sebelum sempat menjawab."),
        res.status
      );
    }
    throw new KesalahanApi("Jawaban server tidak bisa dibaca.", res.status);
  }

  if (!res.ok) {
    throw new KesalahanApi(
      (data as any)?.pesan || `Server menjawab ${res.status} tanpa keterangan.`,
      res.status
    );
  }
  return data as T;
}
