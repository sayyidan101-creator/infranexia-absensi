"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Protected from "@/components/Protected";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buatUser, ubahUser, hapusUser, pesanError, UserBaru } from "@/lib/users";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";
import PengaturanAbsensi from "@/components/PengaturanAbsensi";
import KartuKredensial, { HasilAkun } from "@/components/KartuKredensial";
import KesehatanData from "@/components/KesehatanData";
import PanelSistem from "@/components/PanelSistem";
import Sheet from "@/components/Sheet";
import DaftarKartu from "@/components/DaftarKartu";
import { CountUp, Skeleton, Kosong, Pesan } from "@/components/ui";
import { labelPeriode, statusPeriode, GAYA_PERIODE, sisaHari } from "@/lib/periode";
import { tanggalHariIni } from "@/lib/absensi";
import { ambilKartuCetak } from "@/lib/kartu";
import { lembarKartuHtml } from "@/lib/kartuCetak";
import { cetakHtml } from "@/lib/ekspor";

interface U {
  id: string; name: string; email: string; role: string;
  nim?: string; kampus?: string; jurusan?: string; status?: string; createdAt?: any; foto?: string;
  telepon?: string; kartuTerdaftar?: boolean; kartuLabel?: string;
  mulaiPada?: string; selesaiPada?: string;
}

/**
 * Penanda periode magang. Yang paling berguna bukan tanggalnya, melainkan
 * peringatan bahwa periodenya hampir habis — itu momen admin perlu menyiapkan
 * surat keterangan dan menarik kartunya.
 */
function LencanaPeriode({ u, hariIni }: { u: U; hariIni: string }) {
  const st = statusPeriode(u, hariIni);
  if (st === "tanpa-periode") return null;

  const sisa = sisaHari(u, hariIni);
  const hampirHabis = st === "berjalan" && sisa !== null && sisa <= 7;
  const g = GAYA_PERIODE[st];

  return (
    <span title={labelPeriode(u)}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
        hampirHabis ? "bg-amber-50 text-amber-700" : g.kelas
      }`}>
      {hampirHabis ? `${sisa} hari lagi` : g.teks}
    </span>
  );
}

/** Penanda apakah peserta sudah punya kartu absen. */
function LencanaKartu({ ada }: { ada?: boolean }) {
  return (
    <span title={ada ? "Kartu sudah terdaftar" : "Belum punya kartu absen"}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
        ada ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
      }`}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {ada ? <path d="m5 13 4 4L19 7" /> : <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>}
      </svg>
      Kartu
    </span>
  );
}

