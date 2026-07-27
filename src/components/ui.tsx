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
    <div className="flex flex-col items-center justify-center py-10 text-center anim-fade-up">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3 text-gray-400">
        {ikon || (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        )}
      </div>
      <p className="text-sm font-medium text-navy-900">{judul}</p>
      {pesan && <p className="text-xs text-gray-400 mt-1 max-w-[15rem]">{pesan}</p>}
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
