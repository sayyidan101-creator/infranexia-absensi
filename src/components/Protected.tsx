"use client";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, Role } from "@/context/AuthContext";
import { auth } from "@/lib/firebase";
import Navbar from "./Navbar";

function Splash() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="InfraNexia" className="h-11 anim-float" />
      <div className="w-40 h-1.5 rounded-full skeleton" />
      <p className="text-xs text-gray-500 tracking-widest uppercase anim-fade-in">Menyiapkan aplikasi</p>
    </div>
  );
}

function Halangan({
  judul, pesan, detail, ikon,
}: { judul: string; pesan: string; detail?: string; ikon: React.ReactNode }) {
  const keluar = async () => {
    try { await auth.signOut(); } catch {}
    window.location.replace("/login");
  };
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-8 text-center gap-2">
      <div className="w-14 h-14 rounded-2xl bg-red-50 text-telkomRed flex items-center justify-center anim-pop">
        {ikon}
      </div>
      <p className="font-semibold text-navy-900 mt-2">{judul}</p>
      <p className="text-sm text-gray-500 max-w-sm">{pesan}</p>
      {detail && (
        <p className="text-[11px] text-gray-500 font-mono mt-1 break-all max-w-sm">{detail}</p>
      )}
      <button onClick={keluar}
        className="mt-5 px-6 py-3 rounded-2xl bg-navy-900 text-white text-sm font-semibold press">
        Keluar & masuk dengan akun lain
      </button>
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

  if (loading) return <Splash />;
  if (!user) return <Splash />;

  // Akun login ada, tapi tidak punya dokumen profil di Firestore.
  // Tanpa penanganan ini halaman akan menggantung di layar pembuka selamanya.
  if (!profil)
    return (
      <Halangan
        judul="Profil akun tidak ditemukan"
        pesan={
          "Akun ini bisa login, tapi belum punya data profil di sistem. " +
          "Biasanya karena akun dibuat langsung lewat Firebase Console tanpa dokumen di koleksi users, " +
          "atau profilnya sudah dihapus admin."
        }
        detail={`${user.email || "tanpa email"} · UID ${user.uid}`}
        ikon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            <path d="m21 3-4 4M17 3l4 4" />
          </svg>
        }
      />
    );

  if (allow && !allow.includes(profil.role))
    return (
      <Halangan
        judul="Akses ditolak"
        pesan="Halaman ini tidak tersedia untuk role kamu."
        detail={`role: ${profil.role}`}
        ikon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        }
      />
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
