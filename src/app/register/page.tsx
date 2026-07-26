"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Registrasi publik dinonaktifkan. Akun hanya dibuat oleh admin.
export default function RegisterDisabled() {
  const router = useRouter();
  useEffect(() => { router.replace("/login"); }, [router]);
  return <div className="p-10 text-center text-gray-500">Mengalihkan...</div>;
}