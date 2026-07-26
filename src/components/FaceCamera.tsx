"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { loadModels, getFaceDescriptor, getFullFace, eyeAspectRatio } from "@/lib/faceapi";

type Mode = "enroll" | "verify";

interface Props {
  mode: Mode;
  onCapture: (descriptor: number[]) => void;
  busy?: boolean;
}

export default function FaceCamera({ mode, onCapture, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("Memuat model...");
  const [ready, setReady] = useState(false);
  const [errorKamera, setErrorKamera] = useState("");
  const [wajahAda, setWajahAda] = useState(false);
  const [kedip, setKedip] = useState(false);
  const earState = useRef({ tertutup: false });
  const loopRef = useRef<number | null>(null);

  // Mulai kamera (bisa dipanggil ulang lewat tombol Coba Lagi)
  const mulaiKamera = useCallback(async () => {
    setErrorKamera("");
    setReady(false);
    setStatus("Memuat model...");
    try {
      await loadModels();
    } catch {
      setErrorKamera("Gagal memuat model wajah. Pastikan folder public/models berisi file model.");
      return;
    }

    // hentikan stream lama bila ada
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const coba = async (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);

    setStatus("Menyalakan kamera...");
    let stream: MediaStream | null = null;
    try {
      stream = await coba({ video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } } });
    } catch (e1: any) {
      // fallback: pengaturan paling sederhana
      try {
        stream = await coba({ video: true });
      } catch (e2: any) {
        setErrorKamera(pesanError(e2 || e1));
        return;
      }
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try { await videoRef.current.play(); } catch {}
    }
    setReady(true);
    setStatus("Posisikan wajah di dalam bingkai");
  }, []);

  useEffect(() => {
    mulaiKamera();
    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [mulaiKamera]);

  // Loop deteksi wajah + liveness
  useEffect(() => {
    if (!ready) return;
    let running = true;
    const tick = async () => {
      if (!running || !videoRef.current) return;
      try {
        const res = await getFullFace(videoRef.current);
        if (res) {
          setWajahAda(true);
          if (mode === "verify" && !kedip) {
            const e = eyeAspectRatio(res.landmarks);
            if (e < 0.22) earState.current.tertutup = true;
            else if (earState.current.tertutup && e > 0.28) {
              earState.current.tertutup = false;
              setKedip(true);
            }
          }
        } else setWajahAda(false);
      } catch {}
      loopRef.current = requestAnimationFrame(tick);
    };
    loopRef.current = requestAnimationFrame(tick);
    return () => { running = false; if (loopRef.current) cancelAnimationFrame(loopRef.current); };
  }, [ready, mode, kedip]);

  const ambil = useCallback(async () => {
    if (!videoRef.current) return;
    setStatus("Memproses wajah...");
    const desc = await getFaceDescriptor(videoRef.current);
    if (!desc) { setStatus("Wajah tidak terdeteksi, coba lagi"); return; }
    onCapture(Array.from(desc));
    setStatus("Berhasil diambil");
    setKedip(false);
  }, [onCapture]);

  const statusTampil =
    errorKamera ? "" :
    mode === "verify" ? (kedip ? "Liveness OK — silakan absen" : "Silakan berkedip untuk verifikasi") : status;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[360px] h-[270px] rounded-xl overflow-hidden bg-black ring-4 ring-navy-800">
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
        {!errorKamera && (
          <div className={`absolute inset-6 rounded-lg border-2 ${wajahAda ? "border-green-400" : "border-white/40"}`} />
        )}
        {errorKamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-navy-900/90">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            <p className="text-sm text-red-200 mt-3">{errorKamera}</p>
          </div>
        )}
      </div>

      {errorKamera ? (
        <button onClick={mulaiKamera} className="px-6 py-2.5 rounded-lg bg-navy-800 text-white font-medium hover:bg-navy-700">
          Coba Lagi
        </button>
      ) : (
        <>
          <p className="text-sm text-gray-600 min-h-[20px]">{statusTampil}</p>
          <button
            onClick={ambil}
            disabled={!ready || busy || !wajahAda || (mode === "verify" && !kedip)}
            className="px-6 py-2.5 rounded-lg bg-telkomRed text-white font-medium disabled:opacity-40 hover:brightness-110 transition"
          >
            {busy ? "Memproses..." : mode === "enroll" ? "Ambil Sampel" : "Absen Sekarang"}
          </button>
        </>
      )}
    </div>
  );
}

function pesanError(e: any): string {
  const n = e?.name || "";
  if (n === "NotReadableError" || n === "TrackStartError")
    return "Kamera sedang dipakai aplikasi/tab lain (Zoom, Meet, WhatsApp, dll). Tutup aplikasi itu lalu klik Coba Lagi.";
  if (n === "NotAllowedError" || n === "SecurityError")
    return "Akses kamera ditolak. Izinkan kamera di ikon gembok pada address bar, lalu Coba Lagi.";
  if (n === "NotFoundError" || n === "DevicesNotFoundError")
    return "Kamera tidak ditemukan. Pastikan webcam terpasang dan aktif.";
  if (n === "OverconstrainedError")
    return "Pengaturan kamera tidak didukung perangkat. Klik Coba Lagi.";
  return "Gagal mengakses kamera: " + (e?.message || n || "tidak diketahui");
}