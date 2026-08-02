"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import { db } from "@/lib/firebase";
import { CountUp, Skeleton, Kosong, Pesan, Halaman } from "@/components/ui";
import { unduhXlsx, cetakHtml } from "@/lib/ekspor";
import { laporanHtml } from "@/lib/laporan";
import { sertifikatHtml } from "@/lib/sertifikat";
import { kegiatanPeserta } from "@/lib/aktivitas";
import { labelPeriode, statusPeriode, GAYA_PERIODE, irisanPeriode } from "@/lib/periode";
import {
  riwayatRentang, hitungRekap, batasBulan, tanggalHariIni, Absensi, Rekap,
} from "@/lib/absensi";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
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

function PesertaInner() {
  const params = useParams();
  const router = useRouter();
  const uid = String(params?.uid || "");

  const kini = new Date();
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [bulan, setBulan] = useState(kini.getMonth() + 1);

  const [orang, setOrang] = useState<any>(null);
  const [data, setData] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState("");
  const [sibukSurat, setSibukSurat] = useState(false);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        setOrang(snap.exists() ? { id: uid, ...(snap.data() as any) } : null);
      } catch (e: any) {
        setGalat(e?.message || "Gagal memuat profil.");
      }
    })();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const { dari, sampai } = batasBulan(tahun, bulan);
    riwayatRentang(uid, dari, sampai)
      .then(setData)
      .catch((e) => setGalat(
        /index/i.test(String(e?.message))
          ? "Firestore memerlukan indeks. Jalankan: firebase deploy --only firestore:indexes"
          : e?.message || "Gagal memuat data."
      ))
      .finally(() => setLoading(false));
  }, [uid, tahun, bulan]);

  const rekap: Rekap = useMemo(() => hitungRekap(data), [data]);

  const gantiBulan = (arah: number) => {
    let b = bulan + arah, t = tahun;
    if (b < 1) { b = 12; t--; }
    if (b > 12) { b = 1; t++; }
    setBulan(b); setTahun(t);
  };

  const eksporExcel = async () => {
    await unduhXlsx(
      `rekap-${(orang?.name || "peserta").replace(/\s+/g, "-").toLowerCase()}-${tahun}-${String(bulan).padStart(2, "0")}`,
      `${BULAN[bulan - 1]} ${tahun}`,
      [
        { kunci: "tanggal", judul: "Tanggal", lebar: 12 },
        { kunci: "masuk", judul: "Masuk", lebar: 10 },
        { kunci: "pulang", judul: "Pulang", lebar: 10 },
        { kunci: "label", judul: "Status", lebar: 14 },
      ],
      data.map((a) => ({
        tanggal: a.tanggal, masuk: jam(a.jamMasuk), pulang: jam(a.jamPulang), label: badge(a.status).t,
      }))
    );
  };

  const cetakLaporan = () => {
    if (!orang) return;
    cetakHtml(
      `Laporan ${orang.name}`,
      laporanHtml({
        orang,
        periode: `${BULAN[bulan - 1]} ${tahun}`,
        rekap,
        baris: data.map((a) => ({
          tanggal: a.tanggal, masuk: jam(a.jamMasuk), pulang: jam(a.jamPulang), status: badge(a.status).t,
        })),
      })
    );
  };

  /**
   * Surat keterangan selesai magang.
   *
   * Angkanya dihitung ulang dari seluruh periode magang, bukan dari bulan yang
   * kebetulan sedang dilihat di layar — surat yang menyebut "tiga hari alpa"
   * padahal itu cuma angka bulan Juli akan salah dan memalukan.
   */
  const cetakSurat = async () => {
    if (!orang) return;
    setSibukSurat(true);
    try {
      const rentang = irisanPeriode(orang, orang.mulaiPada || "2000-01-01", orang.selesaiPada || tanggalHariIni());
      if (!rentang) {
        setGalat("Periode magangnya belum diisi. Lengkapi dulu lewat menu Kelola.");
        return;
      }

      const [absen, kegiatan] = await Promise.all([
        riwayatRentang(uid, rentang.dari, rentang.sampai),
        kegiatanPeserta(uid, rentang.dari, rentang.sampai).catch(() => []),
      ]);

      cetakHtml(
        `Surat Keterangan ${orang.name}`,
        sertifikatHtml({
          orang,
          rekap: hitungRekap(absen),
          logbookDiperiksa: kegiatan.filter((k) => k.status === "diperiksa").length,
        })
      );
    } catch (e: any) {
      setGalat(e?.message || "Gagal menyiapkan surat.");
    } finally { setSibukSurat(false); }
  };

  const stPeriode = orang ? statusPeriode(orang, tanggalHariIni()) : "tanpa-periode";

  if (galat) return <Pesan tipe="err">{galat}</Pesan>;

  return (
    <Halaman lebar="sedang">
      {/* Kembali */}
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 press anim-fade-up">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
        Kembali
      </button>

      {/* Profil */}
      <div className="card overflow-hidden anim-fade-up d-1">
        <div className="h-20 bg-gradient-to-r from-navy-900 to-navy-700 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5 anim-float" />
        </div>
        <div className="px-5 pb-5">
          <div className="-mt-10 flex items-end gap-4">
            <div className="ring-4 ring-white rounded-full anim-pop">
              <Avatar name={orang?.name || "?"} foto={orang?.foto} size={76} />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-lg font-bold text-navy-900">{orang?.name || <Skeleton className="h-6 w-40" />}</p>
            <p className="text-sm text-gray-500 break-all">{orang?.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-navy-800 text-white capitalize">{orang?.role}</span>
              {orang?.jurusan && <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{orang.jurusan}</span>}
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                orang?.kartuTerdaftar ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
              }`}>
                {orang?.kartuTerdaftar ? "kartu terdaftar" : "kartu belum terdaftar"}
              </span>
              {orang && stPeriode !== "tanpa-periode" && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${GAYA_PERIODE[stPeriode].kelas}`}>
                  {GAYA_PERIODE[stPeriode].teks.toLowerCase()}
                </span>
              )}
            </div>

            {orang?.role === "magang" && (
              <p className="text-xs text-gray-500 mt-2">
                Periode magang: <b className="text-navy-900">{labelPeriode(orang)}</b>
              </p>
            )}
            {(orang?.nim || orang?.kampus) && (
              <p className="text-xs text-gray-500 mt-2">
                {orang?.nim && `NIM ${orang.nim}`}{orang?.nim && orang?.kampus && " · "}{orang?.kampus}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pemilih bulan */}
      <div className="card p-3 flex items-center justify-between anim-fade-up d-2">
        <button onClick={() => gantiBulan(-1)} aria-label="Bulan sebelumnya"
          className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center press hover:bg-gray-50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <p className="font-semibold text-navy-900">{BULAN[bulan - 1]} {tahun}</p>
        <button onClick={() => gantiBulan(1)} aria-label="Bulan berikutnya"
          className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center press hover:bg-gray-50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      {/* Rekap */}
      <div className="card p-5 anim-fade-up d-3">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Tingkat kehadiran</p>
            <p className="text-3xl font-bold text-navy-900 mt-1 leading-none tabular-nums">
              <CountUp value={rekap.persenKehadiran} suffix="%" />
            </p>
          </div>
          <p className="text-sm text-gray-500 tabular-nums">
            <span className="font-semibold text-navy-900">{rekap.hadir + rekap.terlambat}</span> dari {rekap.hariKerja} hari tercatat
          </p>
        </div>

        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-2.5">
          <Petak label="Hadir" nilai={rekap.hadir} warna="bg-emerald-50 text-emerald-700" />
          <Petak label="Terlambat" nilai={rekap.terlambat} warna="bg-amber-50 text-amber-700" />
          <Petak label="Izin" nilai={rekap.izin} warna="bg-blue-50 text-blue-700" />
          <Petak label="Sakit" nilai={rekap.sakit} warna="bg-purple-50 text-purple-700" />
          <Petak label="Alpa" nilai={rekap.alpha} warna="bg-red-50 text-red-700" />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={eksporExcel} disabled={data.length === 0}
            className="inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 3 3 3-3" /></svg>
            Excel
          </button>
          <button onClick={cetakLaporan} disabled={data.length === 0}
            className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold press disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
            Cetak Laporan
          </button>
        </div>

        {orang?.role === "magang" && (
          <button onClick={cetakSurat} disabled={sibukSurat}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-navy-900/15 bg-navy-900/[0.04] text-sm font-semibold text-navy-900 press disabled:opacity-40">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
              <circle cx="12" cy="15" r="2.5" /><path d="M10.5 17.2 10 21l2-1 2 1-.5-3.8" />
            </svg>
            {sibukSurat ? "Menyiapkan surat..." : "Surat Keterangan Selesai Magang"}
          </button>
        )}
      </div>

      {/* Rincian harian */}
      <div className="card overflow-hidden anim-fade-up d-4">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <h2 className="font-semibold text-navy-900">Rincian Harian</h2>
        </div>
        {loading ? (
          <div className="p-4 space-y-2.5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : data.length === 0 ? (
          <Kosong judul="Belum ada catatan" pesan={`Tidak ada data kehadiran pada ${BULAN[bulan - 1]} ${tahun}.`} />
        ) : (
          <ul className="divide-y divide-gray-50">
            {data.map((a, i) => {
              const b = badge(a.status);
              return (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 anim-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <div className="w-11 shrink-0 text-center">
                    <p className="text-base font-bold text-navy-900 leading-none">{a.tanggal.slice(8)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {new Date(a.tanggal + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short" })}
                    </p>
                  </div>
                  <div className="flex-1 flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-mono">{jam(a.jamMasuk)}</span>
                    <span className="text-gray-300">→</span>
                    <span className="font-mono">{jam(a.jamPulang)}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${b.c}`}>{b.t}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Halaman>
  );
}

function Petak({ label, nilai, warna }: { label: string; nilai: number; warna: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${warna}`}>
      <p className="text-xl font-bold leading-none tabular-nums">{nilai}</p>
      <p className="text-[10px] uppercase tracking-wide mt-1 opacity-80">{label}</p>
    </div>
  );
}

export default function PesertaPage() {
  return <Protected allow={["admin", "pembimbing"]}><PesertaInner /></Protected>;
}
