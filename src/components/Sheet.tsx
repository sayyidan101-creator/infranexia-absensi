"use client";
import { useEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Panel bertumpuk: bottom sheet di ponsel, dialog di layar lebar.
 *
 * Dirender lewat portal ke <body>. Ini penting: konten halaman dibungkus
 * <main> yang punya animasi masuk, dan elemen beranimasi membentuk stacking
 * context sendiri. Akibatnya z-index setinggi apa pun di dalamnya tetap kalah
 * oleh bilah navigasi bawah — tombol di footer panel jadi tertutup.
 *
 * Tata letaknya kolom fleks dengan tinggi `dvh`, bukan `vh`, supaya bilah
 * alamat browser ponsel yang muncul-hilang tidak memotong bagian bawah.
 */
export default function Sheet({
  buka,
  tutup,
  judul,
  children,
  footer,
  lebar = "max-w-lg",
}: {
  buka: boolean;
  tutup: () => void;
  judul: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  lebar?: string;
}) {
  const [terpasang, setTerpasang] = useState(false);
  useEffect(() => setTerpasang(true), []);

  useEffect(() => {
    if (!buka) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") tutup(); };
    document.addEventListener("keydown", esc);
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = sebelumnya;
    };
  }, [buka, tutup]);

  if (!terpasang || !buka) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 anim-fade-in"
      role="dialog" aria-modal="true" onClick={tutup}>
      <div className="absolute inset-0 bg-navy-900/50 backdrop-blur-[2px]" />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative bg-white w-full ${lebar} rounded-t-3xl sm:rounded-2xl shadow-2xl
                    flex flex-col max-h-[92dvh] anim-slide-up sm:anim-pop`}
      >
        {/* Kepala */}
        <div className="shrink-0 px-5 pt-3 pb-3 border-b border-gray-100">
          <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mb-3 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base sm:text-lg font-bold text-navy-900">{judul}</h2>
            <button onClick={tutup} aria-label="Tutup"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 press shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Isi — satu-satunya bagian yang menggulir */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>

        {/* Kaki — selalu terlihat, di luar area gulir */}
        {footer && (
          <div className="shrink-0 border-t border-gray-100 px-5 py-3 pb-safe bg-white rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
