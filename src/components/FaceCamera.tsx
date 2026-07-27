"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  loadModels, getFaceDescriptor, getFaceLandmarks,
  eyeAspectRatio, mouthAspectRatio, yawRatio,
} from "@/lib/faceapi";

type Mode = "enroll" | "verify";

interface Props {
  mode: Mode;
  onCapture: (descriptor: number[]) => void;
  busy?: boolean;
}

/* ============ Tantangan liveness ============
 * Deteksi berjalan pada frame video mentah (tidak dicerminkan), sehingga
 * saat pengguna menoleh ke KANAN, hidungnya bergeser ke kiri gambar → yaw negatif.
 */
type IdTantangan = "kedip" | "kanan" | "kiri" | "mulut";

const TANTANGAN: Record<IdTantangan, { teks: string; pendek: string }> = {
  kedip: { teks: "Berkedip sekali", pendek: "Kedip" },
  kanan: { teks: "Tolehkan kepala ke kanan", pendek: "Toleh kanan" },
  kiri: { teks: "Tolehkan kepala ke kiri", pendek: "Toleh kiri" },
  mulut: { teks: "Buka mulut sebentar", pendek: "Buka mulut" },
};

const SEMUA: IdTantangan[] = ["kedip", "kanan", "kiri", "mulut"];
const JUMLAH_TANTANGAN = 2;
const DETIK_KEDALUWARSA = 20; // liveness harus dipakai dalam 20 detik

function acakTantangan(): IdTantangan[] {
  const sisa = [...SEMUA];
  const hasil: IdTantangan[] = [];
  for (let i = 0; i < JUMLAH_TANTANGAN; i++) {
    const idx = Math.floor(Math.random() * sisa.length);
    hasil.push(sisa.splice(idx, 1)[0]);
  }
  return hasil;
}

// Panduan pengambilan sampel saat pendaftaran wajah
const LANGKAH_ENROLL = ["Hadap lurus ke kamera", "Tolehkan kepala sedikit ke kiri", "Tolehkan kepala sedikit ke kanan"];

