"use client";
import { gambarQr } from "@/lib/pindaiQr";
import type { KartuCetak } from "@/lib/kartu";
import { formatKode } from "@/lib/kartu";

/** Lolos karakter HTML agar nama peserta tidak merusak tata letak kartu. */
function e(teks: unknown): string {
  return String(teks ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Lembar kartu siap cetak.
 *
 * Ukurannya 85,6 × 54 mm — persis KTP, jadi hasil potongnya muat di dompet
 * dan bisa dilaminasi memakai pouch ukuran standar. Satu halaman A4 memuat
 * sepuluh kartu, dua kolom lima baris.
 *
 * QR-nya ditanam sebagai data URL, bukan tautan. Jendela cetak tidak menunggu
 * jaringan, dan hasilnya tetap keluar walau koneksi mati saat mencetak.
 */
export async function lembarKartuHtml(daftar: KartuCetak[]): Promise<string> {
  const kartu = await Promise.all(
    daftar.map(async (k) => {
      const qr = await gambarQr("INX1:" + k.kode, 360);
      const bawah = [k.nim, k.jurusan].filter(Boolean).join(" · ");
      return `
      <div class="kartu">
        <div class="kiri">
          <div class="merek">
            <span class="titik"></span>
            <span class="nama-merek">InfraNexia</span>
          </div>
          <div class="isi">
            <p class="nama">${e(k.nama)}</p>
            ${bawah ? `<p class="sub">${e(bawah)}</p>` : ""}
          </div>
          <div class="kaki">
            <p class="label">Kartu Absen Magang</p>
            <p class="kode">${e(formatKode(k.kode))}</p>
          </div>
        </div>
        <div class="kanan">
          <img src="${qr}" alt="" />
          <p class="petunjuk">Pindai di mesin absen</p>
        </div>
      </div>`;
    })
  );

  // Kartu digenapkan ke kelipatan dua supaya baris terakhir tidak pincang
  const pengisi = kartu.length % 2 === 1 ? `<div class="kartu kosong"></div>` : "";

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Kartu Absen — InfraNexia</title>
<style>
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; padding: 0;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #0B1F3A; background: #f4f5f7;
  }
  .lembar {
    display: grid; grid-template-columns: repeat(2, 85.6mm);
    gap: 4mm; justify-content: center; padding: 6mm 0;
  }
  .kartu {
    width: 85.6mm; height: 54mm;
    display: flex; overflow: hidden;
    border: 0.3mm dashed #c7ccd4; border-radius: 3mm;
    background: #fff;
  }
  .kartu.kosong { border-color: transparent; background: transparent; }

  .kiri {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 4mm 3mm 3.5mm 4mm;
    background: linear-gradient(140deg, #0B1F3A 0%, #16325c 100%);
    color: #fff;
  }
  .merek { display: flex; align-items: center; gap: 1.6mm; }
  .titik { width: 2.4mm; height: 2.4mm; border-radius: 50%; background: #E32118; display: inline-block; }
  .nama-merek { font-size: 3.1mm; font-weight: 700; letter-spacing: 0.35mm; text-transform: uppercase; }

  .isi { padding-right: 1mm; }
  .nama {
    margin: 0; font-size: 4.4mm; font-weight: 700; line-height: 1.15;
    /* Nama panjang dipotong dua baris, bukan meluber keluar kartu */
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sub {
    margin: 1.2mm 0 0; font-size: 2.7mm; line-height: 1.3; color: #b9c4d6;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  .kaki .label {
    margin: 0; font-size: 2.2mm; letter-spacing: 0.3mm;
    text-transform: uppercase; color: #8fa0bb;
  }
  .kaki .kode {
    margin: 0.8mm 0 0; font-size: 3.3mm; font-weight: 700; letter-spacing: 0.35mm;
    font-family: "Consolas", "SF Mono", ui-monospace, monospace;
  }

  .kanan {
    width: 32mm; flex-shrink: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.5mm; padding: 3mm 2.5mm; background: #fff;
  }
  .kanan img { width: 25mm; height: 25mm; display: block; }
  .petunjuk { margin: 0; font-size: 2.1mm; color: #6b7684; text-align: center; }

  @media print {
    body { background: #fff; }
    .lembar { padding: 0; }
    .kartu { break-inside: avoid; }
  }
</style></head>
<body><div class="lembar">${kartu.join("")}${pengisi}</div></body></html>`;
}
