"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Protected from "@/components/Protected";
import { useAuth } from "@/context/AuthContext";
import {
  absensiHariIni, absensiSemuaHariIni, absensiSejak, sudahEnroll,
  riwayatAbsensi, petaNamaUser, jumlahMagang, Absensi,
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

// ---------- Jam live ----------
function Clock() {
  const [now, setNow] = useState("");
  useEffect(() => {
    const f = () => setNow(new Date().toLocaleTimeString("id-ID", { hour12: false }));
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
      {now}
    </span>
  );
}

// ---------- Kartu statistik ----------
function StatCard({ label, value, chip, chipColor, icon, iconBg }: any) {
  return (
    <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-5 overflow-hidden">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
        {chip && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${chipColor}`}>{chip}</span>}
      </div>
      <p className="text-3xl font-bold text-navy-900 mt-4 leading-none">{value}</p>
      <p className="text-xs text-gray-500 mt-1.5 uppercase tracking-wide">{label}</p>
      <div className="absolute -right-3 -bottom-3 opacity-[0.04] scale-[2.2]">{icon}</div>
    </div>
  );
}

// ---------- Grafik Bar/Line ----------
function Chart({ data, mode }: { data: { label: string; hadir: number; telat: number }[]; mode: "bar" | "line" }) {
  const max = Math.max(1, ...data.map((d) => d.hadir + d.telat));
  if (mode === "line") {
    const W = 560, H = 170, pad = 24;
    const step = (W - pad * 2) / (data.length - 1 || 1);
    const pts = data.map((d, i) => {
      const x = pad + i * step;
      const y = H - pad - ((d.hadir + d.telat) / max) * (H - pad * 2);
      return `${x},${y}`;
    });
    return (
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
          <polyline points={pts.join(" ")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => {
            const x = pad + i * step;
            const y = H - pad - ((d.hadir + d.telat) / max) * (H - pad * 2);
            return <circle key={i} cx={x} cy={y} r="3.5" fill="#10b981" />;
          })}
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
      <div className="flex items-end gap-3 h-44">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div className="relative w-full flex flex-col justify-end h-full rounded-t-lg overflow-hidden bg-gray-50">
              <div style={{ height: `${(d.telat / max) * 100}%` }} className="bg-amber-400 w-full" />
              <div style={{ height: `${(d.hadir / max) * 100}%` }} className="bg-emerald-500 w-full" />
              {d.hadir + d.telat > 0 && (
                <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-gray-600">{d.hadir + d.telat}</span>
              )}
            </div>
            <span className="text-xs text-gray-400">{d.label}</span>
          </div>
        ))}
      </div>
      <Legend />
    </div>
  );
}
function Legend() {
  return (
    <div className="flex items-center justify-between mt-4">
      <div className="flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Hadir</span>
        <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Terlambat</span>
      </div>
      <span className="text-[11px] text-gray-400">Diperbarui otomatis</span>
    </div>
  );
}

// ---------- Donut ----------
function Donut({ tepat, telat, belum }: { tepat: number; telat: number; belum: number }) {
  const total = Math.max(1, tepat + telat + belum);
  const p1 = (tepat / total) * 100;
  const p2 = p1 + (telat / total) * 100;
  const pct = Math.round((tepat / total) * 100);
  return (
    <div className="flex items-center gap-5">
      <div className="relative w-28 h-28 shrink-0">
        <div className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(#10b981 0% ${p1}%, #f59e0b ${p1}% ${p2}%, #e5e7eb ${p2}% 100%)` }} />
        <div className="absolute inset-[14px] bg-white rounded-full flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-navy-900">{pct}%</span>
          <span className="text-[10px] text-gray-400">Tepat Waktu</span>
        </div>
      </div>
      <div className="space-y-2.5 text-sm">
        <Row warna="bg-emerald-500" label="Tepat Waktu" val={tepat} />
        <Row warna="bg-amber-400" label="Terlambat" val={telat} />
        <Row warna="bg-gray-300" label="Belum Absen" val={belum} />
      </div>
    </div>
  );
}
function Row({ warna, label, val }: any) {
  return (
    <div className="flex items-center gap-2">
      <i className={`w-2.5 h-2.5 rounded-full ${warna} inline-block`} />
      <span className="text-gray-500 flex-1">{label}</span>
      <span className="font-semibold text-navy-900">{val}</span>
    </div>
  );
}

// ---------- Aktivitas ----------
function Activity({ items }: { items: any[] }) {
  if (items.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        </div>
        <p className="text-sm font-medium text-navy-900">Menunggu aktivitas masuk</p>
        <p className="text-xs text-gray-400 mt-1">Belum ada riwayat kehadiran baru<br />untuk ditampilkan.</p>
      </div>
    );
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          <div className="w-9 h-9 rounded-full bg-navy-800 text-white flex items-center justify-center text-sm font-semibold shrink-0">{it.nama.charAt(0).toUpperCase()}</div>
          <div className="flex-1 min-w-0"><p className="text-sm text-navy-900 truncate"><b>{it.nama}</b> {it.teks}</p></div>
          <span className={`text-xs font-medium ${it.warna}`}>{it.waktu}</span>
        </li>
      ))}
    </ul>
  );
}

