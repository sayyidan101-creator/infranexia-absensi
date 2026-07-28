"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import Sheet from "@/components/Sheet";
import { db } from "@/lib/firebase";
import { Pesan, Konfeti, Kosong } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { nfcTersedia, mulaiPindai, PemindaiNfc } from "@/lib/nfc";
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

  // Pencatatan manual
  const [manualBuka, setManualBuka] = useState(false);
  const [peserta, setPeserta] = useState<any[]>([]);
  const [cariPeserta, setCariPeserta] = useState("");

  const pemindai = useRef<PemindaiNfc | null>(null);
  const posisi = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const sedangProses = useRef(false);

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

  const tanganiKartu = useCallback(async (serial: string) => {
    if (sedangProses.current) return;
    sedangProses.current = true;
    setSibuk(true);
    setGagal("");
    try {
      const r = await absenDenganKartu(serial, posisi.current.lat, posisi.current.lng);
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

  const mulai = async () => {
    setGalat("");
    try {
      pemindai.current = await mulaiPindai(tanganiKartu, (m) => setGagal(m));
      setAktif(true);
    } catch (e: any) {
      setGalat(e?.message || "Gagal memulai pemindaian.");
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

  const didukung = nfcTersedia();

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 anim-fade-up">
        <div>
          <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">Mesin Absen</span>
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">Tempel Kartu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Jam kerja {cfg.jamMasuk}–{cfg.jamPulang}
          </p>
        </div>
        <p className="text-2xl font-bold text-navy-900 font-mono tabular-nums">{jamKini || "--:--:--"}</p>
      </div>

      {!didukung && (
        <Pesan tipe="err">
          Perangkat ini tidak mendukung NFC lewat browser. Gunakan Chrome di Android yang punya NFC,
          atau pakai pencatatan manual di bawah.
        </Pesan>
      )}
      {galat && <Pesan tipe="err">{galat}</Pesan>}

      {/* Area pindai */}
      <div className="relative card overflow-hidden anim-fade-up d-1">
        <Konfeti aktif={!!hasil && !hasil.diulang} />

        <div className="p-6 min-h-[19rem] flex flex-col items-center justify-center text-center">
          {hasil ? (
            <div className="anim-pop w-full">
              <div className="flex justify-center mb-3">
                <div className={`rounded-full p-1 ${hasil.mode === "masuk" ? "bg-emerald-100" : "bg-purple-100"}`}>
                  <Avatar name={hasil.nama} foto={hasil.foto || undefined} size={72} />
                </div>
              </div>
              <p className="text-lg font-bold text-navy-900">{hasil.nama}</p>
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
                <p className="text-xs text-gray-400 mt-2">Kartu ditempel ulang — tidak ada perubahan.</p>
              )}
            </div>
          ) : gagal ? (
            <div className="anim-pop">
              <span className="w-20 h-20 mx-auto rounded-full bg-red-50 text-telkomRed flex items-center justify-center">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              </span>
              <p className="text-sm font-medium text-navy-900 mt-4 max-w-xs">{gagal}</p>
            </div>
          ) : (
            <>
              <span className={`relative w-24 h-24 rounded-full flex items-center justify-center ${
                aktif ? "bg-navy-900 text-white anim-ring" : "bg-gray-100 text-gray-400"
              }`}>
                {sibuk ? (
                  <span className="w-8 h-8 rounded-full border-[3px] border-white/25 border-t-white animate-spin" />
                ) : (
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 8.5a7 7 0 0 1 0 7" /><path d="M9.5 6a11 11 0 0 1 0 12" />
                    <path d="M13 3.5a15 15 0 0 1 0 17" /><circle cx="3" cy="12" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                )}
              </span>
              <p className="text-base font-semibold text-navy-900 mt-5">
                {aktif ? "Tempelkan kartu ke belakang perangkat" : "Mesin absen belum aktif"}
              </p>
              <p className="text-xs text-gray-500 mt-1.5 max-w-[16rem]">
                {aktif
                  ? "Tahan sekitar satu detik sampai muncul umpan balik."
                  : "Ketuk tombol di bawah untuk mulai memindai kartu peserta."}
              </p>
            </>
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
            Catat manual tanpa kartu
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

      {/* Pencatatan manual */}
      <Sheet
        buka={manualBuka}
        tutup={() => setManualBuka(false)}
        judul="Catat Manual"
      >
        <div className="space-y-3">
          <Pesan tipe="info">
            Pakai ini hanya bila kartu tertinggal atau NFC bermasalah. Pencatatan manual
            tersimpan dengan penanda operator, jadi tetap bisa ditelusuri.
          </Pesan>

          <input value={cariPeserta} onChange={(e) => setCariPeserta(e.target.value)}
            placeholder="Cari nama peserta..."
            className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700" />

          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
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
      </Sheet>
    </div>
  );
}

export default function KiosPage() {
  return <Protected allow={["admin", "pembimbing"]}><KiosInner /></Protected>;
}
