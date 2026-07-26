"use client";
import { useState, useEffect, useMemo } from "react";
import Protected from "@/components/Protected";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buatUser, UserBaru } from "@/lib/users";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/Avatar";

interface U {
  id: string; name: string; email: string; role: string;
  nim?: string; kampus?: string; jurusan?: string; status?: string; createdAt?: any; foto?: string;
}

const PALET = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500", "bg-indigo-500"];
const av = (s: string) => PALET[(s.charCodeAt(0) || 0) % PALET.length];
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

  const load = async () => {
    const snap = await getDocs(collection(db, "users"));
    setUsers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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

  const hapus = async (u: U) => {
    if (u.id === profil?.uid) { alert("Tidak bisa menghapus akun sendiri."); return; }
    if (!confirm(`Hapus data ${u.name}? Profil & data wajahnya akan dihapus.`)) return;
    try {
      await deleteDoc(doc(db, "users", u.id));
      await deleteDoc(doc(db, "faceData", u.id)).catch(() => {});
      load();
    } catch (e: any) { alert("Gagal menghapus: " + (e?.message || e)); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 tracking-widest uppercase">Administrasi SDM</p>
          <h1 className="text-2xl font-bold text-navy-900 mt-1">Kelola Data Magang</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">Manajemen terpusat untuk memantau siklus peserta magang, dari onboarding hingga evaluasi akhir di InfraNexia.</p>
        </div>
        {bisaKelola && (
          <button onClick={bukaCreate} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold hover:bg-navy-800 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            Tambah Magang Baru
          </button>
        )}
      </div>

      {/* Statistik */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Magang" value={magang.length} iconBg="bg-blue-50 text-blue-600"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>} />
        <StatCard label="Status Aktif" value={aktif} iconBg="bg-emerald-50 text-emerald-600"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>} />
        <StatCard label="Non-Aktif" value={nonaktif} iconBg="bg-gray-100 text-gray-500"
          icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>} />
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          </span>
          <input value={cari} onChange={(e) => { setCari(e.target.value); setPage(1); }} placeholder="Cari nama atau ID magang..."
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700" />
        </div>
        <select value={divisi} onChange={(e) => { setDivisi(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700">
          <option value="semua">Semua Divisi</option>
          {divisiOpsi.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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
              {loading && <tr><td colSpan={5} className="text-center py-12 text-gray-400">Memuat...</td></tr>}
              {!loading && view.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-400">Tidak ada data.</td></tr>}
              {view.map((u) => {
                const st = u.status || "aktif";
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/60">
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
                        {bisaKelola && <IconBtn title="Hapus" onClick={() => hapus(u)} danger><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></IconBtn>}
                        <IconBtn title="Lihat" onClick={() => bukaView(u)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-500">Menampilkan {view.length} dari {filtered.length} data</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={hal === 1} className="w-8 h-8 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">‹</button>
            {Array.from({ length: totalHal }).slice(0, 4).map((_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`w-8 h-8 rounded-lg text-sm ${hal === i + 1 ? "bg-navy-900 text-white" : "border border-gray-200 hover:bg-gray-50"}`}>{i + 1}</button>
            ))}
            {totalHal > 4 && <span className="px-1 text-gray-400">... {totalHal}</span>}
            <button onClick={() => setPage((p) => Math.min(totalHal, p + 1))} disabled={hal === totalHal} className="w-8 h-8 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">›</button>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-navy-900">
                {modal === "create" ? "Tambah Magang Baru" : modal === "edit" ? "Edit Data" : "Detail Peserta"}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {pesan && <div className={`text-sm px-3 py-2.5 rounded-lg mb-4 ${pesan.t === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-telkomRed"}`}>{pesan.s}</div>}

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
                  <select value={form.role} onChange={(e) => set("role", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm">
                    <option value="magang">Anak Magang</option>
                    <option value="pembimbing">Pembimbing</option>
                    {modal === "edit" && <option value="admin">Admin</option>}
                  </select>
                </FField>
                <FField label="Status">
                  <select value={form.status || "aktif"} onChange={(e) => set("status", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm">
                    <option value="aktif">Aktif</option>
                    <option value="selesai">Selesai</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </FField>
                <FField label="Nama Lengkap"><input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" /></FField>
                {modal === "create" && <FField label="Email"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" /></FField>}
                {modal === "create" && <FField label="Password (min. 6)"><input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" /></FField>}
                {form.role === "magang" && <>
                  <FField label="NIM / ID"><input value={form.nim || ""} onChange={(e) => set("nim", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" /></FField>
                  <FField label="Kampus"><input value={form.kampus || ""} onChange={(e) => set("kampus", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" /></FField>
                  <FField label="Divisi / Jurusan"><input value={form.jurusan || ""} onChange={(e) => set("jurusan", e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm" /></FField>
                </>}
              </div>
            )}

            {modal !== "view" && (
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setModal(null)} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm">Batal</button>
                <button onClick={simpan} disabled={busy} className="px-5 py-2.5 rounded-lg bg-telkomRed text-white text-sm font-medium hover:brightness-110 disabled:opacity-50">
                  {busy ? "Menyimpan..." : modal === "create" ? "Buat Akun" : "Simpan"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, iconBg }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-bold text-navy-900 mt-1.5">{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
  );
}
function IconBtn({ children, onClick, title, danger }: any) {
  return (
    <button onClick={onClick} title={title} className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 ${danger ? "hover:text-telkomRed" : "hover:text-navy-800"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{children}</svg>
    </button>
  );
}
function FField({ label, children }: any) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>{children}</div>;
}
function Info({ label, val }: any) {
  return <div className="flex justify-between border-b border-gray-50 pb-2"><span className="text-gray-500">{label}</span><span className="font-medium text-navy-900 capitalize">{val}</span></div>;
}

export default function AdminPage() {
  return <Protected allow={["admin", "pembimbing"]}><AdminInner /></Protected>;
}