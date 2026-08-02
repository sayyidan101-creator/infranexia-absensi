"use client";
import { useEffect, useState } from "react";
import { Pesan } from "@/components/ui";
import { sinkronKartu, pesanError } from "@/lib/users";
import {
  ambilKonfigurasi, simpanKonfigurasi, KONFIG_DEFAULT, Konfigurasi,
} from "@/lib/absensi";

const inp =
  "w-full border border-gray-200 rounded-xl px-3 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition";

export default function PengaturanAbsensi() {
  const [buka, setBuka] = useState(false);
  const [cfg, setCfg] = useState<Konfigurasi>(KONFIG_DEFAULT);
  const [muat, setMuat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ambilGps, setAmbilGps] = useState(false);
  const [sinkron, setSinkron] = useState(false);
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);

  useEffect(() => {
    ambilKonfigurasi().then((k) => { setCfg(k); setMuat(false); });
  }, []);

  const set = (k: keyof Konfigurasi, v: any) => setCfg((c) => ({ ...c, [k]: v }));

  const gunakanLokasiSaatIni = () => {
    if (!navigator.geolocation) {
      setPesan({ t: "err", s: "Perangkat ini tidak mendukung GPS." });
      return;
    }
    setAmbilGps(true);
    setPesan({ t: "info", s: "Mengambil lokasi... berdirilah di titik kantor." });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set("kantorLat", Number(p.coords.latitude.toFixed(6)));
        set("kantorLng", Number(p.coords.longitude.toFixed(6)));
        setPesan({
          t: "ok",
          s: `Lokasi terambil (akurasi ±${Math.round(p.coords.accuracy)} m). Jangan lupa simpan.`,
        });
        setAmbilGps(false);
      },
      () => {
        setPesan({ t: "err", s: "Gagal mengambil lokasi. Izinkan akses lokasi lalu coba lagi." });
        setAmbilGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const simpan = async () => {
    setPesan(null);
    if (!/^\d{2}:\d{2}$/.test(cfg.jamMasuk) || !/^\d{2}:\d{2}$/.test(cfg.jamPulang)) {
      setPesan({ t: "err", s: "Format jam harus HH:MM, contoh 08:00." });
      return;
    }
    if (cfg.geofenceAktif && (cfg.kantorLat == null || cfg.kantorLng == null)) {
      setPesan({ t: "err", s: "Isi koordinat kantor dulu sebelum mengaktifkan geofencing." });
      return;
    }
    setBusy(true);
    try {
      await simpanKonfigurasi({
        jamMasuk: cfg.jamMasuk,
        jamPulang: cfg.jamPulang,
        toleransiMenit: Number(cfg.toleransiMenit) || 0,
        geofenceAktif: !!cfg.geofenceAktif,
        kantorLat: cfg.kantorLat == null ? null : Number(cfg.kantorLat),
        kantorLng: cfg.kantorLng == null ? null : Number(cfg.kantorLng),
        radiusMeter: Number(cfg.radiusMeter) || 150,
        minJedaMenit: Number(cfg.minJedaMenit) || 0,
        zonaWaktu: cfg.zonaWaktu || "Asia/Jakarta",
      });
      setPesan({ t: "ok", s: "Pengaturan tersimpan dan langsung berlaku." });
    } catch (e: any) {
      setPesan({ t: "err", s: e?.message || "Gagal menyimpan pengaturan." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card overflow-hidden anim-fade-up d-1">
      <button onClick={() => setBuka((v) => !v)}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left press">
        <span className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy-900 text-sm sm:text-base">Pengaturan Absensi</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {muat ? "Memuat..." : `Jam ${cfg.jamMasuk}–${cfg.jamPulang} · toleransi ${cfg.toleransiMenit} mnt · geofencing ${cfg.geofenceAktif ? "aktif" : "nonaktif"}`}
          </p>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-gray-500 transition-transform duration-200 ${buka ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {buka && !muat && (
        <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 pt-4 space-y-5 anim-fade-up">
          {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

          {/* Jam kerja */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Jam Kerja</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Jam Masuk">
                <input type="time" value={cfg.jamMasuk} onChange={(e) => set("jamMasuk", e.target.value)} className={inp} />
              </Field>
              <Field label="Jam Pulang">
                <input type="time" value={cfg.jamPulang} onChange={(e) => set("jamPulang", e.target.value)} className={inp} />
              </Field>
              <Field label="Toleransi (menit)">
                <input type="number" min={0} max={120} inputMode="numeric" value={cfg.toleransiMenit}
                  onChange={(e) => set("toleransiMenit", e.target.value)} className={inp} />
              </Field>
              <Field label="Jeda min. pulang">
                <input type="number" min={0} max={600} inputMode="numeric" value={cfg.minJedaMenit}
                  onChange={(e) => set("minJedaMenit", e.target.value)} className={inp} />
              </Field>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Lewat toleransi otomatis berstatus <b>terlambat</b>. Jeda minimum mencegah absen pulang tepat setelah masuk.
            </p>
          </div>

          {/* Geofencing */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lokasi Kantor</p>
              <button onClick={() => set("geofenceAktif", !cfg.geofenceAktif)}
                role="switch" aria-checked={cfg.geofenceAktif}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${cfg.geofenceAktif ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${cfg.geofenceAktif ? "translate-x-5" : ""}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Latitude">
                <input type="number" step="any" inputMode="decimal" placeholder="-2.976"
                  value={cfg.kantorLat ?? ""} onChange={(e) => set("kantorLat", e.target.value === "" ? null : e.target.value)} className={inp} />
              </Field>
              <Field label="Longitude">
                <input type="number" step="any" inputMode="decimal" placeholder="104.775"
                  value={cfg.kantorLng ?? ""} onChange={(e) => set("kantorLng", e.target.value === "" ? null : e.target.value)} className={inp} />
              </Field>
              <Field label="Radius (meter)">
                <input type="number" min={20} max={5000} inputMode="numeric" value={cfg.radiusMeter}
                  onChange={(e) => set("radiusMeter", e.target.value)} className={inp} />
              </Field>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button onClick={gunakanLokasiSaatIni} disabled={ambilGps}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press disabled:opacity-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" />
                </svg>
                {ambilGps ? "Mengambil lokasi..." : "Pakai lokasi saya sekarang"}
              </button>
              {cfg.kantorLat != null && cfg.kantorLng != null && (
                <a href={`https://www.google.com/maps?q=${cfg.kantorLat},${cfg.kantorLng}`} target="_blank" rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  Lihat di peta
                </a>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Saat aktif, absen di luar radius ditolak server. Buka halaman ini dari HP sambil berdiri di kantor untuk hasil paling akurat.
            </p>
          </div>

          {/* Pemeliharaan */}
          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">Pemeliharaan</p>
            <button
              onClick={async () => {
                setSinkron(true); setPesan(null);
                try {
                  const r = await sinkronKartu();
                  setPesan({ t: "ok", s: `Sinkronisasi selesai: ${r.diperbarui} dari ${r.diperiksa} akun diperbarui.` });
                } catch (e: any) {
                  setPesan({ t: "err", s: pesanError(e) });
                } finally { setSinkron(false); }
              }}
              disabled={sinkron}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sinkron ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" />
              </svg>
              {sinkron ? "Menyinkronkan..." : "Sinkronkan status kartu"}
            </button>
            <p className="text-[11px] text-gray-500 mt-2">
              Jalankan sekali setelah pembaruan sistem, agar penanda kepemilikan kartu selaras dengan data sebenarnya.
            </p>
          </div>

          <button onClick={simpan} disabled={busy}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-telkomRed text-white font-semibold press disabled:opacity-50 shadow-lift">
            {busy ? (<><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Menyimpan...</>) : "Simpan Pengaturan"}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
