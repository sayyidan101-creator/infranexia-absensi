"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import Sheet from "@/components/Sheet";
import { db } from "@/lib/firebase";
import { Pesan, Konfeti, Kosong } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { kameraTersedia, mulaiPindaiQr, PemindaiQr } from "@/lib/pindaiQr";
import { absenDenganKartu, absenManual, HasilAbsenKartu } from "@/lib/kartu";
import { ambilKonfigurasi, KONFIG_DEFAULT, Konfigurasi } from "@/lib/absensi";

interface Catatan extends HasilAbsenKartu {
  waktu: number;
}

function getPosisi(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      (p) => res(p), () => res(null),
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  });
}

const salam = () => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
};

function ScanCardInner() {
  const [aktif, setAktif] = useState(false);
  const [galat, setGalat] = useState("");
  const [hasil, setHasil] = useState<HasilAbsenKartu | null>(null);
  const [gagal, setGagal] = useState("");
  const [riwayat, setRiwayat] = useState<Catatan[]>([]);
  const [cfg, setCfg] = useState<Konfigurasi>(KONFIG_DEFAULT);
  const [jamKini, setJamKini] = useState("");
  const [tanggalKini, setTanggalKini] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [banyakKamera, setBanyakKamera] = useState(false);
  const [layarPenuh, setLayarPenuh] = useState(false);

  // Cadangan: ketik kode kartu, atau pilih nama peserta
  const [manualBuka, setManualBuka] = useState(false);
  const [kodeKetik, setKodeKetik] = useState("");
  const [peserta, setPeserta] = useState<any[]>([]);
  const [cariPeserta, setCariPeserta] = useState("");

  const wadah = useRef<HTMLDivElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const pemindai = useRef<PemindaiQr | null>(null);
  const posisi = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const sedangProses = useRef(false);
  // Kamera membaca QR yang sama belasan kali per detik selama kartunya masih
  // terlihat. Tanpa penjaga ini setiap frame jadi satu permintaan ke server.
  const kodeTerakhir = useRef<{ kode: string; waktu: number }>({ kode: "", waktu: 0 });

  useEffect(() => { ambilKonfigurasi().then(setCfg); }, []);

  useEffect(() => {
    const f = () => {
      const d = new Date();
      // Dirakit sendiri, bukan lewat toLocaleTimeString: format Indonesia
      // memisahkan jam dengan titik ("12.57.52"), sedangkan pada jam sebesar
      // ini titik dua jauh lebih terbaca sebagai penunjuk waktu.
      const dua = (n: number) => String(n).padStart(2, "0");
      setJamKini(`${dua(d.getHours())}:${dua(d.getMinutes())}:${dua(d.getSeconds())}`);
      setTanggalKini(d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }));
    };
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getPosisi().then((p) => {
      if (p) posisi.current = { lat: p.coords.latitude, lng: p.coords.longitude };
    });
  }, []);

  // Layar tetap menyala selama mesin aktif
  useEffect(() => {
    if (!aktif) return;
    let kunci: any = null;
    (navigator as any).wakeLock?.request("screen").then((k: any) => { kunci = k; }).catch(() => {});
    return () => { kunci?.release?.().catch(() => {}); };
  }, [aktif]);

  // Ikuti perubahan layar penuh, termasuk saat pengguna menekan Esc
  useEffect(() => {
    const f = () => setLayarPenuh(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const gantiLayarPenuh = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wadah.current?.requestFullscreen();
    } catch {
      setGalat("Perangkat ini tidak mengizinkan mode layar penuh.");
    }
  };

  const kirim = useCallback(async (kode: string) => {
    if (sedangProses.current) return;
    sedangProses.current = true;
    setSibuk(true);
    setGagal("");
    try {
      const r = await absenDenganKartu(kode, posisi.current.lat, posisi.current.lng);
      setHasil(r);
      setRiwayat((lama) => [{ ...r, waktu: Date.now() }, ...lama].slice(0, 8));
      if (navigator.vibrate) navigator.vibrate(r.diulang ? 20 : [15, 45, 15]);
    } catch (e: any) {
      setGagal(pesanError(e));
      setHasil(null);
      if (navigator.vibrate) navigator.vibrate([50, 60, 50]);
    } finally {
      setSibuk(false);
      setTimeout(() => { sedangProses.current = false; }, 1200);
      setTimeout(() => { setHasil(null); setGagal(""); }, 6000);
    }
  }, []);

  const tanganiPindaian = useCallback((isi: string) => {
    const kode = String(isi || "").trim();
    if (!kode) return;
    const { kode: lalu, waktu } = kodeTerakhir.current;
    if (kode === lalu && Date.now() - waktu < 4000) return;
    kodeTerakhir.current = { kode, waktu: Date.now() };
    kirim(kode);
  }, [kirim]);

  const mulai = async () => {
    setGalat("");
    if (!video.current) return;
    try {
      pemindai.current = await mulaiPindaiQr(video.current, tanganiPindaian, (m) => setGagal(m));
      setAktif(true);
      setBanyakKamera(
        await navigator.mediaDevices
          .enumerateDevices()
          .then((d) => d.filter((x) => x.kind === "videoinput").length > 1)
          .catch(() => false)
      );
    } catch (e: any) {
      setGalat(e?.message || "Gagal menyalakan kamera.");
    }
  };

  const berhenti = () => {
    pemindai.current?.hentikan();
    pemindai.current = null;
    setAktif(false);
  };

  useEffect(() => () => pemindai.current?.hentikan(), []);

  const bukaManual = async () => {
    setManualBuka(true);
    if (peserta.length === 0) {
      const snap = await getDocs(query(collection(db, "users"), where("role", "==", "magang")));
      setPeserta(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    }
  };

  const kirimKetikan = async () => {
    const kode = kodeKetik.trim();
    if (!kode) return;
    setManualBuka(false);
    setKodeKetik("");
    await kirim(kode);
  };

  const catatManual = async (uid: string) => {
    setSibuk(true);
    setGagal("");
    try {
      const r = await absenManual(uid, posisi.current.lat, posisi.current.lng);
      setHasil(r);
      setRiwayat((lama) => [{ ...r, waktu: Date.now() }, ...lama].slice(0, 8));
      setManualBuka(false);
      setTimeout(() => setHasil(null), 6000);
    } catch (e: any) {
      setGagal(pesanError(e));
    } finally { setSibuk(false); }
  };

  const pesertaTersaring = peserta.filter((p) =>
    !cariPeserta || `${p.name} ${p.nim || ""}`.toLowerCase().includes(cariPeserta.toLowerCase())
  );

  const didukung = kameraTersedia();
  const tampilkanHasil = !!hasil || !!gagal;

  return (
    <div ref={wadah} className={layarPenuh ? "fixed inset-0 z-[80] bg-slate-100 overflow-y-auto p-4 sm:p-6" : ""}>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* ============ KEPALA ============ */}
        <div className="rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900 text-white p-5 sm:p-6 anim-fade-up shadow-lift">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-slate-400">
                Mesin Absen
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold mt-1">Scan Card</h1>
              <p className="text-sm text-slate-300 mt-1">
                {salam()} · jam kerja {cfg.jamMasuk}–{cfg.jamPulang}
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-4xl sm:text-5xl font-bold font-mono tabular-nums leading-none">
                {jamKini || "--:--:--"}
              </p>
              <p className="text-xs text-slate-400 mt-1.5">{tanggalKini}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              aktif ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-slate-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${aktif ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
              {aktif ? "Kamera aktif" : "Kamera mati"}
            </span>
            {riwayat.length > 0 && (
              <span className="text-xs text-slate-400">{riwayat.length} pindaian sesi ini</span>
            )}
            <button onClick={gantiLayarPenuh}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 press">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {layarPenuh
                  ? <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                  : <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />}
              </svg>
              {layarPenuh ? "Keluar" : "Layar penuh"}
            </button>
          </div>
        </div>

        {!didukung && (
          <Pesan tipe="err">
            Browser ini tidak bisa mengakses kamera. Pastikan halaman dibuka lewat HTTPS,
            atau pakai pencatatan cadangan di bawah.
          </Pesan>
        )}
        {galat && <Pesan tipe="err">{galat}</Pesan>}

        {/* ============ AREA PINDAI ============ */}
        <div className="relative card overflow-hidden anim-fade-up d-1">
          <Konfeti aktif={!!hasil && !hasil.diulang} />

          <div className="relative bg-navy-900 aspect-[4/3] sm:aspect-[16/10] overflow-hidden">
            {/* Elemen video selalu terpasang — kamera butuh elemennya sudah ada di DOM */}
            <video ref={video} playsInline muted
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                aktif && !tampilkanHasil ? "opacity-100" : "opacity-0"
              }`} />

            {/* Bingkai bidik */}
            {aktif && !tampilkanHasil && (
              <>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative w-[52%] max-w-[16rem] aspect-square">
                    <span className="absolute inset-0 rounded-2xl ring-[100vmax] ring-navy-900/50" />
                    {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                      "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                      "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                      "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c, i) => (
                      <span key={i} className={`absolute w-10 h-10 border-white/90 ${c}`} />
                    ))}
                  </div>
                </div>
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-navy-900/80 to-transparent">
                  <p className="text-center text-base sm:text-lg font-semibold text-white drop-shadow">
                    {sibuk ? "Mencatat..." : "Arahkan kartu ke dalam bingkai"}
                  </p>
                </div>
                {banyakKamera && (
                  <button onClick={() => pemindai.current?.gantiKamera()}
                    aria-label="Ganti kamera"
                    className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center press backdrop-blur-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.6-4.2" /><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.6 4.2" />
                      <path d="M21 3v5h-5M3 21v-5h5" />
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Hasil menutupi kamera supaya terbaca dari jarak berdiri */}
            {tampilkanHasil && (
              <div className={`absolute inset-0 flex flex-col items-center justify-center text-center px-6 anim-pop ${
                hasil ? (hasil.mode === "masuk" && hasil.status === "terlambat" ? "bg-amber-50" : hasil.mode === "masuk" ? "bg-emerald-50" : "bg-purple-50") : "bg-red-50"
              }`}>
                {hasil ? (
                  <>
                    <div className={`rounded-full p-1.5 ${
                      hasil.mode === "masuk"
                        ? hasil.status === "terlambat" ? "bg-amber-200" : "bg-emerald-200"
                        : "bg-purple-200"
                    }`}>
                      <Avatar name={hasil.nama} foto={hasil.foto || undefined} size={104} />
                    </div>

                    <p className="text-2xl sm:text-3xl font-bold text-navy-900 mt-4 leading-tight max-w-lg">
                      {hasil.nama}
                    </p>
                    {hasil.divisi && <p className="text-sm text-gray-500 mt-1">{hasil.divisi}</p>}

                    <div className={`inline-flex items-center gap-2.5 mt-4 px-5 py-2.5 rounded-full text-lg sm:text-xl font-bold ${
                      hasil.mode === "masuk"
                        ? hasil.status === "terlambat" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                        : "bg-purple-500 text-white"
                    }`}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
                      {hasil.mode === "masuk" ? "Masuk" : "Pulang"} · {hasil.jam}
                    </div>

                    {hasil.mode === "masuk" && hasil.status === "terlambat" && (
                      <p className="text-sm text-amber-700 mt-3 font-semibold">Tercatat terlambat</p>
                    )}
                    {hasil.diulang && (
                      <p className="text-sm text-gray-400 mt-3">Kartu dipindai ulang — tidak ada perubahan.</p>
                    )}
                  </>
                ) : (
                  <>
                    <span className="w-24 h-24 rounded-full bg-white text-telkomRed flex items-center justify-center shadow-sm">
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    </span>
                    <p className="text-lg sm:text-xl font-semibold text-navy-900 mt-5 max-w-md leading-snug">{gagal}</p>
                  </>
                )}
              </div>
            )}

            {/* Keadaan diam sebelum kamera dinyalakan */}
            {!aktif && !tampilkanHasil && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <span className="w-24 h-24 rounded-2xl bg-white/10 text-white/70 flex items-center justify-center">
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" />
                  </svg>
                </span>
                <p className="text-lg font-semibold text-white mt-5">Mesin absen belum aktif</p>
                <p className="text-sm text-white/60 mt-2 max-w-[18rem]">
                  Nyalakan kamera, lalu peserta tinggal mengarahkan kartunya.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-4 flex flex-col sm:flex-row gap-2">
            {aktif ? (
              <button onClick={berhenti}
                className="flex-1 py-4 rounded-2xl border border-gray-200 text-navy-900 font-semibold press">
                Hentikan Mesin Absen
              </button>
            ) : (
              <button onClick={mulai} disabled={!didukung}
                className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-telkomRed to-red-700 text-white font-semibold text-lg press shadow-lift disabled:opacity-40 disabled:shadow-none">
                Mulai Mesin Absen
              </button>
            )}
            <button onClick={bukaManual}
              className="sm:w-56 py-4 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600 press">
              Kartu tertinggal
            </button>
          </div>
        </div>

        {/* ============ RIWAYAT ============ */}
        <div className="card p-4 sm:p-5 anim-fade-up d-2">
          <h2 className="font-semibold text-navy-900 mb-3">Pindai Terakhir</h2>
          {riwayat.length === 0 ? (
            <Kosong judul="Belum ada yang absen" pesan="Hasil pindaian akan muncul di sini." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {riwayat.map((r, i) => (
                <li key={r.waktu + "-" + i} className="flex items-center gap-3 py-2.5 anim-fade-up">
                  <Avatar name={r.nama} foto={r.foto || undefined} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{r.nama}</p>
                    <p className="text-[11px] text-gray-400">
                      {r.mode === "masuk" ? "Masuk" : "Pulang"}
                      {r.mode === "masuk" && r.status === "terlambat" && " · terlambat"}
                    </p>
                  </div>
                  <span className={`text-sm font-bold font-mono shrink-0 ${
                    r.mode === "masuk"
                      ? r.status === "terlambat" ? "text-amber-600" : "text-emerald-600"
                      : "text-purple-600"
                  }`}>{r.jam}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 anim-fade-up d-3">
          Jam dicatat dari waktu server. Biarkan halaman ini terbuka selama jam kerja.
        </p>
      </div>

      {/* ============ CADANGAN ============ */}
      <Sheet buka={manualBuka} tutup={() => setManualBuka(false)} judul="Tanpa Pindai">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-navy-900">Ketik kode kartu</label>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
              Kode tercetak di bawah QR pada kartunya. Pakai ini bila QR-nya tergores atau buram.
            </p>
            <div className="flex gap-2">
              <input value={kodeKetik}
                onChange={(e) => setKodeKetik(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") kirimKetikan(); }}
                placeholder="ABCD-EFGH-JKMN"
                autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3.5 py-3 text-sm font-mono tracking-wider outline-none focus:ring-2 focus:ring-navy-700" />
              <button onClick={kirimKetikan} disabled={sibuk || !kodeKetik.trim()}
                className="px-5 rounded-xl bg-navy-900 text-white text-sm font-semibold press disabled:opacity-40 shrink-0">
                Catat
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="text-sm font-semibold text-navy-900">Atau pilih namanya</label>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
              Tersimpan dengan penanda operator, jadi tetap bisa ditelusuri.
            </p>

            <input value={cariPeserta} onChange={(e) => setCariPeserta(e.target.value)}
              placeholder="Cari nama peserta..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700" />

            <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto mt-1">
              {pesertaTersaring.map((p) => (
                <li key={p.id}>
                  <button onClick={() => catatManual(p.id)} disabled={sibuk}
                    className="w-full flex items-center gap-3 py-3 press disabled:opacity-50 text-left">
                    <Avatar name={p.name} foto={p.foto} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{p.jurusan || p.nim || "—"}</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                </li>
              ))}
              {pesertaTersaring.length === 0 && (
                <li className="py-8 text-center text-sm text-gray-400">Tidak ada peserta cocok.</li>
              )}
            </ul>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

export default function ScanCardPage() {
  return <Protected allow={["admin", "pembimbing"]}><ScanCardInner /></Protected>;
}
