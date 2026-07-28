"use client";
import { useState, useRef, useEffect } from "react";
import Sheet from "@/components/Sheet";
import Avatar from "@/components/Avatar";
import { Pesan } from "@/components/ui";
import { pesanError } from "@/lib/users";
import { nfcTersedia, mulaiPindai, labelSerial, PemindaiNfc } from "@/lib/nfc";
import { daftarkanKartu, cabutKartu } from "@/lib/kartu";

/**
 * Mendaftarkan sebuah kartu NFC ke seorang peserta.
 *
 * Yang disimpan hanya hash dari nomor seri kartu — tidak ada apa pun yang
 * ditulis ke kartunya. Jadi kartu apa saja yang ber-NFC bisa dipakai:
 * kartu kosong, kartu akses kantor, bahkan kartu uang elektronik.
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
  const [memindai, setMemindai] = useState(false);
  const [serial, setSerial] = useState("");
  const [pesan, setPesan] = useState<{ t: "ok" | "err" | "info"; s: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const pemindai = useRef<PemindaiNfc | null>(null);

  const hentikan = () => {
    pemindai.current?.hentikan();
    pemindai.current = null;
    setMemindai(false);
  };

  useEffect(() => {
    if (!buka) { hentikan(); setSerial(""); setPesan(null); }
  }, [buka]);

  useEffect(() => () => hentikan(), []);

  const mulai = async () => {
    setPesan(null);
    try {
      pemindai.current = await mulaiPindai(
        (s) => {
          setSerial(s);
          hentikan();
          if (navigator.vibrate) navigator.vibrate([15, 45, 15]);
        },
        (m) => setPesan({ t: "err", s: m })
      );
      setMemindai(true);
    } catch (e: any) {
      setPesan({ t: "err", s: e?.message || "Gagal memulai pemindaian." });
    }
  };

  const simpan = async () => {
    if (!peserta || !serial) return;
    setSibuk(true); setPesan(null);
    try {
      const label = await daftarkanKartu(peserta.id, serial);
      setPesan({ t: "ok", s: `Kartu ${label} terdaftar untuk ${peserta.name}.` });
      setSerial("");
      selesai();
      setTimeout(tutup, 1200);
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(false); }
  };

  const cabut = async () => {
    if (!peserta) return;
    setSibuk(true); setPesan(null);
    try {
      await cabutKartu(peserta.id);
      setPesan({ t: "ok", s: "Kartu dicabut. Peserta ini tidak bisa absen sampai kartu baru didaftarkan." });
      selesai();
    } catch (e: any) {
      setPesan({ t: "err", s: pesanError(e) });
    } finally { setSibuk(false); }
  };

  const didukung = nfcTersedia();

  return (
    <Sheet
      buka={buka}
      tutup={tutup}
      judul="Kartu Absen"
      footer={
        serial ? (
          <button onClick={simpan} disabled={sibuk}
            className="w-full py-3.5 rounded-xl bg-telkomRed text-white text-sm font-semibold press disabled:opacity-50 shadow-lift">
            {sibuk ? "Menyimpan..." : "Daftarkan Kartu Ini"}
          </button>
        ) : undefined
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

        {/* Status kartu saat ini */}
        <div className={`rounded-xl border p-3.5 ${
          peserta?.kartuTerdaftar ? "border-emerald-100 bg-emerald-50/60" : "border-amber-100 bg-amber-50/60"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-navy-900">
              {peserta?.kartuTerdaftar ? "Kartu sudah terdaftar" : "Belum punya kartu"}
            </p>
            {peserta?.kartuLabel && (
              <span className="text-xs font-mono text-gray-500">{peserta.kartuLabel}</span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            {peserta?.kartuTerdaftar
              ? "Mendaftarkan kartu baru akan menggantikan yang lama."
              : "Peserta tidak bisa absen sampai sebuah kartu didaftarkan."}
          </p>
          {peserta?.kartuTerdaftar && (
            <button onClick={cabut} disabled={sibuk}
              className="mt-2.5 w-full py-2.5 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-telkomRed press disabled:opacity-50">
              Cabut kartu
            </button>
          )}
        </div>

        {!didukung ? (
          <Pesan tipe="err">
            Perangkat ini tidak mendukung NFC lewat browser. Buka halaman ini dari Chrome
            di Android yang punya NFC untuk mendaftarkan kartu.
          </Pesan>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-5 text-center">
            <span className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
              serial ? "bg-emerald-500 text-white"
                : memindai ? "bg-navy-900 text-white anim-ring"
                : "bg-white text-gray-400 border border-gray-200"
            }`}>
              {serial ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m5 13 4 4L19 7" /></svg>
              ) : (
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 8.5a7 7 0 0 1 0 7" /><path d="M9.5 6a11 11 0 0 1 0 12" />
                  <path d="M13 3.5a15 15 0 0 1 0 17" /><circle cx="3" cy="12" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              )}
            </span>

            <p className="text-sm font-semibold text-navy-900 mt-4">
              {serial ? "Kartu terbaca" : memindai ? "Tempelkan kartu sekarang" : "Siap memindai"}
            </p>

            {serial ? (
              <p className="text-xs font-mono text-gray-500 mt-1.5 break-all">{labelSerial(serial)}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1.5">
                {memindai
                  ? "Tahan kartu di bagian belakang perangkat sekitar satu detik."
                  : "Ketuk tombol di bawah, lalu tempelkan kartunya."}
              </p>
            )}

            <div className="mt-4">
              {memindai ? (
                <button onClick={hentikan} className="w-full py-3 rounded-xl border border-gray-200 text-sm font-medium press">
                  Batal memindai
                </button>
              ) : (
                <button onClick={() => { setSerial(""); mulai(); }}
                  className="w-full py-3 rounded-xl bg-navy-900 text-white text-sm font-semibold press">
                  {serial ? "Pindai kartu lain" : "Mulai Pindai Kartu"}
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 leading-relaxed">
          Kartu apa pun yang ber-NFC bisa dipakai — kartu kosong, kartu akses kantor,
          bahkan kartu uang elektronik. Sistem hanya menyimpan sidik nomor serinya,
          dan tidak menulis apa pun ke kartu.
        </p>
      </div>
    </Sheet>
  );
}