const BADGE = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-purple-100 text-purple-700", "bg-amber-100 text-amber-700", "bg-pink-100 text-pink-700"];
const badgeDivisi = (s: string) => BADGE[(s.charCodeAt(0) || 0) % BADGE.length];
const tgl = (t?: any) => (t?.toDate ? t.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");

const kosong: UserBaru = { name: "", email: "", password: "", role: "magang", nim: "", kampus: "", jurusan: "", telepon: "", mulaiPada: "", selesaiPada: "" };

function AdminInner() {
  const { profil } = useAuth();
  const bisaKelola = profil?.role === "admin";
  const [users, setUsers] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [cari, setCari] = useState("");
  const [divisi, setDivisi] = useState("semua");
  const [page, setPage] = useState(1);
  const PER = 8;

  // modal: create | edit | view | null
  const [modal, setModal] = useState<null | "create" | "edit" | "view" | "hasil">(null);
  const [hasilAkun, setHasilAkun] = useState<HasilAkun | null>(null);
  const [form, setForm] = useState<any>(kosong);
  const [pesan, setPesan] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [konfirmHapus, setKonfirmHapus] = useState<U | null>(null);
  const [cetakSibuk, setCetakSibuk] = useState(false);
  const [kartuUntuk, setKartuUntuk] = useState<U | null>(null);

  const load = async () => {
    const snap = await getDocs(collection(db, "users"));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Kunci scroll saat modal/sheet terbuka
  useEffect(() => {
    const aktif = !!modal || !!konfirmHapus;
    document.body.style.overflow = aktif ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal, konfirmHapus]);

  const hariIni = tanggalHariIni();
  const magang = users.filter((u) => u.role === "magang");
  const aktif = magang.filter((u) => (u.status || "aktif") === "aktif").length;
  const nonaktif = magang.length - aktif;

  const divisiOpsi = useMemo(() => Array.from(new Set(users.map((u) => u.jurusan).filter(Boolean))), [users]);

  const filtered = useMemo(() => users.filter((u) => {
    if (cari && !(`${u.name} ${u.nim || ""}`.toLowerCase().includes(cari.toLowerCase()))) return false;
    if (divisi !== "semua" && u.jurusan !== divisi) return false;
    return true;
  }), [users, cari, divisi]);

  const totalHal = Math.max(1, Math.ceil(filtered.length / PER));
  const hal = Math.min(page, totalHal);
  const view = filtered.slice((hal - 1) * PER, hal * PER);

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const bukaCreate = () => { setForm(kosong); setPesan(null); setModal("create"); };
  const bukaEdit = (u: U) => { setForm({ ...u, password: "" }); setPesan(null); setModal("edit"); };
  const bukaView = (u: U) => { setForm({ ...u }); setModal("view"); };

  const simpan = async () => {
    setPesan(null);
    if (!form.name || (modal === "create" && (!form.email || (form.password || "").length < 6))) {
      setPesan({ t: "err", s: "Lengkapi nama, email, dan password minimal 6 karakter." }); return;
    }
    setBusy(true);
    try {
      if (modal === "create") {
        const res = await buatUser({
          name: form.name, email: form.email, password: form.password, role: form.role,
          nim: form.nim, kampus: form.kampus, jurusan: form.jurusan, telepon: form.telepon,
          mulaiPada: form.mulaiPada, selesaiPada: form.selesaiPada,
        });
        setHasilAkun({
          nama: form.name, email: form.email, password: form.password, peran: form.role,
          telepon: form.telepon, emailTerkirim: res.emailTerkirim, alasanEmail: res.alasanEmail,
        });
        setModal("hasil");
        load();
        return;
      }
      if (modal === "edit") {
        const res = await ubahUser({
          uid: form.id, name: form.name, email: form.email, password: form.password || undefined,
          role: form.role, nim: form.nim, kampus: form.kampus, jurusan: form.jurusan,
          telepon: form.telepon, status: form.status,
          mulaiPada: form.mulaiPada, selesaiPada: form.selesaiPada,
        });
        const catatan = [
          res.emailBerubah ? "email login diperbarui" : "",
          res.passwordBerubah ? "password diganti" : "",
        ].filter(Boolean).join(" & ");
        setPesan({ t: "ok", s: `Data ${form.name} tersimpan${catatan ? ` — ${catatan}` : ""}.` });
        if (res.emailBerubah && form.id === profil?.uid) {
          setPesan({ t: "ok", s: "Email akunmu sendiri berubah. Kamu akan diminta login ulang." });
          setTimeout(() => { window.location.replace("/login"); }, 2500);
        }
      }
      setModal(null); load();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(false); }
  };

  const hapus = async () => {
    const u = konfirmHapus;
    if (!u) return;
    setBusy(true);
    try {
      const jumlah = await hapusUser(u.id);
      setKonfirmHapus(null);
      setPesan({ t: "ok", s: `${u.name} dihapus beserta ${jumlah} catatan absensinya.` });
      load();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
      setKonfirmHapus(null);
    } finally { setBusy(false); }
  };

  const mintaHapus = (u: U) => {
    if (u.id === profil?.uid) { setPesan({ t: "err", s: "Tidak bisa menghapus akun sendiri." }); return; }
    setKonfirmHapus(u);
  };

  /** Satu lembar A4 berisi seluruh kartu yang aktif — untuk cetak massal di awal periode. */
  const cetakSemuaKartu = async () => {
    setCetakSibuk(true);
    setPesan(null);
    try {
      const daftar = await ambilKartuCetak();
      if (daftar.length === 0) {
        setPesan({ t: "err", s: "Belum ada kartu yang diterbitkan. Terbitkan lewat tombol Kartu di baris peserta." });
        return;
      }
      cetakHtml("Kartu Absen", await lembarKartuHtml(daftar));
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setCetakSibuk(false); }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 anim-fade-up">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">Administrasi SDM</p>
          <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">Kelola Data Magang</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">Manajemen terpusat peserta magang, dari onboarding hingga evaluasi akhir.</p>
        </div>
        {bisaKelola && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={cetakSemuaKartu} disabled={cetakSibuk}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-navy-900 press disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
              {cetakSibuk ? "Menyiapkan..." : "Cetak Kartu"}
            </button>
            <button onClick={bukaCreate} className="hidden md:inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold press hover:bg-navy-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              Tambah Magang Baru
            </button>
          </div>
        )}
      </div>

      {pesan && !modal && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

      {/* Pengaturan jam kerja & geofencing */}
      {bisaKelola && <PengaturanAbsensi />}

      {/* Pemeriksaan keselarasan akun & profil */}
      {bisaKelola && <KesehatanData />}

      {/* Jejak audit, laporan galat, dan pencadangan */}
      {bisaKelola && <PanelSistem />}

      {/* Statistik */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <StatCard label="Total" angka={magang.length} iconBg="bg-blue-50 text-blue-600" delay="d-1"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>} />
        <StatCard label="Aktif" angka={aktif} iconBg="bg-emerald-50 text-emerald-600" delay="d-2"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>} />
        <StatCard label="Non-Aktif" angka={nonaktif} iconBg="bg-gray-100 text-gray-500" delay="d-3"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>} />
      </div>

      {/* Filter */}
      <div className="card p-3 sm:p-4 flex flex-col sm:flex-row gap-2.5 anim-fade-up d-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          </span>
          <input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} placeholder="Cari nama atau ID magang..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition" />
        </div>
        <select value={divisi} onChange={(e) => { setDivisi(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-xl px-4 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700">
          <option value="semua">Semua Divisi</option>
          {divisiOpsi.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* ---------- KARTU (MOBILE) ---------- */}
      <div className="md:hidden space-y-2.5">
        {loading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[86px] w-full rounded-2xl" />)}
        {!loading && view.length === 0 && <div className="card"><Kosong judul="Tidak ada data" pesan="Coba kata kunci lain." /></div>}
        {!loading && view.map((u, i) => {
          const st = u.status || "aktif";
          return (
            <div key={u.id} className="card p-3.5 anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="flex items-center gap-3">
                <Avatar name={u.name} foto={u.foto} size={42} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-navy-900 truncate">{u.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-gray-400 truncate">{u.role === "magang" ? `ID: ${u.nim || u.id.slice(0, 8)}` : u.role}</span>
                    {u.role === "magang" && <LencanaKartu ada={u.kartuTerdaftar} />}
                    {u.role === "magang" && <LencanaPeriode u={u} hariIni={hariIni} />}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs shrink-0">
                  <i className={`w-2 h-2 rounded-full ${st === "aktif" ? "bg-emerald-500" : "bg-gray-300"}`} />
                  <span className={st === "aktif" ? "text-navy-900" : "text-gray-400 capitalize"}>{st === "aktif" ? "Aktif" : st}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-50">
                {u.jurusan
                  ? <span className={`text-[10px] font-semibold px-2 py-1 rounded-md ${badgeDivisi(u.jurusan)}`}>{u.jurusan.toUpperCase()}</span>
                  : <span className="text-[11px] text-gray-400 capitalize">{u.role}</span>}
                <div className="flex items-center gap-1.5">
                  {bisaKelola && u.role === "magang" && (
                    <TombolKecil label="Kartu" onClick={() => setKartuUntuk(u)}>
                      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" />
                    </TombolKecil>
                  )}
                  <TombolKecil label="Lihat" onClick={() => bukaView(u)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></TombolKecil>
                  {bisaKelola && <TombolKecil label="Edit" onClick={() => bukaEdit(u)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></TombolKecil>}
                  {bisaKelola && <TombolKecil label="Hapus" danger onClick={() => mintaHapus(u)}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></TombolKecil>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---------- TABEL (DESKTOP) ---------- */}
      <div className="hidden md:block card overflow-hidden anim-fade-up d-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="px-5 py-3 font-medium">Profil & ID</th>
                <th className="px-5 py-3 font-medium">Divisi</th>
                <th className="px-5 py-3 font-medium">Tanggal Bergabung</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && [0, 1, 2, 3].map((i) => (
                <tr key={i} className="border-b border-gray-50"><td colSpan={5} className="px-5 py-3"><Skeleton className="h-9 w-full" /></td></tr>
              ))}
              {!loading && view.length === 0 && <tr><td colSpan={5}><Kosong judul="Tidak ada data" pesan="Coba kata kunci lain." /></td></tr>}
              {!loading && view.map((u, i) => {
                const st = u.status || "aktif";
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors anim-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} foto={u.foto} size={36} />
                        <div>
                          <Link href={`/peserta/${u.id}`} className="font-medium text-navy-900 hover:underline">{u.name}</Link>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">{u.role === "magang" ? `ID: ${u.nim || u.id.slice(0, 8)}` : u.role}</span>
                            {u.role === "magang" && <LencanaKartu ada={u.kartuTerdaftar} />}
                    {u.role === "magang" && <LencanaPeriode u={u} hariIni={hariIni} />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {u.jurusan
                        ? <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${badgeDivisi(u.jurusan)}`}>{u.jurusan.toUpperCase()}</span>
                        : <span className="text-xs text-gray-400 capitalize">{u.role}</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{tgl(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <i className={`w-2 h-2 rounded-full ${st === "aktif" ? "bg-emerald-500" : "bg-gray-300"}`} />
                        <span className={st === "aktif" ? "text-navy-900" : "text-gray-400 capitalize"}>{st === "aktif" ? "Aktif" : st}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1 text-gray-400">
                        {bisaKelola && <IconBtn title="Edit" onClick={() => bukaEdit(u)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></IconBtn>}
                        {bisaKelola && <IconBtn title="Hapus" onClick={() => mintaHapus(u)} danger><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></IconBtn>}
                        {bisaKelola && u.role === "magang" && (
                          <IconBtn title="Kartu absen" onClick={() => setKartuUntuk(u)}>
                            <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" />
                          </IconBtn>
                        )}
                        <IconBtn title="Lihat" onClick={() => bukaView(u)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="card flex flex-col xs:flex-row items-center justify-between gap-3 px-4 py-3.5 anim-fade-up d-4">
        <p className="text-xs text-gray-500">Menampilkan {view.length} dari {filtered.length} data</p>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={hal === 1} className="w-9 h-9 rounded-xl border border-gray-200 disabled:opacity-40 press hover:bg-gray-50">‹</button>
          {Array.from({ length: totalHal }).slice(0, 4).map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={`w-9 h-9 rounded-xl text-sm press transition ${hal === i + 1 ? "bg-navy-900 text-white" : "border border-gray-200 hover:bg-gray-50"}`}>{i + 1}</button>
          ))}
          {totalHal > 4 && <span className="px-1 text-gray-400">… {totalHal}</span>}
          <button onClick={() => setPage((p) => Math.min(totalHal, p + 1))} disabled={hal === totalHal} className="w-9 h-9 rounded-xl border border-gray-200 disabled:opacity-40 press hover:bg-gray-50">›</button>
        </div>
      </div>

      {/* FAB tambah (mobile) */}
      {bisaKelola && (
        <button onClick={bukaCreate} aria-label="Tambah magang baru"
          className="md:hidden fixed right-4 z-30 w-14 h-14 rounded-2xl bg-telkomRed text-white shadow-lift flex items-center justify-center press"
          style={{ bottom: "calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 1rem)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}

      {/* ===== Panel tambah / edit / detail ===== */}
      <Sheet
        buka={!!modal}
        tutup={() => { setModal(null); setHasilAkun(null); }}
        judul={
          modal === "create" ? "Tambah Magang Baru"
            : modal === "edit" ? "Edit Data"
            : modal === "hasil" ? "Akun Dibuat"
            : "Detail Peserta"
        }
        footer={
          modal === "create" || modal === "edit" ? (
            <div className="flex gap-2">
              <button onClick={() => setModal(null)}
                className="px-5 py-3.5 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press">
                Batal
              </button>
              <button onClick={simpan} disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-telkomRed text-white text-sm font-semibold press hover:brightness-110 disabled:opacity-50 shadow-lift">
                {busy ? (
                  <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Menyimpan...</>
                ) : modal === "create" ? "Buat Akun" : "Simpan Perubahan"}
              </button>
            </div>
          ) : undefined
        }
      >
        {modal === "hasil" && hasilAkun ? (
          <KartuKredensial hasil={hasilAkun} onTutup={() => { setModal(null); setHasilAkun(null); }} />
        ) : modal === "view" ? (
          <div className="space-y-3 text-sm">
            <Info label="Nama" val={form.name} />
            <Info label="Email" val={form.email} />
            <Info label="Role" val={form.role} />
            <Info label="NIM / ID" val={form.nim || "-"} />
            <Info label="Kampus" val={form.kampus || "-"} />
            <Info label="Divisi / Jurusan" val={form.jurusan || "-"} />
            <Info label="WhatsApp" val={form.telepon || "-"} />
            <Info label="Periode Magang" val={labelPeriode(form)} />
            <Info label="Status" val={form.status || "aktif"} />
            <Info label="Kartu Absen" val={form.kartuTerdaftar ? (form.kartuLabel || "terdaftar") : "belum terdaftar"} />
          </div>
        ) : (
          <div className="space-y-5">
            {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

            <Bagian judul="Akun Login">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FField label="Nama Lengkap" penuh>
                  <input value={form.name || ""} onChange={(e) => set("name", e.target.value)}
                    placeholder="Nama sesuai identitas" className={inp} />
                </FField>
                <FField label="Email" bantuan="Dipakai untuk login" penuh>
                  <input type="email" inputMode="email" autoCapitalize="none" placeholder="nama@email.com"
                    value={form.email || ""} onChange={(e) => set("email", e.target.value)} className={inp} />
                </FField>
                <FField
                  label={modal === "create" ? "Password" : "Password Baru"}
                  bantuan={modal === "edit" ? "Kosongkan bila tidak diganti" : undefined}
                  penuh
                >
                  <input type="password" placeholder={modal === "edit" ? "••••••" : "Minimal 6 karakter"}
                    value={form.password || ""} onChange={(e) => set("password", e.target.value)} className={inp} />
                </FField>
              </div>
            </Bagian>

            <Bagian judul="Peran & Status">
              <div className="grid grid-cols-2 gap-3">
                <FField label="Role">
                  <select value={form.role} onChange={(e) => set("role", e.target.value)} className={inp}>
                    <option value="magang">Anak Magang</option>
                    <option value="pembimbing">Pembimbing</option>
                    {modal === "edit" && <option value="admin">Admin</option>}
                  </select>
                </FField>
                <FField label="Status">
                  <select value={form.status || "aktif"} onChange={(e) => set("status", e.target.value)} className={inp}>
                    <option value="aktif">Aktif</option>
                    <option value="selesai">Selesai</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </FField>
              </div>
            </Bagian>

            {form.role === "magang" && (
              <Bagian judul="Data Magang">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FField label="NIM / ID">
                    <input value={form.nim || ""} onChange={(e) => set("nim", e.target.value)} className={inp} />
                  </FField>
                  <FField label="Kampus">
                    <input value={form.kampus || ""} onChange={(e) => set("kampus", e.target.value)} className={inp} />
                  </FField>
                  <FField label="Divisi / Jurusan" penuh>
                    <input value={form.jurusan || ""} onChange={(e) => set("jurusan", e.target.value)} className={inp} />
                  </FField>
                  <FField label="Mulai Magang" bantuan="Boleh dikosongkan">
                    <input type="date" value={form.mulaiPada || ""}
                      max={form.selesaiPada || undefined}
                      onChange={(e) => set("mulaiPada", e.target.value)} className={inp} />
                  </FField>
                  <FField label="Selesai Magang" bantuan="Setelah tanggal ini kartunya berhenti berlaku">
                    <input type="date" value={form.selesaiPada || ""}
                      min={form.mulaiPada || undefined}
                      onChange={(e) => set("selesaiPada", e.target.value)} className={inp} />
                  </FField>
                </div>
              </Bagian>
            )}

            <Bagian judul="Kontak" bantuan="Dipakai untuk mengirim kredensial lewat WhatsApp">
              <FField label="Nomor WhatsApp" penuh>
                <input type="tel" inputMode="tel" placeholder="0812xxxxxxxx"
                  value={form.telepon || ""} onChange={(e) => set("telepon", e.target.value)} className={inp} />
              </FField>
            </Bagian>
          </div>
        )}
      </Sheet>

      {/* ===== Penerbitan kartu absen ===== */}
      <DaftarKartu
        peserta={kartuUntuk}
        buka={!!kartuUntuk}
        tutup={() => setKartuUntuk(null)}
        selesai={load}
      />

      {/* ===== Konfirmasi hapus ===== */}
      <Sheet
        buka={!!konfirmHapus}
        tutup={() => setKonfirmHapus(null)}
        judul="Hapus Peserta"
        lebar="max-w-sm"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setKonfirmHapus(null)}
              className="flex-1 py-3.5 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press">
              Batal
            </button>
            <button onClick={hapus} disabled={busy}
              className="flex-1 py-3.5 rounded-xl bg-telkomRed text-white text-sm font-semibold press disabled:opacity-50">
              {busy ? "Menghapus..." : "Hapus"}
            </button>
          </div>
        }
      >
        <div className="text-center py-2">
          <span className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-telkomRed flex items-center justify-center anim-pop">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </span>
          <p className="font-semibold text-navy-900 mt-3">Hapus {konfirmHapus?.name}?</p>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
            Akun login, profil, kartu absen, dan seluruh riwayat absensinya akan dihapus permanen.
            Tindakan ini tidak bisa dibatalkan.
          </p>
        </div>
      </Sheet>
    </div>
  );
}

const inp = "w-full border border-gray-200 rounded-xl px-3 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition";

function StatCard({ label, angka, icon, iconBg, delay = "" }: any) {
  return (
    <div className={`card p-3.5 sm:p-5 flex sm:items-center sm:justify-between flex-col sm:flex-row gap-2 anim-fade-up ${delay} transition-transform md:hover:-translate-y-0.5`}>
      <div className={`w-9 h-9 sm:hidden rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
      <div>
        <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-2xl sm:text-3xl font-bold text-navy-900 mt-0.5 sm:mt-1.5 tabular-nums"><CountUp value={angka} /></p>
      </div>
      <div className={`hidden sm:flex w-12 h-12 rounded-full items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
  );
}
function IconBtn({ children, onClick, title, danger }: any) {
  return (
    <button onClick={onClick} title={title} className={`w-9 h-9 rounded-lg flex items-center justify-center press hover:bg-gray-100 ${danger ? "hover:text-telkomRed" : "hover:text-navy-800"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
  );
}
function TombolKecil({ children, onClick, label, danger }: any) {
  return (
    <button onClick={onClick} aria-label={label}
      className={`w-9 h-9 rounded-xl flex items-center justify-center press border ${danger ? "border-red-100 bg-red-50 text-telkomRed" : "border-gray-100 bg-gray-50 text-navy-800"}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
  );
}
function FField({ label, children, bantuan, penuh }: any) {
  return (
    <div className={penuh ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      {children}
      {bantuan && <p className="text-[11px] text-gray-400 mt-1">{bantuan}</p>}
    </div>
  );
}

function Bagian({ judul, bantuan, children }: any) {
  return (
    <section>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{judul}</p>
      {children}
      {bantuan && <p className="text-[11px] text-gray-400 mt-1.5">{bantuan}</p>}
    </section>
  );
}
function Info({ label, val }: any) {
  return <div className="flex justify-between gap-4 border-b border-gray-50 pb-2"><span className="text-gray-500 shrink-0">{label}</span><span className="font-medium text-navy-900 capitalize text-right break-all">{val}</span></div>;
}

export default function AdminPage() {
  return <Protected allow={["admin", "pembimbing"]}><AdminInner /></Protected>;
}
