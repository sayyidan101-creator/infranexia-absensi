"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const masuk = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch {
      setError("Email atau password salah.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Latar: foto gedung InfraNexia (jelas, tanpa blur) */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/telkom-bg.jpg')" }}
      />
      {/* Lapisan gelap tipis agar kartu menonjol */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/70 via-navy-900/55 to-navy-900/75" />

      {/* Kartu login (logo + nama + form menyatu) */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo + keterangan */}
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="InfraNexia" className="h-12 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Sistem Absensi Anak Magang</p>
          </div>

          <div className="h-px bg-gray-100 mb-6" />

          <h2 className="text-lg font-semibold text-navy-900 mb-1">Masuk ke Akun</h2>
          <p className="text-sm text-gray-500 mb-6">Silakan masuk untuk melanjutkan.</p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-telkomRed text-sm px-3 py-2.5 rounded-lg mb-4 border border-red-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}

          <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
              </svg>
            </span>
            <input
              type="email" placeholder="nama@email.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition"
            />
          </div>

          <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
          <div className="relative mb-6">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              type="password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && masuk()}
              className="w-full border border-gray-200 rounded-lg pl-10 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition"
            />
          </div>

          <button
            onClick={masuk} disabled={loading}
            className="w-full bg-gradient-to-r from-telkomRed to-red-700 text-white py-2.5 rounded-lg font-semibold shadow-lg shadow-telkomRed/20 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 transition"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>

          <p className="text-center text-xs text-gray-400 mt-5 leading-relaxed">
            Akun dibuat oleh admin. Hubungi admin/pembimbing jika kamu belum memiliki akun.
          </p>
        </div>

        <p className="text-center text-white/80 text-xs mt-5 drop-shadow">
          &copy; {new Date().getFullYear()} InfraNexia · PT Telkom Indonesia · Regional Sumbagsel
        </p>
      </div>
    </div>
  );
}