// ================= DASHBOARD ADMIN =================
function DashAdmin({ nama, role }: { nama: string; role: string }) {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [today, setToday] = useState<Absensi[]>([]);
  const [chart, setChart] = useState<any[]>([]);
  const [aktivitas, setAktivitas] = useState<any[]>([]);
  const [mode, setMode] = useState<"bar" | "line">("bar");
  const [loading, setLoading] = useState(true);
  const [rekap, setRekap] = useState<any[]>([]);

  const muat = async () => {
    setLoading(true);
    const t = await jumlahMagang();
    const hariIni = await absensiSemuaHariIni();
    const hari = last7();
    const sejak = await absensiSejak(hari[0].tgl);
    const namaMap = await petaNamaUser();
    setTotal(t); setToday(hariIni);

    setChart(hari.map((h) => {
      const rec = sejak.filter((a) => a.tanggal === h.tgl);
      return { label: h.label, hadir: rec.filter((a) => a.status === "hadir").length, telat: rec.filter((a) => a.status === "terlambat").length };
    }));

    const ev: any[] = [];
    const rk: any[] = [];
    sejak.forEach((a) => {
      const nm = namaMap[a.userId] || "Pengguna";
      rk.push({ tanggal: a.tanggal, nama: nm, masuk: jam(a.jamMasuk), pulang: jam(a.jamPulang), status: a.status });
      if (a.jamMasuk) ev.push({ nama: nm, teks: a.status === "terlambat" ? "absen masuk (terlambat)" : "absen masuk", waktu: jam(a.jamMasuk), sort: a.jamMasuk.toDate?.().getTime() || 0, warna: a.status === "terlambat" ? "text-amber-600" : "text-emerald-600" });
      if (a.jamPulang) ev.push({ nama: nm, teks: "absen pulang", waktu: jam(a.jamPulang), sort: a.jamPulang.toDate?.().getTime() || 0, warna: "text-navy-700" });
    });
    ev.sort((x, y) => y.sort - x.sort);
    setAktivitas(ev.slice(0, 6));
    setRekap(rk);
    setLoading(false);
  };
  useEffect(() => { muat(); }, []);

  const hadir = today.filter((a) => a.status === "hadir").length;
  const telat = today.filter((a) => a.status === "terlambat").length;
  const pulang = today.filter((a) => a.jamPulang).length;
  const belum = Math.max(0, total - hadir - telat);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

  const ekspor = () => {
    const head = "Tanggal,Nama,Masuk,Pulang,Status\n";
    const body = rekap.map((r) => `${r.tanggal},"${r.nama}",${r.masuk},${r.pulang},${r.status}`).join("\n");
    const blob = new Blob([head + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `laporan-absensi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <Clock />
          <h1 className="text-2xl font-bold text-navy-900 mt-1">Selamat datang, {nama}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kelola data magang dan pantau kehadiran real-time hari ini.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={ekspor} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-navy-900 hover:bg-gray-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
            Ekspor Laporan
          </button>
          {role === "admin" && (
            <button onClick={() => router.push("/admin")} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 text-white text-sm font-medium hover:bg-navy-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              Tambah Magang
            </button>
          )}
        </div>
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Magang" value={total} chip="aktif" chipColor="bg-blue-50 text-blue-600" iconBg="bg-blue-50 text-blue-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>} />
        <StatCard label="Hadir Hari Ini" value={hadir} chip={`${pct(hadir, total)}%`} chipColor="bg-emerald-50 text-emerald-600" iconBg="bg-emerald-50 text-emerald-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>} />
        <StatCard label="Terlambat" value={telat} chip={`${pct(telat, hadir + telat)}%`} chipColor="bg-amber-50 text-amber-600" iconBg="bg-amber-50 text-amber-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>} />
        <StatCard label="Sudah Pulang" value={pulang} chip={`${pct(pulang, hadir + telat)}%`} chipColor="bg-purple-50 text-purple-600" iconBg="bg-purple-50 text-purple-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>} />
      </div>

      {/* Grafik + panel kanan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-semibold text-navy-900">Tren Kehadiran</h2>
              <p className="text-xs text-gray-500 mt-0.5">Visualisasi performa absensi mingguan.</p>
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(["bar", "line"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition ${mode === m ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"}`}>{m}</button>
              ))}
            </div>
          </div>
          {loading ? <div className="h-44 flex items-center justify-center text-sm text-gray-400">Memuat...</div> : <Chart data={chart} mode={mode} />}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Proporsi Harian</h2>
            <Donut tepat={hadir} telat={telat} belum={belum} />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-navy-900">Aktivitas Terbaru</h2>
              <button onClick={muat} className="text-xs text-navy-700 hover:underline">Perbarui</button>
            </div>
            <Activity items={aktivitas} />
          </div>
        </div>
      </div>

      {/* Info sistem + footer */}
      <div className="bg-gradient-to-r from-navy-900 to-navy-700 rounded-2xl p-5 flex items-center gap-3 text-white">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        <div>
          <p className="text-sm font-medium">Sistem berjalan normal</p>
          <p className="text-xs text-slate-300">Data absensi tersimpan di Firebase secara real-time.</p>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 tracking-widest uppercase">InfraNexia Systems &copy; {new Date().getFullYear()}</p>
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
    })();
  }, [uid, nama]);

  return (
    <div className="space-y-6">
      <div><Clock /><h1 className="text-2xl font-bold text-navy-900 mt-1">Halo, {nama}</h1><p className="text-sm text-gray-500">Anak Magang</p></div>

      {!enrolled && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded-xl">
          Kamu belum mendaftarkan wajah. Buka menu <b>Daftar Wajah</b> agar bisa absen.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Status Wajah" value={enrolled ? "Terdaftar" : "Belum"} iconBg={enrolled ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-telkomRed"}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></svg>} />
        <StatCard label="Masuk Hari Ini" value={jam(absen?.jamMasuk)} iconBg="bg-emerald-50 text-emerald-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>} />
        <StatCard label="Pulang Hari Ini" value={jam(absen?.jamPulang)} iconBg="bg-purple-50 text-purple-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>} />
        <StatCard label="Status" value={absen?.status || "-"} iconBg="bg-blue-50 text-blue-600"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-5">
            <div><h2 className="font-semibold text-navy-900">Kehadiranku</h2><p className="text-xs text-gray-500 mt-0.5">7 hari terakhir.</p></div>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(["bar", "line"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 text-xs font-medium rounded-md capitalize ${mode === m ? "bg-white text-navy-900 shadow-sm" : "text-gray-500"}`}>{m}</button>
              ))}
            </div>
          </div>
          <Chart data={chart} mode={mode} />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-navy-900 mb-3">Aktivitas Terbaru</h2>
          <Activity items={aktivitas} />
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 tracking-widest uppercase">InfraNexia Systems &copy; {new Date().getFullYear()}</p>
    </div>
  );
}

function DashInner() {
  const { profil } = useAuth();
  if (!profil) return null;
  return profil.role === "magang"
    ? <DashMagang nama={profil.name} uid={profil.uid} />
    : <DashAdmin nama={profil.name} role={profil.role} />;
}

export default function DashboardPage() {
  return <Protected><DashInner /></Protected>;
}