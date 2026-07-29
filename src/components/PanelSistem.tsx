"use client";
import { useState } from "react";
import { Pesan, Kosong, Skeleton, Segmen } from "@/components/ui";
import { pesanError } from "@/lib/users";
import {
  ambilJejak, ambilGalat, hapusGalat, unduhCadangan, waktuRelatif,
  LABEL_AKSI, AKSI_BERAT, BarisJejak, BarisGalat,
} from "@/lib/sistem";

type Tab = "jejak" | "galat";

/**
 * Panel administrasi sistem: jejak audit, laporan galat, dan pencadangan.
 *
 * Ketiganya menjawab pertanyaan yang sama dari sudut berbeda — "apa yang
 * sebenarnya terjadi di aplikasi ini?" — jadi dikumpulkan dalam satu tempat
 * ketimbang tersebar di halaman masing-masing.
 */
export default function PanelSistem() {
  const [buka, setBuka] = useState(false);
  const [tab, setTab] = useState<Tab>("jejak");
  const [jejak, setJejak] = useState<BarisJejak[] | null>(null);
  const [galat, setGalat] = useState<BarisGalat[] | null>(null);
  const [sibuk, setSibuk] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);

  const muat = async (mana: Tab) => {
    setSibuk(mana);
    setPesan(null);
    try {
      if (mana === "jejak") setJejak(await ambilJejak());
      else setGalat(await ambilGalat());
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const bukaPanel = () => {
    const berikutnya = !buka;
    setBuka(berikutnya);
    if (berikutnya && !jejak) muat("jejak");
  };

  const gantiTab = (t: Tab) => {
    setTab(t);
    if (t === "jejak" && !jejak) muat("jejak");
    if (t === "galat" && !galat) muat("galat");
  };

  const cadangkan = async () => {
    setSibuk("cadangan");
    setPesan(null);
    try {
      const { nama, jumlah } = await unduhCadangan();
      const ringkas = Object.entries(jumlah).map(([k, v]) => `${v} ${k}`).join(", ");
      setPesan({ t: "ok", s: `${nama} terunduh — berisi ${ringkas}. Simpan di luar Firebase.` });
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const bersihkanGalat = async () => {
    setSibuk("hapus");
    try {
      const n = await hapusGalat();
      setGalat([]);
      setPesan({ t: "ok", s: `${n} laporan dihapus.` });
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const jumlahGalat = galat?.length ?? 0;

  return (
    <div className="card overflow-hidden anim-fade-up d-3">
      <button onClick={bukaPanel} className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left press">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          jumlahGalat > 0 ? "bg-red-50 text-telkomRed" : "bg-gray-100 text-gray-500"
        }`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M2 12h4M18 12h4M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-navy-900 text-sm sm:text-base">Sistem &amp; Riwayat Perubahan</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            Jejak audit, laporan galat, dan pencadangan data
          </p>
        </div>
        {jumlahGalat > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-telkomRed shrink-0">
            {jumlahGalat}
          </span>
        )}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-gray-400 transition-transform duration-200 ${buka ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {buka && (
        <div className="px-4 sm:px-5 pb-5 border-t border-gray-100 pt-4 space-y-4 anim-fade-up">
          {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

          {/* Pencadangan */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900">Cadangan Data</p>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Satu berkas JSON berisi seluruh akun, absensi, izin, dan jejak audit.
                  Firebase paket gratis tidak mencadangkan otomatis — simpan hasilnya
                  di luar Firebase. Kode kartu sengaja tidak disertakan.
                </p>
              </div>
              <button onClick={cadangkan} disabled={!!sibuk}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-semibold press disabled:opacity-50">
                {sibuk === "cadangan" ? "Menyiapkan..." : "Unduh"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Segmen<Tab>
              nilai={tab} ubah={gantiTab} kecil
              opsi={[
                { nilai: "jejak", label: "Jejak Audit" },
                { nilai: "galat", label: "Laporan Galat", lencana: jumlahGalat },
              ]}
            />
            <button onClick={() => muat(tab)} disabled={!!sibuk}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-[11px] font-medium text-navy-900 press disabled:opacity-50">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sibuk === tab ? "animate-spin" : ""}>
                <path d="M21 12a9 9 0 1 1-6.22-8.56" /><path d="M21 3v6h-6" />
              </svg>
              Perbarui
            </button>
          </div>

          {/* Jejak audit */}
          {tab === "jejak" && (
            sibuk === "jejak" && !jejak ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !jejak || jejak.length === 0 ? (
              <Kosong judul="Belum ada perubahan tercatat"
                pesan="Pembuatan akun, penerbitan kartu, dan persetujuan izin akan muncul di sini." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {jejak.map((j, i) => (
                  <li key={j.id} className="flex items-start gap-3 py-2.5 anim-fade-up"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-2 ${
                      AKSI_BERAT.has(j.aksi) ? "bg-telkomRed" : "bg-gray-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-navy-900 leading-snug">
                        <b>{j.namaPelaku || j.pelaku}</b>{" "}
                        {LABEL_AKSI[j.aksi] || j.aksi}
                        {j.namaSasaran && <> · <span className="text-gray-600">{j.namaSasaran}</span></>}
                      </p>
                      {j.rincian && <p className="text-[11px] text-gray-400 mt-0.5 break-words">{j.rincian}</p>}
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">{waktuRelatif(j.padaMs)}</span>
                  </li>
                ))}
              </ul>
            )
          )}

          {/* Laporan galat */}
          {tab === "galat" && (
            sibuk === "galat" && !galat ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !galat || galat.length === 0 ? (
              <Kosong judul="Tidak ada galat dilaporkan"
                pesan="Kesalahan yang terjadi di perangkat pengguna akan muncul di sini secara otomatis." />
            ) : (
              <>
                <ul className="space-y-2">
                  {galat.map((g, i) => (
                    <li key={g.id} className="rounded-xl border border-red-100 bg-red-50/50 p-3 anim-fade-up"
                      style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-navy-900 break-words min-w-0">{g.pesan}</p>
                        <span className="text-[10px] text-gray-400 shrink-0 whitespace-nowrap">{waktuRelatif(g.padaMs)}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1.5">
                        {g.nama || "Tanpa nama"}{g.peran ? ` · ${g.peran}` : ""}
                        {g.halaman ? ` · ${g.halaman}` : ""}
                      </p>
                      {g.perangkat && (
                        <p className="text-[10px] text-gray-400 mt-1 truncate" title={g.perangkat}>{g.perangkat}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <button onClick={bersihkanGalat} disabled={!!sibuk}
                  className="w-full py-2.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-telkomRed press disabled:opacity-50">
                  {sibuk === "hapus" ? "Menghapus..." : "Kosongkan laporan"}
                </button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
