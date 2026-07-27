"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Protected from "@/components/Protected";
import { useAuth } from "@/context/AuthContext";
import { simpanWajah, sudahEnroll } from "@/lib/absensi";
import { Pesan, Konfeti } from "@/components/ui";

// face-api hanya jalan di browser — jangan ikut dirender di server
const FaceCamera = dynamic(() => import("@/components/FaceCamera"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-sm aspect-[4/3] rounded-2xl skeleton" />
      <div className="w-full max-w-sm h-[52px] rounded-2xl skeleton" />
    </div>
  ),
});

const TARGET = 3; // jumlah sampel wajah
const PANDUAN = ["Hadap lurus ke kamera", "Tolehkan kepala sedikit ke kiri", "Tolehkan kepala sedikit ke kanan"];

function EnrollInner() {
  const { user } = useAuth();
  const [samples, setSamples] = useState<number[][]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alreadyEnrolled, setAlready] = useState(false);

  useEffect(() => {
    if (user) sudahEnroll(user.uid).then(setAlready);
  }, [user]);

  const onCapture = (d: number[]) => {
    setSamples((s) => (s.length < TARGET ? [...s, d] : s));
  };

  const simpan = async () => {
    if (!user || samples.length < TARGET) return;
    setBusy(true);
    await simpanWajah(user.uid, samples);
    setSaved(true);
    setAlready(true);
    setBusy(false);
    if (navigator.vibrate) navigator.vibrate([15, 45, 15, 45, 30]);
  };

  const progres = Math.round((samples.length / TARGET) * 100);

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="anim-fade-up">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">Biometrik</span>
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">Daftar Wajah</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Ambil {TARGET} sampel wajah agar sistem mengenalimu dengan akurat.
        </p>
      </div>

      {alreadyEnrolled && !saved && (
        <div className="anim-fade-up d-1">
          <Pesan tipe="info">Wajah kamu sudah terdaftar. Ambil ulang untuk memperbarui data.</Pesan>
        </div>
      )}

      {/* Progress bar */}
      <div className="card p-4 anim-fade-up d-1">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-gray-500">Progres pengambilan</span>
          <span className="text-xs font-semibold text-navy-900 tabular-nums">{samples.length}/{TARGET}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500 ease-out"
            style={{ width: `${progres}%` }} />
        </div>
        <div className="flex justify-between gap-2 mt-3">
          {PANDUAN.map((p, i) => {
            const selesai = i < samples.length;
            const kini = i === samples.length;
            return (
              <div key={i} className={`flex-1 flex flex-col items-center gap-1.5 text-center transition-opacity ${kini || selesai ? "opacity-100" : "opacity-40"}`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${
                  selesai ? "bg-emerald-500 text-white scale-100" : kini ? "bg-navy-900 text-white anim-ring" : "bg-gray-200 text-gray-500"
                }`}>
                  {selesai ? "✓" : i + 1}
                </span>
                <span className="text-[10px] leading-tight text-gray-500">{p}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative card p-4 sm:p-5 overflow-hidden anim-fade-up d-2">
        <Konfeti aktif={saved} />

        {saved ? (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <span className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center anim-pop">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
            </span>
            <p className="font-semibold text-navy-900">Wajah berhasil disimpan</p>
            <p className="text-sm text-gray-500">Sekarang kamu sudah bisa melakukan absensi.</p>
            <Link href="/absensi" className="mt-1 px-5 py-3 rounded-2xl bg-telkomRed text-white text-sm font-semibold press">Ke Halaman Absensi</Link>
          </div>
        ) : (
          <>
            <FaceCamera mode="enroll" onCapture={onCapture} busy={busy} />

            <button
              onClick={simpan}
              disabled={samples.length < TARGET || busy}
              className="w-full mt-4 py-4 rounded-2xl bg-navy-900 text-white font-semibold press disabled:opacity-40 transition"
            >
              {busy ? "Menyimpan..." : `Simpan Wajah (${samples.length}/${TARGET})`}
            </button>
            {samples.length > 0 && (
              <button onClick={() => setSamples([])} className="w-full mt-2 py-2.5 text-sm text-gray-500 press">
                Ulangi dari awal
              </button>
            )}
          </>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-400 anim-fade-up d-3">
        Data wajah disimpan sebagai vektor angka, bukan foto.
      </p>
    </div>
  );
}

export default function EnrollPage() {
  return (
    <Protected allow={["magang"]}>
      <EnrollInner />
    </Protected>
  );
}
