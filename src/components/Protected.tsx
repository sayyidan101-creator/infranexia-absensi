"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, Role } from "@/context/AuthContext";
import Navbar from "./Navbar";

export default function Protected({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: Role[];
}) {
  const { user, profil, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (allow && profil && !allow.includes(profil.role)) router.replace("/dashboard");
  }, [user, profil, loading, allow, router]);

  if (loading || !user || !profil)
    return <div className="p-10 text-center text-gray-500">Memuat...</div>;

  if (allow && !allow.includes(profil.role))
    return <div className="p-10 text-center text-gray-500">Akses ditolak.</div>;

  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </>
  );
}
