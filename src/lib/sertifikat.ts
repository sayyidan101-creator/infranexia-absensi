"use client";
import type { Rekap } from "@/lib/absensi";
import { labelPeriode, hariKerja, Periode } from "@/lib/periode";

/** Lolos karakter HTML agar data peserta tidak merusak tata letak surat. */
function e(teks: unknown): string {
  return String(teks ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const tglIndo = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

export interface DataSertifikat {
  orang: { name?: string; nim?: string; kampus?: string; jurusan?: string } & Periode;
  rekap: Rekap;
  /** Jumlah catatan logbook yang sudah diperiksa pembimbing. */
  logbookDiperiksa?: number;
  /** Nomor surat; kalau kosong, barisnya tidak dicetak. */
  nomor?: string;
  kota?: string;
  penandatangan?: { nama?: string; jabatan?: string };
}

/**
 * Surat keterangan selesai magang, siap cetak (A4).
 *
 * Bentuknya mengikuti surat keterangan resmi: kop, nomor, badan surat yang
 * menerangkan siapa dan berapa lama, tabel rekap kehadiran sebagai lampiran
 * di dalamnya, lalu tempat dan tanda tangan.
 *
 * Angka kehadirannya diambil dari data yang benar-benar tercatat, bukan diketik
 * ulang tangan. Itu justru inti gunanya: surat yang angkanya tidak bisa
 * dipertanggungjawabkan tidak ada bedanya dengan tidak ada surat.
 */
export function sertifikatHtml(d: DataSertifikat): string {
  const { orang, rekap, logbookDiperiksa = 0, nomor, kota = "Palembang" } = d;
  const ttd = d.penandatangan || {};

  const hariIni = new Date().toISOString().slice(0, 10);
  const totalHariKerja =
    orang.mulaiPada && orang.selesaiPada ? hariKerja(orang.mulaiPada, orang.selesaiPada) : 0;

  const petak = [
    ["Hadir tepat waktu", rekap.hadir],
    ["Hadir terlambat", rekap.terlambat],
    ["Izin", rekap.izin],
    ["Sakit", rekap.sakit],
    ["Tanpa keterangan", rekap.alpha],
  ]
    .map(([l, n]) => `<tr><td>${e(l)}</td><td class="angka">${e(n)} hari</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Surat Keterangan Magang — ${e(orang.name || "Peserta")}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 22mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; font-family: "Times New Roman", Georgia, serif;
    color: #111827; font-size: 12pt; line-height: 1.65;
  }

  .kop {
    display: flex; align-items: center; justify-content: space-between; gap: 18px;
    border-bottom: 3px double #0B1F3A; padding-bottom: 10px;
  }
  .kop .kiri b { display: block; font-size: 15pt; color: #0B1F3A; letter-spacing: 0.3px; }
  .kop .kiri span { font-size: 10pt; color: #4b5563; }
  .kop .kanan { text-align: right; font-size: 9.5pt; color: #4b5563; line-height: 1.4; }

  h1 {
    text-align: center; font-size: 13.5pt; letter-spacing: 1.4px;
    text-transform: uppercase; margin: 26px 0 2px; text-decoration: underline;
  }
  .nomor { text-align: center; font-size: 10.5pt; color: #4b5563; margin: 0 0 22px; }

  p { margin: 0 0 12px; text-align: justify; }

  .data { margin: 4px 0 14px 28px; }
  .data tr td { padding: 2px 0; vertical-align: top; }
  .data tr td:first-child { width: 150px; color: #374151; }
  .data tr td:nth-child(2) { width: 14px; }
  .data tr td:last-child { font-weight: bold; }

  .rekap {
    width: 74%; margin: 6px 0 16px 28px; border-collapse: collapse; font-size: 11pt;
  }
  .rekap td { border: 1px solid #9ca3af; padding: 5px 10px; }
  .rekap td.angka { text-align: right; width: 90px; font-weight: bold; }
  .rekap tr.jumlah td { background: #f3f4f6; font-weight: bold; }

  .ttd { margin-top: 30px; display: flex; justify-content: flex-end; break-inside: avoid; }
  .ttd .kolom { text-align: center; min-width: 220px; }
  .ttd .ruang { height: 66px; }
  .ttd .nama { font-weight: bold; text-decoration: underline; }
  .ttd .jabatan { font-size: 10.5pt; color: #4b5563; }

  .kaki {
    margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb;
    font-size: 8.5pt; color: #9ca3af; text-align: center; font-family: system-ui, sans-serif;
  }
</style></head>
<body>
  <div class="kop">
    <div class="kiri">
      <b>INFRANEXIA</b>
      <span>PT Telkom Indonesia · Regional Sumbagsel</span>
    </div>
    <div class="kanan">
      Program Magang<br />Divisi Sumber Daya Manusia
    </div>
  </div>

  <h1>Surat Keterangan Selesai Magang</h1>
  <p class="nomor">${nomor ? `Nomor: ${e(nomor)}` : "&nbsp;"}</p>

  <p>Yang bertanda tangan di bawah ini menerangkan bahwa:</p>

  <table class="data">
    <tr><td>Nama</td><td>:</td><td>${e(orang.name || "—")}</td></tr>
    <tr><td>NIM / Nomor Induk</td><td>:</td><td>${e(orang.nim || "—")}</td></tr>
    <tr><td>Asal Institusi</td><td>:</td><td>${e(orang.kampus || "—")}</td></tr>
    <tr><td>Program Studi</td><td>:</td><td>${e(orang.jurusan || "—")}</td></tr>
  </table>

  <p>
    Telah melaksanakan kegiatan magang di InfraNexia, PT Telkom Indonesia Regional
    Sumbagsel, pada periode <b>${e(labelPeriode(orang))}</b>${
      totalHariKerja ? ` yang mencakup <b>${totalHariKerja} hari kerja</b>` : ""
    }, dan telah menyelesaikan seluruh rangkaian kegiatannya.
  </p>

  <p>Rekapitulasi kehadiran yang tercatat pada sistem absensi selama periode tersebut:</p>

  <table class="rekap">
    ${petak}
    <tr class="jumlah">
      <td>Total hari tercatat</td>
      <td class="angka">${e(rekap.hariKerja)} hari</td>
    </tr>
    <tr class="jumlah">
      <td>Persentase kehadiran</td>
      <td class="angka">${e(rekap.persenKehadiran)}%</td>
    </tr>
  </table>

  ${logbookDiperiksa
    ? `<p>Selama periode tersebut yang bersangkutan mengisi catatan kegiatan harian,
       dengan <b>${e(logbookDiperiksa)} catatan</b> yang telah diperiksa dan disetujui pembimbing lapangan.</p>`
    : ""}

  <p>
    Demikian surat keterangan ini dibuat untuk dapat dipergunakan sebagaimana mestinya.
  </p>

  <div class="ttd">
    <div class="kolom">
      <p style="margin:0">${e(kota)}, ${e(tglIndo(hariIni))}</p>
      <p class="jabatan" style="margin:0">${e(ttd.jabatan || "Pembimbing Lapangan")}</p>
      <div class="ruang"></div>
      <p class="nama" style="margin:0">${e(ttd.nama || "(...................................)")}</p>
    </div>
  </div>

  <div class="kaki">
    Angka kehadiran pada surat ini diambil langsung dari sistem absensi InfraNexia ·
    dicetak ${new Date().toLocaleString("id-ID")}
  </div>
</body></html>`;
}
