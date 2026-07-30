"use client";
import { CSP_CETAK } from "@/lib/aman";

/**
 * Ekspor ke .xlsx asli.
 *
 * SheetJS dimuat secara dinamis agar tidak menambah beban halaman bagi
 * pengguna yang tidak pernah menekan tombol ekspor.
 */
export interface KolomEkspor {
  kunci: string;
  judul: string;
  lebar?: number;
}

export async function unduhXlsx(
  namaBerkas: string,
  namaSheet: string,
  kolom: KolomEkspor[],
  baris: Record<string, any>[]
) {
  const XLSX = await import("xlsx");

  const data = baris.map((b) => {
    const o: Record<string, any> = {};
    for (const k of kolom) o[k.judul] = b[k.kunci] ?? "";
    return o;
  });

  const sheet = XLSX.utils.json_to_sheet(data, { header: kolom.map((k) => k.judul) });
  sheet["!cols"] = kolom.map((k) => ({ wch: k.lebar || 16 }));
  // Bekukan baris judul agar tetap terlihat saat digulir
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  const buku = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(buku, sheet, namaSheet.slice(0, 31));
  XLSX.writeFile(buku, namaBerkas.endsWith(".xlsx") ? namaBerkas : `${namaBerkas}.xlsx`);
}

/**
 * Sisipkan kebijakan keamanan ke dalam dokumen cetak.
 *
 * Diletakkan tepat sesudah `<head>` supaya berlaku atas seluruh isi. Kalau
 * cetakannya belum punya `<head>` — misalnya cuplikan HTML sederhana — meta-nya
 * ditaruh di depan, dan browser tetap membacanya karena ia yang pertama.
 */
export function denganCsp(isi: string): string {
  if (isi.includes("Content-Security-Policy")) return isi;
  const kepala = /<head(\s[^>]*)?>/i;
  return kepala.test(isi) ? isi.replace(kepala, (m) => m + CSP_CETAK) : CSP_CETAK + isi;
}

/**
 * Cetak isi HTML lewat jendela baru — dipakai untuk laporan & sertifikat.
 *
 * Jendela ini dibuka dari `about:blank`, yang **mewarisi origin aplikasi**.
 * Artinya skrip apa pun yang lolos ke dalam `isi` berjalan sebagai pengguna
 * yang menekan Cetak, dengan akses ke token loginnya. Karena bahan cetakan
 * berasal dari data yang diisi peserta, `CSP_CETAK` dipasang sebagai penjaga:
 * seluruh skrip dimatikan di dokumen ini, termasuk penangan `onerror` di
 * atribut gambar.
 *
 * Ini lapis kedua, bukan pengganti meloloskan karakter di tempatnya.
 */
export function cetakHtml(judul: string, isi: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
    return;
  }
  w.document.write(denganCsp(isi));
  w.document.title = judul;
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
