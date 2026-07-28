"use client";
import { useState, useEffect, useMemo } from "react";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import Sheet from "@/components/Sheet";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Kosong, Skeleton, Segmen, KepalaHalaman } from "@/components/ui";
import { pesanError } from "@/lib/users";
import {
  ajukanIzin, prosesIzin, batalkanIzin, izinSaya, semuaIzin,
  labelRentang, GAYA_STATUS, LABEL_JENIS, Izin, JenisIzin, StatusIzin,
} from "@/lib/izin";

const inp =
  "w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition";

const hariIni = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const geser = (tanggal: string, hari: number) => {
  const d = new Date(tanggal + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
};

const selisihHari = (a: string, b: string) => {
  const x = new Date(a + "T00:00:00Z").getTime();
  const y = new Date(b + "T00:00:00Z").getTime();
  if (isNaN(x) || isNaN(y) || y < x) return 0;
  return Math.round((y - x) / 86400000) + 1;
};

type Tapis = "semua" | StatusIzin;

function IzinInner() {
  const { profil } = useAuth();
  const pembina = profil?.role === "admin" || profil?.role === "pembimbing";

  const [daftar, setDaftar] = useState<Izin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [tapis, setTapis] = useState<Tapis>("semua");

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

  const menunggu = useMemo(() => daftar.filter((i) => i.status === "menunggu"), [daftar]);
  const tampil = useMemo(
    () => (tapis === "semua" ? daftar : daftar.filter((i) => i.status === tapis)),
    [daftar, tapis]
  );
  const jumlahHari = selisihHari(form.tanggalMulai, form.tanggalSelesai || form.tanggalMulai);

  const bukaForm = () => {
    setForm({ jenis: "izin", tanggalMulai: hariIni(), tanggalSelesai: hariIni(), alasan: "" });
    setPesan(null);
    setBuka(true);
  };

  const pilihCepat = (mulai: string, hari: number) => {
    setForm((f) => ({ ...f, tanggalMulai: mulai, tanggalSelesai: geser(mulai, hari - 1) }));
  };

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
      setBuka(false);
      setPesan({ t: "ok", s: `Pengajuan ${r.jumlahHari} hari terkirim. Menunggu persetujuan pembimbing.` });
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

  const kartu = (i: Izin, n: number) => (
    <KartuIzin
      key={i.id} izin={i} indeks={n} pembina={!!pembina} sibuk={busy === i.id}
      onSetuju={() => putuskan(i.id, "disetujui")}
      onTolak={() => putuskan(i.id, "ditolak")}
      onBatal={() => batal(i.id)}
    />
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <KepalaHalaman
        atas="Ketidakhadiran"
        judul={pembina ? "Persetujuan Izin" : "Izin & Sakit"}
        keterangan={pembina
          ? "Tinjau pengajuan peserta magang. Yang disetujui langsung tercatat di riwayat kehadiran."
          : "Ajukan izin atau sakit agar ketidakhadiranmu tercatat resmi, bukan dianggap alpa."}
        aksi={!pembina ? (
          <button onClick={bukaForm}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-telkomRed text-white text-sm font-semibold press shadow-lift hover:brightness-110">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Ajukan Izin
          </button>
        ) : undefined}
      />

      {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

      {/* Yang menunggu keputusan diangkat ke atas — itulah pekerjaan pembimbing */}
      {pembina && !loading && menunggu.length > 0 && tapis === "semua" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 anim-fade-up d-1">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            </span>
            <div>
              <p className="font-semibold text-navy-900 text-sm">Menunggu keputusanmu</p>
              <p className="text-[11px] text-amber-700/80">
                {menunggu.length} pengajuan dari {new Set(menunggu.map((i) => i.userId)).size} peserta.
              </p>
            </div>
          </div>
          <div className="space-y-2.5">{menunggu.map(kartu)}</div>
        </div>
      )}

      {/* Tapis status */}
      <div className="anim-fade-up d-2 overflow-x-auto no-scrollbar">
        <Segmen<Tapis>
          nilai={tapis}
          ubah={setTapis}
          opsi={[
            { nilai: "semua", label: "Semua" },
            { nilai: "menunggu", label: "Menunggu", lencana: menunggu.length },
            { nilai: "disetujui", label: "Disetujui" },
            { nilai: "ditolak", label: "Ditolak" },
          ]}
        />
      </div>

      {/* Daftar */}
      <div className="space-y-2.5">
        {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}

        {!loading && tampil.length === 0 && (
          <div className="card">
            <Kosong
              judul={tapis === "semua" ? "Belum ada pengajuan" : `Tidak ada yang ${tapis}`}
              pesan={pembina ? "Pengajuan dari peserta akan muncul di sini." : "Ketuk Ajukan Izin untuk membuat pengajuan pertama."}
            />
          </div>
        )}

        {!loading && tampil.map(kartu)}
      </div>

      <p className="text-center text-[11px] text-gray-400 anim-fade-up d-4 pb-2">
        Pengajuan yang disetujui otomatis tercatat sebagai izin atau sakit di riwayat kehadiran.
      </p>

      {/* ---------- FORM PENGAJUAN ---------- */}
      <Sheet
        buka={buka}
        tutup={() => setBuka(false)}
        judul="Ajukan Izin"
        footer={
          <button onClick={kirim} disabled={busy === "ajukan" || form.alasan.trim().length < 5}
            className="w-full py-3.5 rounded-xl bg-telkomRed text-white font-semibold press disabled:opacity-40 shadow-lift">
            {busy === "ajukan" ? "Mengirim..." : `Kirim Pengajuan · ${jumlahHari} hari`}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Jenis</label>
            <div className="grid grid-cols-2 gap-2">
              {(["izin", "sakit"] as JenisIzin[]).map((j) => {
                const aktif = form.jenis === j;
                return (
                  <button key={j} onClick={() => setForm({ ...form, jenis: j })}
                    className={`flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium border transition press ${
                      aktif ? "bg-navy-900 text-white border-navy-900" : "bg-white text-navy-900 border-gray-200"
                    }`}>
                    {j === "sakit" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 2h2v4h4v2h-4v4h-2V8H7V6h4z" /><path d="M4 14h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    )}
                    {LABEL_JENIS[j]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Pilihan cepat</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Hari ini", mulai: hariIni(), hari: 1 },
                { label: "Besok", mulai: geser(hariIni(), 1), hari: 1 },
                { label: "3 hari", mulai: hariIni(), hari: 3 },
                { label: "Sepekan", mulai: hariIni(), hari: 7 },
              ].map((p) => {
                const aktif = form.tanggalMulai === p.mulai && form.tanggalSelesai === geser(p.mulai, p.hari - 1);
                return (
                  <button key={p.label} onClick={() => pilihCepat(p.mulai, p.hari)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-medium border transition press ${
                      aktif ? "bg-navy-900 text-white border-navy-900" : "bg-white text-gray-600 border-gray-200"
                    }`}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Dari tanggal</label>
              <input type="date" value={form.tanggalMulai}
                onChange={(e) => setForm({
                  ...form,
                  tanggalMulai: e.target.value,
                  // Tanggal selesai ikut maju kalau jadi lebih awal dari tanggal mulai
                  tanggalSelesai: e.target.value > form.tanggalSelesai ? e.target.value : form.tanggalSelesai,
                })} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Sampai tanggal</label>
              <input type="date" value={form.tanggalSelesai} min={form.tanggalMulai}
                onChange={(e) => setForm({ ...form, tanggalSelesai: e.target.value })} className={inp} />
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3 text-sm text-navy-900">
            {labelRentang(form.tanggalMulai, form.tanggalSelesai || form.tanggalMulai)}
            <span className="text-gray-400"> · {jumlahHari} hari</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Alasan</label>
            <textarea rows={3} value={form.alasan} maxLength={500}
              onChange={(e) => setForm({ ...form, alasan: e.target.value })}
              placeholder="Contoh: Demam sejak semalam, sudah periksa ke klinik."
              className={inp + " resize-none"} />
            <div className="flex justify-between gap-3 mt-1">
              <p className="text-[11px] text-gray-400">
                {form.alasan.trim().length < 5 ? "Minimal 5 karakter." : "Alasan yang jelas mempercepat persetujuan."}
              </p>
              <p className="text-[11px] text-gray-400 shrink-0">{form.alasan.length}/500</p>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** Satu pengajuan izin. */
function KartuIzin({
  izin: i, indeks, pembina, sibuk, onSetuju, onTolak, onBatal,
}: {
  izin: Izin;
  indeks: number;
  pembina: boolean;
  sibuk: boolean;
  onSetuju: () => void;
  onTolak: () => void;
  onBatal: () => void;
}) {
  const g = GAYA_STATUS[i.status];
  const sakit = i.jenis === "sakit";

  return (
    <div className="card p-4 anim-fade-up" style={{ animationDelay: `${Math.min(indeks, 8) * 40}ms` }}>
      <div className="flex items-start gap-3">
        {pembina ? (
          <Avatar name={i.nama} size={38} />
        ) : (
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            sakit ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
          }`}>
            {sakit ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 2h2v4h4v2h-4v4h-2V8H7V6h4z" /><path d="M4 14h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            )}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {pembina && <p className="font-semibold text-sm text-navy-900">{i.nama}</p>}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              sakit ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
            }`}>{LABEL_JENIS[i.jenis].toUpperCase()}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.kelas}`}>{g.teks}</span>
          </div>
          <p className="text-sm text-navy-900 mt-1.5 font-medium">
            {labelRentang(i.tanggalMulai, i.tanggalSelesai)}
            <span className="text-gray-400 font-normal"> · {i.jumlahHari} hari</span>
          </p>
          <p className="text-sm text-gray-600 mt-1 break-words">{i.alasan}</p>
          {i.status !== "menunggu" && i.namaPemroses && (
            <p className="text-[11px] text-gray-400 mt-1.5">Diproses oleh {i.namaPemroses}</p>
          )}
        </div>
      </div>

      {pembina && i.status === "menunggu" && (
        <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3.5 border-t border-gray-50">
          <button onClick={onTolak} disabled={sibuk}
            className="py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-navy-900 press disabled:opacity-50">
            Tolak
          </button>
          <button onClick={onSetuju} disabled={sibuk}
            className="py-3 rounded-xl bg-emerald-500 text-white text-sm font-semibold press disabled:opacity-50">
            {sibuk ? "Memproses..." : "Setujui"}
          </button>
        </div>
      )}

      {!pembina && i.status === "menunggu" && (
        <button onClick={onBatal} disabled={sibuk}
          className="w-full mt-3.5 pt-3.5 border-t border-gray-50 text-sm text-gray-500 press disabled:opacity-50">
          {sibuk ? "Membatalkan..." : "Batalkan pengajuan"}
        </button>
      )}
    </div>
  );
}

export default function IzinPage() {
  return <Protected><IzinInner /></Protected>;
}
