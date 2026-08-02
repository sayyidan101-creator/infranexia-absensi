import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Kode QR berputar yang ditampilkan layar kios.
 *
 * Arah pemindaiannya dibalik dari kartu: bukan operator yang memindai peserta,
 * melainkan peserta yang memindai layar di kantor. Yang membuatnya bermakna
 * cuma satu hal — **untuk melihat kodenya, orangnya harus berdiri di depan
 * layar itu.** Absen mandiri tanpa syarat itu tidak membuktikan apa pun;
 * peserta bisa menekan tombol dari kasur.
 *
 * Kodenya berganti tiap 20 detik supaya foto layar yang dikirim lewat pesan
 * sudah basi sebelum sempat dibuka penerimanya. Celahnya tidak nol — dua puluh
 * detik tetap dua puluh detik — tapi dipadukan dengan geofence, jaraknya jauh
 * dari sekadar tombol "saya hadir".
 *
 * ## Kenapa tanpa simpanan
 *
 * Tokennya tidak ditulis ke Firestore sama sekali. Ia dihitung dari nomor slot
 * waktu ditambah tanda tangan HMAC, jadi server mana pun bisa memeriksanya
 * tanpa membaca apa pun. Di paket gratis Firebase ini bukan soal keindahan:
 * kios yang menyala delapan jam akan menulis 1.440 dokumen sehari hanya untuk
 * token yang umurnya dua puluh detik, dan kuota harian habis untuk sesuatu
 * yang tidak perlu disimpan.
 */

/** Umur satu kode, dalam detik. */
export const DETIK_PUTAR = 20;

/**
 * Berapa slot lama yang masih diterima.
 *
 * Kamera peserta bisa saja menangkap kode sepersekian detik sebelum layarnya
 * berganti. Tanpa toleransi ini, pemindaian yang tepat di batas pergantian
 * akan ditolak — dan bagi yang mengalaminya, itu terbaca sebagai "aplikasinya
 * rusak", bukan "coba lagi".
 */
const TOLERANSI_SLOT = 1;

export const AWALAN_LAYAR = "INX2:";

/**
 * Kunci penanda tangan, diturunkan dari kredensial server.
 *
 * Sengaja tidak memakai variabel lingkungan baru. Setiap variabel tambahan
 * adalah satu hal lagi yang bisa lupa diisi — dan kita baru saja menghabiskan
 * setengah jam karena satu kolom yang kosong. Kunci service account dijamin
 * ada (tanpanya aplikasi tidak jalan sama sekali) dan tidak pernah sampai ke
 * browser, jadi ia bahan yang tepat.
 */
function kunci(): Buffer {
  const bahan = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!bahan) throw new Error("FIREBASE_SERVICE_ACCOUNT belum ada; token layar tidak bisa dibuat.");
  return createHmac("sha256", "infranexia-layar-v1").update(bahan).digest();
}

export function slotSaatIni(saat: number = Date.now()): number {
  return Math.floor(saat / (DETIK_PUTAR * 1000));
}

/** Kapan slot ini berakhir, dalam milidetik epoch. */
export function akhirSlot(slot: number): number {
  return (slot + 1) * DETIK_PUTAR * 1000;
}

function tandaTangan(slot: number): string {
  return createHmac("sha256", kunci()).update(`layar:${slot}`).digest("base64url").slice(0, 24);
}

export function buatTokenLayar(saat: number = Date.now()): { token: string; berlakuSampai: number } {
  const slot = slotSaatIni(saat);
  return {
    token: `${AWALAN_LAYAR}${slot}.${tandaTangan(slot)}`,
    berlakuSampai: akhirSlot(slot),
  };
}

/**
 * Bentuknya satu antarmuka dengan kolom opsional, bukan gabungan bertanda.
 * Proyek ini berjalan dengan `strict: false`, dan tanpa `strictNullChecks`
 * penyempitan tipe pada gabungan bertanda tidak bekerja — pemanggilnya akan
 * gagal build saat membaca `alasan`.
 */
export interface HasilPeriksa {
  ok: boolean;
  slot?: number;
  alasan?: "bentuk" | "kedaluwarsa" | "palsu";
}

/**
 * Periksa token dari layar.
 *
 * Perbandingan tanda tangannya memakai `timingSafeEqual` — bukan karena
 * seseorang akan sungguh-sungguh mengukur selisih mikrodetik untuk menebak
 * kode absensi, melainkan karena membandingkan rahasia dengan `===` adalah
 * kebiasaan yang tidak pantas dipelihara di tempat lain.
 */
export function periksaTokenLayar(mentah: unknown, saat: number = Date.now()): HasilPeriksa {
  const teks = String(mentah || "").trim();
  if (!teks.startsWith(AWALAN_LAYAR)) return { ok: false, alasan: "bentuk" };

  const isi = teks.slice(AWALAN_LAYAR.length);
  const pisah = isi.indexOf(".");
  if (pisah < 1) return { ok: false, alasan: "bentuk" };

  const slot = Number(isi.slice(0, pisah));
  const tanda = isi.slice(pisah + 1);
  if (!Number.isSafeInteger(slot) || !tanda) return { ok: false, alasan: "bentuk" };

  // Umur diperiksa lebih dulu, supaya token basi tidak dilaporkan sebagai palsu
  const sekarang = slotSaatIni(saat);
  if (slot > sekarang || sekarang - slot > TOLERANSI_SLOT) {
    return { ok: false, alasan: "kedaluwarsa" };
  }

  const benar = Buffer.from(tandaTangan(slot));
  const diberi = Buffer.from(tanda);
  if (benar.length !== diberi.length || !timingSafeEqual(benar, diberi)) {
    return { ok: false, alasan: "palsu" };
  }
  return { ok: true, slot };
}
