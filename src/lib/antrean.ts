"use client";

/**
 * Antrean pindaian yang belum sempat terkirim.
 *
 * Risiko yang ditutup: pukul delapan pagi semua peserta datang bersamaan, wifi
 * kantor tersendat, dan pindaian gagal terkirim. Tanpa antrean, pindaiannya
 * hilang begitu saja — peserta merasa sudah absen padahal tidak tercatat, dan
 * baru ketahuan sore hari saat namanya ditandai alpa.
 *
 * Yang disimpan bukan jam pindaiannya, melainkan **kapan pindaian itu terjadi
 * menurut jam perangkat ini sendiri**. Saat dikirim ulang, yang dikirim adalah
 * selisihnya — berapa detik yang lalu. Selisih dua pembacaan dari jam yang sama
 * tetap benar meski jam itu disetel salah, sehingga prinsip "waktu ditentukan
 * server" tidak perlu dilanggar.
 */

const KUNCI = "infranexia.antrean.pindai.v1";
/** Lebih lama dari ini tidak dikirim: server pun menolaknya. */
const KEDALUWARSA_MENIT = 30;
const MAKS_ANTRE = 100;

export interface PindaianTertunda {
  id: string;
  kode: string;
  /** `Date.now()` perangkat saat pindaian terjadi — hanya dipakai untuk selisih. */
  padaMs: number;
  lat: number | null;
  lng: number | null;
  percobaan: number;
}

function bacaMentah(): PindaianTertunda[] {
  if (typeof window === "undefined") return [];
  try {
    const isi = window.localStorage.getItem(KUNCI);
    const arr = isi ? JSON.parse(isi) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function tulis(daftar: PindaianTertunda[]) {
  try {
    window.localStorage.setItem(KUNCI, JSON.stringify(daftar.slice(-MAKS_ANTRE)));
  } catch {
    // Penyimpanan penuh atau diblokir. Antrean memang bantuan tambahan;
    // kegagalannya tidak boleh menghentikan mesin absen.
  }
}

/** Isi antrean yang masih layak dikirim. Yang basi dibuang sekalian. */
export function ambilAntrean(): PindaianTertunda[] {
  const batas = Date.now() - KEDALUWARSA_MENIT * 60_000;
  const hidup = bacaMentah().filter((p) => p.padaMs > batas);
  if (hidup.length !== bacaMentah().length) tulis(hidup);
  return hidup;
}

export function antrekan(kode: string, lat: number | null, lng: number | null): PindaianTertunda {
  const item: PindaianTertunda = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    kode,
    padaMs: Date.now(),
    lat,
    lng,
    percobaan: 0,
  };
  tulis([...ambilAntrean(), item]);
  return item;
}

export function buang(id: string) {
  tulis(ambilAntrean().filter((p) => p.id !== id));
}

export function tandaiGagal(id: string) {
  tulis(ambilAntrean().map((p) => (p.id === id ? { ...p, percobaan: p.percobaan + 1 } : p)));
}

export function kosongkan() {
  tulis([]);
}

/** Berapa detik yang lalu pindaian itu terjadi, dibulatkan. */
export function mundurDetik(p: PindaianTertunda): number {
  return Math.max(0, Math.round((Date.now() - p.padaMs) / 1000));
}

/**
 * Apakah kegagalan ini layak diantrekan.
 *
 * Hanya kegagalan koneksi. Kartu yang tidak sah, peserta nonaktif, atau di luar
 * radius kantor akan tetap ditolak berapa kali pun dicoba — mengantrekannya
 * cuma menunda pesan galat yang sama sambil membuat operator mengira sudah beres.
 */
export function layakDiantre(e: any): boolean {
  const s = String(e?.message || e || "");
  return /tidak bisa terhubung|failed to fetch|network|offline|gagal memperbarui sesi/i.test(s);
}
