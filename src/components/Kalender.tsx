"use client";
import { useMemo } from "react";
import { gaya, URUTAN, StatusHadir } from "@/lib/status";

// Dua huruf, bukan satu: "S" saja tidak bisa membedakan Senin, Selasa, dan Sabtu.
const HARI = ["Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg"];
const HARI_PANJANG = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export interface HariKalender {
  tanggal: string;              // YYYY-MM-DD
  status?: string | null;
  masuk?: string;
  pulang?: string;
}

/**
 * Kalender kehadiran satu bulan.
 *
 * Sebulan kehadiran dalam satu layar jauh lebih mudah dibaca daripada daftar
 * yang harus digulir — pola bolong, telat beruntun, dan minggu yang hilang
 * langsung terlihat.
 *
 * Pekan dimulai Senin, mengikuti kebiasaan kalender kerja di Indonesia,
 * bukan Minggu seperti bawaan JavaScript.
 */
export default function Kalender({
  tahun,
  bulan,                        // 1–12
  data,
  onPilih,
  terpilih,
  padat = false,
  legenda = true,
}: {
  tahun: number;
  bulan: number;
  data: HariKalender[];
  onPilih?: (h: HariKalender | null, tanggal: string) => void;
  terpilih?: string;
  padat?: boolean;
  /** Dimatikan bila halaman sudah menampilkan rincian yang sama di tempat lain. */
  legenda?: boolean;
}) {
  const peta = useMemo(() => {
    const m = new Map<string, HariKalender>();
    data.forEach((d) => m.set(d.tanggal, d));
    return m;
  }, [data]);

  const sel = useMemo(() => {
    const dua = (n: number) => String(n).padStart(2, "0");
    const jumlahHari = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();

    // getUTCDay(): 0 = Minggu. Digeser agar 0 = Senin.
    const hariPertama = new Date(Date.UTC(tahun, bulan - 1, 1)).getUTCDay();
    const kosongDepan = (hariPertama + 6) % 7;

    const out: (HariKalender & { hari: number; akhirPekan: boolean } | null)[] = [];
    for (let i = 0; i < kosongDepan; i++) out.push(null);

    for (let h = 1; h <= jumlahHari; h++) {
      const tanggal = `${tahun}-${dua(bulan)}-${dua(h)}`;
      const hariMinggu = new Date(Date.UTC(tahun, bulan - 1, h)).getUTCDay();
      const akhirPekan = hariMinggu === 0 || hariMinggu === 6;
      const isi = peta.get(tanggal);
      out.push({ tanggal, hari: h, akhirPekan, status: isi?.status, masuk: isi?.masuk, pulang: isi?.pulang });
    }
    return out;
  }, [tahun, bulan, peta]);

  const hariIni = new Date();
  const tanggalIni = `${hariIni.getFullYear()}-${String(hariIni.getMonth() + 1).padStart(2, "0")}-${String(hariIni.getDate()).padStart(2, "0")}`;

  const dipakai = URUTAN.filter((s) => data.some((d) => d.status === s));

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5">
        {HARI.map((h, i) => (
          <div key={i} title={HARI_PANJANG[i]}
            className={`text-center text-[10px] font-semibold uppercase tracking-wide ${
              i >= 5 ? "text-gray-300" : "text-gray-400"
            }`}>
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {sel.map((s, i) => {
          if (!s) return <div key={"kosong" + i} />;
          const g = s.status ? gaya(s.status) : null;
          const ini = s.tanggal === tanggalIni;
          const aktif = terpilih === s.tanggal;
          const bisaDiklik = !!onPilih;

          const isi = (
            <>
              <span className="relative z-[1]">{s.hari}</span>
              {ini && !g && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-telkomRed" />
              )}
            </>
          );

          const kelas = [
            "relative flex items-center justify-center rounded-lg tabular-nums transition-all duration-200",
            padat ? "aspect-square text-[11px]" : "aspect-square text-xs sm:text-sm",
            g
              ? `${g.padat} font-semibold`
              : s.akhirPekan
              ? "bg-gray-50/70 text-gray-300"
              : "bg-gray-50 text-gray-400",
            ini ? "ring-2 ring-navy-900 ring-offset-1" : "",
            aktif ? "scale-[1.08] shadow-lift z-10" : "",
            bisaDiklik ? "press cursor-pointer" : "",
          ].join(" ");

          const judul = `${s.hari} ${BULAN[bulan - 1]}${g ? " · " + g.panjang : ""}${
            s.masuk && s.masuk !== "--:--" ? " · masuk " + s.masuk : ""
          }`;

          return bisaDiklik ? (
            <button key={s.tanggal} className={kelas} title={judul}
              onClick={() => onPilih?.(s.status ? s : null, s.tanggal)}>
              {isi}
            </button>
          ) : (
            <div key={s.tanggal} className={kelas} title={judul}>{isi}</div>
          );
        })}
      </div>

      {legenda && dipakai.length > 0 && (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-4 pt-3.5 border-t border-gray-100">
          {dipakai.map((s) => {
            const g = gaya(s);
            const n = data.filter((d) => d.status === s).length;
            return (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                <i className={`w-2.5 h-2.5 rounded-[3px] ${g.titik}`} />
                {g.panjang}
                <b className="text-navy-900 tabular-nums">{n}</b>
              </span>
            );
          })}
        </div>
      )}

      {legenda && dipakai.length === 0 && (
        <p className="text-[11px] text-gray-400 mt-4 pt-3.5 border-t border-gray-100 text-center">
          Belum ada catatan kehadiran pada bulan ini.
        </p>
      )}
    </div>
  );
}

/** Judul bulan beserta tombol maju-mundur. */
export function NavigasiBulan({
  tahun,
  bulan,
  ubah,
  bisaMaju = true,
}: {
  tahun: number;
  bulan: number;
  ubah: (tahun: number, bulan: number) => void;
  bisaMaju?: boolean;
}) {
  const geser = (arah: number) => {
    const d = new Date(Date.UTC(tahun, bulan - 1 + arah, 1));
    ubah(d.getUTCFullYear(), d.getUTCMonth() + 1);
  };
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => geser(-1)} aria-label="Bulan sebelumnya"
        className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 press hover:bg-gray-50">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <span className="px-2 text-sm font-semibold text-navy-900 min-w-[8.5rem] text-center">
        {BULAN[bulan - 1]} {tahun}
      </span>
      <button onClick={() => geser(1)} disabled={!bisaMaju} aria-label="Bulan berikutnya"
        className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 press hover:bg-gray-50 disabled:opacity-30">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
  );
}

export { BULAN };
