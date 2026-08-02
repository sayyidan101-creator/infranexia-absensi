"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Protected from "@/components/Protected";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Konfeti, KepalaHalaman, Halaman } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { kameraTersedia, mulaiPindaiQr, PemindaiQr } from "@/lib/pindaiQr";
import { absenDenganLayar, HasilAbsenKartu } from "@/lib/kartu";

/**
 * Absen mandiri: peserta memindai kode di layar kios.
 *
 * Arahnya kebalikan dari halaman kios. Di sana operator memindai kartu
 * peserta; di sini peserta memindai layar kantor. Yang dijaga tetap sama —
 * orangnya harus benar-benar berada di kantor, karena kodenya cuma ada di
 * layar itu dan berganti tiap dua puluh detik.
 */

/** Jeda sebelum kode yang sama boleh dikirim ulang. */
const JEDA_KODE_SAMA_MS = 5_000;

function getPosisi(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res(p),
      () => res(null),
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  });
}

function AbsenInner() {
  const { profil } = useAuth();
  const [aktif, setAktif] = useState(false);
  const [galat, setGalat] = useState("");
  const [gagal, setGagal] = useState("");
  const [hasil, setHasil] = useState<HasilAbsenKartu | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const video = useRef<HTMLVideoElement | null>(null);
  const pemindai = useRef<PemindaiQr | null>(null);
  const posisi = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const sedangProses = useRef(false);
  const kodeTerakhir = useRef<{ kode: string; waktu: number }>({ kode: "", waktu: 0 });
  /**
   * Menandai bahwa halaman ini sudah ditinggalkan.
   *
   * Kamera dinyalakan lewat `await`, jadi ada jeda satu-dua detik antara
   * penekanan tombol dan kembalinya kendali. Kalau pengguna pindah halaman di
   * dalam jeda itu, pembersihan berjalan sebelum kameranya sempat dicatat —
   * dan kameranya menyala terus sampai tab ditutup.
   */
  const usang = useRef(false);

  useEffect(() => {
    getPosisi().then((p) => {
      if (p) posisi.current = { lat: p.coords.latitude, lng: p.coords.longitude };
    });
  }, []);

  const kirim = useCallback(async (token: string) => {
    if (sedangProses.current) return;
    sedangProses.current = true;
    setSibuk(true);
    setGagal("");
    try {
      const r = await absenDenganLayar(token, posisi.current.lat, posisi.current.lng);
      setHasil(r);
      if (navigator.vibrate) navigator.vibrate(r.diulang ? 20 : [15, 45, 15]);
    } catch (e: any) {
      setGagal(pesanError(e));
      setHasil(null);
      if (navigator.vibrate) navigator.vibrate([50, 60, 50]);
    } finally {
      setSibuk(false);
      // Jeda sebelum boleh mengirim lagi, supaya kode yang sudah kedaluwarsa
      // tidak dikirim berulang-ulang sementara peserta membaca pesannya
      setTimeout(() => { sedangProses.current = false; }, 2500);
    }
  }, []);

  const tangani = useCallback((isi: string) => {
    const kode = String(isi || "").trim();
    if (!kode) return;
    const { kode: lalu, waktu } = kodeTerakhir.current;
    if (kode === lalu && Date.now() - waktu < JEDA_KODE_SAMA_MS) return;
    kodeTerakhir.current = { kode, waktu: Date.now() };
    kirim(kode);
  }, [kirim]);

  const mulai = async () => {
    setGalat("");
    setGagal("");
    setHasil(null);
    if (!video.current) return;
    try {
      const p = await mulaiPindaiQr(video.current, tangani, (m) => setGagal(m));
      // Halaman sudah ditinggalkan selagi kamera menyala — hentikan sekarang,
      // bukan menyimpannya di ref yang tidak akan dibaca siapa pun lagi
      if (usang.current) { p.hentikan(); return; }
      pemindai.current = p;
      setAktif(true);
    } catch (e: any) {
      setGalat(e?.message || "Gagal menyalakan kamera. Periksa izin kamera di pengaturan browser.");
    }
  };

  const berhenti = () => {
    pemindai.current?.hentikan();
    pemindai.current = null;
    setAktif(false);
  };

  useEffect(() => () => { usang.current = true; pemindai.current?.hentikan(); }, []);

  const didukung = kameraTersedia();

  return (
    <Halaman lebar="sempit">
      <KepalaHalaman
        atas="Kehadiran"
        judul="Absen"
        keterangan="Arahkan kamera ke layar absensi di kantor. Kodenya berganti tiap 20 detik, jadi harus dipindai langsung dari layarnya."
      />

      {galat && <Pesan tipe="err">{galat}</Pesan>}

      {!didukung && (
        <Pesan tipe="err">
          Browser ini tidak bisa membuka kamera. Buka lewat Chrome atau Safari,
          atau minta pembimbing mencatatkan kehadiranmu secara manual.
        </Pesan>
      )}

      {/* ---------- Jendela kamera ---------- */}
      <div className="relative rounded-2xl overflow-hidden bg-navy-900 aspect-[3/4] sm:aspect-square">
        <video
          ref={video}
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            aktif && !hasil && !gagal ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Bingkai bidik */}
        {aktif && !hasil && !gagal && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3/5 aspect-square rounded-2xl border-2 border-white/70 shadow-[0_0_0_100vmax_rgba(10,31,68,0.45)]" />
          </div>
        )}

        {/* Sebelum dinyalakan */}
        {!aktif && !hasil && !gagal && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="w-16 h-16 rounded-2xl bg-white/10 text-white flex items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              </svg>
            </span>
            <p className="text-white/80 text-sm leading-relaxed max-w-xs">
              Datang ke layar absensi di kantor, lalu nyalakan kamera dan
              arahkan ke kode di layarnya.
            </p>
          </div>
        )}

        {/* Berhasil */}
        {hasil && (
          <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-3 p-6 text-center anim-fade-up">
            <Konfeti aktif={!hasil.diulang} />
            <span className={`w-16 h-16 rounded-full flex items-center justify-center ${
              hasil.diulang ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-600"
            }`}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <div>
              <p className="text-lg font-bold text-navy-900">{hasil.nama}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {hasil.diulang
                  ? `Sudah tercatat sebelumnya · ${hasil.jam}`
                  : `Absen ${hasil.mode} · ${hasil.jam}`}
              </p>
              {!hasil.diulang && hasil.status === "terlambat" && (
                <p className="text-xs font-semibold text-amber-600 mt-1.5">Tercatat terlambat</p>
              )}
            </div>
            <button onClick={() => { setHasil(null); }}
              className="mt-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press">
              Tutup
            </button>
          </div>
        )}

        {/* Gagal */}
        {gagal && !hasil && (
          <div className="absolute inset-0 bg-white flex flex-col items-center justify-center gap-3 p-6 text-center anim-fade-up">
            <span className="w-16 h-16 rounded-full bg-red-100 text-telkomRed flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="10" />
              </svg>
            </span>
            <p className="text-sm text-navy-900 leading-relaxed max-w-xs">{gagal}</p>
            <button onClick={() => setGagal("")}
              className="mt-1 px-5 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-semibold press">
              Coba lagi
            </button>
          </div>
        )}

        {sibuk && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center pointer-events-none">
            <span className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs">Mencatat...</span>
          </div>
        )}
      </div>

      <button
        onClick={aktif ? berhenti : mulai}
        disabled={!didukung}
        className={`w-full py-4 rounded-xl text-sm font-semibold press shadow-lift disabled:opacity-40 ${
          aktif ? "bg-white border border-gray-200 text-navy-900" : "bg-telkomRed text-white"
        }`}
      >
        {aktif ? "Matikan Kamera" : "Nyalakan Kamera"}
      </button>

      <p className="text-center text-[11px] text-gray-500 leading-relaxed">
        Kode di layar berganti tiap 20 detik dan tidak bisa dipakai dari tempat lain.
        Kalau kameramu bermasalah, minta pembimbing mencatatkan lewat menu Scan Card.
      </p>
    </Halaman>
  );
}

export default function AbsenPage() {
  return <Protected allow={["magang"]}><AbsenInner /></Protected>;
}
