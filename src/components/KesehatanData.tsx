"use client";
import { useState } from "react";
import { Pesan } from "@/components/ui";
import { periksaKesehatan, bersihkanData, pesanError, Kesehatan } from "@/lib/users";

/**
 * Memeriksa keselarasan antara akun Firebase Auth dan dokumen profil.
 * Ketidakcocokan di antara keduanya menimbulkan gejala yang membingungkan:
 * akun yang bisa login tapi tertahan di layar pembuka, atau peserta hantu
 * yang ikut terhitung di statistik.
 */
export default function KesehatanData() {
  const [buka, setBuka] = useState(false);
  const [hasil, setHasil] = useState<Kesehatan | null>(null);
  const [busy, setBusy] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);

  const periksa = async () => {
    setBusy("periksa"); setPesan(null);
    try {
      setHasil(await periksaKesehatan());
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  const bukaPanel = () => {
    const berikutnya = !buka;
    setBuka(berikutnya);
    if (berikutnya && !hasil) periksa();
  };

  const bersihkan = async (jenis: "tanpaProfil" | "tanpaAkun") => {
    setBusy(jenis); setPesan(null);
    try {
      const n = await bersihkanData(jenis);
      setPesan({ t: "ok", s: `${n} data dibersihkan.` });
      await periksa();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setBusy(""); }
  };

  const masalah = hasil ? hasil.tanpaProfil.length + hasil.tanpaAkun.length : 0;

  return (
    <div className="card overflow-hidden anim-fade-up d-2">
      <button onClick={bukaPanel} className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left press">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          !hasil ? "bg-gray-100 text-gray-500" : hasil.sehat ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
        }`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy-900 text-sm sm:text-base">Kesehatan Data</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {busy === "periksa" ? "Memeriksa..."
              : !hasil ? "Periksa keselarasan akun login dan profil"
              : hasil.sehat ? `${hasil.totalProfil} profil selaras dengan ${hasil.totalAkun} akun`
              : `${masalah} ketidakcocokan ditemukan`}
          </p>
        </div>
        {hasil && !hasil.sehat && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">{masalah}</span>
        )}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-gray-500 transition-transform duration-200 ${buka ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {buka && (
        <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 pt-4 space-y-4 anim-fade-up">
          {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

          {hasil && (
            <>
              <Bagian
                judul="Akun tanpa profil"
                keterangan="Bisa login, tapi tertahan di layar pembuka karena tidak punya data profil."
                daftar={hasil.tanpaProfil.map((x) => x.email)}
                aksi="Hapus akunnya"
                onAksi={() => bersihkan("tanpaProfil")}
                sibuk={busy === "tanpaProfil"}
              />

              <Bagian
                judul="Profil tanpa akun"
                keterangan="Muncul sebagai peserta hantu di daftar dan statistik, padahal tidak bisa login."
                daftar={hasil.tanpaAkun.map((x) => `${x.nama || "(tanpa nama)"} · ${x.email}`)}
                aksi="Hapus profilnya"
                onAksi={() => bersihkan("tanpaAkun")}
                sibuk={busy === "tanpaAkun"}
              />

              <Bagian
                judul="Belum punya kartu absen"
                keterangan="Peserta aktif yang belum bisa absen karena kartunya belum didaftarkan."
                daftar={hasil.belumKartu.map((x) => x.nama)}
                nada="info"
              />

              <button onClick={periksa} disabled={busy === "periksa"}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-navy-900 press disabled:opacity-50">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={busy === "periksa" ? "animate-spin" : ""}>
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" />
                </svg>
                {busy === "periksa" ? "Memeriksa..." : "Periksa ulang"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Bagian({
  judul, keterangan, daftar, aksi, onAksi, sibuk, nada = "peringatan",
}: {
  judul: string; keterangan: string; daftar: string[];
  aksi?: string; onAksi?: () => void; sibuk?: boolean; nada?: "peringatan" | "info";
}) {
  const kosong = daftar.length === 0;
  return (
    <div className={`rounded-xl border p-3.5 ${
      kosong ? "border-gray-100 bg-gray-50/60"
        : nada === "info" ? "border-blue-100 bg-blue-50/60"
        : "border-amber-100 bg-amber-50/60"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-navy-900">{judul}</p>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
          kosong ? "bg-emerald-100 text-emerald-700"
            : nada === "info" ? "bg-blue-100 text-blue-700"
            : "bg-amber-100 text-amber-700"
        }`}>{kosong ? "aman" : daftar.length}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{keterangan}</p>

      {!kosong && (
        <ul className="mt-2.5 space-y-1">
          {daftar.slice(0, 6).map((t, i) => (
            <li key={i} className="text-xs text-navy-900 font-mono break-all">· {t}</li>
          ))}
          {daftar.length > 6 && <li className="text-xs text-gray-500">+{daftar.length - 6} lainnya</li>}
        </ul>
      )}

      {!kosong && aksi && onAksi && (
        <button onClick={onAksi} disabled={sibuk}
          className="mt-3 w-full py-2.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-telkomRed press disabled:opacity-50">
          {sibuk ? "Membersihkan..." : aksi}
        </button>
      )}
    </div>
  );
}
