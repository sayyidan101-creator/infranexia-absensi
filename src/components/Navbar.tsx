"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";

export default function Navbar() {
  const { profil, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (!profil) return null;

  const menu = [
    { href: "/dashboard", label: "Dashboard", roles: ["admin", "pembimbing", "magang"] },
    { href: "/absensi", label: "Absensi", roles: ["magang"] },
    { href: "/enroll", label: "Daftar Wajah", roles: ["magang"] },
    { href: "/riwayat", label: "Riwayat", roles: ["admin", "pembimbing", "magang"] },
    { href: "/admin", label: "Kelola", roles: ["admin", "pembimbing"] },
  ].filter((m) => m.roles.includes(profil.role));

  const keluar = async () => { await logout(); router.push("/login"); };

  return (
    <nav className="sticky top-0 z-30 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 text-white shadow-lg border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-16">
        {/* Kiri: logo + menu */}
        <div className="flex items-center gap-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="InfraNexia" className="h-8" />
          <div className="hidden md:flex gap-1">
            {menu.map((m) => (
              <Link
                key={m.href} href={m.href}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === m.href ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Kanan: menu profil */}
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full hover:bg-white/10 transition"
          >
            <Avatar name={profil.name} foto={profil.foto} size={32} />
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sm font-medium">{profil.name}</span>
              <span className="text-[11px] text-slate-300 capitalize">{profil.role}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${open ? "rotate-180" : ""}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-60 bg-white text-navy-900 rounded-xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-sm truncate">{profil.name}</p>
                <p className="text-xs text-gray-500 truncate">{profil.email}</p>
                <span className="inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full bg-navy-800 text-white capitalize">{profil.role}</span>
              </div>
              <Link href="/profil" onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Edit Profil
              </Link>
              <button onClick={keluar}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-telkomRed hover:bg-red-50 transition border-t border-gray-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Menu bawah untuk mobile */}
      <div className="md:hidden border-t border-white/10 px-2 py-2 flex gap-1 overflow-x-auto">
        {menu.map((m) => (
          <Link key={m.href} href={m.href}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${
              pathname === m.href ? "bg-white/15" : "text-slate-300"
            }`}>
            {m.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}