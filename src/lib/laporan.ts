import type { Rekap } from "@/lib/absensi";

interface DataLaporan {
  orang: any;
  periode: string;
  rekap: Rekap;
  baris: { tanggal: string; masuk: string; pulang: string; status: string }[];
}

/** Lolos karakter HTML agar data pengguna tidak merusak tata letak laporan. */
function e(teks: unknown): string {
  return String(teks ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Laporan kehadiran siap cetak (A4).
 * Dibuka di jendela baru lalu dicetak; pengguna bisa memilih
 * "Simpan sebagai PDF" pada dialog cetak browser.
 */
export function laporanHtml(d: DataLaporan): string {
  const { orang, periode, rekap, baris } = d;

  const isiBaris = baris.length
    ? baris.map((b) => `<tr>
        <td>${e(b.tanggal)}</td>
        <td class="mono">${e(b.masuk)}</td>
        <td class="mono">${e(b.pulang)}</td>
        <td>${e(b.status)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="kosong">Tidak ada catatan kehadiran pada periode ini.</td></tr>`;

  const petak = [
    ["Hadir", rekap.hadir, "#059669"],
    ["Terlambat", rekap.terlambat, "#d97706"],
    ["Izin", rekap.izin, "#2563eb"],
    ["Sakit", rekap.sakit, "#7c3aed"],
    ["Alpa", rekap.alpha, "#dc2626"],
  ].map(([l, n, c]) => `<div class="petak">
      <div class="angka" style="color:${c}">${n}</div>
      <div class="label">${l}</div>
    </div>`).join("");

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Kehadiran — ${e(orang?.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; margin:0; }
  .kop { display:flex; justify-content:space-between; align-items:flex-start;
         border-bottom:3px solid #0a1f44; padding-bottom:12px; margin-bottom:18px; }
  .kop h1 { margin:0; font-size:20px; color:#0a1f44; letter-spacing:-0.3px; }
  .kop .sub { font-size:12px; color:#64748b; margin-top:2px; }
  .kop .kanan { text-align:right; font-size:11px; color:#64748b; line-height:1.6; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#64748b;
       margin:22px 0 10px; font-weight:600; }
  .identitas { display:grid; grid-template-columns:repeat(2,1fr); gap:6px 24px; font-size:12.5px; }
  .identitas div { display:flex; gap:8px; }
  .identitas span.k { color:#64748b; min-width:96px; }
  .identitas span.v { font-weight:600; }
  .ringkas { display:flex; gap:10px; margin-top:4px; }
  .petak { flex:1; border:1px solid #e2e8f0; border-radius:8px; padding:10px 8px; text-align:center; }
  .petak .angka { font-size:22px; font-weight:700; line-height:1; }
  .petak .label { font-size:10px; text-transform:uppercase; letter-spacing:0.6px; color:#64748b; margin-top:5px; }
  .sorot { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;
           padding:12px 14px; margin-top:12px; display:flex; justify-content:space-between; align-items:center; }
  .sorot .besar { font-size:26px; font-weight:700; color:#0a1f44; line-height:1; }
  .sorot .ket { font-size:11px; color:#64748b; }
  table { width:100%; border-collapse:collapse; font-size:11.5px; margin-top:4px; }
  th, td { border:1px solid #e2e8f0; padding:6px 9px; text-align:left; }
  th { background:#0a1f44; color:#fff; font-weight:600; }
  tr:nth-child(even) td { background:#f8fafc; }
  td.mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  td.kosong { text-align:center; color:#94a3b8; padding:22px; }
  .ttd { margin-top:34px; display:flex; justify-content:flex-end; }
  .ttd .kotak { text-align:center; font-size:12px; width:210px; }
  .ttd .garis { margin-top:58px; border-top:1px solid #0f172a; padding-top:5px; }
  .kaki { margin-top:26px; padding-top:10px; border-top:1px solid #e2e8f0;
          font-size:10px; color:#94a3b8; text-align:center; }
  @media print { .kaki { position:fixed; bottom:0; left:0; right:0; } }
</style></head>
<body>
  <div class="kop">
    <div>
      <h1>Laporan Kehadiran Magang</h1>
      <div class="sub">InfraNexia · PT Telkom Indonesia · Regional Sumbagsel</div>
    </div>
    <div class="kanan">
      Periode<br><strong style="color:#0f172a;font-size:13px">${e(periode)}</strong>
    </div>
  </div>

  <h2>Identitas Peserta</h2>
  <div class="identitas">
    <div><span class="k">Nama</span><span class="v">${e(orang?.name)}</span></div>
    <div><span class="k">NIM / ID</span><span class="v">${e(orang?.nim || "-")}</span></div>
    <div><span class="k">Kampus</span><span class="v">${e(orang?.kampus || "-")}</span></div>
    <div><span class="k">Divisi</span><span class="v">${e(orang?.jurusan || "-")}</span></div>
    <div><span class="k">Email</span><span class="v">${e(orang?.email || "-")}</span></div>
    <div><span class="k">Status</span><span class="v" style="text-transform:capitalize">${e(orang?.status || "aktif")}</span></div>
  </div>

  <h2>Ringkasan</h2>
  <div class="ringkas">${petak}</div>
  <div class="sorot">
    <div>
      <div class="besar">${rekap.persenKehadiran}%</div>
      <div class="ket">Tingkat kehadiran</div>
    </div>
    <div style="text-align:right">
      <div class="besar">${rekap.hadir + rekap.terlambat} / ${rekap.hariKerja}</div>
      <div class="ket">Hari hadir dari hari kerja tercatat</div>
    </div>
  </div>

  <h2>Rincian Harian</h2>
  <table>
    <thead><tr><th style="width:26%">Tanggal</th><th style="width:18%">Masuk</th><th style="width:18%">Pulang</th><th>Status</th></tr></thead>
    <tbody>${isiBaris}</tbody>
  </table>

  <div class="ttd">
    <div class="kotak">
      Palembang, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}<br>
      Pembimbing Magang
      <div class="garis">(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</div>
    </div>
  </div>

  <div class="kaki">
    Dicetak otomatis dari sistem absensi InfraNexia pada ${new Date().toLocaleString("id-ID")}.
    Jam kehadiran dicatat dari waktu server dan diverifikasi dengan pengenalan wajah.
  </div>
</body></html>`;
}
