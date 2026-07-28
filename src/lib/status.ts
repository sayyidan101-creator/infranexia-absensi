/**
 * Satu sumber untuk seluruh tampilan status kehadiran.
 *
 * Sebelumnya tiap halaman menyimpan peta warnanya sendiri, dan lambat laun
 * "terlambat" berwarna kuning di satu halaman tapi oranye di halaman lain.
 * Semua yang menampilkan status sekarang mengambil dari sini.
 */

export type StatusHadir = "hadir" | "terlambat" | "izin" | "sakit" | "alpha";

export interface GayaStatus {
  /** Label pendek untuk lencana, misalnya di tabel. */
  pendek: string;
  /** Label utuh untuk kalimat dan tooltip. */
  panjang: string;
  /** Kelas Tailwind untuk lencana. */
  lencana: string;
  /** Warna padat untuk sel kalender. */
  padat: string;
  /** Warna titik kecil. */
  titik: string;
  /** Warna heksa untuk SVG dan grafik. */
  heks: string;
}

export const GAYA: Record<StatusHadir, GayaStatus> = {
  hadir: {
    pendek: "TEPAT WAKTU",
    panjang: "Hadir tepat waktu",
    lencana: "bg-emerald-100 text-emerald-700",
    padat: "bg-emerald-500 text-white",
    titik: "bg-emerald-500",
    heks: "#10b981",
  },
  terlambat: {
    pendek: "TERLAMBAT",
    panjang: "Hadir tapi terlambat",
    lencana: "bg-amber-100 text-amber-700",
    padat: "bg-amber-400 text-white",
    titik: "bg-amber-400",
    heks: "#fbbf24",
  },
  izin: {
    pendek: "IZIN",
    panjang: "Izin",
    lencana: "bg-blue-100 text-blue-700",
    padat: "bg-blue-500 text-white",
    titik: "bg-blue-500",
    heks: "#3b82f6",
  },
  sakit: {
    pendek: "SAKIT",
    panjang: "Sakit",
    lencana: "bg-purple-100 text-purple-700",
    padat: "bg-purple-500 text-white",
    titik: "bg-purple-500",
    heks: "#a855f7",
  },
  alpha: {
    pendek: "ALPA",
    panjang: "Tanpa keterangan",
    lencana: "bg-red-100 text-red-700",
    padat: "bg-telkomRed text-white",
    titik: "bg-telkomRed",
    heks: "#e32118",
  },
};

const TIDAK_DIKENAL: GayaStatus = {
  pendek: "—",
  panjang: "Tidak ada catatan",
  lencana: "bg-gray-100 text-gray-600",
  padat: "bg-gray-100 text-gray-400",
  titik: "bg-gray-300",
  heks: "#cbd5e1",
};

export function gaya(status?: string | null): GayaStatus {
  return GAYA[(status || "") as StatusHadir] || {
    ...TIDAK_DIKENAL,
    pendek: status ? String(status).toUpperCase() : TIDAK_DIKENAL.pendek,
  };
}

/** Urutan baku saat status dipakai sebagai daftar atau legenda. */
export const URUTAN: StatusHadir[] = ["hadir", "terlambat", "izin", "sakit", "alpha"];

/** Dianggap masuk kerja — dipakai untuk menghitung persentase dan rentetan. */
export function terhitungHadir(status?: string | null): boolean {
  return status === "hadir" || status === "terlambat";
}
