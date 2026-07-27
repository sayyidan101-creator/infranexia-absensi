"use client";

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

/** Cetak isi HTML lewat jendela baru — dipakai untuk laporan & sertifikat. */
export function cetakHtml(judul: string, isi: string) {
  const w = window.open("", "_blank");
  if (!w) {
    alert("Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.");
    return;
  }
  w.document.write(isi);
  w.document.title = judul;
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
