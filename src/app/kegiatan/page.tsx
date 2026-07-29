"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import Sheet from "@/components/Sheet";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Kosong, Skeleton, Segmen, KepalaHalaman } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { kecilkanGambar, ukuranKb } from "@/lib/gambar";
import { cetakHtml } from "@/lib/ekspor";
import { logbookHtml } from "@/lib/logbook";
import { tanggalHariIni, geserHari, batasBulan } from "@/lib/absensi";
import {
  simpanKegiatan, hapusFotoKegiatan, periksaKegiatan, fotoKegiatan,
  kegiatanPeserta, kegiatanSemua, GAYA_KEGIATAN, MAKS_HARI_MUNDUR, Kegiatan,
} from "@/lib/aktivitas";

const tglPanjang = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
};
const tglPendek = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
};

type TapisPembina = "semua" | "menunggu";

function KegiatanInner() {
  const { profil } = useAuth();
  const isPembina = profil?.role !== "magang";

  const [daftar, setDaftar] = useState<Kegiatan[]>([]);
  const [loading, setLoading] = useState(true);
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [sibuk, setSibuk] = useState("");
  const [tapis, setTapis] = useState<TapisPembina>("semua");

  // Rentang yang ditanyakan ke Firestore
  const kini = new Date();
  const [rentang] = useState(() => batasBulan(kini.getFullYear(), kini.getMonth() + 1));

  // ---- Penulisan oleh peserta ----
  const [tulisBuka, setTulisBuka] = useState(false);
  const [form, setForm] = useState({ tanggal: tanggalHariIni(), kegiatan: "", kendala: "" });
  const [foto, setFoto] = useState("");
  const [fotoLama, setFotoLama] = useState(false);
  const berkasRef = useRef<HTMLInputElement>(null);

  // ---- Pemeriksaan oleh pembimbing ----
  const [dibuka, setDibuka] = useState<Kegiatan | null>(null);
  const [fotoDibuka, setFotoDibuka] = useState<string>("");
  const [catatan, setCatatan] = useState("");

  const muat = async () => {
    if (!profil) return;
    setLoading(true);
    try {
      setDaftar(
        isPembina
          ? await kegiatanSemua(rentang.dari, rentang.sampai)
          : await kegiatanPeserta(profil.uid, geserHari(rentang.dari, -60), rentang.sampai)
      );
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setLoading(false); }
  };
  useEffect(() => { muat(); }, [profil?.uid]);

  const petaTanggal = useMemo(() => {
    const m = new Map<string, Kegiatan>();
    if (!isPembina) daftar.forEach((k) => m.set(k.tanggal, k));
    return m;
  }, [daftar, isPembina]);

  const tampil = useMemo(
    () => (isPembina && tapis === "menunggu" ? daftar.filter((k) => k.status !== "diperiksa") : daftar),
    [daftar, isPembina, tapis]
  );
  const menunggu = daftar.filter((k) => k.status !== "diperiksa").length;

  // ---------------- Peserta ----------------

  const bukaTulis = async (tanggal: string) => {
    const ada = petaTanggal.get(tanggal);
    setForm({ tanggal, kegiatan: ada?.kegiatan || "", kendala: ada?.kendala || "" });
    setFoto("");
    setFotoLama(!!ada?.adaFoto);
    setPesan(null);
    setTulisBuka(true);
  };

  const pilihFoto = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    setSibuk("foto");
    try {
      setFoto(await kecilkanGambar(f, { maksSisi: 640, maksByte: 200_000 }));
      setPesan(null);
    } catch (e: any) {
      setPesan({ t: "err", s: e?.message || "Gagal memproses gambar." });
    } finally {
      setSibuk("");
      if (berkasRef.current) berkasRef.current.value = "";
    }
  };

  const simpan = async () => {
    setSibuk("simpan"); setPesan(null);
    try {
      await simpanKegiatan({
        tanggal: form.tanggal,
        kegiatan: form.kegiatan,
        kendala: form.kendala,
        foto: foto || undefined,
      });
      setTulisBuka(false);
      setPesan({ t: "ok", s: `Catatan ${tglPendek(form.tanggal)} tersimpan.` });
      await muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const buangFoto = async () => {
    if (foto) { setFoto(""); return; }
    setSibuk("hapusFoto");
    try {
      await hapusFotoKegiatan(form.tanggal);
      setFotoLama(false);
      await muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  // ---------------- Pembimbing ----------------

  const bukaPeriksa = async (k: Kegiatan) => {
    setDibuka(k);
    setCatatan(k.catatanPembimbing || "");
    setFotoDibuka("");
    if (k.adaFoto) {
      // Baru diambil sekarang — inilah gunanya foto disimpan terpisah
      fotoKegiatan(k.userId, k.tanggal).then(setFotoDibuka).catch(() => undefined);
    }
  };

  const tandai = async (batal = false) => {
    if (!dibuka) return;
    setSibuk("periksa");
    try {
      await periksaKegiatan(dibuka.userId, dibuka.tanggal, catatan, batal);
      setDibuka(null);
      setPesan({ t: "ok", s: batal ? "Tanda periksa dicabut." : "Catatan ditandai sudah diperiksa." });
      await muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  // ---------------- Cetak logbook ----------------

  const cetakLogbook = async (uid: string, orang: any, judul: string) => {
    setSibuk("cetak"); setPesan(null);
    try {
      const catatanOrang = daftar.filter((k) => k.userId === uid);
      if (catatanOrang.length === 0) {
        setPesan({ t: "err", s: "Belum ada catatan kegiatan untuk dicetak." });
        return;
      }
      // Foto diambil satu per satu, hanya untuk catatan yang punya
      const berfoto = catatanOrang.filter((k) => k.adaFoto);
      const gambar = await Promise.all(
        berfoto.map((k) => fotoKegiatan(k.userId, k.tanggal).catch(() => ""))
      );
      const petaFoto: Record<string, string> = {};
      berfoto.forEach((k, i) => { if (gambar[i]) petaFoto[k.tanggal] = gambar[i]; });

      cetakHtml(
        "Logbook Kegiatan",
        logbookHtml({ orang, periode: judul, catatan: catatanOrang, foto: petaFoto })
      );
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  // Tujuh hari terakhir, untuk peserta mengisi cepat
  const hariTerakhir = useMemo(() => {
    const hari: string[] = [];
    for (let i = 0; i <= MAKS_HARI_MUNDUR; i++) hari.push(geserHari(tanggalHariIni(), -i));
    return hari;
  }, []);

  const periodeJudul = `${tglPendek(rentang.dari)} – ${tglPendek(rentang.sampai)} ${kini.getFullYear()}`;
  const sudahDiperiksa = dibuka?.status === "diperiksa";

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <KepalaHalaman
        atas="Logbook"
        judul={isPembina ? "Catatan Kegiatan" : "Kegiatan Harian"}
        keterangan={isPembina
          ? "Tinjau apa yang dikerjakan peserta setiap hari, beri catatan, lalu tandai sudah diperiksa."
          : "Tulis apa yang kamu kerjakan hari ini. Ini yang nanti jadi lampiran laporan magangmu."}
        aksi={!isPembina ? (
          <button onClick={() => cetakLogbook(profil!.uid, profil, periodeJudul)} disabled={!!sibuk}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-navy-900 press disabled:opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
            {sibuk === "cetak" ? "Menyiapkan..." : "Cetak Logbook"}
          </button>
        ) : undefined}
      />

      {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

      {/* ---------- PESERTA: isi cepat tujuh hari terakhir ---------- */}
      {!isPembina && (
        <div className="card p-4 sm:p-5 anim-fade-up d-1">
          <h2 className="font-semibold text-navy-900">Isi Catatan</h2>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Bisa mengisi mundur sampai {MAKS_HARI_MUNDUR} hari. Lewat dari itu tanggalnya terkunci.
          </p>

          <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
            {hariTerakhir.map((t, i) => {
              const ada = petaTanggal.get(t);
              const terkunci = ada?.status === "diperiksa";
              return (
                <button key={t} onClick={() => bukaTulis(t)}
                  className={`relative rounded-xl border p-2.5 text-left press transition ${
                    ada
                      ? terkunci
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-navy-900/15 bg-navy-900/[0.04]"
                      : "border-dashed border-gray-200 bg-white"
                  }`}>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">
                    {i === 0 ? "Hari ini" : i === 1 ? "Kemarin" : tglPendek(t)}
                  </p>
                  <p className={`text-xs font-semibold mt-1 ${ada ? "text-navy-900" : "text-gray-400"}`}>
                    {ada ? (terkunci ? "Diperiksa" : "Terisi") : "Belum diisi"}
                  </p>
                  {ada?.adaFoto && (
                    <span className="absolute top-2 right-2 text-gray-400" title="Ada bukti foto">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="12" cy="12" r="3" />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- PEMBIMBING: penyaring ---------- */}
      {isPembina && (
        <div className="flex items-center justify-between gap-3 flex-wrap anim-fade-up d-1">
          <Segmen<TapisPembina>
            nilai={tapis} ubah={setTapis}
            opsi={[
              { nilai: "semua", label: "Semua" },
              { nilai: "menunggu", label: "Belum diperiksa", lencana: menunggu },
            ]}
          />
          <button onClick={muat} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-[11px] font-medium text-navy-900 press disabled:opacity-50">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" />
            </svg>
            Perbarui
          </button>
        </div>
      )}

      {/* ---------- DAFTAR ---------- */}
      <div className="space-y-2.5">
        {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}

        {!loading && tampil.length === 0 && (
          <div className="card">
            <Kosong
              judul={isPembina ? "Belum ada catatan" : "Catatanmu masih kosong"}
              pesan={isPembina
                ? "Catatan kegiatan peserta akan muncul di sini."
                : "Mulai dari kotak “Hari ini” di atas."}
            />
          </div>
        )}

        {!loading && tampil.map((k, i) => {
          const g = GAYA_KEGIATAN[k.status] || GAYA_KEGIATAN.dikirim;
          return (
            <button key={k.id}
              onClick={() => (isPembina ? bukaPeriksa(k) : bukaTulis(k.tanggal))}
              className="w-full card p-4 text-left anim-fade-up press"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <div className="flex items-start gap-3">
                {isPembina && <Avatar name={k.nama || "?"} size={38} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isPembina && <p className="font-semibold text-sm text-navy-900">{k.nama}</p>}
                    <span className="text-xs text-gray-500">{tglPanjang(k.tanggal)}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.kelas}`}>{g.teks}</span>
                    {k.adaFoto && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="12" cy="12" r="3" />
                        </svg>
                        Foto
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-1.5 line-clamp-2 whitespace-pre-line">{k.kegiatan}</p>
                  {k.catatanPembimbing && (
                    <p className="text-xs text-blue-700 mt-1.5 line-clamp-1">
                      Catatan {k.namaPemeriksa || "pembimbing"}: {k.catatanPembimbing}
                    </p>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0 mt-1"><path d="m9 18 6-6-6-6" /></svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* ---------- SHEET: PESERTA MENULIS ---------- */}
      <Sheet
        buka={tulisBuka}
        tutup={() => setTulisBuka(false)}
        judul={tglPanjang(form.tanggal)}
        footer={
          <button onClick={simpan} disabled={!!sibuk || form.kegiatan.trim().length < 10}
            className="w-full py-3.5 rounded-xl bg-telkomRed text-white text-sm font-semibold press disabled:opacity-40 shadow-lift">
            {sibuk === "simpan" ? "Menyimpan..." : "Simpan Catatan"}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Apa yang kamu kerjakan hari ini?
            </label>
            <textarea rows={5} value={form.kegiatan} maxLength={1500}
              onChange={(e) => setForm({ ...form, kegiatan: e.target.value })}
              placeholder="Contoh: Membantu konfigurasi perangkat jaringan di ruang server, lalu mendokumentasikan hasilnya ke lembar inventaris."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700 resize-none" />
            <p className="text-[11px] text-gray-400 mt-1 text-right">{form.kegiatan.length}/1500</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Kendala <span className="text-gray-400">— boleh dikosongkan</span>
            </label>
            <textarea rows={2} value={form.kendala} maxLength={500}
              onChange={(e) => setForm({ ...form, kendala: e.target.value })}
              placeholder="Hal yang menghambat, kalau ada."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700 resize-none" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Bukti foto <span className="text-gray-400">— opsional</span>
            </label>

            {foto ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto} alt="Pratinjau bukti" className="w-full h-44 object-cover" />
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                  <span className="text-[11px] text-gray-500">{ukuranKb(foto)} KB</span>
                  <button onClick={buangFoto} className="text-[11px] font-semibold text-telkomRed press">
                    Hapus
                  </button>
                </div>
              </div>
            ) : fotoLama ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
                <span className="text-sm text-gray-600">Sudah ada foto tersimpan.</span>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => berkasRef.current?.click()} className="text-xs font-semibold text-navy-900 press">
                    Ganti
                  </button>
                  <button onClick={buangFoto} disabled={!!sibuk} className="text-xs font-semibold text-telkomRed press disabled:opacity-50">
                    {sibuk === "hapusFoto" ? "Menghapus..." : "Hapus"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => berkasRef.current?.click()} disabled={sibuk === "foto"}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 press disabled:opacity-50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="15" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M8 5l1.5-2h5L16 5" />
                </svg>
                {sibuk === "foto" ? "Memproses..." : "Ambil atau pilih foto"}
              </button>
            )}

            <input ref={berkasRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={pilihFoto} />
            <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
              Fotonya dikecilkan otomatis di perangkatmu sebelum dikirim, jadi hemat kuota.
            </p>
          </div>

          {petaTanggal.get(form.tanggal)?.catatanPembimbing && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
              <p className="text-xs font-semibold text-blue-800">
                Catatan {petaTanggal.get(form.tanggal)?.namaPemeriksa || "pembimbing"}
              </p>
              <p className="text-sm text-blue-900/90 mt-1 whitespace-pre-line">
                {petaTanggal.get(form.tanggal)?.catatanPembimbing}
              </p>
            </div>
          )}
        </div>
      </Sheet>

      {/* ---------- SHEET: PEMBIMBING MEMERIKSA ---------- */}
      <Sheet
        buka={!!dibuka}
        tutup={() => setDibuka(null)}
        judul="Periksa Catatan"
        footer={
          <div className="flex gap-2">
            {sudahDiperiksa ? (
              <button onClick={() => tandai(true)} disabled={!!sibuk}
                className="flex-1 py-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-navy-900 press disabled:opacity-50">
                Cabut tanda periksa
              </button>
            ) : (
              <button onClick={() => tandai(false)} disabled={!!sibuk}
                className="flex-1 py-3.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold press disabled:opacity-50 shadow-lift">
                {sibuk === "periksa" ? "Menyimpan..." : "Tandai Sudah Diperiksa"}
              </button>
            )}
          </div>
        }
      >
        {dibuka && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <Avatar name={dibuka.nama || "?"} size={44} />
              <div className="min-w-0">
                <p className="font-semibold text-sm text-navy-900 truncate">{dibuka.nama}</p>
                <p className="text-xs text-gray-500">{tglPanjang(dibuka.tanggal)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Uraian kegiatan</p>
              <p className="text-sm text-navy-900 whitespace-pre-line leading-relaxed">{dibuka.kegiatan}</p>
            </div>

            {dibuka.kendala && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Kendala</p>
                <p className="text-sm text-amber-700 whitespace-pre-line">{dibuka.kendala}</p>
              </div>
            )}

            {dibuka.adaFoto && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Bukti foto</p>
                {fotoDibuka ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoDibuka} alt="Bukti kegiatan"
                    className="w-full rounded-xl border border-gray-200 object-cover max-h-72" />
                ) : (
                  <Skeleton className="w-full h-44 rounded-xl" />
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Catatan untuk peserta <span className="text-gray-400">— opsional</span>
              </label>
              <textarea rows={3} value={catatan} maxLength={500}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Umpan balik singkat, arahan, atau apresiasi."
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-navy-700 resize-none" />
            </div>

            <button
              onClick={() => cetakLogbook(dibuka.userId, { name: dibuka.nama }, periodeJudul)}
              disabled={!!sibuk}
              className="w-full py-2.5 rounded-lg border border-gray-200 text-xs font-semibold text-navy-900 press disabled:opacity-50">
              {sibuk === "cetak" ? "Menyiapkan..." : `Cetak logbook ${dibuka.nama || "peserta"}`}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default function KegiatanPage() {
  return <Protected><KegiatanInner /></Protected>;
}
