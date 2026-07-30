/**
 * Periode magang: tanggal mulai dan tanggal selesai tiap peserta.
 *
 * Tanpa ini, setiap persentase kehadiran dihitung dari data yang kebetulan ada,
 * bukan dari lama magang yang sebenarnya. Peserta yang baru masuk pertengahan
 * bulan terlihat buruk tanpa sebab, dan yang sudah selesai tetap terhitung
 * "belum absen" setiap hari sampai akunnya dimatikan manual.
 *
 * Keduanya opsional. Peserta lama yang belum diisi periodenya tetap berjalan
 * seperti sebelumnya — tidak ada yang mendadak terkunci hanya karena kolom
 * baru ini kosong.
 */

export interface Periode {
  mulaiPada?: string;    // YYYY-MM-DD
  selesaiPada?: string;  // YYYY-MM-DD
}

const POLA = /^\d{4}-\d{2}-\d{2}$/;

export function tanggalValid(t: unknown): boolean {
  const s = String(t ?? "");
  if (!POLA.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Apakah sebuah tanggal berada di dalam periode. Batas yang kosong berarti terbuka. */
export function dalamPeriode(p: Periode, tanggal: string): boolean {
  if (p.mulaiPada && tanggal < p.mulaiPada) return false;
  if (p.selesaiPada && tanggal > p.selesaiPada) return false;
  return true;
}

export type StatusPeriode = "belum-mulai" | "berjalan" | "selesai" | "tanpa-periode";

export function statusPeriode(p: Periode, hariIni: string): StatusPeriode {
  if (!p.mulaiPada && !p.selesaiPada) return "tanpa-periode";
  if (p.mulaiPada && hariIni < p.mulaiPada) return "belum-mulai";
  if (p.selesaiPada && hariIni > p.selesaiPada) return "selesai";
  return "berjalan";
}

/**
 * Potong sebuah rentang agar tidak melewati periode magang.
 * Mengembalikan null bila keduanya tidak beririsan sama sekali — misalnya
 * rekap bulan Maret untuk peserta yang baru mulai bulan Juni.
 */
export function irisanPeriode(
  p: Periode,
  dari: string,
  sampai: string
): { dari: string; sampai: string } | null {
  const a = p.mulaiPada && p.mulaiPada > dari ? p.mulaiPada : dari;
  const b = p.selesaiPada && p.selesaiPada < sampai ? p.selesaiPada : sampai;
  return a > b ? null : { dari: a, sampai: b };
}

/** Jumlah hari kerja (Senin–Jumat) dalam sebuah rentang, batas ikut dihitung. */
export function hariKerja(dari: string, sampai: string): number {
  if (!tanggalValid(dari) || !tanggalValid(sampai) || dari > sampai) return 0;
  let n = 0;
  const d = new Date(dari + "T00:00:00Z");
  const akhir = new Date(sampai + "T00:00:00Z");
  while (d <= akhir) {
    const h = d.getUTCDay();
    if (h !== 0 && h !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Sisa hari kalender sampai periode berakhir. Negatif berarti sudah lewat. */
export function sisaHari(p: Periode, hariIni: string): number | null {
  if (!p.selesaiPada) return null;
  const a = new Date(hariIni + "T00:00:00Z").getTime();
  const b = new Date(p.selesaiPada + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}

const tglIndo = (s?: string) => {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

/** "12 Juni – 12 September 2026", atau bentuk terbuka bila salah satu kosong. */
export function labelPeriode(p: Periode): string {
  if (!p.mulaiPada && !p.selesaiPada) return "Belum ditentukan";
  if (p.mulaiPada && !p.selesaiPada) return `Mulai ${tglIndo(p.mulaiPada)}`;
  if (!p.mulaiPada && p.selesaiPada) return `Sampai ${tglIndo(p.selesaiPada)}`;

  const a = new Date(p.mulaiPada + "T00:00:00");
  const b = new Date(p.selesaiPada + "T00:00:00");
  // Tahun yang sama tidak perlu ditulis dua kali
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.toLocaleDateString("id-ID", { day: "numeric", month: "long" })} – ${tglIndo(p.selesaiPada)}`;
  }
  return `${tglIndo(p.mulaiPada)} – ${tglIndo(p.selesaiPada)}`;
}

export const GAYA_PERIODE: Record<StatusPeriode, { teks: string; kelas: string }> = {
  "berjalan": { teks: "BERJALAN", kelas: "bg-emerald-100 text-emerald-700" },
  "belum-mulai": { teks: "BELUM MULAI", kelas: "bg-blue-100 text-blue-700" },
  "selesai": { teks: "SELESAI", kelas: "bg-gray-200 text-gray-600" },
  "tanpa-periode": { teks: "TANPA PERIODE", kelas: "bg-amber-100 text-amber-700" },
};
