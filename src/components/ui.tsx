"use client";
import { useEffect, useRef, useState } from "react";

/* ---------- Angka menghitung naik ---------- */
export function CountUp({
  value, durasi = 900, suffix = "", className = "",
}: { value: number; durasi?: number; suffix?: string; className?: string }) {
  const [tampil, setTampil] = useState(0);
  const dari = useRef(0);

  useEffect(() => {
    const awal = dari.current;
    const delta = value - awal;
    if (delta === 0) { setTampil(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / durasi);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setTampil(Math.round(awal + delta * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else dari.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durasi]);

  return <span className={className}>{tampil}{suffix}</span>;
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

export function SkeletonKartu() {
  return (
    <div className="card p-4 sm:p-5">
      <Skeleton className="w-10 h-10 rounded-xl" />
      <Skeleton className="h-7 w-16 mt-4" />
      <Skeleton className="h-3 w-24 mt-2" />
    </div>
  );
}

/* ---------- Keadaan kosong ---------- */
export function Kosong({ judul, pesan, ikon }: { judul: string; pesan?: string; ikon?: React.ReactNode }) {
  return (
    // Padatnya disengaja. Keadaan kosong itu bukan berita, cuma keterangan —
    // dan versi sebelumnya memakan hampir satu layar penuh di ponsel untuk
    // mengabarkan bahwa tidak ada apa-apa.
    <div className="flex flex-col items-center justify-center py-7 text-center anim-fade-up">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-2.5 text-gray-500">
        {ikon || (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-navy-900">{judul}</p>
      {/* gray-500, bukan gray-400: pada latar putih yang 400 nyaris tidak terbaca
          di layar ponsel yang kena cahaya matahari — dan kios ini dipakai pagi */}
      {pesan && <p className="text-xs text-gray-500 mt-1 max-w-[17rem] leading-relaxed">{pesan}</p>}
    </div>
  );
}

/* ---------- Notifikasi kecil (inline) ---------- */
export function Pesan({ tipe, children }: { tipe: "ok" | "err" | "info"; children: React.ReactNode }) {
  const gaya = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
    err: "bg-red-50 text-telkomRed border-red-100",
    info: "bg-blue-50 text-blue-700 border-blue-100",
  }[tipe];
  return (
    <div className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-xl border anim-fade-up ${gaya}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
        {tipe === "ok" ? <path d="m5 13 4 4L19 7" /> : <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
      </svg>
      <span className="flex-1">{children}</span>
    </div>
  );
}

/* ---------- Pemilih beberapa pilihan (segmented control) ---------- */
export function Segmen<T extends string>({
  nilai, opsi, ubah, kecil = false,
}: {
  nilai: T;
  opsi: { nilai: T; label: string; lencana?: number }[];
  ubah: (v: T) => void;
  kecil?: boolean;
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-xl p-0.5 shrink-0">
      {opsi.map((o) => {
        const aktif = o.nilai === nilai;
        return (
          <button key={o.nilai} onClick={() => ubah(o.nilai)}
            className={`relative inline-flex items-center gap-1.5 rounded-lg font-medium transition-all press ${
              kecil ? "px-2.5 py-1.5 text-[11px]" : "px-3.5 py-2 text-xs"
            } ${aktif ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"}`}>
            {o.label}
            {!!o.lencana && o.lencana > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                aktif ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-600"
              }`}>{o.lencana}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Kerangka halaman yang seragam ---------- */

/**
 * Lebar isi halaman, dipilih menurut jenis isinya — bukan per selera halaman.
 *
 * Sebelumnya tiap halaman menentukan lebarnya sendiri, dan hasilnya lima nilai
 * berbeda: lg, 2xl, 3xl, 4xl, dan penuh. Berpindah dari Beranda ke Izin lalu ke
 * Profil membuat isinya melompat tiga kali di layar lebar — itu yang membuat
 * aplikasi terasa seperti kumpulan halaman, bukan satu produk.
 *
 * Sekarang hanya ada tiga, dan pilihannya beralasan:
 *   penuh  — tabel dan papan angka, memang butuh ruang
 *   sedang — daftar yang dibaca satu per satu
 *   sempit — formulir satu kolom, di mana baris terlalu lebar justru
 *            melelahkan mata
 */
export type LebarHalaman = "penuh" | "sedang" | "sempit";

const LEBAR: Record<LebarHalaman, string> = {
  penuh: "max-w-6xl",
  sedang: "max-w-3xl",
  sempit: "max-w-2xl",
};

/**
 * Pembungkus isi halaman.
 *
 * Selain lebar, ia menyeragamkan jarak antar bagian. Dulu ada lima irama
 * berbeda di lima halaman — perbedaan yang tidak pernah disengaja siapa pun,
 * hanya menumpuk seiring halaman ditambah satu per satu.
 */
export function Halaman({
  lebar = "sedang",
  children,
}: {
  lebar?: LebarHalaman;
  children: React.ReactNode;
}) {
  return <div className={`${LEBAR[lebar]} mx-auto space-y-4 sm:space-y-5`}>{children}</div>;
}

/* ---------- Judul halaman yang seragam ---------- */
export function KepalaHalaman({
  atas, judul, keterangan, aksi,
}: {
  atas: string;
  judul: string;
  keterangan?: string;
  aksi?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 anim-fade-up">
      <div className="min-w-0">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-500">{atas}</span>
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">{judul}</h1>
        {keterangan && <p className="text-sm text-gray-500 mt-1 max-w-xl">{keterangan}</p>}
      </div>
      {aksi && <div className="shrink-0">{aksi}</div>}
    </div>
  );
}

/* ---------- Konfeti kecil untuk momen sukses ---------- */
const WARNA = ["#e60012", "#10b981", "#f59e0b", "#3b82f6", "#a855f7"];
export function Konfeti({ aktif }: { aktif: boolean }) {
  if (!aktif) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} className="confetti-piece absolute top-0 rounded-[2px]"
          style={{
            left: `${(i * 5.6 + 4) % 96}%`,
            width: 7, height: 11,
            background: WARNA[i % WARNA.length],
            animationDelay: `${(i % 6) * 90}ms`,
          }} />
      ))}
    </div>
  );
}
