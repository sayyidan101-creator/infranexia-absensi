"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lihat, setLihat] = useState(false);
  const [error, setError] = useState("");
  const [kabar, setKabar] = useState("");
  const [loading, setLoading] = useState(false);
  const [modeLupa, setModeLupa] = useState(false);
  const router = useRouter();

  const masuk = async () => {
    if (loading) return;
    setError(""); setKabar("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch {
      setError("Email atau password salah.");
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Kirim tautan setel ulang password.
   *
   * Balasannya sengaja sama persis untuk email yang terdaftar maupun tidak.
   * Kalau dibedakan, halaman ini berubah jadi alat untuk menebak siapa saja
   * yang punya akun di sini.
   */
  const kirimPemulihan = async () => {
    if (loading) return;
    setError(""); setKabar("");
    const alamat = email.trim();
    if (!alamat || !alamat.includes("@")) {
      setError("Isi dulu alamat emailmu di atas.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, alamat);
    } catch (e: any) {
      // Hanya kesalahan yang bukan soal ada-tidaknya akun yang ditampilkan
      if (String(e?.code) === "auth/too-many-requests") {
        setError("Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.");
        setLoading(false);
        return;
      }
      if (String(e?.code) === "auth/invalid-email") {
        setError("Format emailnya belum benar.");
        setLoading(false);
        return;
      }
    }
    setKabar(
      `Kalau ${alamat} terdaftar, tautan penggantian password sudah dikirim ke sana. ` +
      "Periksa juga folder spam."
    );
    setModeLupa(false);
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden py-8">
      {/* Latar: foto gedung InfraNexia */}
      <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: "url('/telkom-bg.jpg')" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-navy-900/75 via-navy-900/60 to-navy-900/85" />

      {/* Kartu login */}
      <div className="relative z-10 w-full max-w-md px-5 pt-safe pb-safe">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 anim-fade-up">
          <div className="text-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="InfraNexia" className="h-11 sm:h-12 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Sistem Absensi Anak Magang</p>
          </div>

          <div className="h-px bg-gray-100 mb-6" />

          <h2 className="text-lg font-semibold text-navy-900 mb-1">
            {modeLupa ? "Lupa Password" : "Masuk ke Akun"}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            {modeLupa
              ? "Masukkan email akunmu. Tautan penggantian password akan dikirim ke sana."
              : "Silakan masuk untuk melanjutkan."}
          </p>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-telkomRed text-sm px-3 py-2.5 rounded-xl mb-4 border border-red-100 anim-fade-up">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}

          {kabar && (
            <div className="flex items-start gap-2 bg-emerald-50 text-emerald-700 text-sm px-3 py-2.5 rounded-xl mb-4 border border-emerald-100 anim-fade-up">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                <path d="m5 13 4 4L19 7" />
              </svg>
              <span className="leading-relaxed">{kabar}</span>
            </div>
          )}

          <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
          <div className="relative mb-4">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
              </svg>
            </span>
            <input
              type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="nama@email.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-xl pl-11 pr-3 py-3.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition"
            />
          </div>

          {!modeLupa && (
          <>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-gray-600">Password</label>
            <button type="button" onClick={() => { setModeLupa(true); setError(""); setKabar(""); }}
              className="text-xs font-medium text-telkomRed press">
              Lupa password?
            </button>
          </div>
          <div className="relative mb-6">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <input
              type={lihat ? "text" : "password"} autoComplete="current-password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && masuk()}
              className="w-full border border-gray-200 rounded-xl pl-11 pr-12 py-3.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition"
            />
            <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan password" : "Tampilkan password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-navy-800 press">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                {!lihat && <line x1="3" y1="3" x2="21" y2="21" />}
              </svg>
            </button>
          </div>
          </>
          )}

          {modeLupa ? (
            <>
              <button
                onClick={kirimPemulihan} disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-telkomRed to-red-700 text-white py-4 rounded-2xl font-semibold shadow-lift press hover:brightness-110 disabled:opacity-60 transition"
              >
                {loading ? (
                  <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Mengirim...</>
                ) : "Kirim Tautan Penggantian"}
              </button>
              <button type="button" onClick={() => { setModeLupa(false); setError(""); }}
                className="w-full mt-2 py-3 text-sm text-gray-500 press">
                Kembali ke halaman masuk
              </button>
            </>
          ) : (
            <button
              onClick={masuk} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-telkomRed to-red-700 text-white py-4 rounded-2xl font-semibold shadow-lift press hover:brightness-110 disabled:opacity-60 transition"
            >
              {loading ? (
                <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Memproses...</>
              ) : "Masuk"}
            </button>
          )}

          <p className="text-center text-xs text-gray-400 mt-5 leading-relaxed">
            Akun dibuat oleh admin. Hubungi admin/pembimbing jika kamu belum memiliki akun.
          </p>
        </div>

        <p className="text-center text-white/80 text-[11px] sm:text-xs mt-5 drop-shadow anim-fade-in d-2">
          &copy; {new Date().getFullYear()} InfraNexia · PT Telkom Indonesia · Regional Sumbagsel
        </p>
      </div>
    </div>
  );
}
