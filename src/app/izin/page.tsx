"use client";
import { useState, useEffect, useMemo } from "react";
import Protected from "@/components/Protected";
import Avatar from "@/components/Avatar";
import Sheet from "@/components/Sheet";
import { useAuth } from "@/context/AuthContext";
import { Pesan, Kosong, Skeleton, Segmen, KepalaHalaman, Halaman } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { tanggalHariIni, geserHari } from "@/lib/absensi";
import { kecilkanGambar, ukuranKb } from "@/lib/gambar";
import {
  ajukanIzin, prosesIzin, batalkanIzin, izinSaya, semuaIzin,
  lampirkanBukti, buktiIzin, wajibSurat, WAJIB_SURAT_SEJAK_HARI,
  labelRentang, GAYA_STATUS, LABEL_JENIS, Izin, JenisIzin,
} from "@/lib/izin";

const inp =
  "w-full border border-gray-200 rounded-xl px-3.5 py-3 sm:py-2.5 text-sm outline-none focus:ring-2 focus:ring-navy-700 focus:border-transparent transition";

/**
 * Surat dokter dikecilkan lebih longgar daripada foto kegiatan.
 *
 * Yang perlu terbaca di sini adalah tulisan tangan dokter, cap klinik, dan
 * tanggalnya. Pada 640 piksel — ukuran yang cukup untuk foto ruangan — semua
 * itu jadi bubur, dan surat yang tidak terbaca sama saja dengan tidak ada.
 */
const OPSI_SURAT = { maksSisi: 1200, maksByte: 250_000 };

