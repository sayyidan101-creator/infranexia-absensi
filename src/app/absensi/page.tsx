"use client";
import { useState, useEffect } from "react";
import Protected from "@/components/Protected";
import FaceCamera from "@/components/FaceCamera";
import { useAuth } from "@/context/AuthContext";
import {
  ambilWajah, sudahEnroll, absensiHariIni, catatMasuk, catatPulang,
  konfigurasi, hitungStatus, Absensi,
} from "@/lib/absensi";
import { bestMatchDistance } from "@/lib/faceapi";

function getPosisi(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res(p), () => res(null), { timeout: 5000 });
  });
}

function AbsensiInner() {
  const { user } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [absen, setAbsen] = useState<Absensi | null>(null);
  const [pesan, setPesan] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setEnrolled(await sudahEnroll(user.uid));
    setAbsen(await absensiHariIni(user.uid));
  };
  useEffect(() => { refresh(); }, [user]);

  const proses = async (descriptor: number[]) => {
    if (!user) return;
    setBusy(true);
    setPesan("Memverifikasi wajah...");
    try {
      const stored = await ambilWajah(user.uid);
      if (!stored) { setPesan("Kamu belum mendaftarkan wajah."); return; }

      const { threshold, jamMasuk, toleransi } = konfigurasi();
      const jarak = bestMatchDistance(descriptor, stored);

      if (jarak > threshold) {
        setPesan(`Wajah tidak cocok (jarak ${jarak.toFixed(3)}). Coba lagi.`);
        return;
      }

      const pos = await getPosisi();
      const lat = pos?.coords.latitude;
      const lng = pos?.coords.longitude;

      if (!absen?.jamMasuk) {
        const status = hitungStatus(jamMasuk, toleransi);
        await catatMasuk(user.uid, status, jarak, lat, lng);
        setPesan(`Absen masuk berhasil — status: ${status.toUpperCase()}`);
      } else if (!absen?.jamPulang) {
        await catatPulang(user.uid, jarak, lat, lng);
        setPesan("Absen pulang berhasil. Terima kasih!");
      }
      await refresh();
    } catch (e: any) {
      setPesan("Terjadi kesalahan: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const sudahLengkap = absen?.jamMasuk && absen?.jamPulang;
  const label = !absen?.jamMasuk ? "Absen Masuk" : !absen?.jamPulang ? "Absen Pulang" : "Selesai";

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-1">Absensi — {label}</h1>
      <p className="text-sm text-gray-500 mb-5">Hadapkan wajah ke kamera dan berkedip untuk verifikasi.</p>

      {enrolled === false && (
        <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded mb-4">
          Kamu belum mendaftarkan wajah. Buka menu <b>Daftar Wajah</b> terlebih dahulu.
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-5">
        {sudahLengkap ? (
          <p className="text-center text-green-600 font-medium py-8">
            Absensi hari ini sudah lengkap ✓
          </p>
        ) : enrolled ? (
          <FaceCamera mode="verify" onCapture={proses} busy={busy} />
        ) : null}

        {pesan && (
          <p className="mt-4 text-center text-sm font-medium text-navy-800">{pesan}</p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3 text-center text-sm">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-gray-500">Masuk</p>
            <p className="font-semibold">
              {absen?.jamMasuk ? absen.jamMasuk.toDate().toLocaleTimeString("id-ID") : "-"}
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-gray-500">Pulang</p>
            <p className="font-semibold">
              {absen?.jamPulang ? absen.jamPulang.toDate().toLocaleTimeString("id-ID") : "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AbsensiPage() {
  return (
    <Protected allow={["magang"]}>
      <AbsensiInner />
    </Protected>
  );
}
