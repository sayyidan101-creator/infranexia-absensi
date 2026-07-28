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

function KiosInner() {
  const [aktif, setAktif] = useState(false);
  const [galat, setGalat] = useState("");
  const [hasil, setHasil] = useState<HasilAbsenKartu | null>(null);
  const [gagal, setGagal] = useState("");
  const [riwayat, setRiwayat] = useState<Catatan[]>([]);
  const [cfg, setCfg] = useState<Konfigurasi>(KONFIG_DEFAULT);
  const [jamKini, setJamKini] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [banyakKamera, setBanyakKamera] = useState(false);

  // Cadangan: ketik kode kartu, atau pilih nama peserta
  const [manualBuka, setManualBuka] = useState(false);
  const [kodeKetik, setKodeKetik] = useState("");
  const [peserta, setPeserta] = useState<any[]>([]);
  const [cariPeserta, setCariPeserta] = useState("");

  const video = useRef<HTMLVideoElement | null>(null);
  const pemindai = useRef<PemindaiQr | null>(null);
  const posisi = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const sedangProses = useRef(false);
  // Kamera membaca QR yang sama belasan kali per detik selama kartunya masih
  // terlihat. Tanpa penjaga ini setiap frame jadi satu permintaan ke server.
  const kodeTerakhir = useRef<{ kode: string; waktu: number }>({ kode: "", waktu: 0 });

  useEffect(() => { ambilKonfigurasi().then(setCfg); }, []);

  useEffect(() => {
    const f = () => setJamKini(new Date().toLocaleTimeString("id-ID", { hour12: false }));
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);

  useEffect(() => {
    getPosisi().then((p) => {
      if (p) posisi.current = { lat: p.coords.latitude, lng: p.coords.longitude };
    });
  }, []);

  // Layar tetap menyala selama kios aktif
  useEffect(() => {
    if (!aktif) return;
    let kunci: any = null;
    (navigator as any).wakeLock?.request("screen").then((k: any) => { kunci = k; }).catch(() => {});
    return () => { kunci?.release?.().catch(() => {}); };
  }, [aktif]);

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
    <div className="max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 anim-fade-up">
        <div>
          <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">Mesin Absen</span>
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">Pindai Kartu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Jam kerja {cfg.jamMasuk}–{cfg.jamPulang}
          </p>
        </div>
        <p className="text-2xl font-bold text-navy-900 font-mono tabular-nums">{jamKini || "--:--:--"}</p>
      </div>

      {!didukung && (
        <Pesan tipe="err">
          Browser ini tidak bisa mengakses kamera. Pastikan halaman dibuka lewat HTTPS,
          atau pakai pencatatan cadangan di bawah.
        </Pesan>
      )}
      {galat && <Pesan tipe="err">{galat}</Pesan>}

      {/* Area pindai */}
      <div className="relative card overflow-hidden anim-fade-up d-1">
        <Konfeti aktif={!!hasil && !hasil.diulang} />

        <div className="relative bg-navy-900 aspect-[4/3] overflow-hidden">
          {/* Elemen video selalu terpasang — kamera butuh elemennya sudah ada di DOM */}
          <video ref={video} playsInline muted
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              aktif && !tampilkanHasil ? "opacity-100" : "opacity-0"
            }`} />

          {/* Bingkai bidik */}
          {aktif && !tampilkanHasil && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-[62%] aspect-square">
                  <span className="absolute inset-0 rounded-2xl ring-[100vmax] ring-navy-900/45" />
                  {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
                    "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
                    "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
                    "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c, i) => (
                    <span key={i} className={`absolute w-9 h-9 border-white/90 ${c}`} />
                  ))}
                </div>
              </div>
              <p className="absolute bottom-3 inset-x-0 text-center text-[13px] font-medium text-white/90 drop-shadow">
                {sibuk ? "Mencatat..." : "Arahkan QR kartu ke dalam bingkai"}
              </p>
              {banyakKamera && (
                <button onClick={() => pemindai.current?.gantiKamera()}
                  aria-label="Ganti kamera"
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center press backdrop-blur-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.6-4.2" /><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.6 4.2" />
                    <path d="M21 3v5h-5M3 21v-5h5" />
                  </svg>
                </button>
              )}
            </>
          )}

          {/* Hasil menutupi kamera supaya terbaca dari jarak berdiri */}
          {tampilkanHasil && (
            <div className="absolute inset-0 bg-white flex flex-col items-center justify-center text-center px-6 anim-pop">
              {hasil ? (
                <>
                  <div className={`rounded-full p-1 ${hasil.mode === "masuk" ? "bg-emerald-100" : "bg-purple-100"}`}>
                    <Avatar name={hasil.nama} foto={hasil.foto || undefined} size={76} />
                  </div>
                  <p className="text-lg font-bold text-navy-900 mt-3">{hasil.nama}</p>
                  {hasil.divisi && <p className="text-xs text-gray-500 mt-0.5">{hasil.divisi}</p>}

                  <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full text-sm font-semibold ${
                    hasil.mode === "masuk"
                      ? hasil.status === "terlambat" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      : "bg-purple-100 text-purple-700"
                  }`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
                    {hasil.mode === "masuk" ? "Absen masuk" : "Absen pulang"} · {hasil.jam}
                  </div>

                  {hasil.mode === "masuk" && hasil.status === "terlambat" && (
                    <p className="text-xs text-amber-600 mt-2 font-medium">Tercatat terlambat</p>
                  )}
                  {hasil.diulang && (
                    <p className="text-xs text-gray-400 mt-2">Kartu dipindai ulang — tidak ada perubahan.</p>
                  )}
                </>
              ) : (
                <>
                  <span className="w-20 h-20 rounded-full bg-red-50 text-telkomRed flex items-center justify-center">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                  </span>
                  <p className="text-sm font-medium text-navy-900 mt-4 max-w-xs">{gagal}</p>
                </>
              )}
            </div>
          )}

          {/* Keadaan diam sebelum kamera dinyalakan */}
          {!aktif && !tampilkanHasil && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <span className="w-20 h-20 rounded-2xl bg-white/10 text-white/70 flex items-center justify-center">
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" />
                </svg>
              </span>
              <p className="text-base font-semibold text-white mt-4">Mesin absen belum aktif</p>
              <p className="text-xs text-white/60 mt-1.5 max-w-[16rem]">
                Nyalakan kamera, lalu peserta tinggal mengarahkan kartunya.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-4">
          {aktif ? (
            <button onClick={berhenti}
              className="w-full py-4 rounded-2xl border border-gray-200 text-navy-900 font-semibold press">
              Hentikan Mesin Absen
            </button>
          ) : (
            <button onClick={mulai} disabled={!didukung}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-telkomRed to-red-700 text-white font-semibold press shadow-lift disabled:opacity-40 disabled:shadow-none">
              Mulai Mesin Absen
            </button>
          )}
          <button onClick={bukaManual} className="w-full mt-2 py-3 text-sm text-gray-500 press">
            Kartunya tertinggal atau tidak terbaca
          </button>
        </div>
      </div>

      {/* Riwayat pindai */}
      <div className="card p-4 sm:p-5 anim-fade-up d-2">
        <h2 className="font-semibold text-navy-900 mb-3">Pindai Terakhir</h2>
        {riwayat.length === 0 ? (
          <Kosong judul="Belum ada yang absen" pesan="Hasil pindaian akan muncul di sini." />
        ) : (
          <ul className="divide-y divide-gray-100">
            {riwayat.map((r, i) => (
              <li key={r.waktu + "-" + i} className="flex items-center gap-3 py-2.5 anim-fade-up">
                <Avatar name={r.nama} foto={r.foto || undefined} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-900 truncate">{r.nama}</p>
                  <p className="text-[11px] text-gray-400">
                    {r.mode === "masuk" ? "Masuk" : "Pulang"}
                    {r.mode === "masuk" && r.status === "terlambat" && " · terlambat"}
                  </p>
                </div>
                <span className={`text-xs font-semibold font-mono shrink-0 ${
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

      {/* Cadangan: ketik kode, atau pilih nama */}
      <Sheet buka={manualBuka} tutup={() => setManualBuka(false)} judul="Tanpa Pindai">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-navy-900">Ketik kode kartu</label>
            <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
              Kode tercetak di kartunya. Pakai ini bila QR-nya tergores atau buram.
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

export default function KiosPage() {
  return <Protected allow={["admin", "pembimbing"]}><KiosInner /></Protected>;
}
