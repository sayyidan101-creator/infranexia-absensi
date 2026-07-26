"use client";
import { useState, useEffect } from "react";
import Protected from "@/components/Protected";
import FaceCamera from "@/components/FaceCamera";
import { useAuth } from "@/context/AuthContext";
import { simpanWajah, sudahEnroll } from "@/lib/absensi";

const TARGET = 3; // jumlah sampel wajah

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
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-1">Daftar Wajah</h1>
      <p className="text-sm text-gray-500 mb-5">
        Ambil {TARGET} sampel wajah (lurus, sedikit menoleh kiri & kanan) untuk akurasi lebih baik.
      </p>

      {alreadyEnrolled && !saved && (
        <div className="bg-blue-50 text-blue-700 text-sm p-3 rounded mb-4">
          Wajah kamu sudah terdaftar. Ambil ulang untuk memperbarui data.
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-5">
        <FaceCamera mode="enroll" onCapture={onCapture} busy={busy} />

        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: TARGET }).map((_, i) => (
            <span
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                i < samples.length ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {i + 1}
            </span>
          ))}
        </div>

        <button
          onClick={simpan}
          disabled={samples.length < TARGET || busy || saved}
          className="w-full mt-4 bg-navy-800 text-white py-2.5 rounded-lg font-medium disabled:opacity-40"
        >
          {saved ? "Tersimpan ✓" : `Simpan Wajah (${samples.length}/${TARGET})`}
        </button>
        {samples.length > 0 && !saved && (
          <button onClick={() => setSamples([])} className="w-full mt-2 text-sm text-gray-500">
            Ulangi
          </button>
        )}
      </div>
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
