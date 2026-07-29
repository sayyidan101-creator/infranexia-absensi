"use client";

/**
 * Perkecil dan kompres gambar menjadi data URL.
 *
 * Dipakai bersama oleh foto profil dan foto bukti kegiatan. Keduanya berakhir
 * di dalam dokumen Firestore — Cloud Storage menuntut paket berbayar — jadi
 * ukurannya harus ditekan di browser, sebelum sempat dikirim.
 *
 * Kualitas diturunkan bertahap sampai hasilnya di bawah `maksByte`, bukan
 * ditebak sekali. Foto ruangan yang ramai jauh lebih berat daripada foto layar
 * monitor pada kualitas yang sama, dan menebak satu angka untuk keduanya
 * berarti salah pada salah satunya.
 */
export async function kecilkanGambar(
  berkas: File,
  { maksSisi = 640, maksByte = 200_000 } = {}
): Promise<string> {
  const sumber = await bacaSebagaiDataUrl(berkas);
  const img = await muatGambar(sumber);

  let { width, height } = img;
  const skala = Math.min(1, maksSisi / Math.max(width, height));
  width = Math.max(1, Math.round(width * skala));
  height = Math.max(1, Math.round(height * skala));

  const kanvas = document.createElement("canvas");
  kanvas.width = width;
  kanvas.height = height;
  const konteks = kanvas.getContext("2d");
  if (!konteks) throw new Error("Browser ini tidak bisa memproses gambar.");
  konteks.drawImage(img, 0, 0, width, height);

  for (const mutu of [0.72, 0.6, 0.5, 0.4, 0.32]) {
    const hasil = kanvas.toDataURL("image/jpeg", mutu);
    if (hasil.length <= maksByte) return hasil;
  }

  // Masih terlalu berat pada mutu terendah — kecilkan dimensinya sekali lagi
  const kecil = document.createElement("canvas");
  kecil.width = Math.round(width * 0.7);
  kecil.height = Math.round(height * 0.7);
  kecil.getContext("2d")?.drawImage(img, 0, 0, kecil.width, kecil.height);
  return kecil.toDataURL("image/jpeg", 0.45);
}

function bacaSebagaiDataUrl(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const pembaca = new FileReader();
    pembaca.onload = () => selesai(String(pembaca.result || ""));
    pembaca.onerror = () => gagal(new Error("Gagal membaca berkas."));
    pembaca.readAsDataURL(berkas);
  });
}

function muatGambar(sumber: string): Promise<HTMLImageElement> {
  return new Promise((selesai, gagal) => {
    const img = new Image();
    img.onload = () => selesai(img);
    img.onerror = () => gagal(new Error("Berkas itu bukan gambar yang bisa dibaca."));
    img.src = sumber;
  });
}

/** Perkiraan ukuran data URL dalam kilobita, untuk ditampilkan ke pengguna. */
export function ukuranKb(dataUrl: string): number {
  return Math.round((dataUrl.length * 0.75) / 1024);
}