export default function FaceCamera({ mode, onCapture, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);

  const [status, setStatus] = useState("Memuat model...");
  const [ready, setReady] = useState(false);
  const [errorKamera, setErrorKamera] = useState("");
  const [wajahAda, setWajahAda] = useState(false);

  // Liveness
  const [urutan, setUrutan] = useState<IdTantangan[]>([]);
  const [langkah, setLangkah] = useState(0);
  const [livenessOk, setLivenessOk] = useState(false);
  const [sisaDetik, setSisaDetik] = useState(0);

  // Penanda kondisi antar-frame (ref agar tidak memicu render tiap frame)
  const kondisi = useRef({ mataTertutup: false, mulutTerbuka: false, netral: true });
  const langkahRef = useRef(0);
  const urutanRef = useRef<IdTantangan[]>([]);
  const selesaiRef = useRef(false);

  const mulaiUlangTantangan = useCallback(() => {
    const baru = acakTantangan();
    urutanRef.current = baru;
    langkahRef.current = 0;
    selesaiRef.current = false;
    kondisi.current = { mataTertutup: false, mulutTerbuka: false, netral: true };
    setUrutan(baru);
    setLangkah(0);
    setLivenessOk(false);
    setSisaDetik(0);
  }, []);

  // ---------- Kamera ----------
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

    streamRef.current?.getTracks().forEach((t) => t.stop());
    const coba = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c);

    setStatus("Menyalakan kamera...");
    let stream: MediaStream | null = null;
    try {
      stream = await coba({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } });
    } catch (e1: any) {
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

  useEffect(() => {
    if (mode === "verify") mulaiUlangTantangan();
  }, [mode, mulaiUlangTantangan]);

  // ---------- Hitung mundur masa berlaku liveness ----------
  useEffect(() => {
    if (!livenessOk) return;
    setSisaDetik(DETIK_KEDALUWARSA);
    const id = setInterval(() => {
      setSisaDetik((s) => {
        if (s <= 1) {
          clearInterval(id);
          mulaiUlangTantangan();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [livenessOk, mulaiUlangTantangan]);

  // ---------- Loop deteksi ----------
  useEffect(() => {
    if (!ready) return;
    let jalan = true;

    const tick = async () => {
      if (!jalan || !videoRef.current) return;
      try {
        const res = await getFaceLandmarks(videoRef.current);
        if (!res) {
          setWajahAda(false);
        } else {
          setWajahAda(true);
          if (mode === "verify" && !selesaiRef.current) {
            nilaiTantangan(res.landmarks);
          }
        }
      } catch {}
      loopRef.current = requestAnimationFrame(tick);
    };

    const nilaiTantangan = (landmarks: any) => {
      const target = urutanRef.current[langkahRef.current];
      if (!target) return;

      const ear = eyeAspectRatio(landmarks);
      const mar = mouthAspectRatio(landmarks);
      const yaw = yawRatio(landmarks);
      let lolos = false;

      if (target === "kedip") {
        if (ear < 0.21) kondisi.current.mataTertutup = true;
        else if (kondisi.current.mataTertutup && ear > 0.27) {
          kondisi.current.mataTertutup = false;
          lolos = true;
        }
      } else if (target === "mulut") {
        if (mar > 0.55) kondisi.current.mulutTerbuka = true;
        else if (kondisi.current.mulutTerbuka && mar < 0.4) {
          kondisi.current.mulutTerbuka = false;
          lolos = true;
        }
      } else {
        // Menoleh: wajib kembali ke posisi netral dulu, lalu menoleh cukup jauh
        const cukup = target === "kanan" ? yaw < -0.16 : yaw > 0.16;
        if (Math.abs(yaw) < 0.07) kondisi.current.netral = true;
        if (kondisi.current.netral && cukup) {
          kondisi.current.netral = false;
          lolos = true;
        }
      }

      if (!lolos) return;

      const berikut = langkahRef.current + 1;
      langkahRef.current = berikut;
      kondisi.current = { mataTertutup: false, mulutTerbuka: false, netral: false };
      setLangkah(berikut);
      if (navigator.vibrate) navigator.vibrate(18);

      if (berikut >= urutanRef.current.length) {
        selesaiRef.current = true;
        setLivenessOk(true);
      }
    };

    loopRef.current = requestAnimationFrame(tick);
    return () => { jalan = false; if (loopRef.current) cancelAnimationFrame(loopRef.current); };
  }, [ready, mode]);

  // ---------- Ambil sampel ----------
  const ambil = useCallback(async () => {
    if (!videoRef.current) return;
    setStatus("Memproses wajah...");
    const desc = await getFaceDescriptor(videoRef.current);
    if (!desc) { setStatus("Wajah tidak terdeteksi, coba lagi"); return; }
    if (navigator.vibrate) navigator.vibrate([12, 40, 12]);
    onCapture(Array.from(desc));
    setStatus("Berhasil diambil");
    if (mode === "verify") mulaiUlangTantangan();
  }, [onCapture, mode, mulaiUlangTantangan]);

  const siap = ready && wajahAda && (mode === "enroll" || livenessOk);
  const tantanganKini = urutan[langkah];

  const statusTampil =
    errorKamera ? "" :
    !ready ? status :
    !wajahAda ? "Posisikan wajah di dalam bingkai" :
    mode === "enroll" ? "Wajah terdeteksi — siap diambil" :
    livenessOk ? `Terverifikasi · berlaku ${sisaDetik} detik` :
    tantanganKini ? TANTANGAN[tantanganKini].teks : "Menyiapkan verifikasi...";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Pratinjau kamera */}
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

            {!siap && <span className="scanline" />}

            {/* Lencana deteksi wajah */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-sm text-[11px] font-medium text-white">
              <span className={`w-1.5 h-1.5 rounded-full ${siap ? "bg-emerald-400" : wajahAda ? "bg-amber-300" : "bg-white/60"} ${!siap ? "animate-pulse" : ""}`} />
              {siap ? "Siap" : wajahAda ? "Wajah terdeteksi" : "Mencari wajah"}
            </div>

            {/* Titik kemajuan tantangan */}
            {mode === "verify" && (
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-sm">
                {urutan.map((t, i) => (
                  <span key={i} title={TANTANGAN[t].pendek}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i < langkah ? "bg-emerald-400" : i === langkah ? "bg-amber-300 animate-pulse" : "bg-white/40"
                    }`} />
                ))}
              </div>
            )}

            {/* Instruksi tantangan di bawah pratinjau */}
            {mode === "verify" && wajahAda && !livenessOk && tantanganKini && (
              <div key={tantanganKini + langkah}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/95 shadow-lg anim-pop">
                <span className="text-navy-900">{ikonTantangan(tantanganKini)}</span>
                <span className="text-[13px] font-semibold text-navy-900 whitespace-nowrap">
                  {TANTANGAN[tantanganKini].teks}
                </span>
              </div>
            )}

            {mode === "verify" && livenessOk && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-500 shadow-lg anim-pop">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
                <span className="text-[13px] font-semibold text-white">Liveness terverifikasi</span>
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
          {/* Daftar tantangan (verify) atau panduan langkah (enroll) */}
          {mode === "verify" && urutan.length > 0 && (
            <div className="w-full max-w-sm flex items-center gap-2">
              {urutan.map((t, i) => {
                const selesai = i < langkah;
                const kini = i === langkah && !livenessOk;
                return (
                  <div key={i} className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${
                    selesai ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : kini ? "bg-navy-900 border-navy-900 text-white"
                      : "bg-white border-gray-100 text-gray-400"
                  }`}>
                    <span className="shrink-0">{selesai ? <Centang /> : ikonTantangan(t)}</span>
                    <span className="text-[11px] font-medium leading-tight">{TANTANGAN[t].pendek}</span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-sm text-gray-600 min-h-[20px] text-center">{statusTampil}</p>

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

          {mode === "enroll" && (
            <p className="text-[11px] text-gray-400 text-center max-w-sm">
              {LANGKAH_ENROLL.join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Centang() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

function ikonTantangan(t: IdTantangan) {
  const p = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (t === "kedip") return <svg {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6" /><path d="M12 6v-2M4 9 2.5 7.5M20 9l1.5-1.5" /></svg>;
  if (t === "mulut") return <svg {...p}><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="15" rx="3.5" ry="2.5" /><path d="M9 9h.01M15 9h.01" /></svg>;
  if (t === "kanan") return <svg {...p}><path d="M9 5l7 7-7 7" /><path d="M4 12h8" /></svg>;
  return <svg {...p}><path d="M15 5l-7 7 7 7" /><path d="M20 12h-8" /></svg>;
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
