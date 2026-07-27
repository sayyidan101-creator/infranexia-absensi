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
      stream = await coba({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
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
              if (navigator.vibrate) navigator.vibrate(18);
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
    if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
    onCapture(Array.from(desc));
    setStatus("Berhasil diambil");
    setKedip(false);
  }, [onCapture]);

  const siap = ready && wajahAda && (mode === "enroll" || kedip);
  const statusTampil =
    errorKamera ? "" :
    !ready ? status :
    !wajahAda ? "Posisikan wajah di dalam bingkai" :
    mode === "verify" ? (kedip ? "Liveness terverifikasi" : "Berkedip sekali untuk verifikasi") :
    "Wajah terdeteksi — siap diambil";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Pratinjau kamera: penuh di HP, proporsi 4:3 */}
      <div className={`relative w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-navy-900 ring-4 transition-colors duration-300 ${
        errorKamera ? "ring-red-300" : siap ? "ring-emerald-400" : wajahAda ? "ring-amber-300" : "ring-navy-800"
      }`}>
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />

        {!errorKamera && ready && (
          <>
            {/* Bingkai sudut */}
            <div className="pointer-events-none absolute inset-[10%]">
              {[
                "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl",
                "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl",
                "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl",
                "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl",
              ].map((c, i) => (
                <span key={i} className={`absolute w-9 h-9 transition-colors duration-300 ${c} ${
                  siap ? "border-emerald-400" : wajahAda ? "border-amber-300" : "border-white/50"
                }`} />
              ))}
            </div>
            {/* Garis pemindai */}
            {!siap && <span className="scanline" />}
            {/* Lencana status */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-sm text-[11px] font-medium text-white">
              <span className={`w-1.5 h-1.5 rounded-full ${siap ? "bg-emerald-400" : wajahAda ? "bg-amber-300" : "bg-white/60"} ${!siap ? "animate-pulse" : ""}`} />
              {siap ? "Siap" : wajahAda ? "Wajah terdeteksi" : "Mencari wajah"}
            </div>
            {mode === "verify" && (
              <div className={`absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                kedip ? "bg-emerald-500 text-white" : "bg-black/45 backdrop-blur-sm text-white/90"
              }`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {kedip ? <path d="m5 13 4 4L19 7" /> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}
                </svg>
                {kedip ? "Liveness OK" : "Kedip"}
              </div>
            )}
          </>
        )}

        {!ready && !errorKamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-900/80 text-white">
            <span className="w-8 h-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
            <p className="text-xs text-slate-300">{status}</p>
          </div>
        )}

        {errorKamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-navy-900/92 anim-fade-in">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            <p className="text-sm text-red-200 mt-3">{errorKamera}</p>
          </div>
        )}
      </div>

      {errorKamera ? (
        <button onClick={mulaiKamera} className="w-full max-w-sm py-3.5 rounded-2xl bg-navy-800 text-white font-semibold press hover:bg-navy-700">
          Coba Lagi
        </button>
      ) : (
        <>
          <p className="text-sm text-gray-600 min-h-[20px] text-center transition-all">{statusTampil}</p>
          <button
            onClick={ambil}
            disabled={!siap || busy}
            className={`w-full max-w-sm flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-semibold press transition-all disabled:opacity-40 disabled:shadow-none ${
              siap ? "bg-gradient-to-r from-telkomRed to-red-700 shadow-lift" : "bg-gray-400"
            }`}
          >
            {busy ? (
              <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Memproses...</>
            ) : mode === "enroll" ? "Ambil Sampel" : "Absen Sekarang"}
          </button>
        </>
      )}
    </div>
  );
}

function pesanError(e: any): string {
  const n = e?.name || "";
  if (n === "NotReadableError" || n === "TrackStartError")
    return "Kamera sedang dipakai aplikasi/tab lain (Zoom, Meet, WhatsApp, dll). Tutup aplikasi itu lalu ketuk Coba Lagi.";
  if (n === "NotAllowedError" || n === "SecurityError")
    return "Akses kamera ditolak. Izinkan kamera di pengaturan situs, lalu ketuk Coba Lagi.";
  if (n === "NotFoundError" || n === "DevicesNotFoundError")
    return "Kamera tidak ditemukan. Pastikan kamera perangkat aktif.";
  if (n === "OverconstrainedError")
    return "Pengaturan kamera tidak didukung perangkat. Ketuk Coba Lagi.";
  return "Gagal mengakses kamera: " + (e?.message || n || "tidak diketahui");
}
