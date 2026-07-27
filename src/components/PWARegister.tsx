"use client";
import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let sudahMuatUlang = false;
    let hentikanPemeriksaan: (() => void) | undefined;

    // Saat service worker versi baru mengambil alih, muat ulang sekali.
    // Tanpa ini pengguna harus menghapus data situs secara manual setiap
    // kali aplikasi diperbarui.
    const saatBerganti = () => {
      if (sudahMuatUlang) return;
      sudahMuatUlang = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", saatBerganti);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Periksa pembaruan segera, lalu berkala selama aplikasi terbuka
        reg.update().catch(() => {});
        const id = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
        hentikanPemeriksaan = () => clearInterval(id);
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", saatBerganti);
      hentikanPemeriksaan?.();
    };
  }, []);

  return null;
}
