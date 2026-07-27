"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Protected from "@/components/Protected";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Konfeti } from "@/components/ui";
import {
  ambilWajah, sudahEnroll, absensiHariIni, catatMasuk, catatPulang,
  konfigurasi, hitungStatus, Absensi,
} from "@/lib/absensi";

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

function getPosisi(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res(p), () => res(null), { timeout: 5000 });
  });
}

const jamStr = (t?: any) =>
  t?.toDate ? t.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--";

function AbsensiInner() {
  const { user } = useAuth();
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [absen, setAbsen] = useState<Absensi | null>(null);
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sukses, setSukses] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setEnrolled(await sudahEnroll(user.uid));
    setAbsen(await absensiHariIni(user.uid));
  };
  useEffect(() => { refresh(); }, [user]);

  const proses = async (descriptor: number[]) => {
    if (!user) return;
    setBusy(true);
    setPesan({ t: "info", s: "Memverifikasi wajah..." });
    try {
      const stored = await ambilWajah(user.uid);
      if (!stored) { setPesan({ t: "err", s: "Kamu belum mendaftarkan wajah." }); return; }

      const { threshold, jamMasuk, toleransi } = konfigurasi();
      const { bestMatchDistance } = await import("@/lib/faceapi");
      const jarak = bestMatchDistance(descriptor, stored);

      if (jarak > threshold) {
        setPesan({ t: "err", s: `Wajah tidak cocok (jarak ${jarak.toFixed(3)}). Coba lagi dengan pencahayaan lebih baik.` });
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        return;
      }

      const pos = await getPosisi();
      const lat = pos?.coords.latitude;
      const lng = pos?.coords.longitude;

      if (!absen?.jamMasuk) {
        const status = hitungStatus(jamMasuk, toleransi);
        await catatMasuk(user.uid, status, jarak, lat, lng);
        setPesan({ t: "ok", s: `Absen masuk berhasil — status ${status.toUpperCase()}` });
      } else if (!absen?.jamPulang) {
        await catatPulang(user.uid, jarak, lat, lng);
        setPesan({ t: "ok", s: "Absen pulang berhasil. Terima kasih!" });
      }
      setSukses(true);
      if (navigator.vibrate) navigator.vibrate([15, 45, 15, 45, 30]);
      setTimeout(() => setSukses(false), 2200);
      await refresh();
    } catch (e: any) {
      setPesan({ t: "err", s: "Terjadi kesalahan: " + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const sudahLengkap = !!(absen?.jamMasuk && absen?.jamPulang);
  const label = !absen?.jamMasuk ? "Absen Masuk" : !absen?.jamPulang ? "Absen Pulang" : "Selesai";
  const cfg = konfigurasi();

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="anim-fade-up">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">Presensi Wajah</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-navy-900 text-white">{label}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">
          {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Jam kerja {cfg.jamMasuk}–{cfg.jamPulang} · toleransi {cfg.toleransi} menit.</p>
      </div>

      {enrolled === false && (
        <div className="anim-fade-up d-1">
          <Pesan tipe="info">
            Kamu belum mendaftarkan wajah.{" "}
            <Link href="/enroll" className="font-semibold underline">Daftar Wajah sekarang</Link>.
          </Pesan>
        </div>
      )}

      {/* Kartu utama */}
      <div className="relative card p-4 sm:p-5 overflow-hidden anim-fade-up d-2">
        <Konfeti aktif={sukses} />

        {sudahLengkap ? (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <span className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center anim-pop">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
            </span>
            <p className="font-semibold text-navy-900">Absensi hari ini sudah lengkap</p>
            <p className="text-sm text-gray-500">Sampai jumpa besok!</p>
          </div>
        ) : enrolled ? (
          <FaceCamera mode="verify" onCapture={proses} busy={busy} />
        ) : (
          <div className="flex flex-col items-center text-center py-8 gap-3">
            <span className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            </span>
            <p className="font-semibold text-navy-900">Wajah belum terdaftar</p>
            <Link href="/enroll" className="mt-1 px-5 py-3 rounded-2xl bg-navy-900 text-white text-sm font-semibold press">Daftar Wajah</Link>
          </div>
        )}

        {pesan && <div className="mt-4"><Pesan tipe={pesan.t}>{pesan.s}</Pesan></div>}
      </div>

      {/* Ringkasan jam */}
      <div className="grid grid-cols-2 gap-3 anim-fade-up d-3">
        <KartuJam label="Masuk" waktu={jamStr(absen?.jamMasuk)} aktif={!!absen?.jamMasuk} warna="emerald"
          icon={<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>} />
        <KartuJam label="Pulang" waktu={jamStr(absen?.jamPulang)} aktif={!!absen?.jamPulang} warna="purple"
          icon={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>} />
      </div>

      <p className="text-center text-[11px] text-gray-400 anim-fade-up d-4">
        Pastikan wajah terkena cahaya cukup dan tidak tertutup masker.
      </p>
    </div>
  );
}

function KartuJam({ label, waktu, aktif, warna, icon }: any) {
  const gaya = aktif
    ? warna === "emerald" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-purple-50 text-purple-600 border-purple-100"
    : "bg-white text-gray-400 border-gray-100";
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${gaya}`}>
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{icon}</svg>
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-2xl font-bold mt-1.5 tabular-nums ${aktif ? "" : "text-gray-300"}`}>{waktu}</p>
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
