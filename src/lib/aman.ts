/**
 * Pelolos karakter untuk HTML yang disusun sebagai teks.
 *
 * Seluruh cetakan di aplikasi ini — riwayat, kartu, logbook, surat keterangan —
 * dibangun dengan template string lalu diserahkan ke `cetakHtml`. Jendela cetak
 * itu berbagi origin dengan aplikasi, jadi skrip apa pun yang lolos ke dalamnya
 * berjalan sebagai orang yang menekan tombol Cetak. Kalau yang menekan seorang
 * admin, penyerang mendapat kuasa admin.
 *
 * Dan bahannya datang dari peserta sendiri: `firestore.rules` memang
 * mengizinkan peserta mengubah `name`, `foto`, `nim`, `kampus`, dan `jurusan`
 * pada dokumennya. Itu wajar. Yang tidak wajar adalah memasang nilainya ke HTML
 * tanpa diloloskan.
 *
 * Dulu tiap berkas cetak punya `e()` sendiri, dan satu di antaranya tidak punya
 * sama sekali. Satu sumber bersama menutup celah itu — dan yang lebih penting,
 * menutup celah yang sama pada berkas cetak yang belum ditulis.
 */

/** Lolos karakter untuk isi elemen maupun nilai atribut. */
export function lolos(nilai: unknown): string {
  return String(nilai ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Lolos karakter, lalu ganti baris baru menjadi `<br />`. */
export function lolosBaris(nilai: unknown): string {
  return lolos(nilai).replace(/\r?\n/g, "<br />");
}

/**
 * Alamat gambar yang aman dipasang ke `src`.
 *
 * Meloloskan karakter saja tidak cukup di sini. Atribut `src` juga menerima
 * `javascript:` dan `data:text/html`, yang dua-duanya menjalankan skrip tanpa
 * perlu keluar dari tanda kutip. Jadi bentuknya diperiksa lebih dulu, dan yang
 * tidak dikenali dibuang menjadi string kosong — gambar hilang jauh lebih baik
 * daripada skrip berjalan.
 *
 * Yang diterima hanya data URL gambar dan tautan https.
 */
export function sumberGambarAman(nilai: unknown): string {
  const s = String(nilai ?? "").trim();
  if (!s) return "";

  const dataGambar = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i;
  const httpsBiasa = /^https:\/\/[^\s"'<>\\]+$/i;

  if (!dataGambar.test(s) && !httpsBiasa.test(s)) return "";
  return lolos(s);
}

/**
 * Kebijakan keamanan untuk dokumen cetak.
 *
 * Lapis kedua, dipasang sebagai penjaga bukan sebagai perbaikan utama.
 * Perbaikan utamanya tetap meloloskan karakter di tempatnya. Tapi kalau suatu
 * hari ada satu nilai yang terlewat — dan pada kode yang tumbuh, itu soal waktu
 * saja — kebijakan ini yang menahan skripnya tidak berjalan.
 *
 * `default-src 'none'` mematikan skrip, termasuk penangan `onerror` di atribut.
 * Gambar dan gaya sebaris tetap diizinkan karena cetakannya memang memerlukan.
 */
export const CSP_CETAK =
  `<meta http-equiv="Content-Security-Policy" ` +
  `content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:;" />`;
