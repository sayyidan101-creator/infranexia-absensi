"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="InfraNexia" className="h-11 anim-float" />
      <div className="w-40 h-1.5 rounded-full skeleton" />
      <p className="text-xs text-gray-400 tracking-widest uppercase anim-fade-in">Memuat</p>
    </div>
  );
}