const tglPendek = (s: string) => {
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

/** Berapa hari yang tercakup dua tanggal, inklusif. */
function hitungHari(mulai: string, selesai: string): number {
  const a = new Date(mulai + "T00:00:00Z").getTime();
  const b = new Date((selesai || mulai) + "T00:00:00Z").getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

type Tapis = "menunggu" | "semua" | "disetujui" | "ditolak";

/**
 * Ringkasan riwayat izin seseorang, dihitung dari daftar yang sudah dimuat.
 *
 * Ini yang paling menentukan saat pembimbing memutuskan. Satu pengajuan izin
 * satu hari terlihat wajar; pengajuan yang sama, dari orang yang sudah izin
 * empat kali bulan ini, adalah keputusan yang berbeda. Tanpa angka ini
 * pembimbing menekan Setujui tanpa konteks apa pun.
 */
function riwayatOrang(daftar: Izin[], userId: string, bulan: string) {
  const punya = daftar.filter((i) => i.userId === userId && i.status !== "ditolak");
  const bulanIni = punya.filter((i) => (i.tanggalMulai || "").startsWith(bulan));
  return {
    kaliBulanIni: bulanIni.length,
    hariBulanIni: bulanIni.reduce((n, i) => n + (i.jumlahHari || 0), 0),
    totalKali: punya.length,
  };
}

function IzinInner() {
  const { profil } = useAuth();
  const pembina = profil?.role === "admin" || profil?.role === "pembimbing";

  const [daftar, setDaftar] = useState<Izin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [tapis, setTapis] = useState<Tapis>("menunggu");

  // Pengajuan (magang)
  const [buka, setBuka] = useState(false);
  const [form, setForm] = useState({
    jenis: "izin" as JenisIzin,
    tanggalMulai: tanggalHariIni(),
    tanggalSelesai: tanggalHariIni(),
    alasan: "",
  });

  // Bukti surat dokter
  const [bukti, setBukti] = useState("");          // untuk pengajuan yang sedang disusun
  const [olahFoto, setOlahFoto] = useState(false); // sedang dikecilkan di browser
  const [fotoTinjau, setFotoTinjau] = useState(""); // surat pada pengajuan yang dibuka
  const [muatFoto, setMuatFoto] = useState(false);
  const [perbesar, setPerbesar] = useState("");    // data URL yang ditampilkan penuh layar

  // Peninjauan (pembina)
  const [tinjau, setTinjau] = useState<Izin | null>(null);
  const [catatan, setCatatan] = useState("");

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

  // Peserta tidak punya "kotak masuk" — baginya daftar penuh lebih masuk akal
  useEffect(() => { if (profil && !pembina) setTapis("semua"); }, [profil, pembina]);

  const menunggu = daftar.filter((i) => i.status === "menunggu");
  const tampil = useMemo(
    () => (tapis === "semua" ? daftar : daftar.filter((i) => i.status === tapis)),
    [daftar, tapis]
  );

  const bulanIni = tanggalHariIni().slice(0, 7);

  // ---------------- Surat dokter ----------------

  /** Baca berkas dari input, kecilkan, kembalikan data URL. */
  const olah = async (berkas: File | null | undefined): Promise<string> => {
    if (!berkas) return "";
    setOlahFoto(true);
    try {
      return await kecilkanGambar(berkas, OPSI_SURAT);
    } finally {
      setOlahFoto(false);
    }
  };

  // Surat pada pengajuan yang sedang dibuka pembina — diambil hanya saat
  // lembarnya terbuka, bukan ikut termuat bersama daftarnya.
  useEffect(() => {
    setFotoTinjau("");
    if (!tinjau?.adaBukti) return;
    let usang = false;
    setMuatFoto(true);
    buktiIzin(tinjau.id)
      .then((f) => { if (!usang) setFotoTinjau(f); })
      .catch(() => { if (!usang) setFotoTinjau(""); })
      .finally(() => { if (!usang) setMuatFoto(false); });
    return () => { usang = true; };
  }, [tinjau?.id, tinjau?.adaBukti]);

  /** Peserta melihat suratnya sendiri dari kartu daftar. */
  const lihatSurat = async (id: string) => {
    setBusy(id);
    try {
      const f = await buktiIzin(id);
      if (f) setPerbesar(f);
      else setPesan({ t: "err", s: "Surat tidak bisa dibuka." });
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  /** Melampirkan surat pada pengajuan yang sudah terkirim tapi belum diputus. */
  const lampirkanSusulan = async (id: string, berkas: File | null) => {
    if (!berkas) return;
    setPesan(null);
    setBusy(id);
    try {
      await lampirkanBukti(id, await olah(berkas));
      setPesan({ t: "ok", s: "Surat dokter terlampir." });
      muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  // ---------------- Peserta ----------------

  const hariForm = hitungHari(form.tanggalMulai, form.tanggalSelesai);
  const suratWajib = wajibSurat(form.jenis, hariForm);
  const siapKirim = form.alasan.trim().length >= 5 && (!suratWajib || !!bukti);

  const pilihCepat = (mulaiOffset: number, hari: number) => {
    const mulai = geserHari(tanggalHariIni(), mulaiOffset);
    setForm({ ...form, tanggalMulai: mulai, tanggalSelesai: geserHari(mulai, hari - 1) });
  };

  const kirim = async () => {
    setPesan(null);
    if (form.alasan.trim().length < 5) {
      setPesan({ t: "err", s: "Tuliskan alasan minimal 5 karakter." });
      return;
    }
    if (suratWajib && !bukti) {
      setPesan({
        t: "err",
        s: `Sakit ${hariForm} hari perlu foto surat dokter sebelum bisa dikirim.`,
      });
      return;
    }
    setBusy("ajukan");
    try {
      const r = await ajukanIzin({
        jenis: form.jenis,
        alasan: form.alasan.trim(),
        tanggalMulai: form.tanggalMulai,
        tanggalSelesai: form.tanggalSelesai || form.tanggalMulai,
        bukti: bukti || undefined,
      });
      setPesan({
        t: "ok",
        s: `Pengajuan ${r.jumlahHari} hari terkirim${r.adaBukti ? " beserta surat dokter" : ""}. Menunggu persetujuan pembimbing.`,
      });
      setForm({ ...form, alasan: "" });
      setBukti("");
      setBuka(false);
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

  // ---------------- Pembina ----------------

  const bukaTinjau = (i: Izin) => {
    setTinjau(i);
    setCatatan(i.catatan || "");
    setPesan(null);
  };

  const putuskan = async (keputusan: "disetujui" | "ditolak") => {
    if (!tinjau) return;
    if (keputusan === "ditolak" && catatan.trim().length < 3) {
      // Penolakan tanpa alasan menyisakan peserta menebak-nebak, dan biasanya
      // berakhir jadi pertanyaan yang harus dijawab lisan juga
      setPesan({ t: "err", s: "Tuliskan alasan penolakan — peserta perlu tahu apa yang salah." });
      return;
    }
    setBusy("proses");
    try {
      const r = await prosesIzin(tinjau.id, keputusan, catatan.trim());
      const nama = tinjau.nama;
      setTinjau(null);
      setPesan({
        t: "ok",
        s: keputusan === "disetujui"
          ? `Disetujui. ${r.dicatat} hari tercatat di riwayat kehadiran ${nama}.`
          : `Pengajuan ${nama} ditolak.`,
      });
      muat();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  const statTinjau = tinjau ? riwayatOrang(daftar, tinjau.userId, bulanIni) : null;

  return (
    <Halaman lebar="sedang">
      <KepalaHalaman
        atas="Ketidakhadiran"
        judul={pembina ? "Persetujuan Izin" : "Izin & Sakit"}
        keterangan={pembina
          ? "Yang disetujui langsung tercatat di riwayat kehadiran peserta."
          : "Ajukan izin atau sakit agar ketidakhadiranmu tercatat resmi, bukan dianggap alpa."}
        aksi={!pembina ? (
          <button onClick={() => { setBuka(true); setPesan(null); }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-telkomRed text-white text-sm font-semibold press shadow-lift">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Ajukan Izin
          </button>
        ) : undefined}
      />

      {/*
        Hanya ditampilkan saat tidak ada lembar terbuka.

        Lembarnya portal `fixed inset-0 z-[70]`, jadi pesan di badan halaman
        berada di belakangnya dan tidak terlihat. Dulu ini satu-satunya tempat
        pesan dirender — akibatnya validasi "menolak wajib pakai catatan"
        berjalan tanpa jejak apa pun di layar, dan pengajuan yang ditolak server
        tampak seperti berhasil terkirim. Salinannya sekarang ada di dalam kedua
        lembar; yang ini untuk pesan yang muncul setelah lembarnya tertutup.
      */}
      {pesan && !buka && !tinjau && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

      {/* ---------- PEMBINA: yang menunggu didahulukan ---------- */}
      {pembina && !loading && menunggu.length > 0 && tapis !== "menunggu" && (
        <button onClick={() => setTapis("menunggu")}
          className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 press anim-fade-up">
          <span className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3 2" /></svg>
          </span>
          <div className="text-left flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {menunggu.length} pengajuan menunggu keputusanmu
            </p>
            <p className="text-[11px] text-amber-700/80 mt-0.5">
              Selama belum diputus, ketidakhadirannya belum tercatat resmi.
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500 shrink-0"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      )}

      {/* ---------- Tapis ---------- */}
      <div className="anim-fade-up d-1 overflow-x-auto no-scrollbar">
        <Segmen<Tapis>
          nilai={tapis}
          ubah={setTapis}
          opsi={pembina
            ? [
                { nilai: "menunggu", label: "Menunggu", lencana: menunggu.length },
                { nilai: "disetujui", label: "Disetujui" },
                { nilai: "ditolak", label: "Ditolak" },
                { nilai: "semua", label: "Semua" },
              ]
            : [
                { nilai: "semua", label: "Semua" },
                { nilai: "menunggu", label: "Menunggu", lencana: menunggu.length },
                { nilai: "disetujui", label: "Disetujui" },
                { nilai: "ditolak", label: "Ditolak" },
              ]}
        />
      </div>

      {/* ---------- Daftar ---------- */}
      <div className="space-y-2.5">
        {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}

        {!loading && tampil.length === 0 && (
          <div className="card">
            <Kosong
              judul={
                tapis === "menunggu"
                  ? "Tidak ada yang menunggu"
                  : tapis === "semua" ? "Belum ada pengajuan" : `Tidak ada yang ${tapis}`
              }
              pesan={
                tapis === "menunggu"
                  ? "Semua pengajuan sudah diputus. Tidak ada yang tertahan."
                  : pembina ? "Pengajuan dari peserta akan muncul di sini." : "Pengajuanmu akan muncul di sini."
              }
            />
          </div>
        )}

        {!loading && tampil.map((i, n) => {
          const g = GAYA_STATUS[i.status];
          const perluDiputus = pembina && i.status === "menunggu";
          const stat = pembina ? riwayatOrang(daftar, i.userId, bulanIni) : null;
          const sering = (stat?.kaliBulanIni || 0) >= 3;

          const isi = (
            <>
              <div className="flex items-start gap-3">
                {pembina && <Avatar name={i.nama} size={40} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {pembina && <p className="font-semibold text-sm text-navy-900">{i.nama}</p>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      i.jenis === "sakit" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>{LABEL_JENIS[i.jenis].toUpperCase()}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.kelas}`}>{g.teks}</span>
                    {perluDiputus && sering && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {stat!.kaliBulanIni}× BULAN INI
                      </span>
                    )}
                    {i.adaBukti && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        SURAT DOKTER
                      </span>
                    )}
                    {!i.adaBukti && i.jenis === "sakit" && i.jumlahHari >= WAJIB_SURAT_SEJAK_HARI && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        TANPA SURAT
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-navy-900 mt-1.5 font-medium">
                    {labelRentang(i.tanggalMulai, i.tanggalSelesai)}
                    <span className="text-gray-500 font-normal"> · {i.jumlahHari} hari</span>
                  </p>
                  <p className="text-sm text-gray-600 mt-1 break-words line-clamp-2">{i.alasan}</p>

                  {i.status !== "menunggu" && i.namaPemroses && (
                    <p className="text-[11px] text-gray-500 mt-1.5 break-words">
                      Diproses oleh {i.namaPemroses}
                      {i.catatan ? ` · “${i.catatan}”` : ""}
                    </p>
                  )}
                </div>

                {perluDiputus && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 shrink-0 mt-1"><path d="m9 18 6-6-6-6" /></svg>
                )}
              </div>

              {!pembina && (i.status === "menunggu" || i.adaBukti) && (
                <div className="mt-3.5 pt-3.5 border-t border-gray-50 flex items-center gap-2">
                  {i.adaBukti && (
                    <button onClick={() => lihatSurat(i.id)} disabled={busy === i.id}
                      className="flex-1 text-sm text-navy-900 font-medium press disabled:opacity-50">
                      {busy === i.id ? "Membuka..." : "Lihat surat"}
                    </button>
                  )}

                  {/* Lampiran susulan: yang lupa melampirkan tidak perlu
                      membatalkan lalu mengajukan ulang dari awal. */}
                  {i.status === "menunggu" && !i.adaBukti && (
                    <label className="flex-1 text-center text-sm text-navy-900 font-medium press cursor-pointer">
                      {busy === i.id ? "Mengunggah..." : "Lampirkan surat"}
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(ev) => {
                          lampirkanSusulan(i.id, ev.target.files?.[0] || null);
                          ev.currentTarget.value = "";
                        }} />
                    </label>
                  )}

                  {i.status === "menunggu" && (
                    <button onClick={() => batal(i.id)} disabled={busy === i.id}
                      className="flex-1 text-sm text-gray-500 press disabled:opacity-50">
                      {busy === i.id ? "Membatalkan..." : "Batalkan"}
                    </button>
                  )}
                </div>
              )}
            </>
          );

          const kelas = `card p-4 anim-fade-up ${perluDiputus ? "ring-1 ring-amber-200 bg-amber-50/40" : ""}`;
          const gaya = { animationDelay: `${Math.min(n, 8) * 40}ms` };

          return perluDiputus ? (
            <button key={i.id} onClick={() => bukaTinjau(i)} className={`${kelas} w-full text-left press`} style={gaya}>
              {isi}
            </button>
          ) : (
            <div key={i.id} className={kelas} style={gaya}>{isi}</div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-gray-500 anim-fade-up d-4">
        Pengajuan yang disetujui otomatis tercatat sebagai {LABEL_JENIS.izin.toLowerCase()} atau {LABEL_JENIS.sakit.toLowerCase()} di riwayat kehadiran.
      </p>

      {/* ---------- SHEET: PESERTA MENGAJUKAN ---------- */}
      <Sheet
        buka={buka}
        tutup={() => setBuka(false)}
        judul="Ajukan Izin"
        footer={
          <button onClick={kirim} disabled={busy === "ajukan" || olahFoto || !siapKirim}
            className="w-full py-3.5 rounded-xl bg-telkomRed text-white text-sm font-semibold press disabled:opacity-40 shadow-lift">
            {busy === "ajukan"
              ? "Mengirim..."
              : suratWajib && !bukti ? "Lampirkan surat dokter dulu" : "Kirim Pengajuan"}
          </button>
        }
      >
        <div className="space-y-4">
          {/* Pesan di dalam lembar — di luar sini ia tertutup lapisan gelapnya */}
          {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

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

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Pilih cepat</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { l: "Hari ini", o: 0, h: 1 },
                { l: "Besok", o: 1, h: 1 },
                { l: "3 hari", o: 0, h: 3 },
              ].map((p) => (
                <button key={p.l} onClick={() => pilihCepat(p.o, p.h)}
                  className="py-2.5 rounded-xl border border-gray-200 text-xs font-medium text-navy-900 press">
                  {p.l}
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
            <p className="text-[11px] text-gray-500 mt-1 text-right">{form.alasan.length}/500</p>
          </div>

          {/* ---------- Foto surat dokter ---------- */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Foto surat dokter{" "}
              {suratWajib
                ? <span className="text-telkomRed font-semibold">— wajib</span>
                : <span className="text-gray-500">— bila ada</span>}
            </label>

            {bukti ? (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <button type="button" onClick={() => setPerbesar(bukti)} className="block w-full press">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bukti} alt="Surat dokter" className="w-full max-h-56 object-contain bg-gray-50" />
                </button>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100">
                  <span className="text-[11px] text-gray-500">{ukuranKb(bukti)} KB · ketuk untuk memperbesar</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="text-[11px] font-medium text-navy-900 press cursor-pointer">
                      Ganti
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={async (ev) => {
                          const f = ev.target.files?.[0] || null;
                          ev.currentTarget.value = "";
                          try { if (f) setBukti(await olah(f)); }
                          catch (e: any) { setPesan({ t: "err", s: pesanError(e) }); }
                        }} />
                    </label>
                    <button type="button" onClick={() => setBukti("")}
                      className="text-[11px] font-medium text-telkomRed press">
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed cursor-pointer press ${
                suratWajib ? "border-telkomRed/40 bg-red-50/40" : "border-gray-200 bg-gray-50/60"
              }`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  className={suratWajib ? "text-telkomRed" : "text-gray-500"}>
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                <span className="text-xs font-medium text-navy-900">
                  {olahFoto ? "Memproses foto..." : "Ambil atau pilih foto"}
                </span>
                <span className="text-[11px] text-gray-500">Foto akan dikecilkan otomatis</span>
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={olahFoto}
                  onChange={async (ev) => {
                    const f = ev.target.files?.[0] || null;
                    ev.currentTarget.value = "";
                    try { if (f) setBukti(await olah(f)); }
                    catch (e: any) { setPesan({ t: "err", s: pesanError(e) }); }
                  }} />
              </label>
            )}

            {suratWajib && !bukti && (
              <p className="text-[11px] text-telkomRed mt-1.5 leading-relaxed">
                Sakit {hariForm} hari perlu keterangan dokter. Untuk sakit satu hari,
                surat tidak diminta.
              </p>
            )}
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed">
            Alasan yang jelas mempercepat persetujuan. Pembimbing melihat persis
            apa yang kamu tulis di sini.
          </p>
        </div>
      </Sheet>

      {/* ---------- SHEET: PEMBINA MEMUTUSKAN ---------- */}
      <Sheet
        buka={!!tinjau}
        tutup={() => setTinjau(null)}
        judul="Tinjau Pengajuan"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => putuskan("ditolak")} disabled={!!busy}
              className="py-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-telkomRed press disabled:opacity-50">
              Tolak
            </button>
            <button onClick={() => putuskan("disetujui")} disabled={!!busy}
              className="py-3.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold press disabled:opacity-50 shadow-lift">
              {busy === "proses" ? "Memproses..." : "Setujui"}
            </button>
          </div>
        }
      >
        {tinjau && (
          <div className="space-y-4">
            {/* Pesan di dalam lembar — di luar sini ia tertutup lapisan gelapnya.
                Ini yang membuat "Tolak tanpa catatan" dulu terasa seperti
                tombol yang tidak berfungsi. */}
            {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <Avatar name={tinjau.nama} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-navy-900 truncate">{tinjau.nama}</p>
                <p className="text-xs text-gray-500">
                  {LABEL_JENIS[tinjau.jenis]} · {tinjau.jumlahHari} hari
                </p>
              </div>
            </div>

            {/* Konteks untuk memutuskan */}
            {statTinjau && (
              <div className={`rounded-xl border p-3.5 ${
                statTinjau.kaliBulanIni >= 3
                  ? "border-amber-200 bg-amber-50/70"
                  : "border-gray-100 bg-gray-50/70"
              }`}>
                <p className="text-xs font-semibold text-navy-900">Riwayat izin peserta ini</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-gray-600">
                  <span>Bulan ini <b className="text-navy-900">{statTinjau.kaliBulanIni}×</b></span>
                  <span>Total hari bulan ini <b className="text-navy-900">{statTinjau.hariBulanIni}</b></span>
                  <span>Sejak awal <b className="text-navy-900">{statTinjau.totalKali}×</b></span>
                </div>
                {statTinjau.kaliBulanIni >= 3 && (
                  <p className="text-[11px] text-amber-700 mt-2 leading-relaxed">
                    Sudah cukup sering bulan ini. Pertimbangkan bicara langsung sebelum memutuskan.
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Tanggal yang diajukan</p>
              <p className="text-sm font-semibold text-navy-900">
                {labelRentang(tinjau.tanggalMulai, tinjau.tanggalSelesai)}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(tinjau.tanggal || []).slice(0, 12).map((t) => (
                  <span key={t} className="text-[10px] font-medium px-2 py-1 rounded-md bg-gray-100 text-gray-600">
                    {tglPendek(t)}
                  </span>
                ))}
                {(tinjau.tanggal || []).length > 12 && (
                  <span className="text-[10px] text-gray-500 self-center">
                    +{(tinjau.tanggal || []).length - 12} lagi
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Alasan yang ditulis peserta</p>
              <p className="text-sm text-navy-900 whitespace-pre-line leading-relaxed">{tinjau.alasan}</p>
            </div>

            {/* ---------- Surat dokter ---------- */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Surat dokter</p>

              {tinjau.adaBukti ? (
                muatFoto ? (
                  <Skeleton className="h-40 w-full rounded-xl" />
                ) : fotoTinjau ? (
                  <button type="button" onClick={() => setPerbesar(fotoTinjau)}
                    className="block w-full rounded-xl border border-gray-200 overflow-hidden press">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoTinjau} alt="Surat dokter" className="w-full max-h-60 object-contain bg-gray-50" />
                    <span className="block text-[11px] text-gray-500 py-2 border-t border-gray-100">
                      Ketuk untuk memperbesar
                    </span>
                  </button>
                ) : (
                  <p className="text-xs text-gray-500 rounded-xl bg-gray-50 border border-gray-100 p-3">
                    Suratnya gagal dimuat. Coba tutup lalu buka lagi pengajuan ini.
                  </p>
                )
              ) : wajibSurat(tinjau.jenis, tinjau.jumlahHari) ? (
                <p className="text-xs text-red-700 rounded-xl bg-red-50 border border-red-100 p-3 leading-relaxed">
                  Pengajuan ini tidak punya surat, padahal sakit {tinjau.jumlahHari} hari
                  semestinya melampirkannya. Kemungkinan besar diajukan sebelum aturannya
                  berlaku — mintakan susulan sebelum menyetujui.
                </p>
              ) : (
                <p className="text-xs text-gray-500 rounded-xl bg-gray-50 border border-gray-100 p-3">
                  Tidak dilampirkan. Untuk {LABEL_JENIS[tinjau.jenis].toLowerCase()} sepanjang
                  ini surat memang tidak diwajibkan.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Catatan <span className="text-gray-500">— wajib bila menolak</span>
              </label>
              <textarea rows={2} value={catatan} maxLength={300}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Alasan penolakan, atau pesan singkat bila disetujui."
                className={inp + " resize-none"} />
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5">
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Bila disetujui, <b>{tinjau.jumlahHari} hari</b> akan tercatat sebagai{" "}
                <b>{LABEL_JENIS[tinjau.jenis].toLowerCase()}</b> di riwayat kehadiran{" "}
                {(tinjau.nama || "peserta").split(" ")[0]}. Hari yang sudah ada kehadiran
                nyatanya tidak ditimpa.
              </p>
            </div>
          </div>
        )}
      </Sheet>

      {/* ---------- Surat penuh layar ---------- */}
      {perbesar && (
        <div onClick={() => setPerbesar("")}
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 anim-fade-up">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={perbesar} alt="Surat dokter" className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setPerbesar("")} aria-label="Tutup"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center press">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </Halaman>
  );
}

export default function IzinPage() {
  return <Protected><IzinInner /></Protected>;
}
