import { panggilApi } from "@/lib/api";

export interface HasilAbsenKartu {
  mode: "masuk" | "pulang";
  status: string;
  jam: string;
  tanggal?: string;
  nama: string;
  foto?: string | null;
  divisi?: string;
  diulang: boolean;
}

/** Daftarkan sebuah kartu ke peserta (admin). */
export async function daftarkanKartu(uid: string, serial: string): Promise<string> {
  const r = await panggilApi<{ label: string }>("/api/kartu", { aksi: "daftar", uid, serial });
  return r.label;
}

/** Cabut kartu dari peserta (admin). */
export async function cabutKartu(uid: string): Promise<void> {
  await panggilApi("/api/kartu", { aksi: "cabut", uid });
}

/** Catat absensi dari kartu yang ditempelkan di kios. */
export async function absenDenganKartu(
  serial: string,
  lat?: number | null,
  lng?: number | null
): Promise<HasilAbsenKartu> {
  return panggilApi<HasilAbsenKartu>("/api/kartu", {
    aksi: "absen", serial, lat: lat ?? null, lng: lng ?? null,
  });
}

/** Catat absensi manual bila kartu atau NFC bermasalah. */
export async function absenManual(
  uid: string,
  lat?: number | null,
  lng?: number | null
): Promise<HasilAbsenKartu> {
  return panggilApi<HasilAbsenKartu>("/api/kartu", {
    aksi: "manual", uid, lat: lat ?? null, lng: lng ?? null,
  });
}
