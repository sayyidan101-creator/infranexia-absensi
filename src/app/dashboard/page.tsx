"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { CountUp, SkeletonKartu, Skeleton, Kosong } from "@/components/ui";
import {
  absensiHariIni, absensiSejak, sudahEnroll, riwayatAbsensi,
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
            {!u.wajahTerdaftar && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 shrink-0">
                belum daftar wajah
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

// ================= DASHBOARD MAGANG =================
function DashMagang({ nama, uid }: { nama: string; uid: string }) {
  const [absen, setAbsen] = useState<Absensi | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [chart, setChart] = useState<any[]>([]);
  const [aktivitas, setAktivitas] = useState<any[]>([]);
  const [mode, setMode] = useState<"bar" | "line">("bar");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setAbsen(await absensiHariIni(uid));
      setEnrolled(await sudahEnroll(uid));
      const riw = await riwayatAbsensi(uid);
      const hari = last7();
      setChart(hari.map((h) => {
        const rec = riw.filter((a) => a.tanggal === h.tgl);
        return { label: h.label, hadir: rec.filter((a) => a.status === "hadir").length, telat: rec.filter((a) => a.status === "terlambat").length };
      }));
      const ev: any[] = [];
      riw.forEach((a) => {
        if (a.jamMasuk) ev.push({ nama, teks: a.status === "terlambat" ? "masuk (terlambat)" : "masuk", waktu: `${a.tanggal} ${jam(a.jamMasuk)}`, sort: a.jamMasuk.toDate?.().getTime() || 0, warna: a.status === "terlambat" ? "text-amber-600" : "text-emerald-600" });
        if (a.jamPulang) ev.push({ nama, teks: "pulang", waktu: `${a.tanggal} ${jam(a.jamPulang)}`, sort: a.jamPulang.toDate?.().getTime() || 0, warna: "text-navy-700" });
      });
      ev.sort((x, y) => y.sort - x.sort);
      setAktivitas(ev.slice(0, 6));
      setLoading(false);
    })();
  }, [uid, nama]);

  const sudahMasuk = !!absen?.jamMasuk;
  const sudahPulang = !!absen?.jamPulang;
  const aksi = !enrolled ? { href: "/enroll", label: "Daftarkan Wajah Dulu", sub: "Wajib sebelum bisa absen" }
    : !sudahMasuk ? { href: "/absensi", label: "Absen Masuk Sekarang", sub: "Ketuk untuk buka kamera" }
    : !sudahPulang ? { href: "/absensi", label: "Absen Pulang", sub: "Jangan lupa absen sebelum pulang" }
    : null;

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="anim-fade-up">
        <Clock />
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">{salam()}, {nama.split(" ")[0]}</h1>
        <p className="text-sm text-gray-500">Semoga harimu produktif hari ini.</p>
      </div>

      {/* Kartu aksi utama */}
      {aksi ? (
        <Link href={aksi.href}
          className="block relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 text-white p-5 shadow-lift press anim-fade-up d-1">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/5 anim-float" />
          <div className="relative flex items-center gap-4">
            <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${enrolled ? "bg-telkomRed" : "bg-amber-500"} ${!sudahMasuk && enrolled ? "anim-ring" : ""}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                <circle cx="12" cy="11" r="2.5" /><path d="M8 17c.8-1.8 2.2-2.7 4-2.7s3.2.9 4 2.7" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold leading-tight">{aksi.label}</p>
              <p className="text-xs text-slate-300 mt-0.5">{aksi.sub}</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-70"><path d="m9 18 6-6-6-6" /></svg>
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 flex items-center gap-4 anim-fade-up d-1">
          <span className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
          </span>
          <div>
            <p className="font-semibold text-emerald-800">Absensi hari ini lengkap</p>
            <p className="text-xs text-emerald-700/80 mt-0.5">Masuk {jam(absen?.jamMasuk)} · Pulang {jam(absen?.jamPulang)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Status Wajah" value={enrolled ? "Terdaftar" : "Belum"} delay="d-2" iconBg={enrolled ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-telkomRed"}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>} />
        <StatCard label="Masuk Hari Ini" value={jam(absen?.jamMasuk)} delay="d-3" iconBg="bg-emerald-50 text-emerald-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>} />
        <StatCard label="Pulang Hari Ini" value={jam(absen?.jamPulang)} delay="d-4" iconBg="bg-purple-50 text-purple-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>} />
        <StatCard label="Status" value={absen?.status || "-"} delay="d-5" iconBg="bg-blue-50 text-blue-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 card p-4 sm:p-6 anim-fade-up d-6">
          <div className="flex items-start justify-between mb-5 gap-3">
            <div><h2 className="font-semibold text-navy-900">Kehadiranku</h2><p className="text-xs text-gray-500 mt-0.5">7 hari terakhir.</p></div>
            <div className="flex bg-gray-100 rounded-lg p-0.5 shrink-0">
              {(["bar", "line"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${mode === m ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"}`}>{m}</button>
              ))}
            </div>
          </div>
          {loading ? <Skeleton className="h-40 sm:h-44 w-full" /> : <Chart data={chart} mode={mode} />}
        </div>
        <div className="card p-4 sm:p-6 anim-fade-up d-7">
          <h2 className="font-semibold text-navy-900 mb-3">Aktivitas Terbaru</h2>
          <Activity items={aktivitas} />
        </div>
      </div>
      <p className="text-center text-[10px] sm:text-xs text-gray-400 tracking-widest uppercase">InfraNexia Systems &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

function DashInner() {
  const { profil } = useAuth();
  if (!profil) return null;
  return profil.role === "magang"
    ? <DashMagang nama={profil.name} uid={profil.uid} />
    : <DashAdmin nama={profil.name} />;
}

export default function DashboardPage() {
  return <Protected><DashInner /></Protected>;
}
