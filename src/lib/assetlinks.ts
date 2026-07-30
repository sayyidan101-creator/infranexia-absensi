/**
 * Penyusun berkas Digital Asset Links.
 *
 * Dipisahkan dari route-nya karena berkas route hanya boleh mengekspor
 * penangan HTTP — Next.js menolak build kalau ada ekspor lain. Selain itu,
 * yang benar-benar perlu diuji di sini justru bagian murni ini: perapian sidik
 * jari dan bentuk akhir berkasnya.
 */

export const PAKET_BAWAAN = "id.infranexia.absensi";

/**
 * Rapikan sidik jari apa pun bentuk tempelannya.
 *
 * Orang menempelkannya dari keytool (huruf besar, bertitik dua), dari Play
 * Console (kadang huruf kecil), atau dari Gradle (tanpa titik dua sama
 * sekali). Ketiganya sidik yang sama, tetapi Chrome hanya menerima satu
 * bentuk. Menolak dua di antaranya cuma menghasilkan satu jam menebak-nebak
 * kenapa bilah URL tidak mau hilang.
 */
export function rapikanSidik(mentah: string): string | null {
  const bersih = mentah.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (bersih.length !== 64) return null;          // SHA-256 = 32 bita = 64 digit heksa
  return (bersih.match(/.{2}/g) as string[]).join(":");
}

export function daftarSidik(mentah: string | undefined): string[] {
  if (!mentah) return [];
  const hasil: string[] = [];
  for (const bagian of mentah.split(/[,\s;]+/)) {
    const rapi = rapikanSidik(bagian);
    // Yang tidak berbentuk sidik SHA-256 dibuang, bukan diteruskan. Satu nilai
    // cacat membuat Chrome menolak seluruh berkasnya, bukan cuma baris itu.
    if (rapi && !hasil.includes(rapi)) hasil.push(rapi);
  }
  return hasil;
}

export interface PernyataanAset {
  relation: string[];
  target: {
    namespace: string;
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * Isi berkas assetlinks.json.
 *
 * Kalau tidak ada sidik yang sah, hasilnya daftar kosong — tetap JSON yang
 * sah. Chrome menyimpulkan verifikasi gagal lalu menampilkan bilah URL, persis
 * keadaan yang benar. Menyajikan berkas rusak justru membuat galatnya sukar
 * dilacak.
 */
export function susunAssetlinks(
  paket: string | undefined,
  sidikMentah: string | undefined
): PernyataanAset[] {
  const sidik = daftarSidik(sidikMentah);
  if (!sidik.length) return [];

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: (paket || PAKET_BAWAAN).trim(),
        sha256_cert_fingerprints: sidik,
      },
    },
  ];
}
