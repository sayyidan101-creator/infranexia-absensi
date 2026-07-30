"use client";
import type { Kegiatan } from "@/lib/aktivitas";

import { lolos as e, lolosBaris as baris, sumberGambarAman } from "@/lib/aman";

const tglPanjang = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export interface DataLogbook {
  orang: { name?: string; nim?: string; kampus?: string; jurusan?: string };
  periode: string;
  catatan: Kegiatan[];
  /** tanggal -> foto data URL. Hanya yang berhasil diambil. */
  foto?: Record<string, string>;
}

/**
 * Logbook kegiatan siap cetak (A4).
 *
 * Bentuknya mengikuti kebiasaan lampiran laporan magang kampus: kop, identitas
 * peserta, tabel kegiatan per tanggal, dan kolom tanda tangan pembimbing di
 * akhir. Dibuka di jendela baru lalu dicetak; pada dialog cetak bisa dipilih
 * "Simpan sebagai PDF".
 */
export function logbookHtml(d: DataLogbook): string {
  const { orang, periode, catatan, foto = {} } = d;

  const urut = [...catatan].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const isi = urut.length
    ? urut
        .map((k, i) => {
          const gambar = foto[k.tanggal];
          return `<tr>
            <td class="no">${i + 1}</td>
            <td class="tgl">${e(tglPanjang(k.tanggal))}</td>
            <td class="uraian">
              <p class="kegiatan">${baris(k.kegiatan)}</p>
              ${k.kendala ? `<p class="kendala"><b>Kendala:</b> ${baris(k.kendala)}</p>` : ""}
              ${k.catatanPembimbing
                ? `<p class="umpan"><b>Catatan pembimbing:</b> ${baris(k.catatanPembimbing)}</p>`
                : ""}
            </td>
            <td class="bukti">
              ${sumberGambarAman(gambar)
                ? `<img src="${sumberGambarAman(gambar)}" alt="" />`
                : `<span class="tanpa">—</span>`}
            </td>
            <td class="status">${k.status === "diperiksa" ? "Diperiksa" : "Menunggu"}</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="kosong">Belum ada catatan kegiatan pada periode ini.</td></tr>`;

  const diperiksa = urut.filter((k) => k.status === "diperiksa").length;
  const berfoto = urut.filter((k) => foto[k.tanggal]).length;

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Logbook Kegiatan — ${e(orang.name || "Peserta")}</title>
<style>
  @page { size: A4 portrait; margin: 15mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #0f172a; font-size: 11px; line-height: 1.5;
  }

  .kop {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; border-bottom: 2.5px solid #0B1F3A; padding-bottom: 10px;
  }
  .kop h1 { margin: 0; font-size: 17px; color: #0B1F3A; letter-spacing: 0.2px; }
  .kop .sub { margin: 3px 0 0; font-size: 11px; color: #64748b; }
  .kop .cap { text-align: right; font-size: 10px; color: #64748b; }
  .kop .cap b { display: block; font-size: 12px; color: #0B1F3A; }

  .identitas {
    display: grid; grid-template-columns: repeat(2, 1fr);
    gap: 4px 22px; margin: 12px 0 4px;
  }
  .identitas div { display: flex; gap: 6px; }
  .identitas span.l { color: #64748b; min-width: 74px; }
  .identitas span.v { font-weight: 600; }

  .ringkas {
    display: flex; gap: 18px; margin: 10px 0 14px; padding: 8px 12px;
    background: #f1f5f9; border-radius: 6px; font-size: 10.5px; color: #475569;
  }
  .ringkas b { color: #0B1F3A; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
  th {
    background: #0B1F3A; color: #fff; font-size: 10px; text-align: left;
    text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600;
  }
  tr { break-inside: avoid; }
  td.no { width: 24px; text-align: center; color: #64748b; }
  td.tgl { width: 96px; color: #334155; }
  td.bukti { width: 84px; text-align: center; }
  td.bukti img { width: 74px; height: 56px; object-fit: cover; border-radius: 3px; }
  td.bukti .tanpa { color: #cbd5e1; }
  td.status { width: 62px; font-size: 10px; color: #475569; }
  td.kosong { text-align: center; color: #94a3b8; padding: 22px; }

  .kegiatan { margin: 0; }
  .kendala { margin: 5px 0 0; color: #b45309; font-size: 10.5px; }
  .umpan { margin: 5px 0 0; color: #1d4ed8; font-size: 10.5px; }

  .ttd {
    margin-top: 26px; display: flex; justify-content: flex-end;
    break-inside: avoid;
  }
  .ttd .kolom { text-align: center; min-width: 190px; }
  .ttd .kolom p { margin: 0; }
  .ttd .ruang { height: 58px; }
  .ttd .garis { border-bottom: 1px solid #475569; }
  .ttd .peran { margin-top: 5px; color: #64748b; font-size: 10px; }

  .kaki {
    margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between;
  }
</style></head>
<body>
  <div class="kop">
    <div>
      <h1>Logbook Kegiatan Magang</h1>
      <p class="sub">Periode ${e(periode)}</p>
    </div>
    <div class="cap">
      <b>InfraNexia</b>
      PT Telkom Indonesia<br />Regional Sumbagsel
    </div>
  </div>

  <div class="identitas">
    <div><span class="l">Nama</span><span class="v">${e(orang.name || "—")}</span></div>
    <div><span class="l">NIM</span><span class="v">${e(orang.nim || "—")}</span></div>
    <div><span class="l">Kampus</span><span class="v">${e(orang.kampus || "—")}</span></div>
    <div><span class="l">Jurusan</span><span class="v">${e(orang.jurusan || "—")}</span></div>
  </div>

  <div class="ringkas">
    <span><b>${urut.length}</b> hari tercatat</span>
    <span><b>${diperiksa}</b> sudah diperiksa pembimbing</span>
    <span><b>${berfoto}</b> disertai bukti foto</span>
  </div>

  <table>
    <thead>
      <tr><th>No</th><th>Tanggal</th><th>Uraian Kegiatan</th><th>Bukti</th><th>Status</th></tr>
    </thead>
    <tbody>${isi}</tbody>
  </table>

  <div class="ttd">
    <div class="kolom">
      <p class="peran">Mengetahui, Pembimbing Lapangan</p>
      <div class="ruang garis"></div>
      <p class="peran">Nama &amp; Tanda Tangan</p>
    </div>
  </div>

  <div class="kaki">
    <span>Dicetak dari sistem absensi InfraNexia</span>
    <span>${new Date().toLocaleString("id-ID")}</span>
  </div>
</body></html>`;
}
