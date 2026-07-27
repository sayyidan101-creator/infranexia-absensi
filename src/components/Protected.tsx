"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, Role } from "@/context/AuthContext";
import Navbar from "./Navbar";

function Splash() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="InfraNexia" className="h-11 anim-float" />
      <div className="w-40 h-1.5 rounded-full skeleton" />
      <p className="text-xs text-gray-400 tracking-widest uppercase anim-fade-in">Menyiapkan aplikasi</p>
    </div>
  );
}

export default function Protected({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: Role[];
}) {
  const { user, profil, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (allow && profil && !allow.includes(profil.role)) router.replace("/dashboard");
  }, [user, profil, loading, allow, router]);

  if (loading || !user || !profil) return <Splash />;

  if (allow && !allow.includes(profil.role))
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-8 text-center gap-2">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-telkomRed flex items-center justify-center anim-pop">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="font-semibold text-navy-900 mt-2">Akses ditolak</p>
        <p className="text-sm text-gray-500">Halaman ini tidak tersedia untuk role kamu.</p>
      </div>
    );

  return (
    <>
      <Navbar />
      <main key={pathname} className="max-w-6xl mx-auto px-4 py-5 md:py-6 pb-tabbar md:pb-8 anim-fade-up">
        {children}
      </main>
    </>
  );
}
