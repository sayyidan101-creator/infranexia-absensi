"use client";
import React from "react";

/**
 * Penangkap galat React.
 *
 * Tanpa ini, satu kesalahan rendering membuat seluruh halaman menjadi layar
 * putih kosong — dan pengguna tidak punya cara menjelaskan apa yang terjadi
 * selain "tiba-tiba blank". Di sini kesalahannya ditangkap, ditampilkan
 * seadanya, dan dikirim ke server supaya admin melihatnya tanpa menunggu
 * ada yang mengeluh.
 */

async function laporkan(pesan: string, tumpukan: string) {
  try {
    const { auth } = await import("@/lib/firebase");
    const pengguna = auth.currentUser;
    if (!pengguna) return; // laporan hanya dari sesi yang sah
    const token = await pengguna.getIdToken();
    await fetch("/api/galat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        aksi: "lapor",
        pesan,
        tumpukan,
        halaman: window.location.pathname,
        perangkat: navigator.userAgent,
      }),
    });
  } catch {
    // Kegagalan melapor tidak boleh memicu galat baru — cukup diabaikan.
  }
}

/** Galat yang lolos ke luar React, termasuk janji yang ditolak tanpa penangan. */
export function pasangPelaporGlobal() {
  if (typeof window === "undefined") return;
  if ((window as any).__pelaporGalatTerpasang) return;
  (window as any).__pelaporGalatTerpasang = true;

  window.addEventListener("error", (e) => {
    laporkan(String(e.message || "Galat tidak diketahui"), String(e.error?.stack || ""));
  });
  window.addEventListener("unhandledrejection", (e: any) => {
    const alasan = e?.reason;
    laporkan(
      "Janji ditolak: " + String(alasan?.message || alasan || "tanpa keterangan"),
      String(alasan?.stack || "")
    );
  });
}

interface Keadaan {
  galat: Error | null;
}

export default class PenangkapGalat extends React.Component<
  { children: React.ReactNode },
  Keadaan
> {
  state: Keadaan = { galat: null };

  static getDerivedStateFromError(galat: Error): Keadaan {
    return { galat };
  }

  componentDidCatch(galat: Error, info: React.ErrorInfo) {
    laporkan(galat.message || "Galat rendering", galat.stack || info.componentStack || "");
  }

  render() {
    if (!this.state.galat) return this.props.children;

    return (
      <div className="min-h-[70dvh] flex items-center justify-center px-5">
        <div className="card p-6 max-w-sm w-full text-center anim-fade-up">
          <span className="w-14 h-14 rounded-2xl bg-red-50 text-telkomRed flex items-center justify-center mx-auto">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          <h2 className="font-bold text-navy-900 mt-4">Halaman ini bermasalah</h2>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
            Kesalahannya sudah dilaporkan ke admin. Coba muat ulang — kalau terus
            berulang, beri tahu admin apa yang kamu lakukan sebelum ini.
          </p>

          <p className="mt-3 text-[11px] font-mono text-gray-500 break-words bg-gray-50 rounded-lg px-3 py-2">
            {this.state.galat.message || "Tanpa keterangan"}
          </p>

          <div className="flex gap-2 mt-5">
            <button onClick={() => this.setState({ galat: null })}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press">
              Coba lagi
            </button>
            <button onClick={() => window.location.reload()}
              className="flex-1 py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold press">
              Muat ulang
            </button>
          </div>
        </div>
      </div>
    );
  }
}
