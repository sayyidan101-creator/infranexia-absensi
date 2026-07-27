"use client";
import { useState, useEffect, useMemo } from "react";
import Protected from "@/components/Protected";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buatUser, UserBaru } from "@/lib/users";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";
import { CountUp, Skeleton, Kosong, Pesan } from "@/components/ui";

interface U {
  id: string; name: string; email: string; role: string;
  nim?: string; kampus?: string; jurusan?: string; status?: string; createdAt?: any; foto?: string;
}

const BADGE = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-purple-100 text-purple-700", "bg-amber-100 text-amber-700", "bg-pink-100 text-pink-700"];
const badgeDivisi = (s: string) => BADGE[(s.charCodeAt(0) || 0) % BADGE.length];
const tgl = (t?: any) => (t?.toDate ? t.toDate().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-");

const kosong: UserBaru = { name: "", email: "", password: "", role: "magang", nim: "", kampus: "", jurusan: "" };

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
  const [modal, setModal] = useState<null | "create" | "edit" | "view">(null);
  const [form, setForm] = useState<any>(kosong);
  const [pesan, setPesan] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [konfirmHapus, setKonfirmHapus] = useState<U | null>(null);

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
        await buatUser({ name: form.name, email: form.email, password: form.password, role: form.role, nim: form.nim, kampus: form.kampus, jurusan: form.jurusan });
      } else if (modal === "edit") {
        await updateDoc(doc(db, "users", form.id), {
          name: form.name, role: form.role, nim: form.nim || "", kampus: form.kampus || "",
          jurusan: form.jurusan || "", status: form.status || "aktif",
        });
      }
      setModal(null); load();
    } catch (e: any) {
      setPesan({ t: "err", s: e?.code === "auth/email-already-in-use" ? "Email sudah terpakai." : (e?.message || "Gagal menyimpan.") });
    } finally { setBusy(false); }
  };

  const hapus = async () => {
    const u = konfirmHapus;
    if (!u) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, "users", u.id));
      await deleteDoc(doc(db, "faceData", u.id)).catch(() => {});
      setKonfirmHapus(null);
      load();
    } catch (e: any) {
      setPesan({ t: "err", s: "Gagal menghapus: " + (e?.message || e) });
    } finally { setBusy(false); }
  };

  const mintaHapus = (u: U) => {
    if (u.id === profil?.uid) { setPesan({ t: "err", s: "Tidak bisa menghapus akun sendiri." }); return; }
    setKonfirmHapus(u);
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
          <button onClick={bukaCreate} className="hidden md:inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold press hover:bg-navy-800 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            Tambah Magang Baru
          </button>
        )}
      </div>

      {pesan && !modal && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

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
                  <p className="text-xs text-gray-400 truncate">{u.role === "magang" ? `ID: ${u.nim || u.id.slice(0, 8)}` : u.role}</p>
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
                          <p className="font-medium text-navy-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.role === "magang" ? `ID: ${u.nim || u.id.slice(0, 8)}` : u.role}</p>
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

      {/* MODAL — bottom sheet di HP, dialog di desktop */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 anim-fade-in" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto pb-safe anim-slide-up sm:anim-pop"
            onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto mt-3 sm:hidden" />
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <h2 className="text-base sm:text-lg font-bold text-navy-900">
                {modal === "create" ? "Tambah Magang Baru" : modal === "edit" ? "Edit Data" : "Detail Peserta"}
              </h2>
              <button onClick={() => setModal(null)} aria-label="Tutup"
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 press">✕</button>
            </div>

            <div className="px-5 py-4">
              {pesan && <div className="mb-4"><Pesan tipe={pesan.t}>{pesan.s}</Pesan></div>}

              {modal === "view" ? (
                <div className="space-y-3 text-sm">
                  <Info label="Nama" val={form.name} />
                  <Info label="Email" val={form.email} />
                  <Info label="Role" val={form.role} />
                  <Info label="NIM / ID" val={form.nim || "-"} />
                  <Info label="Kampus" val={form.kampus || "-"} />
                  <Info label="Divisi / Jurusan" val={form.jurusan || "-"} />
                  <Info label="Status" val={form.status || "aktif"} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <FField label="Nama Lengkap"><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inp} /></FField>
                  {modal === "create" && <FField label="Email"><input type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inp} /></FField>}
                  {modal === "create" && <FField label="Password (min. 6)"><input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className={inp} /></FField>}
                  {form.role === "magang" && <>
                    <FField label="NIM / ID"><input value={form.nim || ""} onChange={(e) => set("nim", e.target.value)} className={inp} /></FField>
                    <FField label="Kampus"><input value={form.kampus || ""} onChange={(e) => set("kampus", e.target.value)} className={inp} /></FField>
                    <FField label="Divisi / Jurusan"><input value={form.jurusan || ""} onChange={(e) => set("jurusan", e.target.value)} className={inp} /></FField>
                  </>}
                </div>
              )}
            </div>

            {modal !== "view" && (
              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex gap-2">
                <button onClick={() => setModal(null)} className="flex-1 sm:flex-none px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium press">Batal</button>
                <button onClick={simpan} disabled={busy}
                  className="flex-1 px-5 py-3 rounded-xl bg-telkomRed text-white text-sm font-semibold press hover:brightness-110 disabled:opacity-50">
                  {busy ? "Menyimpan..." : modal === "create" ? "Buat Akun" : "Simpan"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Konfirmasi hapus */}
      {konfirmHapus && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 anim-fade-in" onClick={() => setKonfirmHapus(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 pb-safe anim-slide-up sm:anim-pop text-center" onClick={(e) => e.stopPropagation()}>
            <span className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-telkomRed flex items-center justify-center">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
            </span>
            <p className="font-semibold text-navy-900 mt-3">Hapus {konfirmHapus.name}?</p>
            <p className="text-sm text-gray-500 mt-1">Profil dan data wajahnya akan dihapus permanen.</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setKonfirmHapus(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium press">Batal</button>
              <button onClick={hapus} disabled={busy} className="flex-1 py-3 rounded-xl bg-telkomRed text-white text-sm font-semibold press disabled:opacity-50">
                {busy ? "Menghapus..." : "Hapus"}
              </button>
            </div>
          </div>
        </div>
      )}
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
function FField({ label, children }: any) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>{children}</div>;
}
function Info({ label, val }: any) {
  return <div className="flex justify-between gap-4 border-b border-gray-50 pb-2"><span className="text-gray-500 shrink-0">{label}</span><span className="font-medium text-navy-900 capitalize text-right break-all">{val}</span></div>;
}

export default function AdminPage() {
  return <Protected allow={["admin", "pembimbing"]}><AdminInner /></Protected>;
}
