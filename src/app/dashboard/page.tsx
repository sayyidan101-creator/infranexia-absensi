"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import CincinProgres from "@/components/CincinProgres";
import Kalender, { NavigasiBulan, BULAN } from "@/components/Kalender";
import { useAuth } from "@/context/AuthContext";
import { CountUp, SkeletonKartu, Skeleton, Kosong, Segmen, Pesan } from "@/components/ui";
import { gaya, terhitungHadir } from "@/lib/status";
import { izinMenunggu, Izin } from "@/lib/izin";
import {
  absensiHariIni, absensiSejak, riwayatRentang, batasBulan, hitungRekap,
  petaUserDetail, pantauAbsensiHariIni, tanggalHariIni, Absensi,
} from "@/lib/absensi";

const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function last7() {
  const out: { tgl: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const off = d.getTimezoneOffset() * 60000;
    out.push({ tgl: new Date(d.getTime() - off).toISOString().slice(0, 10), label: HARI[d.getDay()] });
  }
  return out;
}
const jam = (t?: any) => (t?.toDate ? t.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-");

const tglPendek = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
};

/**
 * Kegagalan memuat dijadikan pesan yang bisa dibaca, bukan dibiarkan menggantung.
 * Sebelumnya satu permintaan yang gagal membuat `setLoading(false)` tak pernah
 * dijalankan, dan halaman berhenti selamanya di kerangka abu-abu.
 */
function pesanMuat(e: any): string {
  const s = String(e?.code || e?.message || e);
  if (/permission-denied|insufficient/i.test(s))
    return "Data kehadiranmu tidak bisa dibaca. Aturan keamanan Firestore perlu diperbarui — beri tahu admin.";
  if (/index/i.test(s))
    return "Firestore masih menyiapkan indeks untuk penyaringan tanggal. Coba lagi beberapa menit lagi.";
  if (/offline|unavailable|network/i.test(s))
    return "Tidak bisa terhubung ke server. Periksa koneksimu lalu muat ulang.";
  return e?.message || "Gagal memuat data.";
}

const salam = () => {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
};

// ---------- Jam live ----------
function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const f = () => setNow(new Date().toLocaleTimeString("id-ID", { hour12: false }));
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);
  const tanggal = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
      <span className="hidden xs:inline">{tanggal} ·</span>
      <span className="font-mono tabular-nums">{now || "--:--:--"}</span>
    </span>
  );
}

// ---------- Kartu statistik ----------
function StatCard({ label, value, angka, chip, chipColor, icon, iconBg, delay = "" }: any) {
  return (
    <div className={`relative card p-4 sm:p-5 overflow-hidden anim-fade-up ${delay} transition-transform duration-200 active:scale-[0.98] md:hover:-translate-y-0.5 md:hover:shadow-lift`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
        {chip && <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full ${chipColor}`}>{chip}</span>}
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-navy-900 mt-3 sm:mt-4 leading-none tabular-nums">
        {typeof angka === "number" ? <CountUp value={angka} /> : value}
      </p>
      <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 uppercase tracking-wide">{label}</p>
      <div className="absolute -right-3 -bottom-3 opacity-[0.04] scale-[2.2] pointer-events-none">{icon}</div>
    </div>
  );
}

// ---------- Bar ringkasan kehadiran hari ini ----------
function RingkasanHariIni({ hadir, telat, belum, total }: { hadir: number; telat: number; belum: number; total: number }) {
  const t = Math.max(1, total);
  const pHadir = (hadir / t) * 100;
  const pTelat = (telat / t) * 100;
  const pct = Math.round(((hadir + telat) / t) * 100);

  return (
    <div className="card p-5 anim-fade-up d-1">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Kehadiran hari ini</p>
          <p className="text-3xl font-bold text-navy-900 mt-1 leading-none tabular-nums">
            <CountUp value={pct} suffix="%" />
          </p>
        </div>
        <p className="text-sm text-gray-500 tabular-nums">
          <span className="font-semibold text-navy-900">{hadir + telat}</span> dari {total} peserta
        </p>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${pHadir}%` }} />
        <div className="bg-amber-400 transition-all duration-700 ease-out" style={{ width: `${pTelat}%` }} />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3.5 text-xs">
        <Titik warna="bg-emerald-500" label="Tepat waktu" nilai={hadir} />
        <Titik warna="bg-amber-400" label="Terlambat" nilai={telat} />
        <Titik warna="bg-gray-200" label="Belum absen" nilai={belum} />
      </div>
    </div>
  );
}
function Titik({ warna, label, nilai }: { warna: string; label: string; nilai: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-500">
      <i className={`w-2.5 h-2.5 rounded-full ${warna}`} />
      {label}
      <b className="text-navy-900 tabular-nums">{nilai}</b>
    </span>
  );
}

