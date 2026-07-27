"use client";
import { useState, useEffect, useMemo } from "react";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Kosong, Skeleton } from "@/components/ui";
import { pesanError } from "@/lib/users";
import {
  ajukanIzin, prosesIzin, batalkanIzin, izinSaya, semuaIzin,
  labelRentang, GAYA_STATUS, LABEL_JENIS, Izin, JenisIzin,
} from "@/lib/izin";

const inp =
  "w-full border border-gray-200 rounded-xl px-3.5 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition";

const hariIni = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function IzinInner() {
  const { profil } = useAuth();
  const pembina = profil?.role === "admin" || profil?.role === "pembimbing";

  const [daftar, setDaftar] = useState<Izin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [tapis, setTapis] = useState<"semua" | "menunggu" | "disetujui" | "ditolak">("semua");

  // Form pengajuan (magang)
  const [buka, setBuka] = useState(false);
  const [form, setForm] = useState({
    jenis: "izin" as JenisIzin,
    tanggalMulai: hariIni(),
    tanggalSelesai: hariIni(),
    alasan: "",
  });

  const muat = async () => {
    if (!profil) return;
    setLoading(true);
    try {
      setDaftar(pembina ? await semuaIzin() : await izinSaya(profil.uid));
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { muat(); }, [profil?.uid]);

  const tampil = useMemo(
    () => (tapis === "semua" ? daftar : daftar.filter((i) => i.status === tapis)),
    [daftar, tapis]
  );
  const menunggu = daftar.filter((i) => i.status === "menunggu").length;

  const kirim = async () => {
    setPesan(null);
    if (form.alasan.trim().length < 5) {
      setPesan({ t: "err", s: "Tuliskan alasan minimal 5 karakter." });
      return;
    }
    setBusy("ajukan");
    try {
      const r = await ajukanIzin({
        jenis: form.jenis,
        alasan: form.alasan.trim(),
        tanggalMulai: form.tanggalMulai,
        tanggalSelesai: form.tanggalSelesai || form.tanggalMulai,
      });
      setPesan({ t: "ok", s: `Pengajuan ${r.jumlahHari} hari terkirim. Menunggu persetujuan pembimbing.` });
      setForm({ ...form, alasan: "" });
      setBuka(false);
      muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  const putuskan = async (id: string, keputusan: "disetujui" | "ditolak") => {
    setPesan(null);
    setBusy(id);
    try {
      const r = await prosesIzin(id, keputusan);
      setPesan({
        t: "ok",
        s: keputusan === "disetujui"
          ? `Disetujui. ${r.dicatat} hari tercatat di riwayat kehadiran.`
          : "Pengajuan ditolak.",
      });
      muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  const batal = async (id: string) => {
    setBusy(id);
    try {
      await batalkanIzin(id);
      setPesan({ t: "ok", s: "Pengajuan dibatalkan." });
      muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="anim-fade-up">
        <span className="text-[11px] font-semibold tracking-widest uppercase text-gray-400">Ketidakhadiran</span>
        <h1 className="text-xl sm:text-2xl font-bold text-navy-900 mt-1">
          {pembina ? "Persetujuan Izin" : "Izin & Sakit"}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {pembina
            ? "Tinjau pengajuan peserta magang. Yang disetujui langsung tercatat di riwayat kehadiran."
            : "Ajukan izin atau sakit agar ketidakhadiranmu tercatat resmi, bukan dianggap alpa."}
        </p>
      </div>

      {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

      {/* Form pengajuan — hanya magang */}
      {!pembina && (
        <div className="card overflow-hidden anim-fade-up d-1">
          <button onClick={() => setBuka((v) => !v)} className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left press">
            <span className="w-10 h-10 rounded-xl bg-telkomRed text-white flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <div className="flex-1">
              <p className="font-semibold text-navy-900 text-sm sm:text-base">Ajukan Izin Baru</p>
              <p className="text-xs text-gray-500 mt-0.5">Izin keperluan pribadi atau sakit</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-gray-400 transition-transform duration-200 ${buka ? "rotate-180" : ""}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {buka && (
            <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 pt-4 space-y-3 anim-fade-up">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Jenis</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["izin", "sakit"] as JenisIzin[]).map((j) => (
                    <button key={j} onClick={() => setForm({ ...form, jenis: j })}
                      className={`py-3 rounded-xl text-sm font-medium border transition press ${
                        form.jenis === j
                          ? "bg-navy-900 text-white border-navy-900"
                          : "bg-white text-navy-900 border-gray-200"
                      }`}>
                      {LABEL_JENIS[j]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Dari tanggal</label>
                  <input type="date" value={form.tanggalMulai}
                    onChange={(e) => setForm({ ...form, tanggalMulai: e.target.value })} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Sampai tanggal</label>
                  <input type="date" value={form.tanggalSelesai} min={form.tanggalMulai}
                    onChange={(e) => setForm({ ...form, tanggalSelesai: e.target.value })} className={inp} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Alasan</label>
                <textarea rows={3} value={form.alasan} maxLength={500}
                  onChange={(e) => setForm({ ...form, alasan: e.target.value })}
                  placeholder="Contoh: Demam sejak semalam, sudah periksa ke klinik."
                  className={inp + " resize-none"} />
                <p className="text-[11px] text-gray-400 mt-1 text-right">{form.alasan.length}/500</p>
              </div>

              <button onClick={kirim} disabled={busy === "ajukan"}
                className="w-full py-4 rounded-2xl bg-telkomRed text-white font-semibold press disabled:opacity-50 shadow-lift">
                {busy === "ajukan" ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tapis status */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar anim-fade-up d-2">
        {(["semua", "menunggu", "disetujui", "ditolak"] as const).map((t) => (
          <button key={t} onClick={() => setTapis(t)}
            className={`px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition press ${
              tapis === t ? "bg-navy-900 text-white border-navy-900" : "bg-white text-gray-600 border-gray-200"
            }`}>
            <span className="capitalize">{t}</span>
            {t === "menunggu" && menunggu > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tapis === t ? "bg-white/20" : "bg-amber-100 text-amber-700"
              }`}>{menunggu}</span>
            )}
          </button>
        ))}
      </div>

      {/* Daftar */}
      <div className="space-y-2.5">
        {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}

        {!loading && tampil.length === 0 && (
          <div className="card">
            <Kosong
              judul={tapis === "semua" ? "Belum ada pengajuan" : `Tidak ada yang ${tapis}`}
              pesan={pembina ? "Pengajuan dari peserta akan muncul di sini." : "Pengajuanmu akan muncul di sini."}
            />
          </div>
        )}

        {!loading && tampil.map((i, n) => {
          const g = GAYA_STATUS[i.status];
          return (
            <div key={i.id} className="card p-4 anim-fade-up" style={{ animationDelay: `${Math.min(n, 8) * 40}ms` }}>
              <div className="flex items-start gap-3">
                {pembina && <Avatar name={i.nama} size={38} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {pembina && <p className="font-semibold text-sm text-navy-900">{i.nama}</p>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      i.jenis === "sakit" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>{LABEL_JENIS[i.jenis].toUpperCase()}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.kelas}`}>{g.teks}</span>
                  </div>
                  <p className="text-sm text-navy-900 mt-1.5 font-medium">
                    {labelRentang(i.tanggalMulai, i.tanggalSelesai)}
                    <span className="text-gray-400 font-normal"> · {i.jumlahHari} hari</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-1 break-words">{i.alasan}</p>
                  {i.status !== "menunggu" && i.namaPemroses && (
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      Diproses oleh {i.namaPemroses}
                    </p>
                  )}
                </div>
              </div>

              {/* Aksi */}
              {pembina && i.status === "menunggu" && (
                <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3.5 border-t border-gray-50">
                  <button onClick={() => putuskan(i.id, "ditolak")} disabled={busy === i.id}
                    className="py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press disabled:opacity-50">
                    Tolak
                  </button>
                  <button onClick={() => putuskan(i.id, "disetujui")} disabled={busy === i.id}
                    className="py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold press disabled:opacity-50">
                    {busy === i.id ? "Memproses..." : "Setujui"}
                  </button>
                </div>
              )}

              {!pembina && i.status === "menunggu" && (
                <button onClick={() => batal(i.id)} disabled={busy === i.id}
                  className="w-full mt-3.5 pt-3.5 border-t border-gray-50 text-sm text-gray-500 press disabled:opacity-50">
                  {busy === i.id ? "Membatalkan..." : "Batalkan pengajuan"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-gray-400 anim-fade-up d-4">
        Pengajuan yang disetujui otomatis tercatat sebagai {LABEL_JENIS.izin.toLowerCase()} atau {LABEL_JENIS.sakit.toLowerCase()} di riwayat kehadiran.
      </p>
    </div>
  );
}

export default function IzinPage() {
  return <Protected><IzinInner /></Protected>;
}
