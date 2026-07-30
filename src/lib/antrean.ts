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

/**
 * Batas usia pindaian yang masih layak dikirim.
 *
 * Sengaja **lebih pendek** daripada batas mundur di server (30 menit). Kalau
 * keduanya sama, ada celah: pindaian tepat di ambang dipangkas server ke batas
 * atas, dan begitu dipangkas jam yang tercatat tidak lagi mengikuti pindaiannya
 * — dua kiriman dari satu pindaian bisa jatuh pada dua jam berbeda dan
 * menghasilkan dua catatan.
 *
 * Komentar lama di sini menyebut "server pun menolaknya". Itu keliru: server
 * tidak menolak, ia memangkas lalu mencatat. Jadi pindaian yang dibuang di
 * sini sebenarnya masih akan diterima — karena itu pembuangannya sekarang
 * dihitung dan dilaporkan, tidak lagi diam-diam.
 */
const KEDALUWARSA_MENIT = 25;
const MAKS_ANTRE = 100;

/** Sesudah sebanyak ini percobaan gagal, satu pindaian berhenti dicoba lagi. */
export const MAKS_PERCOBAAN = 6;

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

function masihSegar(p: PindaianTertunda): boolean {
  return p.padaMs > Date.now() - KEDALUWARSA_MENIT * 60_000;
}

/** Isi antrean yang masih layak dikirim. Tidak mengubah apa pun. */
export function ambilAntrean(): PindaianTertunda[] {
  return bacaMentah().filter(masihSegar);
}

/**
 * Buang yang sudah kedaluwarsa, dan **kembalikan** apa yang dibuang.
 *
 * Dipisah dari `ambilAntrean` dengan sengaja. Dulu pembuangan terjadi sebagai
 * efek samping dari membaca, sehingga pindaian orang bisa hilang tanpa ada satu
 * pun tempat yang bisa memberi tahu. Sekarang pemanggilnya menerima daftarnya
 * dan bisa mengabarkan operator — pindaian yang hilang berarti seseorang
 * ditandai alpa sore itu, dan itu harus diketahui saat masih bisa dibetulkan.
 */
export function bersihkanKedaluwarsa(): PindaianTertunda[] {
  const semua = bacaMentah();
  const basi = semua.filter((p) => !masihSegar(p));
  if (basi.length) tulis(semua.filter(masihSegar));
  return basi;
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
 * Apakah kegagalan ini masih pantas dicoba lagi.
 *
 * Keputusannya diambil dari **kode status**, bukan dari mencocokkan kalimat
 * galat. Cara lama — mencari kata "tidak bisa terhubung", "network", dan
 * seterusnya — berarti setiap galat yang kalimatnya tak terduga dianggap
 * penolakan permanen. Satu jawaban 500 dari Firestore yang tersendat cukup untuk
 * menghapus seluruh antrean pagi itu, dan operator hanya melihat lencana
 * "12 menunggu terkirim" hilang seperti berhasil.
 *
 * Yang pantas dicoba lagi:
 *   0        permintaannya tidak pernah sampai — koneksi putus
 *   401      token kedaluwarsa; percobaan berikutnya memakai token segar
 *   408 429  server minta menunggu
 *   5xx      server tersendat, bukan pindaiannya yang salah
 *
 * Yang tidak: 4xx lainnya. Kartu tidak sah, peserta nonaktif, di luar radius,
 * atau di luar periode magang akan ditolak berapa kali pun dicoba —
 * mengantrekannya cuma menunda pesan galat yang sama.
 */
export function layakDiantre(e: any): boolean {
  // `typeof`, bukan `> 0`: status 0 justru kasus paling penting di sini —
  // permintaannya tidak pernah sampai ke server.
  if (typeof e?.status === "number" && Number.isFinite(e.status)) {
    const status = e.status;
    return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
  }

  // Tanpa kode status — galat dari luar panggilan API, atau kode lama.
  // Diperlakukan sebagai gangguan koneksi bila kalimatnya menunjukkan begitu.
  const s = String(e?.message || e || "");
  return /tidak bisa terhubung|failed to fetch|network|offline|gagal memperbarui sesi/i.test(s);
}
