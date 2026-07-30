import { NextResponse } from "next/server";
import { susunAssetlinks } from "@/lib/assetlinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Digital Asset Links — berkas yang membuat bilah URL hilang dari aplikasi.
 *
 * Aplikasi Android yang membungkus situs ini (Trusted Web Activity) hanya
 * boleh menyembunyikan alamat situsnya kalau situsnya sendiri mengaku bahwa
 * aplikasi itu memang miliknya. Pengakuan itu berkas ini. Tanpanya aplikasi
 * tetap jalan, hanya saja alamat situs terus tampil di atas — kelihatan
 * seperti browser, bukan aplikasi.
 *
 * Yang dicocokkan Chrome: nama paket aplikasi, dan sidik SHA-256 dari kunci
 * yang menandatanganinya. Keduanya BUKAN rahasia — memang harus terbuka di
 * internet supaya bisa dibaca Chrome. Yang rahasia adalah berkas keystore dan
 * kata sandinya, dan keduanya tidak pernah menyentuh proyek ini.
 *
 * Disajikan lewat route, bukan berkas statis, karena satu proyek sering perlu
 * lebih dari satu sidik: kunci unggahan milikmu, dan kunci milik Google kalau
 * Play App Signing dipakai — Play menandatangani ulang aplikasimu dengan
 * kuncinya sendiri, sehingga sidik yang sampai ke HP pengguna bukan sidikmu.
 * Kalau hanya sidikmu yang dicantumkan, aplikasi dari Play Store gagal
 * memverifikasi dan bilah URL muncul kembali.
 *
 * Isi variabel lingkungannya di Vercel:
 *   ANDROID_PACKAGE      id.infranexia.absensi
 *   ANDROID_FINGERPRINTS AA:BB:...  (pisahkan dengan koma bila lebih dari satu)
 */
export async function GET() {
  const isi = susunAssetlinks(process.env.ANDROID_PACKAGE, process.env.ANDROID_FINGERPRINTS);

  return NextResponse.json(isi, {
    headers: {
      "Content-Type": "application/json",
      // Chrome membacanya sekali lalu menyimpannya lama. Cache pendek supaya
      // penambahan sidik kunci Play tidak perlu ditunggu berjam-jam.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
