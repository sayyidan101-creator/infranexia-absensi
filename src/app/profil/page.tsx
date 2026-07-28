"use client";
import { useState, useEffect, useRef } from "react";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import CincinProgres from "@/components/CincinProgres";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Skeleton, KepalaHalaman } from "@/components/ui";
import { gaya, URUTAN } from "@/lib/status";
import { batasBulan, riwayatRentang, hitungRekap, Rekap } from "@/lib/absensi";
import { doc, updateDoc } from "firebase/firestore";
import { updatePassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

// Resize + kompres gambar menjadi data URL kecil (disimpan di Firestore)
function fileKeBase64(file: File, maks = 256): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const scale = Math.min(1, maks / Math.max(width, height));
        width = Math.round(width * scale); height = Math.round(height * scale);
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        res(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = rej;
      img.src = reader.result as string;
    };
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function ProfilInner() {
  const { profil } = useAuth();
  const [form, setForm] = useState({ name: "", nim: "", kampus: "", jurusan: "" });
  const [foto, setFoto] = useState<string | undefined>(undefined);
  const [pass, setPass] = useState({ baru: "", konfirmasi: "" });
  const [lihatPass, setLihatPass] = useState(false);
  const [pesan, setPesan] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ringkasan kehadiran bulan berjalan — hanya relevan bagi peserta
  const [rekap, setRekap] = useState<Rekap | null>(null);

  useEffect(() => {
    if (profil) {
      setForm({ name: profil.name || "", nim: profil.nim || "", kampus: profil.kampus || "", jurusan: profil.jurusan || "" });
      setFoto(profil.foto);
    }
  }, [profil]);

  useEffect(() => {
    if (!profil || profil.role !== "magang") return;
    let batal = false;
    const kini = new Date();
    const { dari, sampai } = batasBulan(kini.getFullYear(), kini.getMonth() + 1);
    riwayatRentang(profil.uid, dari, sampai)
      .then((d) => { if (!batal) setRekap(hitungRekap(d)); })
      .catch(() => { if (!batal) setRekap(null); });
    return () => { batal = true; };
  }, [profil?.uid, profil?.role]);

  if (!profil) return null;
  const magang = profil.role === "magang";
  const punyaKartu = !!(profil as any).kartuTerdaftar;
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const pilihFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setPesan({ t: "err", s: "Ukuran foto maksimal 5 MB." }); return; }
    try {
      const b64 = await fileKeBase64(f);
      setFoto(b64);
      setPesan(null);
    } catch { setPesan({ t: "err", s: "Gagal memproses gambar." }); }
  };

  const simpan = async () => {
    setPesan(null);
    if (!form.name.trim()) { setPesan({ t: "err", s: "Nama tidak boleh kosong." }); return; }
    if (pass.baru) {
      if (pass.baru.length < 6) { setPesan({ t: "err", s: "Password minimal 6 karakter." }); return; }
      if (pass.baru !== pass.konfirmasi) { setPesan({ t: "err", s: "Konfirmasi password tidak cocok." }); return; }
    }
    setBusy(true);
    try {
      const data: any = { name: form.name, foto: foto || "" };
      if (magang) { data.nim = form.nim; data.kampus = form.kampus; data.jurusan = form.jurusan; }
      await updateDoc(doc(db, "users", profil.uid), data);

      if (pass.baru && auth.currentUser) await updatePassword(auth.currentUser, pass.baru);

      setPesan({ t: "ok", s: "Profil berhasil diperbarui." });
      setPass({ baru: "", konfirmasi: "" });
      if (navigator.vibrate) navigator.vibrate(20);
      setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      const s = e?.code === "auth/requires-recent-login"
        ? "Untuk ganti password, silakan logout lalu login kembali, baru coba lagi."
        : (e?.message || "Gagal menyimpan.");
      setPesan({ t: "err", s });
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-5">
      <KepalaHalaman
        atas="Akun"
        judul="Profil Saya"
        keterangan="Perbarui foto, data diri, dan password akunmu."
      />

      {/* ---------- KARTU IDENTITAS ---------- */}
      <div className="card overflow-hidden anim-fade-up d-1">
        <div className="h-24 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-700 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5 anim-float" />
          <div className="absolute -left-4 bottom-0 w-24 h-24 rounded-full bg-white/5" />
        </div>
        <div className="px-5 sm:px-6 pb-5">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <div className="relative inline-block">
              <div className="ring-4 ring-white rounded-full inline-block anim-pop">
                <Avatar name={form.name} foto={foto} size={92} />
              </div>
              <button onClick={() => fileRef.current?.click()} title="Ubah foto" aria-label="Ubah foto"
                className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-telkomRed text-white flex items-center justify-center shadow-md ring-2 ring-white press hover:brightness-110">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pilihFoto} />
            </div>
            {foto && (
              <button onClick={() => setFoto(undefined)}
                className="text-xs text-gray-400 hover:text-telkomRed press pb-1">Hapus foto</button>
            )}
          </div>

          <div className="mt-3">
            <p className="text-lg font-bold text-navy-900">{form.name || "Tanpa Nama"}</p>
            <p className="text-sm text-gray-500 break-all">{profil.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-navy-800 text-white capitalize">{profil.role}</span>
              {magang && (
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  punyaKartu ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                }`}>
                  {punyaKartu ? "Kartu absen aktif" : "Kartu absen belum terbit"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

      {/* ---------- RINGKASAN KEHADIRAN ---------- */}
      {magang && (
        <div className="card p-5 anim-fade-up d-2">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Kehadiran bulan ini</p>
          {!rekap ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : (
            <div className="flex items-center gap-5">
              <CincinProgres
                nilai={rekap.persenKehadiran}
                ukuran={92} tebal={8}
                warnaLatar="#eef2f7"
                warna={rekap.persenKehadiran >= 80 ? "#10b981" : rekap.persenKehadiran >= 60 ? "#fbbf24" : "#e32118"}
                anak={
                  <>
                    <span className="text-xl font-bold text-navy-900 tabular-nums">{rekap.persenKehadiran}%</span>
                    <span className="text-[9px] uppercase tracking-wide text-gray-400 mt-0.5">hadir</span>
                  </>
                }
              />
              <div className="min-w-0 flex-1 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-gray-500">
                {URUTAN.map((s) => {
                  const n = { hadir: rekap.hadir, terlambat: rekap.terlambat, izin: rekap.izin, sakit: rekap.sakit, alpha: rekap.alpha }[s];
                  const g = gaya(s);
                  return (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <i className={`w-2 h-2 rounded-full shrink-0 ${g.titik}`} />
                      {g.panjang}
                      <b className="text-navy-900 tabular-nums">{n}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {!punyaKartu && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mt-4">
              Kartu absenmu belum diterbitkan. Hubungi admin — tanpa kartu, kehadiranmu tidak bisa tercatat.
            </p>
          )}
        </div>
      )}

      {/* ---------- DATA DIRI ---------- */}
      <div className="card p-5 anim-fade-up d-3">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Data diri</p>
        <Field label="Nama Lengkap" value={form.name} onChange={(v: string) => set("name", v)} />
        {magang && (
          <div className="grid sm:grid-cols-2 gap-x-3">
            <Field label="NIM" value={form.nim} onChange={(v: string) => set("nim", v)} />
            <Field label="Kampus" value={form.kampus} onChange={(v: string) => set("kampus", v)} />
            <Field label="Jurusan / Divisi" value={form.jurusan} onChange={(v: string) => set("jurusan", v)} />
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-1">
          Email login hanya bisa diubah admin lewat menu Kelola.
        </p>
      </div>

      {/* ---------- KEAMANAN ---------- */}
      <div className="card p-5 anim-fade-up d-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <p className="text-xs uppercase tracking-widest text-gray-400">Ganti password</p>
          <button onClick={() => setLihatPass((v) => !v)}
            className="text-[11px] font-medium text-gray-500 press">
            {lihatPass ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Kosongkan kalau tidak ingin mengubah.</p>
        <div className="grid sm:grid-cols-2 gap-x-3">
          <Field label="Password Baru" type={lihatPass ? "text" : "password"}
            value={pass.baru} onChange={(v: string) => setPass({ ...pass, baru: v })} />
          <Field label="Konfirmasi Password" type={lihatPass ? "text" : "password"}
            value={pass.konfirmasi} onChange={(v: string) => setPass({ ...pass, konfirmasi: v })} />
        </div>
        {pass.baru && (
          <p className={`text-[11px] mt-1 ${
            pass.baru.length < 6 ? "text-telkomRed"
              : pass.konfirmasi && pass.baru !== pass.konfirmasi ? "text-telkomRed"
              : "text-emerald-600"
          }`}>
            {pass.baru.length < 6
              ? "Password minimal 6 karakter."
              : pass.konfirmasi && pass.baru !== pass.konfirmasi
              ? "Konfirmasi belum cocok."
              : "Password siap disimpan."}
          </p>
        )}
      </div>

      <button onClick={simpan} disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-telkomRed text-white px-6 py-4 rounded-2xl font-semibold press hover:brightness-110 disabled:opacity-50 shadow-lift anim-fade-up d-5">
        {busy
          ? (<><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Menyimpan...</>)
          : "Simpan Perubahan"}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: any) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition" />
    </div>
  );
}

export default function ProfilPage() {
  return <Protected><ProfilInner /></Protected>;
}