// ---------- Grafik Bar/Line ----------
function Chart({ data, mode }: { data: { label: string; hadir: number; telat: number }[]; mode: "bar" | "line" }) {
  const max = Math.max(1, ...data.map((d) => d.hadir + d.telat));
  if (mode === "line") {
    const W = 560, H = 170, pad = 24;
    const step = (W - pad * 2) / (data.length - 1 || 1);
    const koor = data.map((d, i) => ({
      x: pad + i * step,
      y: H - pad - ((d.hadir + d.telat) / max) * (H - pad * 2),
    }));
    const pts = koor.map((p) => `${p.x},${p.y}`).join(" ");
    const area = `${pad},${H - pad} ${pts} ${pad + (data.length - 1) * step},${H - pad}`;
    return (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40 sm:h-44 overflow-visible">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#areaGrad)" className="anim-fade-in" />
          <polyline points={pts} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            style={{ strokeDasharray: 1200, strokeDashoffset: 1200, animation: "draw-line 1.1s ease-out forwards" }} />
          {koor.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#10b981" className="anim-pop" style={{ animationDelay: `${400 + i * 60}ms` }} />
          ))}
          {data.map((d, i) => (
            <text key={i} x={pad + i * step} y={H - 4} textAnchor="middle" fontSize="10" fill="#94a3b8">{d.label}</text>
          ))}
        </svg>
        <Legend />
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3 h-40 sm:h-44">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
            <div className="relative w-full flex flex-col justify-end h-full rounded-t-lg overflow-hidden bg-gray-50">
              <div style={{ height: `${(d.telat / max) * 100}%`, transitionDelay: `${i * 60}ms` }}
                className="bg-amber-400 w-full transition-[height] duration-700 ease-out" />
              <div style={{ height: `${(d.hadir / max) * 100}%`, transitionDelay: `${i * 60}ms` }}
                className="bg-emerald-500 w-full transition-[height] duration-700 ease-out group-hover:brightness-110" />
              {d.hadir + d.telat > 0 && (
                <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-gray-600">{d.hadir + d.telat}</span>
              )}
            </div>
            <span className="text-[11px] sm:text-xs text-gray-400">{d.label}</span>
          </div>
        ))}
      </div>
      <Legend />
    </div>
  );
}
function Legend() {
  return (
    <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Hadir</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Terlambat</span>
      </div>
      <span className="text-[11px] text-gray-400">7 hari terakhir</span>
    </div>
  );
}

// ---------- Aktivitas ----------
function Activity({ items }: { items: any[] }) {
  if (items.length === 0)
    return <Kosong judul="Menunggu aktivitas masuk" pesan="Belum ada riwayat kehadiran baru untuk ditampilkan." />;
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5 anim-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
          <Avatar name={it.nama} foto={it.foto} size={36} />
          <div className="flex-1 min-w-0"><p className="text-sm text-navy-900 truncate"><b>{it.nama}</b> {it.teks}</p></div>
          <span className={`text-xs font-medium shrink-0 ${it.warna}`}>{it.waktu}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------- Daftar yang belum absen ----------
function BelumAbsen({ orang }: { orang: any[] }) {
  if (orang.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center anim-fade-up">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
        </div>
        <p className="text-sm font-medium text-navy-900">Semua sudah absen</p>
        <p className="text-xs text-gray-400 mt-1">Tidak ada peserta yang tertinggal hari ini.</p>
      </div>
    );

  const tampil = orang.slice(0, 6);
  return (
    <>
      <ul className="divide-y divide-gray-100">
        {tampil.map((u, i) => (
          <li key={u.id} className="flex items-center gap-3 py-2.5 anim-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <Avatar name={u.name} foto={u.foto} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-navy-900 truncate">{u.name}</p>
              <p className="text-xs text-gray-400 truncate">{u.jurusan || u.kampus || "—"}</p>
            </div>
            {!u.kartuTerdaftar && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0">
                belum punya kartu
              </span>
            )}
          </li>
        ))}
      </ul>
      {orang.length > tampil.length && (
        <p className="text-xs text-gray-400 pt-3 text-center">+{orang.length - tampil.length} peserta lainnya</p>
      )}
    </>
  );
}

