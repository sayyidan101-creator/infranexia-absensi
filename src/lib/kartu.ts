import { panggilApi } from "@/lib/api";

export interface HasilAbsenKartu {
  mode: "masuk" | "pulang";
  /** Benar bila catatan ini masuk lewat antrean offline, bukan seketika. */
  tertunda?: boolean;
  status: string;
  jam: string;
  tanggal?: string;
  nama: string;
  foto?: string | null;
  divisi?: string;
  diulang: boolean;
}

export interface KartuCetak {
  uid: string;
  kode: string;
  nama: string;
  nim?: string;
  jurusan?: string;
  kampus?: string;
  foto?: string;
  terbitMs?: number;
}

/** Terbitkan kartu QR baru untuk peserta (admin). Kartu lamanya langsung mati. */
export async function terbitkanKartu(uid: string): Promise<{ kode: string; label: string }> {
  return panggilApi<{ kode: string; label: string }>("/api/kartu", { aksi: "terbitkan", uid });
}

/** Cabut kartu dari peserta (admin). */
export async function cabutKartu(uid: string): Promise<void> {
  await panggilApi("/api/kartu", { aksi: "cabut", uid });
}

/** Ambil kode kartu untuk dicetak. Tanpa `uids`, seluruh kartu yang aktif. */
export async function ambilKartuCetak(uids?: string[]): Promise<KartuCetak[]> {
  const r = await panggilApi<{ kartu: KartuCetak[] }>("/api/kartu", {
    aksi: "cetak", uids: uids ?? [],
  });
  return r.kartu;
}

/**
 * Catat absensi dari kartu yang dipindai di kios.
 *
 * `mundurDetik` dipakai antrean offline: berapa detik yang lalu pindaiannya
 * benar-benar terjadi. Server memakai selisih itu untuk memundurkan jamnya,
 * bukan mempercayai jam perangkat.
 */
export async function absenDenganKartu(
  kode: string,
  lat?: number | null,
  lng?: number | null,
  mundurDetik = 0
): Promise<HasilAbsenKartu> {
  return panggilApi<HasilAbsenKartu>("/api/kartu", {
    aksi: "absen", kode, lat: lat ?? null, lng: lng ?? null, mundurDetik,
  });
}

/** Catat absensi manual bila kartunya tertinggal. */
export async function absenManual(
  uid: string,
  lat?: number | null,
  lng?: number | null
): Promise<HasilAbsenKartu> {
  return panggilApi<HasilAbsenKartu>("/api/kartu", {
    aksi: "manual", uid, lat: lat ?? null, lng: lng ?? null,
  });
}

// ---------------- Kode berputar di layar kios ----------------

export interface TokenLayar {
  token: string;
  /** Milidetik epoch saat kode ini berhenti berlaku. */
  berlakuSampai: number;
  detikPutar: number;
}

/** Minta kode baru untuk ditampilkan di layar kios (pembina). */
export async function ambilTokenLayar(): Promise<TokenLayar> {
  return panggilApi<TokenLayar>("/api/kartu", { aksi: "tokenLayar" });
}

/**
 * Catat kehadiran sendiri setelah memindai layar kios.
 *
 * Dipanggil dari ponsel peserta, bukan dari kios. Yang membuatnya sah adalah
 * tokennya — hanya terbaca dari layar di kantor, dan berumur dua puluh detik.
 */
export async function absenDenganLayar(
  token: string,
  lat?: number | null,
  lng?: number | null
): Promise<HasilAbsenKartu> {
  return panggilApi<HasilAbsenKartu>("/api/kartu", {
    aksi: "hadir", token, lat: lat ?? null, lng: lng ?? null,
  });
}

/** Bentuk yang dicetak di kartu: `ABCD-EFGH-JKMN`. */
export function formatKode(kode: string): string {
  const bersih = String(kode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return bersih.match(/.{1,4}/g)?.join("-") || bersih;
}
