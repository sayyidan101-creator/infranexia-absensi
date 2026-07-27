"use client";
import { useState, useEffect, useMemo } from "react";
import Protected from "@/components/Protected";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";
import { CountUp, Skeleton, Kosong } from "@/components/ui";
import {
  semuaAbsensi, riwayatAbsensi, petaUserDetail, jumlahMagang,
  tanggalHariIni, Absensi,
} from "@/lib/absensi";

interface Baris {
  id: string; userId: string; nama: string; divisi: string; kode: string;
  tanggal: string; masuk: string; pulang: string; status: string; foto?: string;
}

const jam = (t?: any) => (t?.toDate ? t.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--");

function badge(status: string) {
  const map: Record<string, { t: string; c: string }> = {
    hadir: { t: "TEPAT WAKTU", c: "bg-emerald-100 text-emerald-700" },
    terlambat: { t: "TERLAMBAT", c: "bg-amber-100 text-amber-700" },
    izin: { t: "IZIN", c: "bg-blue-100 text-blue-700" },
    sakit: { t: "SAKIT", c: "bg-purple-100 text-purple-700" },
    alpha: { t: "ALPA", c: "bg-red-100 text-red-700" },
  };
  return map[status] || { t: (status || "-").toUpperCase(), c: "bg-gray-100 text-gray-600" };
}

const tglPendek = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
};

