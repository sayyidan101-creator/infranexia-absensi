"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Pesan } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { gambarQr } from "@/lib/pindaiQr";
import { ambilTokenLayar } from "@/lib/kartu";

/**
 * Kode absensi yang ditampilkan di layar kios untuk dipindai peserta.
 *
 * Arahnya kebalikan dari mesin pindai kartu: di sini layar yang menampilkan,
 * peserta yang memindai dengan ponselnya sendiri. Tidak perlu operator dan
 * tidak perlu mencetak kartu — tapi kehadiran fisiknya tetap terbukti, karena
 * kode ini hanya terbaca dari layar yang berdiri di kantor.
 *
 * Kodenya berganti tiap dua puluh detik. Itu yang membuat foto layar yang
 * dikirim lewat pesan tidak berguna: sebelum penerimanya sempat membuka, kode
 * itu sudah basi. Celahnya tidak nol — dua puluh detik tetap dua puluh detik —
 * tapi jauh lebih rapat daripada kode yang diam sepanjang hari.
 */
export default function KodeLayar({ jamKerja }: { jamKerja?: string }) {
  const [gambar, setGambar] = useState("");
  const [sisa, setSisa] = useState(0);
  const [galat, setGalat] = useState("");
  const [memuat, setMemuat] = useState(true);

  const berlaku = useRef(0);
  const usang = useRef(false);
  const jadwal = useRef<any>(null);

  const segarkan = useCallback(async () => {
    try {
      const r = await ambilTokenLayar();
      if (usang.current) return;

      berlaku.current = r.berlakuSampai;
      setGambar(await gambarQr(r.token, 560));
      if (usang.current) return;
      setGalat("");
      setMemuat(false);

      // Dijadwalkan tepat saat kode ini habis, bukan pada selang tetap.
      // Selang tetap akan meleset dari batas putaran dan menyisakan jendela
      // beberapa detik ketika layar menampilkan kode yang sudah kedaluwarsa.
      const jeda = Math.max(1000, r.berlakuSampai - Date.now() + 150);
      jadwal.current = setTimeout(segarkan, jeda);
    } catch (e: any) {
      if (usang.current) return;
      setGalat(pesanError(e));
      setMemuat(false);
      // Tetap dicoba lagi: kios ini ditinggal menyala seharian, dan gangguan
      // jaringan sesaat tidak boleh membuatnya berhenti selamanya
      jadwal.current = setTimeout(segarkan, 5000);
    }
  }, []);

  useEffect(() => {
    usang.current = false;
    segarkan();
    return () => {
      usang.current = true;
      clearTimeout(jadwal.current);
    };
  }, [segarkan]);

  // Hitung mundur, dihitung dari waktu berlaku dan bukan dari pencacah sendiri,
  // supaya tetap benar meski tab sempat tidak aktif
  useEffect(() => {
    const f = () => setSisa(Math.max(0, Math.ceil((berlaku.current - Date.now()) / 1000)));
    f();
    const id = setInterval(f, 250);
    return () => clearInterval(id);
  }, []);

  const persen = Math.min(100, Math.max(0, (sisa / 20) * 100));

  return (
    <div className="card overflow-hidden anim-fade-up d-1">
      <div className="bg-navy-900 p-6 sm:p-8 flex flex-col items-center gap-5">
        <div className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-slate-400">
            Pindai dengan ponselmu
          </p>
          <p className="text-white text-lg sm:text-xl font-bold mt-1">
            Buka menu Absen, arahkan ke kode ini
          </p>
          {jamKerja && <p className="text-xs text-slate-400 mt-1">Jam kerja {jamKerja}</p>}
        </div>

        {/* Kode */}
        <div className="relative bg-white rounded-2xl p-4 sm:p-5 shadow-lift">
          {gambar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={gambar}
              alt="Kode absensi"
              className="w-[min(70vw,22rem)] h-[min(70vw,22rem)] object-contain"
            />
          ) : (
            <div className="w-[min(70vw,22rem)] h-[min(70vw,22rem)] flex items-center justify-center">
              <span className="text-sm text-gray-400">
                {memuat ? "Menyiapkan kode..." : "Kode tidak tersedia"}
              </span>
            </div>
          )}
        </div>

        {/* Hitung mundur */}
        <div className="w-full max-w-sm">
          <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${persen}%` }}
            />
          </div>
          <p className="text-center text-xs text-slate-400 mt-2 tabular-nums">
            {sisa > 0 ? `Berganti dalam ${sisa} detik` : "Menyiapkan kode baru..."}
          </p>
        </div>
      </div>

      {galat && (
        <div className="p-4">
          <Pesan tipe="err">{galat}</Pesan>
        </div>
      )}
    </div>
  );
}
