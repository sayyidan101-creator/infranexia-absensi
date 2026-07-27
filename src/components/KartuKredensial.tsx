"use client";
import { useState } from "react";

export interface HasilAkun {
  nama: string;
  email: string;
  password: string;
  peran: string;
  telepon?: string;
  emailTerkirim: boolean;
  alasanEmail?: string | null;
}

/**
 * Ditampilkan setelah akun baru berhasil dibuat: menampilkan kredensial
 * sekali saja, dengan cara cepat mengirimkannya ke peserta magang.
 */
export default function KartuKredensial({ hasil, onTutup }: { hasil: HasilAkun; onTutup: () => void }) {
  const [tersalin, setTersalin] = useState<"" | "semua" | "password">("");

  const urlApp = typeof window !== "undefined" ? window.location.origin : "";

  const pesanLengkap = [
    `Halo ${hasil.nama}, akun absensi magang InfraNexia kamu sudah dibuat.`,
    "",
    `Alamat: ${urlApp}`,
    `Email: ${hasil.email}`,
    `Password: ${hasil.password}`,
    "",
    "Setelah login, segera ganti password lewat menu Edit Profil, lalu daftarkan wajah kamu di menu Daftar Wajah.",
  ].join("\n");

  const salin = async (teks: string, jenis: "semua" | "password") => {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(jenis);
      setTimeout(() => setTersalin(""), 1800);
    } catch {
      setTersalin("");
    }
  };

  const nomorWa = (hasil.telepon || "").replace(/\D/g, "");
  const tautanWa = nomorWa
    ? `https://wa.me/${nomorWa}?text=${encodeURIComponent(pesanLengkap)}`
    : `https://wa.me/?text=${encodeURIComponent(pesanLengkap)}`;

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Status */}
      <div className="flex flex-col items-center text-center gap-2 pt-1">
        <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center anim-pop">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4 4L19 7" /></svg>
        </span>
        <p className="font-semibold text-navy-900">Akun {hasil.nama} berhasil dibuat</p>
      </div>

      {/* Status email */}
      <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm ${
        hasil.emailTerkirim
          ? "bg-emerald-50 border-emerald-100 text-emerald-700"
          : "bg-amber-50 border-amber-100 text-amber-800"
      }`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" />
        </svg>
        <span className="flex-1">
          {hasil.emailTerkirim
            ? <>Kredensial sudah dikirim ke <b>{hasil.email}</b>.</>
            : <>Email tidak terkirim. {hasil.alasanEmail} Kirimkan manual lewat tombol di bawah.</>}
        </span>
      </div>

      {/* Kredensial */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
        <Baris label="Email" nilai={hasil.email} />
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-xs text-gray-500 w-20 shrink-0">Password</span>
          <span className="flex-1 text-sm font-semibold font-mono text-navy-900 break-all">{hasil.password}</span>
          <button onClick={() => salin(hasil.password, "password")}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-navy-900 hover:bg-white press"
            aria-label="Salin password">
            {tersalin === "password"
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><path d="m5 13 4 4L19 7" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Password ini hanya ditampilkan sekali. Setelah jendela ini ditutup, password
        tidak bisa dilihat lagi — hanya bisa diganti lewat Firebase Console.
      </p>

      {/* Aksi kirim */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <a href={tautanWa} target="_blank" rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-[#25D366] text-white font-semibold press">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.08-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.09 3.2 5.07 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35Z" />
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02h-.01c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.39c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Z" />
          </svg>
          {nomorWa ? "Kirim via WhatsApp" : "Bagikan via WhatsApp"}
        </a>

        <button onClick={() => salin(pesanLengkap, "semua")}
          className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl border border-gray-200 text-navy-900 font-semibold press">
          {tersalin === "semua" ? (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><path d="m5 13 4 4L19 7" /></svg> Tersalin</>
          ) : (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Salin pesan</>
          )}
        </button>
      </div>

      {!nomorWa && (
        <p className="text-[11px] text-gray-400 text-center">
          Nomor HP tidak diisi, jadi WhatsApp akan meminta kamu memilih kontak tujuan.
        </p>
      )}

      <button onClick={onTutup}
        className="w-full py-3.5 rounded-2xl bg-navy-900 text-white font-semibold press">
        Selesai
      </button>
    </div>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <span className="flex-1 text-sm font-medium text-navy-900 break-all">{nilai}</span>
    </div>
  );
}