// ================= DASHBOARD ADMIN =================
function DashAdmin({ nama }: { nama: string }) {
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState<Absensi[]>([]);
  const [chart, setChart] = useState<any[]>([]);
  const [aktivitas, setAktivitas] = useState<any[]>([]);
  const [belumAbsen, setBelumAbsen] = useState<any[]>([]);
  const [mode, setMode] = useState<"bar" | "line">("bar");
  const [loading, setLoading] = useState(true);
  const [magangAktif, setMagangAktif] = useState<any[]>([]);
  const [langsung, setLangsung] = useState(false);

  const muat = async () => {
    setLoading(true);
    const hari = last7();

    // Dua permintaan saja: seluruh profil + absensi 7 hari terakhir.
    // Jumlah magang dan absensi hari ini diturunkan dari sini, bukan
    // ditanyakan ulang ke Firestore.
    const [detail, sejak] = await Promise.all([petaUserDetail(), absensiSejak(hari[0].tgl)]);

    const magang = Object.entries(detail)
      .map(([id, d]: any) => ({ id, ...d }))
      .filter((u) => u.role === "magang" && (u.status || "aktif") === "aktif");
    setTotal(magang.length);
    setMagangAktif(magang);

    const hariIni = sejak.filter((a) => a.tanggal === tanggalHariIni());
    setToday(hariIni);

    const sudah = new Set(hariIni.map((a) => a.userId));
    setBelumAbsen(magang.filter((u) => !sudah.has(u.id)));

    setChart(hari.map((h) => {
      const rec = sejak.filter((a) => a.tanggal === h.tgl);
      return { label: h.label, hadir: rec.filter((a) => a.status === "hadir").length, telat: rec.filter((a) => a.status === "terlambat").length };
    }));

    const ev: any[] = [];
    sejak.forEach((a) => {
      const u = detail[a.userId] || {};
      const nm = u.name || "Pengguna";
      if (a.jamMasuk) ev.push({ nama: nm, foto: u.foto, teks: a.status === "terlambat" ? "absen masuk (terlambat)" : "absen masuk", waktu: jam(a.jamMasuk), sort: a.jamMasuk.toDate?.().getTime() || 0, warna: a.status === "terlambat" ? "text-amber-600" : "text-emerald-600" });
      if (a.jamPulang) ev.push({ nama: nm, foto: u.foto, teks: "absen pulang", waktu: jam(a.jamPulang), sort: a.jamPulang.toDate?.().getTime() || 0, warna: "text-navy-700" });
    });
    ev.sort((x, y) => y.sort - x.sort);
    setAktivitas(ev.slice(0, 6));
    setLoading(false);
  };
  useEffect(() => { muat(); }, []);

  // Pantau absensi hari ini secara langsung: angka berubah sendiri saat ada
  // yang absen, tanpa perlu menekan Perbarui.
  useEffect(() => {
    if (magangAktif.length === 0) return;
    const berhenti = pantauAbsensiHariIni(
      (data) => {
        setToday(data);
        const sudah = new Set(data.map((a) => a.userId));
        setBelumAbsen(magangAktif.filter((u) => !sudah.has(u.id)));
        setLangsung(true);
      },
      () => setLangsung(false)
    );
    return () => berhenti();
  }, [magangAktif]);

  const hadir = today.filter((a) => a.status === "hadir").length;
  const telat = today.filter((a) => a.status === "terlambat").length;
  const pulang = today.filter((a) => a.jamPulang).length;
  const belum = Math.max(0, total - hadir - telat);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 anim-fade-up">
        <div>
          <Clock />
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">{salam()}, {nama.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5 inline-flex items-center gap-1.5">
            Pantau kehadiran magang
            {langsung && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                langsung
              </span>
            )}
          </p>
        </div>
        <button onClick={muat} disabled={loading}
          className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-navy-900 press hover:bg-gray-50 disabled:opacity-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" />
          </svg>
          Perbarui
        </button>
      </div>

      {/* Ringkasan kehadiran */}
      {loading ? <Skeleton className="h-[9.5rem] w-full rounded-2xl" />
        : <RingkasanHariIni hadir={hadir} telat={telat} belum={belum} total={total} />}

      {/* Statistik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? [0, 1, 2, 3].map((i) => <SkeletonKartu key={i} />) : (<>
          <StatCard label="Total Magang" angka={total} chip="aktif" chipColor="bg-blue-50 text-blue-600" iconBg="bg-blue-50 text-blue-600" delay="d-1"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>} />
          <StatCard label="Hadir Hari Ini" angka={hadir} chip={`${pct(hadir, total)}%`} chipColor="bg-emerald-50 text-emerald-600" iconBg="bg-emerald-50 text-emerald-600" delay="d-2"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>} />
          <StatCard label="Terlambat" angka={telat} chip={`${pct(telat, hadir + telat)}%`} chipColor="bg-amber-50 text-amber-600" iconBg="bg-amber-50 text-amber-600" delay="d-3"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>} />
          <StatCard label="Sudah Pulang" angka={pulang} chip={`${pct(pulang, hadir + telat)}%`} chipColor="bg-purple-50 text-purple-600" iconBg="bg-purple-50 text-purple-600" delay="d-4"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>} />
        </>)}
      </div>

      {/* Grafik */}
      <div className="card p-4 sm:p-6 anim-fade-up d-3">
        <div className="flex items-start justify-between mb-5 gap-3">
          <div>
            <h2 className="font-semibold text-navy-900">Tren Kehadiran</h2>
            <p className="text-xs text-gray-500 mt-0.5">Performa absensi sepekan terakhir.</p>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-0.5 shrink-0">
            {(["bar", "line"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${mode === m ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"}`}>{m}</button>
            ))}
          </div>
        </div>
        {loading ? <Skeleton className="h-40 sm:h-44 w-full" /> : <Chart data={chart} mode={mode} />}
      </div>

      {/* Belum absen + aktivitas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="card p-4 sm:p-6 anim-fade-up d-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-navy-900">Belum Absen</h2>
            {belumAbsen.length > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                {belumAbsen.length} orang
              </span>
            )}
          </div>
          {loading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            : <BelumAbsen orang={belumAbsen} />}
        </div>

        <div className="card p-4 sm:p-6 anim-fade-up d-5">
          <h2 className="font-semibold text-navy-900 mb-3">Aktivitas Terbaru</h2>
          {loading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            : <Activity items={aktivitas} />}
        </div>
      </div>

      {/* Info sistem + footer */}
      <div className="bg-gradient-to-r from-navy-900 to-navy-700 rounded-2xl p-5 flex items-start gap-3 text-white anim-fade-up d-6">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0 mt-1.5" />
        <div>
          <p className="text-sm font-medium">Sistem berjalan normal</p>
          <p className="text-xs text-slate-300">Jam absensi dicatat dari waktu server, bukan perangkat pengguna.</p>
        </div>
      </div>
      <p className="text-center text-[10px] sm:text-xs text-gray-400 tracking-widest uppercase">InfraNexia Systems &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

type TapisPeserta = "semua" | "belum" | "telat";

// ================= DASHBOARD PEMBIMBING =================
/**
 * Pembimbing memakai halaman sendiri, bukan halaman admin.
 *
 * Yang mereka butuhkan berbeda: bukan mengelola akun, tapi tahu siapa yang
 * belum datang pagi ini dan pengajuan izin mana yang menunggu tanda tangan
 * mereka. Menampilkan menu pengelolaan akun yang tidak bisa mereka pakai
 * hanya menambah kebisingan.
 */
function DashPembina({ nama }: { nama: string }) {
  const [orang, setOrang] = useState<any[]>([]);
  const [today, setToday] = useState<Absensi[]>([]);
  const [chart, setChart] = useState<any[]>([]);
  const [aktivitas, setAktivitas] = useState<any[]>([]);
  const [izin, setIzin] = useState<Izin[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState("");
  const [langsung, setLangsung] = useState(false);
  const [tapis, setTapis] = useState<TapisPeserta>("semua");

  const muat = async () => {
    setLoading(true);
    setGalat("");
    try {
    const hari = last7();
    const [detail, sejak, daftarIzin] = await Promise.all([
      petaUserDetail(),
      absensiSejak(hari[0].tgl),
      izinMenunggu().catch(() => [] as Izin[]),
    ]);

    const magang = Object.entries(detail)
      .map(([id, d]: any) => ({ id, ...d }))
      .filter((u) => u.role === "magang" && (u.status || "aktif") === "aktif")
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    setOrang(magang);
    setIzin(daftarIzin);
    setToday(sejak.filter((a) => a.tanggal === tanggalHariIni()));

    setChart(hari.map((h) => {
      const rec = sejak.filter((a) => a.tanggal === h.tgl);
      return {
        label: h.label,
        hadir: rec.filter((a) => a.status === "hadir").length,
        telat: rec.filter((a) => a.status === "terlambat").length,
      };
    }));

    const ev: any[] = [];
    sejak.forEach((a) => {
      const u = detail[a.userId] || {};
      const nm = u.name || "Pengguna";
      if (a.jamMasuk) ev.push({ nama: nm, foto: u.foto, teks: a.status === "terlambat" ? "absen masuk (terlambat)" : "absen masuk", waktu: jam(a.jamMasuk), sort: a.jamMasuk.toDate?.().getTime() || 0, warna: a.status === "terlambat" ? "text-amber-600" : "text-emerald-600" });
      if (a.jamPulang) ev.push({ nama: nm, foto: u.foto, teks: "absen pulang", waktu: jam(a.jamPulang), sort: a.jamPulang.toDate?.().getTime() || 0, warna: "text-navy-700" });
    });
    ev.sort((x, y) => y.sort - x.sort);
    setAktivitas(ev.slice(0, 6));
    } catch (e: any) {
      setGalat(pesanMuat(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { muat(); }, []);

  // Angka ikut berubah sendiri saat ada yang absen di kios
  useEffect(() => {
    if (orang.length === 0) return;
    const berhenti = pantauAbsensiHariIni(
      (data) => { setToday(data); setLangsung(true); },
      () => setLangsung(false)
    );
    return () => berhenti();
  }, [orang]);

  const petaHariIni = useMemo(() => {
    const m = new Map<string, Absensi>();
    today.forEach((a) => m.set(a.userId, a));
    return m;
  }, [today]);

  const hadir = today.filter((a) => a.status === "hadir").length;
  const telat = today.filter((a) => a.status === "terlambat").length;
  const total = orang.length;
  const belum = Math.max(0, total - hadir - telat);
  const persen = total ? Math.round(((hadir + telat) / total) * 100) : 0;
  const menunggu = izin; // sudah disaring di query

  const daftar = orang.filter((u) => {
    const a = petaHariIni.get(u.id);
    if (tapis === "belum") return !a;
    if (tapis === "telat") return a?.status === "terlambat";
    return true;
  });

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 anim-fade-up">
        <div>
          <Clock />
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">{salam()}, {nama.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5 inline-flex items-center gap-1.5">
            Peserta bimbinganmu hari ini
            {langsung && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                langsung
              </span>
            )}
          </p>
        </div>
        <button onClick={muat} disabled={loading}
          className="self-start inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium text-navy-900 press hover:bg-gray-50 disabled:opacity-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}>
            <path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" />
          </svg>
          Perbarui
        </button>
      </div>

      {galat && <Pesan tipe="err">{galat}</Pesan>}

      {/* Ikhtisar hari ini */}
      {loading ? <Skeleton className="h-44 w-full rounded-2xl" /> : (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white p-5 sm:p-6 anim-fade-up d-1 shadow-lift">
          <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5 anim-float" />
          <div className="relative flex items-center gap-5">
            <CincinProgres nilai={persen} ukuran={104} label="hadir" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest text-slate-300">Kehadiran hari ini</p>
              <p className="text-2xl font-bold mt-1 tabular-nums leading-none">
                {hadir + telat} <span className="text-base font-medium text-slate-300">dari {total} peserta</span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-emerald-400" />Tepat waktu <b className="text-white tabular-nums">{hadir}</b></span>
                <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-amber-400" />Terlambat <b className="text-white tabular-nums">{telat}</b></span>
                <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-white/30" />Belum <b className="text-white tabular-nums">{belum}</b></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Yang perlu ditindaklanjuti */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <KartuTindakan
          href="/izin"
          nada={menunggu.length > 0 ? "amber" : "netral"}
          angka={menunggu.length}
          judul="Izin menunggu persetujuan"
          pesan={menunggu.length > 0
            ? `Dari ${new Set(menunggu.map((i) => i.userId)).size} peserta. Buka untuk meninjau.`
            : "Tidak ada pengajuan yang tertahan."}
          delay="d-2"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 15h6M9 11h3" /></svg>}
        />
        <KartuTindakan
          href="/kios"
          nada={belum > 0 ? "navy" : "netral"}
          angka={belum}
          judul="Belum absen hari ini"
          pesan={belum > 0
            ? "Buka Scan Card bila ada yang kartunya bermasalah."
            : "Semua peserta sudah tercatat hari ini."}
          delay="d-3"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 20h1" /></svg>}
        />
      </div>

      {/* Daftar peserta hari ini */}
      <div className="card p-4 sm:p-6 anim-fade-up d-4">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-navy-900">Peserta Hari Ini</h2>
            <p className="text-xs text-gray-500 mt-0.5">Ketuk nama untuk membuka rekap kehadirannya.</p>
          </div>
          <Segmen<TapisPeserta>
            nilai={tapis}
            ubah={setTapis}
            kecil
            opsi={[
              { nilai: "semua", label: "Semua" },
              { nilai: "belum", label: "Belum absen", lencana: belum },
              { nilai: "telat", label: "Terlambat", lencana: telat },
            ]}
          />
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : daftar.length === 0 ? (
          <Kosong
            judul={tapis === "belum" ? "Semua sudah absen" : tapis === "telat" ? "Tidak ada yang terlambat" : "Belum ada peserta"}
            pesan={tapis === "semua" ? "Peserta magang aktif akan muncul di sini." : "Bagus — tidak ada yang perlu ditindaklanjuti."}
          />
        ) : (
          <ul className="divide-y divide-gray-100 -mx-1">
            {daftar.map((u, i) => {
              const a = petaHariIni.get(u.id);
              const g = a ? gaya(a.status) : null;
              return (
                <li key={u.id} className="anim-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                  <Link href={`/peserta/${u.id}`} className="flex items-center gap-3 py-2.5 px-1 rounded-xl press">
                    <Avatar name={u.name} foto={u.foto} size={38} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-900 truncate">{u.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {a?.jamMasuk ? `Masuk ${jam(a.jamMasuk)}` : u.jurusan || u.kampus || "—"}
                        {a?.jamPulang ? ` · Pulang ${jam(a.jamPulang)}` : ""}
                      </p>
                    </div>
                    {g ? (
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${g.lencana}`}>{g.pendek}</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0 bg-gray-100 text-gray-500">BELUM</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Tren + aktivitas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 card p-4 sm:p-6 anim-fade-up d-5">
          <div className="mb-5">
            <h2 className="font-semibold text-navy-900">Tren Kehadiran</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sepekan terakhir, seluruh peserta.</p>
          </div>
          {loading ? <Skeleton className="h-40 sm:h-44 w-full" /> : <Chart data={chart} mode="bar" />}
        </div>
        <div className="card p-4 sm:p-6 anim-fade-up d-6">
          <h2 className="font-semibold text-navy-900 mb-3">Aktivitas Terbaru</h2>
          {loading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            : <Activity items={aktivitas} />}
        </div>
      </div>

      <p className="text-center text-[10px] sm:text-xs text-gray-400 tracking-widest uppercase">InfraNexia Systems &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

/** Kartu ringkas berisi satu hal yang perlu ditindaklanjuti. */
function KartuTindakan({
  href, nada, angka, judul, pesan, icon, delay = "",
}: {
  href: string;
  nada: "amber" | "navy" | "netral";
  angka: number;
  judul: string;
  pesan: string;
  icon: React.ReactNode;
  delay?: string;
}) {
  const gayaKartu =
    nada === "amber" ? "bg-amber-50 border-amber-200"
      : nada === "navy" ? "bg-white border-gray-100"
      : "bg-white border-gray-100";
  const gayaIkon =
    nada === "amber" ? "bg-amber-500 text-white"
      : nada === "navy" ? "bg-navy-900 text-white"
      : "bg-emerald-50 text-emerald-600";

  return (
    <Link href={href}
      className={`group flex items-center gap-4 rounded-2xl border p-4 sm:p-5 press anim-fade-up ${delay} ${gayaKartu} transition-shadow md:hover:shadow-lift`}>
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${gayaIkon}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-navy-900 tabular-nums leading-none"><CountUp value={angka} /></span>
          <p className="text-sm font-semibold text-navy-900 truncate">{judul}</p>
        </div>
        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{pesan}</p>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        className="text-gray-300 shrink-0 transition-transform group-hover:translate-x-0.5"><path d="m9 18 6-6-6-6" /></svg>
    </Link>
  );
}

// ================= DASHBOARD MAGANG =================
function DashMagang({ nama, uid, punyaKartu }: { nama: string; uid: string; punyaKartu: boolean }) {
  const kini = new Date();
  const [absen, setAbsen] = useState<Absensi | null>(null);
  const [bulanan, setBulanan] = useState<Absensi[]>([]);
  const [aktivitas, setAktivitas] = useState<any[]>([]);
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [bulan, setBulan] = useState(kini.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState("");

  useEffect(() => {
    let batal = false;
    (async () => {
      setLoading(true);
      setGalat("");
      try {
        const { dari, sampai } = batasBulan(tahun, bulan);
        const [hariIni, sebulan] = await Promise.all([
          absensiHariIni(uid),
          riwayatRentang(uid, dari, sampai),
        ]);
        if (batal) return;
        setAbsen(hariIni);
        setBulanan(sebulan);

        const ev: any[] = [];
        sebulan.forEach((a) => {
          if (a.jamMasuk) ev.push({ nama, teks: a.status === "terlambat" ? "masuk (terlambat)" : "masuk", waktu: `${tglPendek(a.tanggal)} ${jam(a.jamMasuk)}`, sort: a.jamMasuk.toDate?.().getTime() || 0, warna: a.status === "terlambat" ? "text-amber-600" : "text-emerald-600" });
          if (a.jamPulang) ev.push({ nama, teks: "pulang", waktu: `${tglPendek(a.tanggal)} ${jam(a.jamPulang)}`, sort: a.jamPulang.toDate?.().getTime() || 0, warna: "text-navy-700" });
        });
        ev.sort((x, y) => y.sort - x.sort);
        setAktivitas(ev.slice(0, 6));
      } catch (e: any) {
        if (!batal) {
          setGalat(pesanMuat(e));
          setBulanan([]);
          setAktivitas([]);
        }
      } finally {
        if (!batal) setLoading(false);
      }
    })();
    return () => { batal = true; };
  }, [uid, nama, tahun, bulan]);

  const rekap = useMemo(() => hitungRekap(bulanan), [bulanan]);

  const hariKalender = useMemo(
    () => bulanan.map((a) => ({
      tanggal: a.tanggal,
      status: a.status,
      masuk: jam(a.jamMasuk),
      pulang: jam(a.jamPulang),
    })),
    [bulanan]
  );

  // Rentetan hadir: dihitung mundur dari catatan terakhir, berhenti begitu
  // ketemu hari yang tidak terhitung hadir.
  const rentetan = useMemo(() => {
    const urut = [...bulanan].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    let n = 0;
    for (const a of urut) {
      if (!terhitungHadir(a.status)) break;
      n++;
    }
    return n;
  }, [bulanan]);

  const sudahMasuk = !!absen?.jamMasuk;
  const sudahPulang = !!absen?.jamPulang;
  const bulanIni = tahun === kini.getFullYear() && bulan === kini.getMonth() + 1;

  const kabar = !punyaKartu
    ? { nada: "amber" as const, judul: "Kartu absen belum terbit", pesan: "Minta admin menerbitkan kartumu dulu — tanpa itu kamu belum bisa absen." }
    : !sudahMasuk
    ? { nada: "navy" as const, judul: "Belum absen masuk", pesan: "Pindai kartumu di mesin absen kantor saat tiba." }
    : !sudahPulang
    ? { nada: "navy" as const, judul: `Masuk pukul ${jam(absen?.jamMasuk)}`, pesan: "Jangan lupa pindai kartu lagi sebelum pulang." }
    : { nada: "emerald" as const, judul: "Absensi hari ini lengkap", pesan: `Masuk ${jam(absen?.jamMasuk)} · Pulang ${jam(absen?.jamPulang)}` };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="anim-fade-up">
        <Clock />
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">{salam()}, {nama.split(" ")[0]}</h1>
        <p className="text-sm text-gray-500">Semoga harimu produktif hari ini.</p>
      </div>

      {galat && <Pesan tipe="err">{galat}</Pesan>}

      {/* Status hari ini */}
      <div className={`relative overflow-hidden rounded-2xl p-5 flex items-center gap-4 anim-fade-up d-1 ${
        kabar.nada === "emerald" ? "bg-emerald-50 border border-emerald-200"
          : kabar.nada === "amber" ? "bg-amber-50 border border-amber-200"
          : "bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white shadow-lift"
      }`}>
        {kabar.nada === "navy" && <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/5 anim-float" />}
        <span className={`relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
          kabar.nada === "emerald" ? "bg-emerald-500 text-white"
            : kabar.nada === "amber" ? "bg-amber-500 text-white"
            : "bg-telkomRed text-white"
        }`}>
          {kabar.nada === "emerald" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 20h1" />
            </svg>
          )}
        </span>
        <div className="relative min-w-0">
          <p className={`font-semibold leading-tight ${kabar.nada === "emerald" ? "text-emerald-800" : kabar.nada === "amber" ? "text-amber-800" : ""}`}>
            {kabar.judul}
          </p>
          <p className={`text-xs mt-0.5 ${
            kabar.nada === "emerald" ? "text-emerald-700/80" : kabar.nada === "amber" ? "text-amber-700/80" : "text-slate-300"
          }`}>{kabar.pesan}</p>
        </div>
      </div>

      {/* Rekap bulan berjalan */}
      <div className="card p-5 sm:p-6 anim-fade-up d-2">
        <div className="flex items-center gap-5">
          <CincinProgres
            nilai={rekap.persenKehadiran}
            ukuran={104}
            warnaLatar="#eef2f7"
            warna={rekap.persenKehadiran >= 80 ? "#10b981" : rekap.persenKehadiran >= 60 ? "#fbbf24" : "#e32118"}
            anak={
              <>
                <span className="text-2xl font-bold text-navy-900 tabular-nums">{rekap.persenKehadiran}%</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">kehadiran</span>
              </>
            }
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-gray-400">{BULAN[bulan - 1]} {tahun}</p>
            <p className="text-2xl font-bold text-navy-900 mt-1 tabular-nums leading-none">
              {rekap.hadir + rekap.terlambat}
              <span className="text-base font-medium text-gray-400"> dari {rekap.hariKerja} hari</span>
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-amber-400" />Terlambat <b className="text-navy-900 tabular-nums">{rekap.terlambat}</b></span>
              <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-blue-500" />Izin & sakit <b className="text-navy-900 tabular-nums">{rekap.izin + rekap.sakit}</b></span>
              <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-telkomRed" />Alpa <b className="text-navy-900 tabular-nums">{rekap.alpha}</b></span>
            </div>
          </div>
        </div>

        {rentetan >= 3 && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2.5 text-sm">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1.5.5-2.5.5-2.5" /><path d="M12 22a6 6 0 0 0 6-6c0-2-1-3.5-2-4.5" /><path d="M12 22a6 6 0 0 1-6-6c0-1 .3-2 .8-2.8" /></svg>
            </span>
            <p className="text-navy-900">
              <b>{rentetan} hari</b> hadir berturut-turut. <span className="text-gray-500">Pertahankan.</span>
            </p>
          </div>
        )}
      </div>

      {/* Kalender kehadiran */}
      <div className="card p-4 sm:p-6 anim-fade-up d-3">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="font-semibold text-navy-900">Kalender Kehadiran</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sebulan penuh dalam satu layar.</p>
          </div>
          <NavigasiBulan tahun={tahun} bulan={bulan}
            ubah={(t, b) => { setTahun(t); setBulan(b); }}
            bisaMaju={!bulanIni} />
        </div>
        {loading
          ? <Skeleton className="h-56 w-full rounded-xl" />
          : <Kalender tahun={tahun} bulan={bulan} data={hariKalender} />}
      </div>

      {/* Jam hari ini + aktivitas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4 lg:col-span-1">
          <StatCard label="Masuk Hari Ini" value={jam(absen?.jamMasuk)} delay="d-4" iconBg="bg-emerald-50 text-emerald-600"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>} />
          <StatCard label="Pulang Hari Ini" value={jam(absen?.jamPulang)} delay="d-5" iconBg="bg-purple-50 text-purple-600"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>} />
        </div>
        <div className="lg:col-span-2 card p-4 sm:p-6 anim-fade-up d-6">
          <h2 className="font-semibold text-navy-900 mb-3">Aktivitas Terbaru</h2>
          {loading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
            : <Activity items={aktivitas} />}
        </div>
      </div>

      <p className="text-center text-[10px] sm:text-xs text-gray-400 tracking-widest uppercase">InfraNexia Systems &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

function DashInner() {
  const { profil } = useAuth();
  if (!profil) return null;
  if (profil.role === "magang")
    return <DashMagang nama={profil.name} uid={profil.uid} punyaKartu={!!(profil as any).kartuTerdaftar} />;
  if (profil.role === "pembimbing") return <DashPembina nama={profil.name} />;
  return <DashAdmin nama={profil.name} />;
}

export default function DashboardPage() {
  return <Protected><DashInner /></Protected>;
}
