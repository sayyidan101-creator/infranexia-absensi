import "server-only";
import { createHash, randomBytes } from "crypto";

/**
 * Kartu absen berbentuk kode QR yang diterbitkan sendiri oleh sistem.
 *
 * Bedanya dengan kartu NFC: nomor seri NFC sudah tercetak dari pabrik, jadi
 * kartu apa pun bisa didaftarkan — termasuk kartu e-money milik siapa saja.
 * Di sini kebalikannya. Kode dibuat acak oleh server, dan hanya kode yang
 * pernah diterbitkan yang dikenali. Kartu dari luar tidak ada artinya.
 *
 * Kodenya disimpan dua kali: sebagai id dokumen dalam bentuk hash (untuk
 * pencarian cepat saat dipindai) dan sebagai teks di dalam dokumen (supaya
 * kartu yang hilang bisa dicetak ulang tanpa menerbitkan kode baru). Keduanya
 * berada di koleksi `kartu` yang tertutup rapat dari browser.
 */

/**
 * Huruf dan angka yang tidak saling menyerupai bila dibaca manusia.
 * 0, 1, I, L, O, dan U sengaja dibuang: kode ini kadang harus diketik ulang
 * dari kartu yang tercetak buram atau tergores.
 */
const ALFABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const PANJANG = 12;
const GARAM = "infranexia-kartu-v2";

/** Awalan pada muatan QR, supaya QR asing langsung ketahuan bukan kartu kami. */
export const AWALAN_QR = "INX1:";

/** Terbitkan kode kartu baru yang acak. */
export function buatKode(): string {
  let hasil = "";
  // Byte yang jatuh di sisa pembagian ditolak, bukan dipaksa masuk lewat modulo.
  // Tanpa ini huruf-huruf awal alfabet akan muncul sedikit lebih sering.
  const batas = Math.floor(256 / ALFABET.length) * ALFABET.length;
  while (hasil.length < PANJANG) {
    for (const b of randomBytes(PANJANG * 2)) {
      if (b >= batas) continue;
      hasil += ALFABET[b % ALFABET.length];
      if (hasil.length === PANJANG) break;
    }
  }
  return hasil;
}

/**
 * Rapikan apa pun yang masuk menjadi bentuk baku: huruf besar, tanpa pemisah.
 * Menerima hasil pindaian QR (`INX1:ABCD...`) maupun ketikan tangan
 * (`abcd-efgh-jkmn`).
 */
export function normalkanKode(mentah: unknown): string {
  let teks = String(mentah ?? "").trim().toUpperCase();
  if (teks.startsWith(AWALAN_QR)) teks = teks.slice(AWALAN_QR.length);
  return teks.replace(/[^A-Z0-9]/g, "");
}

export function kodeValid(mentah: unknown): boolean {
  const kode = normalkanKode(mentah);
  if (kode.length !== PANJANG) return false;
  return [...kode].every((c) => ALFABET.includes(c));
}

export function hashKode(kode: string): string {
  return createHash("sha256").update(GARAM + ":" + normalkanKode(kode)).digest("hex");
}

/** Bentuk yang dicetak di kartu: `ABCD-EFGH-JKMN`. */
export function formatKode(kode: string): string {
  const bersih = normalkanKode(kode);
  return bersih.match(/.{1,4}/g)?.join("-") || bersih;
}

/** Potongan yang aman ditampilkan di daftar peserta, misalnya "…JKMN". */
export function labelAman(kode: string): string {
  const bersih = normalkanKode(kode);
  return bersih.length <= 4 ? bersih : "…" + bersih.slice(-4);
}

/** Isi yang ditanam di dalam gambar QR. */
export function muatanQr(kode: string): string {
  return AWALAN_QR + normalkanKode(kode);
}
