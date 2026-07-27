"use client";
import { useState, useEffect, useRef } from "react";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { Pesan } from "@/components/ui";
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
  const [pesan, setPesan] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profil) {
      setForm({ name: profil.name || "", nim: profil.nim || "", kampus: profil.kampus || "", jurusan: profil.jurusan || "" });
      setFoto(profil.foto);
    }
  }, [profil]);

  if (!profil) return null;
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
    setBusy(true);
    try {
      const data: any = { name: form.name, foto: foto || "" };
      if (profil.role === "magang") { data.nim = form.nim; data.kampus = form.kampus; data.jurusan = form.jurusan; }
      await updateDoc(doc(db, "users", profil.uid), data);

      if (pass.baru) {
        if (pass.baru.length < 6) { setPesan({ t: "err", s: "Password minimal 6 karakter." }); setBusy(false); return; }
        if (pass.baru !== pass.konfirmasi) { setPesan({ t: "err", s: "Konfirmasi password tidak cocok." }); setBusy(false); return; }
        if (auth.currentUser) await updatePassword(auth.currentUser, pass.baru);
      }

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
    <div className="max-w-2xl mx-auto">
      <div className="anim-fade-up">
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mb-1">Edit Profil</h1>
        <p className="text-sm text-gray-500 mb-5">Perbarui foto, data akun, dan password kamu.</p>
      </div>

      <div className="card overflow-hidden anim-fade-up d-1">
        {/* Banner + avatar */}
        <div className="h-24 bg-gradient-to-r from-navy-900 to-navy-700 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5 anim-float" />
        </div>
        <div className="px-5 sm:px-6 pb-6">
          <div className="-mt-12">
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
            <div className="mt-3">
              <p className="font-semibold text-navy-900">{form.name || "Tanpa Nama"}</p>
              <p className="text-sm text-gray-500 break-all">{profil.email}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs px-2 py-0.5 rounded-full bg-navy-800 text-white capitalize">{profil.role}</span>
                {foto && (
                  <button onClick={() => setFoto(undefined)} className="text-xs text-gray-400 hover:text-telkomRed press">Hapus foto</button>
                )}
              </div>
            </div>
          </div>

          {pesan && <div className="my-4"><Pesan tipe={pesan.t}>{pesan.s}</Pesan></div>}

          <div className="mt-6">
            <Field label="Nama Lengkap" value={form.name} onChange={(v: string) => set("name", v)} />
            {profil.role === "magang" && (
              <div className="grid sm:grid-cols-2 gap-x-3">
                <Field label="NIM" value={form.nim} onChange={(v: string) => set("nim", v)} />
                <Field label="Kampus" value={form.kampus} onChange={(v: string) => set("kampus", v)} />
                <Field label="Jurusan / Divisi" value={form.jurusan} onChange={(v: string) => set("jurusan", v)} />
              </div>
            )}
          </div>

          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-sm font-medium text-navy-900 mb-1">Ganti Password</p>
            <p className="text-xs text-gray-500 mb-3">Kosongkan jika tidak ingin mengubah.</p>
            <div className="grid sm:grid-cols-2 gap-x-3">
              <Field label="Password Baru" type="password" value={pass.baru} onChange={(v: string) => setPass({ ...pass, baru: v })} />
              <Field label="Konfirmasi Password" type="password" value={pass.konfirmasi} onChange={(v: string) => setPass({ ...pass, konfirmasi: v })} />
            </div>
          </div>

          <button onClick={simpan} disabled={busy}
            className="mt-6 w-full sm:w-auto flex items-center justify-center gap-2 bg-telkomRed text-white px-6 py-4 sm:py-3 rounded-2xl font-semibold press hover:brightness-110 disabled:opacity-50 shadow-lift">
            {busy ? (<><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Menyimpan...</>) : "Simpan Perubahan"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: any) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3.5 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition" />
    </div>
  );
}

export default function ProfilPage() {
  return <Protected><ProfilInner /></Protected>;
}
