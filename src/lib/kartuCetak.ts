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

const KOLOM = 2;
const BARIS = 5;
const PER_HALAMAN = KOLOM * BARIS;

/**
 * Logo diubah jadi data URL, bukan dirujuk lewat `/logo.png`.
 *
 * Lembar cetak dibuka di jendela `about:blank`, dan penyelesaian alamat
 * relatif di sana tidak bisa diandalkan lintas browser. Lagi pula jendela
 * cetak tidak menunggu gambar selesai diunduh — hasilnya kartu tanpa logo.
 */
async function logoDataUrl(jalur: string): Promise<string> {
  try {
    const res = await fetch(jalur);
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise((selesai) => {
      const pembaca = new FileReader();
      pembaca.onloadend = () => selesai(String(pembaca.result || ""));
      pembaca.onerror = () => selesai("");
      pembaca.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

const tglIndo = (ms?: number) =>
  ms
    ? new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "—";

/** Inisial untuk kartu peserta yang belum mengunggah foto. */
function inisial(nama: string): string {
  const bagian = String(nama || "").trim().split(/\s+/).filter(Boolean);
  if (bagian.length === 0) return "?";
  return (bagian[0][0] + (bagian[1]?.[0] || "")).toUpperCase();
}

/**
 * Ukuran huruf nama menyesuaikan panjangnya.
 * Lebar yang tersisa di antara pasfoto dan QR hanya sekitar 34 mm; dengan satu
 * ukuran tetap, nama tiga kata ke atas pasti terpotong — dan nama yang
 * terpotong pada kartu identitas jelas tidak bisa diterima.
 */
function kelasNama(nama: string): string {
  const n = String(nama || "").trim().length;
  if (n <= 16) return "nama-besar";
  if (n <= 28) return "nama-sedang";
  return "nama-kecil-sekali";
}

function sisiDepan(k: KartuCetak, qr: string, logo: string): string {
  const bawah = [k.nim, k.jurusan].filter(Boolean).join(" · ");
  const foto = k.foto
    ? `<img class="pasfoto" src="${k.foto}" alt="" />`
    : `<div class="pasfoto kosong">${e(inisial(k.nama))}</div>`;

  return `
  <div class="kartu depan">
    <div class="pita"></div>
    <div class="kepala">
      ${logo ? `<img class="logo" src="${logo}" alt="" />` : `<span class="merek">InfraNexia</span>`}
      <span class="jenis">Kartu Tanda Peserta Magang</span>
    </div>

    <div class="badan">
      ${foto}
      <div class="identitas">
        <p class="nama ${kelasNama(k.nama)}">${e(k.nama)}</p>
        ${bawah ? `<p class="sub">${e(bawah)}</p>` : ""}
        <p class="instansi">${e(k.kampus || "PT Telkom Indonesia")}</p>
      </div>
      <div class="qr">
        <img src="${qr}" alt="" />
        <p class="kode">${e(formatKode(k.kode))}</p>
      </div>
    </div>

    <div class="kaki">
      <span>Diterbitkan ${e(tglIndo(k.terbitMs))}</span>
      <span class="wilayah">Regional Sumbagsel</span>
    </div>
  </div>`;
}

function sisiBelakang(k: KartuCetak): string {
  return `
  <div class="kartu belakang">
    <div class="bar-atas">Ketentuan Pemakaian</div>
    <ol class="aturan">
      <li>Milik pribadi, tidak boleh dipinjamkan kepada siapa pun.</li>
      <li>Pindai pada mesin absen saat datang dan saat pulang.</li>
      <li>Bila hilang, segera laporkan agar kartunya dinonaktifkan.</li>
    </ol>

    <div class="pengisi"></div>

    <div class="ttd">
      <div class="kolom">
        <p class="label">Pemegang Kartu</p>
        <div class="garis"></div>
        <p class="nama-ttd">${e(k.nama)}</p>
      </div>
      <div class="kolom">
        <p class="label">Pembimbing</p>
        <div class="garis"></div>
        <p class="nama-ttd">&nbsp;</p>
      </div>
    </div>

    <div class="kaki-belakang">
      <span>Bila ditemukan, kembalikan ke kantor InfraNexia.</span>
      <span class="mono">${e(formatKode(k.kode))}</span>
    </div>
  </div>`;
}

/**
 * Lembar kartu siap cetak, dua sisi.
 *
 * Ukurannya 85,6 × 54 mm — persis KTP, jadi hasil potongnya muat di dompet
 * dan bisa dilaminasi memakai pouch ukuran standar.
 *
 * Halaman sisi belakang sengaja dibalik urutan kolomnya. Saat dicetak bolak-balik
 * dengan pembalikan sisi panjang, kertas berputar pada sumbu tegak — tanpa
 * pembalikan ini, punggung setiap kartu mendarat di kartu tetangganya.
 */
export async function lembarKartuHtml(daftar: KartuCetak[]): Promise<string> {
  const logo = await logoDataUrl("/logo-white.png");

  const qrSemua = await Promise.all(daftar.map((k) => gambarQr("INX1:" + k.kode, 400)));

  const halaman: string[] = [];
  for (let i = 0; i < daftar.length; i += PER_HALAMAN) {
    const potongan = daftar.slice(i, i + PER_HALAMAN);
    const qrPotongan = qrSemua.slice(i, i + PER_HALAMAN);

    const depan = potongan.map((k, n) => sisiDepan(k, qrPotongan[n], logo)).join("");

    // Balik urutan di dalam tiap baris agar sejajar saat dicetak bolak-balik
    const belakang: string[] = [];
    for (let b = 0; b < potongan.length; b += KOLOM) {
      belakang.push(...potongan.slice(b, b + KOLOM).reverse().map(sisiBelakang));
    }

    halaman.push(`<section class="lembar">${depan}</section>`);
    halaman.push(`<section class="lembar">${belakang.join("")}</section>`);
  }

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Kartu Tanda Peserta Magang — InfraNexia</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; padding: 0; background: #eef1f5;
    font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif;
    color: #0B1F3A;
  }
  .lembar {
    display: grid; grid-template-columns: repeat(${KOLOM}, 85.6mm);
    gap: 4mm; justify-content: center; align-content: start;
    padding: 5mm 0; break-after: page;
  }
  .lembar:last-child { break-after: auto; }

  .kartu {
    position: relative; width: 85.6mm; height: 54mm; overflow: hidden;
    border-radius: 3mm; background: #fff;
    border: 0.25mm dashed #b9c1cc;   /* panduan gunting */
    break-inside: avoid;
  }

  /* ---------- SISI DEPAN ---------- */
  .depan { display: flex; flex-direction: column; }
  .depan .pita {
    height: 1.6mm; flex-shrink: 0;
    background: linear-gradient(90deg, #E32118 0%, #E32118 32%, #0B1F3A 32%, #0B1F3A 100%);
  }
  .kepala {
    display: flex; align-items: center; justify-content: space-between;
    padding: 2.4mm 4mm 1.6mm; background: #0B1F3A; color: #fff; flex-shrink: 0;
  }
  .kepala .logo { height: 4.2mm; display: block; }
  .kepala .merek { font-size: 3.4mm; font-weight: 700; letter-spacing: 0.3mm; }
  .kepala .jenis {
    font-size: 2.1mm; letter-spacing: 0.28mm; text-transform: uppercase; color: #9fb0cb;
  }

  .badan { flex: 1; display: flex; align-items: center; gap: 2.6mm; padding: 2.6mm 3.5mm; min-height: 0; }

  .pasfoto {
    width: 15mm; height: 20mm; object-fit: cover; flex-shrink: 0;
    border-radius: 1.5mm; border: 0.3mm solid #d7dde6; background: #eef1f5;
  }
  .pasfoto.kosong {
    display: flex; align-items: center; justify-content: center;
    font-size: 7mm; font-weight: 700; color: #9aa7b8;
  }

  .identitas { flex: 1; min-width: 0; }
  .identitas .nama {
    margin: 0; font-weight: 700; line-height: 1.15;
    display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden;
  }
  .nama-besar { font-size: 4.3mm; -webkit-line-clamp: 2; }
  .nama-sedang { font-size: 3.5mm; -webkit-line-clamp: 2; }
  .nama-kecil-sekali { font-size: 3mm; line-height: 1.2; -webkit-line-clamp: 3; }
  .identitas .sub {
    margin: 1.1mm 0 0; font-size: 2.7mm; line-height: 1.3; color: #5a6b82;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .identitas .instansi {
    margin: 1.6mm 0 0; font-size: 2.3mm; color: #8b98a9;
    text-transform: uppercase; letter-spacing: 0.2mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .qr { flex-shrink: 0; text-align: center; }
  .qr img { width: 19.5mm; height: 19.5mm; display: block; }
  .qr .kode {
    margin: 1mm 0 0; font-size: 2.5mm; font-weight: 700; letter-spacing: 0.15mm;
    font-family: "Consolas", "SF Mono", ui-monospace, monospace; color: #0B1F3A;
  }

  .kaki {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1.6mm 4mm 2.2mm; font-size: 2.1mm; color: #8b98a9; flex-shrink: 0;
    border-top: 0.25mm solid #e6eaf0;
  }
  .kaki .wilayah { font-weight: 600; color: #5a6b82; }

  /* ---------- SISI BELAKANG ---------- */
  .belakang { display: flex; flex-direction: column; padding: 0; }
  .bar-atas {
    background: #0B1F3A; color: #fff; padding: 2.2mm 4mm;
    font-size: 2.4mm; letter-spacing: 0.3mm; text-transform: uppercase; font-weight: 600;
  }
  .aturan {
    margin: 2.2mm 3.5mm 0 6.5mm; padding: 0;
    font-size: 2.15mm; line-height: 1.4; color: #3c4b60;
  }
  .aturan li { margin-bottom: 0.9mm; }
  .pengisi { flex: 1; min-height: 0; }

  .ttd { display: flex; gap: 5mm; padding: 0 3.5mm; }
  .ttd .kolom { flex: 1; text-align: center; }
  .ttd .label { margin: 0; font-size: 1.95mm; color: #8b98a9; }
  .ttd .garis { height: 5.5mm; border-bottom: 0.3mm solid #b9c1cc; }
  .ttd .nama-ttd {
    margin: 0.6mm 0 0; font-size: 2.1mm; color: #3c4b60;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .kaki-belakang {
    display: flex; justify-content: space-between; align-items: center; gap: 2.5mm;
    margin-top: 1.6mm; padding: 1.3mm 3.5mm 1.8mm; border-top: 0.25mm solid #e6eaf0;
    font-size: 1.9mm; color: #8b98a9; flex-shrink: 0;
  }
  .kaki-belakang .mono {
    font-family: "Consolas", "SF Mono", ui-monospace, monospace;
    font-weight: 700; color: #5a6b82; white-space: nowrap;
  }

  @media print {
    body { background: #fff; }
    .lembar { padding: 0; }
  }
</style></head>
<body>${halaman.join("")}</body></html>`;
}
