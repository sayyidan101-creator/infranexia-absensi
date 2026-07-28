"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";
import Kalender, { NavigasiBulan, BULAN, HariKalender } from "@/components/Kalender";
import CincinProgres from "@/components/CincinProgres";
import { CountUp, Skeleton, Kosong, Pesan, Segmen, KepalaHalaman } from "@/components/ui";
import { gaya, URUTAN } from "@/lib/status";
import { unduhXlsx, cetakHtml } from "@/lib/ekspor";
import {
  absensiRentang, riwayatRentang, petaUserDetail, hitungRekap,
  tanggalHariIni, geserHari, batasBulan, Absensi,
} from "@/lib/absensi";

interface Baris {
  id: string; userId: string; nama: string; divisi: string; kode: string;
  tanggal: string; masuk: string; pulang: string; status: string; foto?: string;
}

const jam = (t?: any) => (t?.toDate ? t.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "--:--");

const tglPendek = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
};

const tglPanjang = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const HARI_AWAL = 30;
type Mode = "kalender" | "daftar";

function RiwayatInner() {
  const { profil } = useAuth();
  const isPembina = profil?.role !== "magang";
  const kini = new Date();

  const [rows, setRows] = useState<Baris[]>([]);
  const [loading, setLoading] = useState(true);
  const [memuatLagi, setMemuatLagi] = useState(false);
  const [galat, setGalat] = useState("");

  // Peserta dibuka pada kalender: sebulan sekaligus lebih berguna baginya
  // daripada daftar. Pembimbing sebaliknya — perlu mencari dan menyaring.
  const [mode, setMode] = useState<Mode>("kalender");
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [bulan, setBulan] = useState(kini.getMonth() + 1);
  const [pilihTanggal, setPilihTanggal] = useState("");

  // Rentang yang benar-benar ditanyakan ke Firestore
  const [dari, setDari] = useState(() => geserHari(tanggalHariIni(), -HARI_AWAL));
  const [sampai, setSampai] = useState(() => tanggalHariIni());

  // Penyaring sisi tampilan
  const [cari, setCari] = useState("");
  const [status, setStatus] = useState("semua");
  const [page, setPage] = useState(1);
  const [filterBuka, setFilterBuka] = useState(false);
  const PER = 10;

  const ambil = async (d: string, s: string) => {
    if (!profil) return;
    setGalat("");
    try {
      let data: Absensi[];
      let detail: Record<string, any> = {};
      if (profil.role === "magang") {
        data = await riwayatRentang(profil.uid, d, s);
        detail[profil.uid] = { name: profil.name, jurusan: profil.jurusan, nim: profil.nim, foto: profil.foto };
      } else {
        [data, detail] = await Promise.all([absensiRentang(d, s), petaUserDetail()]);
      }
      setRows(data.map((a) => {
        const u = detail[a.userId] || {};
        return {
          id: a.id, userId: a.userId, nama: u.name || "Pengguna",
          divisi: u.jurusan || u.kampus || "-", kode: u.nim || a.userId.slice(0, 8),
          tanggal: a.tanggal, masuk: jam(a.jamMasuk), pulang: jam(a.jamPulang), status: a.status, foto: u.foto,
        };
      }));
    } catch (e: any) {
      // Query rentang memerlukan indeks; kalau belum dibuat Firestore memberi tahu lewat pesan ini
      setGalat(
        /index/i.test(String(e?.message))
          ? "Firestore memerlukan indeks untuk penyaringan tanggal. Jalankan: firebase deploy --only firestore:indexes"
          : e?.message || "Gagal memuat riwayat."
      );
    }
  };

  // Muat pertama. Peserta langsung diberi bulan berjalan supaya kalendernya terisi.
  useEffect(() => {
    if (!profil) return;
    const awal = profil.role === "magang"
      ? batasBulan(kini.getFullYear(), kini.getMonth() + 1)
      : { dari: geserHari(tanggalHariIni(), -HARI_AWAL), sampai: tanggalHariIni() };
    setDari(awal.dari);
    setSampai(awal.sampai);
    if (profil.role !== "magang") setMode("daftar");
    setLoading(true);
    ambil(awal.dari, awal.sampai).finally(() => setLoading(false));
  }, [profil?.uid]);

  const terapkanRentang = async (d: string, s: string) => {
    setDari(d); setSampai(s); setPage(1);
    setLoading(true);
    await ambil(d, s);
    setLoading(false);
  };

  const gantiBulan = async (t: number, b: number) => {
    setTahun(t); setBulan(b); setPilihTanggal("");
    const { dari: d, sampai: s } = batasBulan(t, b);
    await terapkanRentang(d, s);
  };

  const muatLebihLama = async () => {
    const baru = geserHari(dari, -HARI_AWAL);
    setMemuatLagi(true);
    setDari(baru);
    await ambil(baru, sampai);
    setMemuatLagi(false);
  };

  const filtered = useMemo(() => rows.filter((r) => {
    if (cari && !(`${r.nama} ${r.divisi}`.toLowerCase().includes(cari.toLowerCase()))) return false;
    if (status !== "semua" && r.status !== status) return false;
    return true;
  }), [rows, cari, status]);

  const totalHal = Math.max(1, Math.ceil(filtered.length / PER));
  const hal = Math.min(page, totalHal);
  const view = filtered.slice((hal - 1) * PER, hal * PER);
  const filterAktif = status !== "semua" ? 1 : 0;

  const today = tanggalHariIni();
  const rekap = useMemo(
    () => hitungRekap(filtered.map((r) => ({ status: r.status } as any))),
    [filtered]
  );
  const jumlahStatus: Record<string, number> = {
    hadir: rekap.hadir, terlambat: rekap.terlambat, izin: rekap.izin, sakit: rekap.sakit, alpha: rekap.alpha,
  };
  const telatIni = rows.filter((r) => r.tanggal === today && r.status === "terlambat").length;
  const alpaIni = rows.filter((r) => r.tanggal === today && r.status === "alpha").length;

  const hariKalender: HariKalender[] = useMemo(
    () => rows.map((r) => ({ tanggal: r.tanggal, status: r.status, masuk: r.masuk, pulang: r.pulang })),
    [rows]
  );
  const detailHari = useMemo(
    () => rows.find((r) => r.tanggal === pilihTanggal) || null,
    [rows, pilihTanggal]
  );
  const bulanIni = tahun === kini.getFullYear() && bulan === kini.getMonth() + 1;
  const tampilDaftar = isPembina || mode === "daftar";

  const reset = () => { setCari(""); setStatus("semua"); setPage(1); };

  const eksporExcel = async () => {
    await unduhXlsx(
      `riwayat-kehadiran-${dari}_sd_${sampai}`,
      "Kehadiran",
      [
        { kunci: "tanggal", judul: "Tanggal", lebar: 12 },
        { kunci: "nama", judul: "Nama", lebar: 24 },
        { kunci: "divisi", judul: "Divisi", lebar: 20 },
        { kunci: "kode", judul: "NIM / ID", lebar: 16 },
        { kunci: "masuk", judul: "Masuk", lebar: 10 },
        { kunci: "pulang", judul: "Pulang", lebar: 10 },
        { kunci: "label", judul: "Status", lebar: 14 },
      ],
      filtered.map((r) => ({ ...r, label: gaya(r.status).pendek }))
    );
  };

  const eksporPDF = () => {
    const baris = filtered.map((r) => `<tr><td>${r.tanggal}</td><td>${r.nama}</td><td>${r.divisi}</td><td>${r.masuk}</td><td>${r.pulang}</td><td>${gaya(r.status).pendek}</td></tr>`).join("");
    cetakHtml("Riwayat Kehadiran", `<html><head><meta charset="utf-8"><title>Riwayat Kehadiran</title>
      <style>body{font-family:sans-serif;padding:24px;color:#0f172a}h1{color:#0a1f44;margin:0 0 4px}
      p.sub{color:#64748b;font-size:13px;margin:0 0 18px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #e2e8f0;padding:6px 10px;text-align:left}
      th{background:#0a1f44;color:#fff}
      tr:nth-child(even) td{background:#f8fafc}</style>
      </head><body><h1>Riwayat Kehadiran — InfraNexia</h1>
      <p class="sub">Periode ${dari} s.d. ${sampai} · ${filtered.length} entri · dicetak ${new Date().toLocaleString("id-ID")}</p>
      <table><thead><tr><th>Tanggal</th><th>Nama</th><th>Divisi</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead>
      <tbody>${baris}</tbody></table></body></html>`);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <KepalaHalaman
        atas="Kehadiran"
        judul="Riwayat Kehadiran"
        keterangan={isPembina
          ? `Seluruh peserta, periode ${tglPendek(dari)} – ${tglPendek(sampai)}.`
          : "Catatan kehadiranmu, lengkap dengan jam masuk dan pulangnya."}
        aksi={
          <div className="flex gap-2">
            <button onClick={eksporPDF}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-navy-900 press hover:bg-gray-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              Cetak
            </button>
            <button onClick={eksporExcel}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 text-white text-sm font-medium press hover:bg-navy-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 3 3 3-3" /></svg>
              Excel
            </button>
          </div>
        }
      />

      {galat && <Pesan tipe="err">{galat}</Pesan>}

      {/* ---------- RINGKASAN PESERTA ---------- */}
      {!isPembina && (
        <div className="card p-5 sm:p-6 anim-fade-up d-1">
          <div className="flex items-center gap-5">
            <CincinProgres
              nilai={rekap.persenKehadiran}
              ukuran={100}
              warnaLatar="#eef2f7"
              warna={rekap.persenKehadiran >= 80 ? "#10b981" : rekap.persenKehadiran >= 60 ? "#fbbf24" : "#e32118"}
              anak={
                <>
                  <span className="text-2xl font-bold text-navy-900 tabular-nums">{rekap.persenKehadiran}%</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-400 mt-1">hadir</span>
                </>
              }
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-widest text-gray-400">
                {mode === "kalender" ? `${BULAN[bulan - 1]} ${tahun}` : "Periode terpilih"}
              </p>
              <p className="text-2xl font-bold text-navy-900 mt-1 tabular-nums leading-none">
                {rekap.hadir + rekap.terlambat}
                <span className="text-base font-medium text-gray-400"> dari {rekap.hariKerja} hari</span>
              </p>
              {/* Dibiarkan mengalir, bukan dua kolom: label seperti "Hadir tapi
                  terlambat" terpotong kalau dipaksa masuk setengah lebar layar. */}
              <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-3 text-xs text-gray-500">
                {URUTAN.filter((s) => jumlahStatus[s] > 0).map((s) => {
                  const g = gaya(s);
                  return (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <i className={`w-2 h-2 rounded-full shrink-0 ${g.titik}`} />
                      {g.panjang}
                      <b className="text-navy-900 tabular-nums">{jumlahStatus[s]}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- PEMILIH TAMPILAN ---------- */}
      {!isPembina && (
        <div className="flex items-center justify-between gap-3 flex-wrap anim-fade-up d-2">
          <Segmen<Mode>
            nilai={mode}
            ubah={setMode}
            opsi={[{ nilai: "kalender", label: "Kalender" }, { nilai: "daftar", label: "Daftar" }]}
          />
          {mode === "kalender" && (
            <NavigasiBulan tahun={tahun} bulan={bulan} ubah={gantiBulan} bisaMaju={!bulanIni} />
          )}
        </div>
      )}

      {/* ---------- KALENDER ---------- */}
      {!isPembina && mode === "kalender" && (
        <div className="card p-4 sm:p-6 anim-fade-up d-3">
          {loading ? <Skeleton className="h-64 w-full rounded-xl" /> : (
            <Kalender
              tahun={tahun} bulan={bulan} data={hariKalender}
              legenda={false}
              terpilih={pilihTanggal}
              onPilih={(_, tanggal) => setPilihTanggal((lama) => (lama === tanggal ? "" : tanggal))}
            />
          )}

          {pilihTanggal && (
            <div className="mt-5 pt-5 border-t border-gray-100 anim-fade-up">
              <p className="text-xs uppercase tracking-widest text-gray-400">{tglPanjang(pilihTanggal)}</p>
              {detailHari ? (
                <div className="flex items-center gap-4 mt-2.5 flex-wrap">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${gaya(detailHari.status).lencana}`}>
                    {gaya(detailHari.status).pendek}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
                    Masuk <b className="font-mono text-navy-900">{detailHari.masuk}</b>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500"><path d="M12 19V5M5 12l7 7 7-7" /></svg>
                    Pulang <b className="font-mono text-navy-900">{detailHari.pulang}</b>
                  </span>
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-2">Tidak ada catatan kehadiran pada tanggal ini.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------- PENCARIAN + FILTER ---------- */}
      {tampilDaftar && (
        <div className="card p-3 sm:p-4 anim-fade-up d-1">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              </span>
              <input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }}
                placeholder={isPembina ? "Cari nama atau divisi..." : "Cari di riwayatmu..."}
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
              <label>
                <span className="block text-[11px] text-gray-500 mb-1">Dari</span>
                <input type="date" value={dari} max={sampai}
                  onChange={(e) => terapkanRentang(e.target.value, sampai)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700" />
              </label>
              <label>
                <span className="block text-[11px] text-gray-500 mb-1">Sampai</span>
                <input type="date" value={sampai} min={dari}
                  onChange={(e) => terapkanRentang(dari, e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700" />
              </label>
              <label>
                <span className="block text-[11px] text-gray-500 mb-1">Status</span>
                <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700">
                  <option value="semua">Semua</option>
                  {URUTAN.map((s) => <option key={s} value={s}>{gaya(s).panjang}</option>)}
                </select>
              </label>
              <button onClick={reset} className="self-end px-4 py-2.5 rounded-xl bg-gray-100 text-navy-900 text-sm font-medium press">Reset</button>
            </div>
          )}
        </div>
      )}

      {/* ---------- DAFTAR: KARTU (MOBILE) ---------- */}
      {tampilDaftar && (
        <div className="md:hidden space-y-2.5">
          {loading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[74px] w-full rounded-2xl" />)}
          {!loading && view.length === 0 && (
            <div className="card"><Kosong judul="Tidak ada data" pesan="Coba ubah kata kunci, status, atau rentang tanggal." /></div>
          )}
          {!loading && view.map((r, i) => {
            const g = gaya(r.status);
            const isi = (
              <div className="card p-3.5 flex items-center gap-3 anim-fade-up press" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                {isPembina ? (
                  <Avatar name={r.nama} foto={r.foto} size={40} />
                ) : (
                  <span className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 leading-none ${g.lencana}`}>
                    <b className="text-sm tabular-nums">{r.tanggal.slice(8)}</b>
                    <span className="text-[8px] uppercase mt-0.5 tracking-wide">{tglPendek(r.tanggal).slice(3)}</span>
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-navy-900 truncate">
                      {isPembina ? r.nama : tglPanjang(r.tanggal).split(",")[0]}
                    </p>
                    {isPembina && <span className="text-[10px] text-gray-400 shrink-0">{tglPendek(r.tanggal)}</span>}
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
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${g.lencana}`}>{g.pendek}</span>
              </div>
            );
            return isPembina
              ? <Link key={r.id} href={`/peserta/${r.userId}`}>{isi}</Link>
              : <div key={r.id}>{isi}</div>;
          })}
        </div>
      )}

      {/* ---------- DAFTAR: TABEL (DESKTOP) ---------- */}
      {tampilDaftar && (
        <div className="hidden md:block card overflow-hidden anim-fade-up d-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  {isPembina && <th className="px-5 py-3 font-medium">Nama Magang</th>}
                  {isPembina && <th className="px-5 py-3 font-medium">Divisi</th>}
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
                {!loading && view.length === 0 && <tr><td colSpan={6}><Kosong judul="Tidak ada data" pesan="Coba ubah kata kunci, status, atau rentang tanggal." /></td></tr>}
                {!loading && view.map((r, i) => {
                  const g = gaya(r.status);
                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                      {isPembina && (
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={r.nama} foto={r.foto} size={36} />
                            <div>
                              <Link href={`/peserta/${r.userId}`} className="font-medium text-navy-900 hover:underline">{r.nama}</Link>
                              <p className="text-xs text-gray-400">ID: {r.kode}</p>
                            </div>
                          </div>
                        </td>
                      )}
                      {isPembina && <td className="px-5 py-3 text-gray-600">{r.divisi}</td>}
                      <td className="px-5 py-3 text-gray-600">{isPembina ? r.tanggal : tglPanjang(r.tanggal)}</td>
                      <td className={`px-5 py-3 font-mono ${r.status === "terlambat" ? "text-telkomRed" : "text-gray-700"}`}>{r.masuk}</td>
                      <td className="px-5 py-3 font-mono text-gray-700">{r.pulang}</td>
                      <td className="px-5 py-3"><span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${g.lencana}`}>{g.pendek}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------- HALAMAN ---------- */}
      {tampilDaftar && (
        <div className="card flex flex-col gap-3 px-4 py-3.5 anim-fade-up d-3">
          <div className="flex flex-col xs:flex-row items-center justify-between gap-3">
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
          <button onClick={muatLebihLama} disabled={memuatLagi || loading}
            className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press hover:bg-gray-50 disabled:opacity-50">
            {memuatLagi ? "Memuat..." : `Muat ${HARI_AWAL} hari sebelumnya`}
          </button>
        </div>
      )}

      {/* ---------- STATISTIK PEMBIMBING ---------- */}
      {isPembina && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MiniStat warna="bg-emerald-50 text-emerald-600" angka={rekap.persenKehadiran} suffix="%" delay="d-1"
            label="Kehadiran Periode Ini"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>} />
          <MiniStat warna="bg-amber-50 text-amber-600" angka={telatIni} delay="d-2"
            label="Terlambat Hari Ini"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>} />
          <MiniStat warna="bg-blue-50 text-blue-600" angka={rekap.izin + rekap.sakit} delay="d-3"
            label="Izin & Sakit"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>} />
          <MiniStat warna="bg-red-50 text-telkomRed" angka={alpaIni} delay="d-4"
            label="Alpa Hari Ini"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>} />
        </div>
      )}
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
