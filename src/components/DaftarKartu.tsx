"use client";
import { useState, useEffect } from "react";
import Sheet from "@/components/Sheet";
import Avatar from "@/components/Avatar";
import { Pesan } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { gambarQr } from "@/lib/pindaiQr";
import { lembarKartuHtml } from "@/lib/kartuCetak";
import { cetakHtml } from "@/lib/ekspor";
import { terbitkanKartu, cabutKartu, ambilKartuCetak, formatKode } from "@/lib/kartu";

/**
 * Menerbitkan kartu absen ber-QR untuk seorang peserta.
 *
 * Kodenya dibuat acak oleh server, jadi hanya kartu yang keluar dari sini
 * yang dikenali mesin absen. Kartu dari luar — e-money, kartu akses, QR
 * apa pun — tidak ada artinya.
 */
export default function DaftarKartu({
  peserta,
  buka,
  tutup,
  selesai,
}: {
  peserta: any | null;
  buka: boolean;
  tutup: () => void;
  selesai: () => void;
}) {
  const [kode, setKode] = useState("");
  const [qr, setQr] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [sibuk, setSibuk] = useState("");

  useEffect(() => {
    if (!buka) { setKode(""); setQr(""); setPesan(null); }
  }, [buka]);

  // Gambar QR baru dibuat setelah kodenya ada
  useEffect(() => {
    if (!kode) { setQr(""); return; }
    let batal = false;
    gambarQr("INX1:" + kode, 400)
      .then((d) => { if (!batal) setQr(d); })
      .catch(() => undefined);
    return () => { batal = true; };
  }, [kode]);

  const terbitkan = async () => {
    if (!peserta) return;
    setSibuk("terbit"); setPesan(null);
    try {
      const r = await terbitkanKartu(peserta.id);
      setKode(r.kode);
      setPesan({
        t: "ok",
        s: peserta.kartuTerdaftar
          ? "Kartu baru terbit. Kartu lamanya sudah tidak berlaku."
          : `Kartu terbit untuk ${peserta.name}. Cetak lalu serahkan ke pesertanya.`,
      });
      selesai();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const cetak = async () => {
    if (!peserta) return;
    setSibuk("cetak"); setPesan(null);
    try {
      const daftar = await ambilKartuCetak([peserta.id]);
      if (daftar.length === 0) {
        setPesan({ t: "err", s: "Peserta ini belum punya kartu. Terbitkan dulu." });
        return;
      }
      cetakHtml("Kartu Absen", await lembarKartuHtml(daftar));
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const cabut = async () => {
    if (!peserta) return;
    setSibuk("cabut"); setPesan(null);
    try {
      await cabutKartu(peserta.id);
      setKode("");
      setPesan({ t: "ok", s: "Kartu dicabut. Peserta ini tidak bisa absen sampai kartu baru diterbitkan." });
      selesai();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(""); }
  };

  const punya = !!peserta?.kartuTerdaftar || !!kode;

  return (
    <Sheet
      buka={buka}
      tutup={tutup}
      judul="Kartu Absen"
      footer={
        <div className="flex gap-2">
          <button onClick={terbitkan} disabled={!!sibuk}
            className={`flex-1 py-3.5 rounded-xl text-sm font-semibold press disabled:opacity-50 ${
              punya ? "border border-gray-200 text-navy-900" : "bg-telkomRed text-white shadow-lift"
            }`}>
            {sibuk === "terbit" ? "Menerbitkan..." : punya ? "Terbitkan Ulang" : "Terbitkan Kartu"}
          </button>
          {punya && (
            <button onClick={cetak} disabled={!!sibuk}
              className="flex-1 py-3.5 rounded-xl bg-telkomRed text-white text-sm font-semibold press disabled:opacity-50 shadow-lift">
              {sibuk === "cetak" ? "Menyiapkan..." : "Cetak Kartu"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {peserta && (
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
            <Avatar name={peserta.name} foto={peserta.foto} size={44} />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-navy-900 truncate">{peserta.name}</p>
              <p className="text-xs text-gray-500 truncate">{peserta.jurusan || peserta.nim || "—"}</p>
            </div>
          </div>
        )}

        {pesan && <Pesan tipe={pesan.t}>{pesan.s}</Pesan>}

        {kode ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5 text-center anim-pop">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Kode QR kartu" className="w-44 h-44 mx-auto rounded-xl bg-white p-2 shadow-sm" />
            ) : (
              <div className="w-44 h-44 mx-auto rounded-xl skeleton" />
            )}
            <p className="mt-4 text-lg font-bold font-mono tracking-wider text-navy-900">
              {formatKode(kode)}
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed max-w-[17rem] mx-auto">
              Kode cadangan bila QR-nya tidak terbaca — operator bisa mengetiknya di mesin absen.
            </p>
          </div>
        ) : (
          <div className={`rounded-xl border p-3.5 ${
            peserta?.kartuTerdaftar ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/60"
          }`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-navy-900">
                {peserta?.kartuTerdaftar ? "Kartu sudah terbit" : "Belum punya kartu"}
              </p>
              {peserta?.kartuLabel && (
                <span className="text-xs font-mono text-gray-500">{peserta.kartuLabel}</span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              {peserta?.kartuTerdaftar
                ? "Kartunya bisa dicetak ulang kapan saja tanpa mengubah kode. Terbitkan ulang hanya bila kartu lamanya hilang."
                : "Peserta tidak bisa absen sampai kartunya diterbitkan dan dicetak."}
            </p>
          </div>
        )}

        {peserta?.kartuTerdaftar && (
          <button onClick={cabut} disabled={!!sibuk}
            className="w-full py-2.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-telkomRed press disabled:opacity-50">
            {sibuk === "cabut" ? "Mencabut..." : "Cabut kartu"}
          </button>
        )}

        <p className="text-[11px] text-gray-500 leading-relaxed">
          Kartunya dicetak seukuran KTP dan bisa dilaminasi. Yang tertanam di dalam QR
          hanya kodenya — nama dan identitas peserta tidak ikut di sana.
        </p>
      </div>
    </Sheet>
  );
}