function RiwayatInner() {
  const { profil } = useAuth();
  const [rows, setRows] = useState<Baris[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMagang, setTotalMagang] = useState(0);

  // filter
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState("semua");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [page, setPage] = useState(1);
  const [filterBuka, setFilterBuka] = useState(false);
  const PER = 10;

  useEffect(() => {
    if (!profil) return;
    (async () => {
      setLoading(true);
      let data: Absensi[];
      let detail: Record<string, any> = {};
      if (profil.role === "magang") {
        data = await riwayatAbsensi(profil.uid);
        detail[profil.uid] = { name: profil.name, jurusan: profil.jurusan, nim: profil.nim, foto: profil.foto };
      } else {
        data = await semuaAbsensi();
        detail = await petaUserDetail();
        setTotalMagang(await jumlahMagang());
      }
      setRows(data.map((a) => {
        const u = detail[a.userId] || {};
        return {
          id: a.id, userId: a.userId, nama: u.name || "Pengguna",
          divisi: u.jurusan || u.kampus || "-", kode: u.nim || a.userId.slice(0, 8),
          tanggal: a.tanggal, masuk: jam(a.jamMasuk), pulang: jam(a.jamPulang), status: a.status, foto: u.foto,
        };
      }));
      setLoading(false);
    })();
  }, [profil]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (cari && !(`${r.nama} ${r.divisi}`.toLowerCase().includes(cari.toLowerCase()))) return false;
    if (status !== "semua" && r.status !== status) return false;
    if (dari && r.tanggal < dari) return false;
    if (sampai && r.tanggal > sampai) return false;
    return true;
  }), [rows, cari, status, dari, sampai]);

  const totalHal = Math.max(1, Math.ceil(filtered.length / PER));
  const hal = Math.min(page, totalHal);
  const view = filtered.slice((hal - 1) * PER, hal * PER);
  const filterAktif = (status !== "semua" ? 1 : 0) + (dari ? 1 : 0) + (sampai ? 1 : 0);

  // statistik bawah
  const today = tanggalHariIni();
  const hadirIni = rows.filter((r) => r.tanggal === today && (r.status === "hadir" || r.status === "terlambat")).length;
  const telatIni = rows.filter((r) => r.tanggal === today && r.status === "terlambat").length;
  const isAdmin = profil?.role !== "magang";
  const alpaIni = isAdmin ? Math.max(0, totalMagang - hadirIni) : 0;
  const attendance = isAdmin ? (totalMagang ? Math.round((hadirIni / totalMagang) * 100) : 0)
    : (rows.length ? Math.round((rows.filter((r) => r.status === "hadir").length / rows.length) * 100) : 0);

  const reset = () => { setCari(""); setStatus("semua"); setDari(""); setSampai(""); setPage(1); };

  const eksporExcel = () => {
    const head = "Tanggal,Nama,Divisi,ID,Masuk,Pulang,Status\n";
    const body = filtered.map((r) => `${r.tanggal},"${r.nama}","${r.divisi}",${r.kode},${r.masuk},${r.pulang},${r.status}`).join("\n");
    const blob = new Blob([head + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `riwayat-kehadiran-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const eksporPDF = () => {
    const baris = filtered.map((r) => `<tr><td>${r.tanggal}</td><td>${r.nama}</td><td>${r.divisi}</td><td>${r.masuk}</td><td>${r.pulang}</td><td>${badge(r.status).t}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Riwayat Kehadiran</title>
      <style>body{font-family:sans-serif;padding:24px}h1{color:#0a1f44}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}th{background:#0a1f44;color:#fff}</style>
      </head><body><h1>Riwayat Kehadiran — InfraNexia</h1><p>Dicetak: ${new Date().toLocaleString("id-ID")}</p>
      <table><thead><tr><th>Tanggal</th><th>Nama</th><th>Divisi</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead><tbody>${baris}</tbody></table>
      </body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header gelap */}
      <div className="bg-gradient-to-r from-navy-900 to-navy-700 rounded-2xl p-5 sm:p-6 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-4 anim-fade-up">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold">Riwayat Kehadiran</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5 max-w-lg">Pantau dan audit data presensi secara real-time.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:flex gap-2">
          <button onClick={eksporPDF} className="inline-flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium press">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            PDF
          </button>
          <button onClick={eksporExcel} className="inline-flex items-center justify-center gap-2 px-4 py-3 md:py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-medium press">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 3 3 3-3" /></svg>
            Excel
          </button>
        </div>
      </div>

      {/* Pencarian + filter */}
      <div className="card p-3 sm:p-4 anim-fade-up d-1">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </span>
            <input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} placeholder="Cari nama atau divisi..."
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition" />
          </div>
          <button onClick={() => setFilterBuka((v) => !v)}
            className={`relative inline-flex items-center gap-2 px-4 rounded-xl border text-sm font-medium press transition ${
              filterBuka || filterAktif ? "bg-navy-900 text-white border-navy-900" : "bg-white text-navy-900 border-gray-200"
            }`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18M7 12h10M11 19h2" /></svg>
            <span className="hidden xs:inline">Filter</span>
            {filterAktif > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-telkomRed text-white text-[10px] font-bold flex items-center justify-center">{filterAktif}</span>}
          </button>
        </div>

        {filterBuka && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 anim-fade-up">
            <label className="col-span-1">
              <span className="block text-[11px] text-gray-500 mb-1">Dari</span>
              <input type="date" value={dari} onChange={(e) => { setDari(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700" />
            </label>
            <label className="col-span-1">
              <span className="block text-[11px] text-gray-500 mb-1">Sampai</span>
              <input type="date" value={sampai} onChange={(e) => { setSampai(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700" />
            </label>
            <label className="col-span-1">
              <span className="block text-[11px] text-gray-500 mb-1">Status</span>
              <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700">
                <option value="semua">Semua</option>
                <option value="hadir">Tepat Waktu</option>
                <option value="terlambat">Terlambat</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </select>
            </label>
            <button onClick={reset} className="self-end px-4 py-2.5 rounded-xl bg-gray-100 text-navy-900 text-sm font-medium press">Reset</button>
          </div>
        )}
      </div>

      {/* ---------- KARTU (MOBILE) ---------- */}
      <div className="md:hidden space-y-2.5">
        {loading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px] w-full rounded-2xl" />)}
        {!loading && view.length === 0 && (
          <div className="card"><Kosong judul="Tidak ada data" pesan="Coba ubah kata kunci atau filter tanggal." /></div>
        )}
        {!loading && view.map((r, i) => {
          const b = badge(r.status);
          return (
            <div key={r.id} className="card p-3.5 flex items-center gap-3 anim-fade-up press" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <Avatar name={r.nama} foto={r.foto} size={40} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-navy-900 truncate">{r.nama}</p>
                  <span className="text-[10px] text-gray-400 shrink-0">{tglPendek(r.tanggal)}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
                    <span className={`font-mono ${r.status === "terlambat" ? "text-telkomRed font-semibold" : ""}`}>{r.masuk}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500"><path d="M12 19V5M5 12l7 7 7-7" /></svg>
                    <span className="font-mono">{r.pulang}</span>
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${b.c}`}>{b.t}</span>
            </div>
          );
        })}
      </div>

      {/* ---------- TABEL (DESKTOP) ---------- */}
      <div className="hidden md:block card overflow-hidden anim-fade-up d-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Nama Magang</th>
                <th className="px-5 py-3 font-medium">Divisi</th>
                <th className="px-5 py-3 font-medium">Tanggal</th>
                <th className="px-5 py-3 font-medium">Masuk</th>
                <th className="px-5 py-3 font-medium">Pulang</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-gray-50"><td colSpan={6} className="px-5 py-3"><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!loading && view.length === 0 && <tr><td colSpan={6}><Kosong judul="Tidak ada data" pesan="Coba ubah kata kunci atau filter tanggal." /></td></tr>}
              {!loading && view.map((r, i) => {
                const b = badge(r.status);
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.nama} foto={r.foto} size={36} />
                        <div>
                          <p className="font-medium text-navy-900">{r.nama}</p>
                          <p className="text-xs text-gray-400">ID: {r.kode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{r.divisi}</td>
                    <td className="px-5 py-3 text-gray-600">{r.tanggal}</td>
                    <td className={`px-5 py-3 font-mono ${r.status === "terlambat" ? "text-telkomRed" : "text-gray-700"}`}>{r.masuk}</td>
                    <td className="px-5 py-3 font-mono text-gray-700">{r.pulang}</td>
                    <td className="px-5 py-3"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${b.c}`}>{b.t}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="card flex flex-col xs:flex-row items-center justify-between gap-3 px-4 py-3.5 anim-fade-up d-3">
        <p className="text-xs text-gray-500">
          {filtered.length === 0 ? 0 : (hal - 1) * PER + 1}–{Math.min(hal * PER, filtered.length)} dari {filtered.length} entri
        </p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={hal === 1}
            className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center disabled:opacity-40 press hover:bg-gray-50">‹</button>
          {Array.from({ length: totalHal }).slice(0, 5).map((_, i) => {
            const n = i + 1;
            return (
              <button key={n} onClick={() => setPage(n)}
                className={`w-9 h-9 rounded-xl text-sm press transition ${n === hal ? "bg-navy-900 text-white" : "border border-gray-200 hover:bg-gray-50"}`}>{n}</button>
            );
          })}
          {totalHal > 5 && <span className="px-1 text-gray-400">… {totalHal}</span>}
          <button onClick={() => setPage((p) => Math.min(totalHal, p + 1))} disabled={hal === totalHal}
            className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center disabled:opacity-40 press hover:bg-gray-50">›</button>
        </div>
      </div>

      {/* Statistik bawah */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MiniStat warna="bg-emerald-50 text-emerald-600" angka={attendance} suffix="%" delay="d-1"
          label={isAdmin ? "Kehadiran Hari Ini" : "Rata-rata Tepat Waktu"}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>} />
        <MiniStat warna="bg-amber-50 text-amber-600" angka={telatIni} delay="d-2"
          label="Terlambat Hari Ini"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>} />
        <MiniStat warna="bg-red-50 text-telkomRed" delay="d-3"
          angka={isAdmin ? alpaIni : rows.filter((r) => r.status === "terlambat").length}
          label={isAdmin ? "Alpa Hari Ini" : "Total Terlambat"}
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>} />
        <div className="bg-navy-900 rounded-2xl p-4 sm:p-5 flex items-center gap-3 text-white anim-fade-up d-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" /></svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] text-slate-300 uppercase tracking-wide">Sync Terakhir</p>
            <p className="text-sm font-semibold">Baru saja</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ warna, angka, suffix = "", label, icon, delay = "" }: any) {
  return (
    <div className={`card p-4 sm:p-5 flex items-center gap-3 sm:gap-4 anim-fade-up ${delay} transition-transform md:hover:-translate-y-0.5`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${warna}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold text-navy-900 leading-none tabular-nums"><CountUp value={angka} suffix={suffix} /></p>
        <p className="text-[10px] sm:text-xs text-gray-500 mt-1 uppercase tracking-wide leading-tight">{label}</p>
      </div>
    </div>
  );
}

export default function RiwayatPage() {
  return <Protected><RiwayatInner /></Protected>;
}
