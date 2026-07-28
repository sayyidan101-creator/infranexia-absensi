"use client";

/**
 * Pembungkus Web NFC.
 *
 * Yang dibaca hanyalah **nomor seri** kartu — tidak ada data yang ditulis ke
 * kartu. Konsekuensinya kartu apa pun yang ber-NFC bisa dipakai: kartu kosong,
 * kartu akses kantor, bahkan kartu e-money. Kartunya tidak menyimpan identitas
 * apa pun; pemetaan serial ke peserta hanya ada di server.
 *
 * Dukungan: Chrome di Android. iOS tidak mengizinkan halaman web membaca NFC.
 */

export type StatusNfc = "siap" | "tidak-didukung" | "butuh-izin" | "ditolak" | "galat";

export function nfcTersedia(): boolean {
  return typeof window !== "undefined" && "NDEFReader" in window;
}

export interface PemindaiNfc {
  hentikan: () => void;
}

/**
 * Mulai memindai. Harus dipanggil dari gestur pengguna (klik tombol),
 * karena browser meminta izin NFC saat itu.
 */
export async function mulaiPindai(
  saatKartu: (serial: string) => void,
  saatGalat?: (pesan: string) => void
): Promise<PemindaiNfc> {
  if (!nfcTersedia()) {
    throw new Error(
      "Perangkat atau browser ini tidak mendukung NFC. Gunakan Chrome di Android yang memiliki NFC."
    );
  }

  const Pembaca = (window as any).NDEFReader;
  const pembaca = new Pembaca();
  const kontrol = new AbortController();

  pembaca.addEventListener("reading", (ev: any) => {
    const serial = String(ev?.serialNumber || "").trim();
    if (serial) saatKartu(serial.toLowerCase());
    else saatGalat?.("Kartu terbaca tapi tidak punya nomor seri. Coba kartu lain.");
  });

  pembaca.addEventListener("readingerror", () => {
    saatGalat?.("Kartu gagal dibaca. Tempelkan lebih lama dan tepat di bagian belakang perangkat.");
  });

  try {
    await pembaca.scan({ signal: kontrol.signal });
  } catch (e: any) {
    if (e?.name === "NotAllowedError") {
      throw new Error("Izin NFC ditolak. Aktifkan izin NFC untuk situs ini lalu coba lagi.");
    }
    if (e?.name === "NotSupportedError") {
      throw new Error("NFC tidak aktif di perangkat ini. Nyalakan NFC lewat pengaturan sistem.");
    }
    throw new Error(e?.message || "Gagal memulai pemindaian NFC.");
  }

  return { hentikan: () => kontrol.abort() };
}

/** Ringkas serial menjadi bentuk yang enak dibaca manusia. */
export function labelSerial(serial: string): string {
  const bersih = serial.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return bersih.match(/.{1,4}/g)?.join(":") || bersih;
}
