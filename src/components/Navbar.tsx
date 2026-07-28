"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";

type IconProps = { className?: string };
const I = {
  dashboard: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  absensi: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
      <circle cx="12" cy="11" r="2.5" /><path d="M8 17c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7" />
    </svg>
  ),
  enroll: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 0 0 7 0" />
    </svg>
  ),
  izin: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M9 15h6M9 11h3" />
    </svg>
  ),
  riwayat: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
  kelola: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />
    </svg>
  ),
  profil: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  keluar: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
    </svg>
  ),
};

export default function Navbar() {
  const { profil, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const refSheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const target = e.target as Node;
      // Sheet profil pada mobile dirender di luar `ref`, sehingga tanpa
      // pengecualian ini sentuhan pada tombol di dalamnya akan menutup sheet
      // pada mousedown — dan onClick tombolnya tidak pernah sempat berjalan.
      if (ref.current?.contains(target)) return;
      if (refSheet.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Kunci scroll saat sheet profil mobile terbuka
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!profil) return null;

  const menu = [
    { href: "/dashboard", label: "Dashboard", icon: I.dashboard, roles: ["admin", "pembimbing", "magang"] },
    { href: "/kios", label: "Kios", icon: I.absensi, roles: ["admin", "pembimbing"] },
    { href: "/izin", label: "Izin", icon: I.izin, roles: ["admin", "pembimbing", "magang"] },
    { href: "/riwayat", label: "Riwayat", icon: I.riwayat, roles: ["admin", "pembimbing", "magang"] },
    { href: "/admin", label: "Kelola", icon: I.kelola, roles: ["admin", "pembimbing"] },
  ].filter((m) => m.roles.includes(profil.role));

  const keluar = async () => {
    setOpen(false);
    try {
      await logout();
    } catch {
      // Abaikan: sesi lokal tetap dibersihkan lewat muat ulang di bawah
    }
    // Muat ulang penuh, bukan router.push. Ini memastikan seluruh state React,
    // cache router Next.js, dan sisa data pengguna benar-benar hilang —
    // navigasi sisi-klien saja kadang menyisakan halaman lama di layar.
    window.location.replace("/login");
  };

  return (
    <>
      {/* ============ TOP BAR ============ */}
      <nav className="sticky top-0 z-30 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 text-white shadow-lg border-b border-white/10 pt-safe">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14 md:h-16">
          <div className="flex items-center gap-8 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="InfraNexia" className="h-7 md:h-8 shrink-0" />
            {/* Menu horizontal hanya desktop */}
            <div className="hidden md:flex gap-1">
              {menu.map((m) => {
                const aktif = pathname === m.href;
                return (
                  <Link key={m.href} href={m.href}
                    className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                      aktif ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}>
                    {m.label}
                    {aktif && <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-telkomRed anim-fade-in" />}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Tombol profil */}
          <div className="relative shrink-0" ref={ref}>
            <button onClick={() => setOpen((v) => !v)}
              aria-label="Menu profil"
              className="flex items-center gap-2.5 pl-1.5 pr-2 md:pr-3 py-1.5 rounded-full hover:bg-white/10 press transition">
              <Avatar name={profil.name} foto={profil.foto} size={32} />
              <span className="hidden sm:flex flex-col items-start leading-tight max-w-[9rem]">
                <span className="text-sm font-medium truncate w-full">{profil.name}</span>
                <span className="text-[11px] text-slate-300 capitalize">{profil.role}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`hidden sm:block transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Dropdown desktop */}
            {open && (
              <div className="hidden md:block absolute right-0 mt-2 w-60 bg-white text-navy-900 rounded-xl shadow-xl border border-gray-100 overflow-hidden anim-pop origin-top-right">
                <KartuProfil profil={profil} />
                <Link href="/profil" onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition">
                  <I.profil className="w-[18px] h-[18px]" /> Edit Profil
                </Link>
                <button onClick={keluar}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-telkomRed hover:bg-red-50 transition border-t border-gray-100">
                  <I.keluar className="w-[18px] h-[18px]" /> Keluar
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ============ SHEET PROFIL (MOBILE) ============ */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end anim-fade-in" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div ref={refSheet} className="relative w-full bg-white rounded-t-3xl pb-safe anim-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mt-3 mb-1" />
            <KartuProfil profil={profil} />
            <div className="p-2">
              <Link href="/profil" onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 text-[15px] rounded-xl active:bg-gray-100 transition">
                <I.profil className="w-5 h-5 text-navy-800" /> Edit Profil
              </Link>
              <button onClick={keluar}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-[15px] text-telkomRed rounded-xl active:bg-red-50 transition">
                <I.keluar className="w-5 h-5" /> Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ BOTTOM TAB BAR (MOBILE) ============ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-gray-200/80 shadow-tab pb-safe">
        <div className="flex items-stretch justify-around px-1">
          {menu.map((m) => {
            const aktif = pathname === m.href;
            const Ikon = m.icon;
            return (
              <Link key={m.href} href={m.href}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2.5 press">
                <span className={`absolute top-0 h-0.5 rounded-full bg-telkomRed transition-all duration-300 ${aktif ? "w-8 opacity-100" : "w-0 opacity-0"}`} />
                <span className={`relative flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-300 ${
                  aktif ? "bg-navy-900/10 text-navy-900 -translate-y-0.5" : "text-gray-400"
                }`}>
                  <Ikon className="w-[21px] h-[21px]" />
                </span>
                <span className={`text-[10.5px] leading-none transition-colors ${aktif ? "text-navy-900 font-semibold" : "text-gray-400 font-medium"}`}>
                  {m.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function KartuProfil({ profil }: { profil: any }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
      <Avatar name={profil.name} foto={profil.foto} size={42} />
      <div className="min-w-0">
        <p className="font-semibold text-sm text-navy-900 truncate">{profil.name}</p>
        <p className="text-xs text-gray-500 truncate">{profil.email}</p>
        <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-navy-800 text-white capitalize">{profil.role}</span>
      </div>
    </div>
  );
}
