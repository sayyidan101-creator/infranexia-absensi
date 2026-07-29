import { panggilApi } from "@/lib/api";

export interface BarisJejak {
  id: string;
  aksi: string;
  pelaku: string;
  namaPelaku: string;
  sasaran?: string;
  namaSasaran?: string;
  rincian?: string;
  padaMs: number;
}

export interface BarisGalat {
  id: string;
  pesan: string;
  tumpukan?: string;
  halaman?: string;
  perangkat?: string;
  nama?: string;
  peran?: string;
  padaMs: number;
}

export const LABEL_AKSI: Record<string, string> = {
  "akun.buat": "membuat akun",
  "akun.ubah": "mengubah data",
  "akun.hapus": "menghapus akun",
  "kartu.terbit": "menerbitkan kartu",
  "kartu.cabut": "mencabut kartu",
  "izin.setujui": "menyetujui izin",
  "izin.tolak": "menolak izin",
  "kegiatan.periksa": "memeriksa catatan kegiatan",
  "config.ubah": "mengubah pengaturan",
  "data.bersihkan": "membersihkan data",
};

/** Tindakan yang pantas menonjol karena tidak bisa dibatalkan. */
export const AKSI_BERAT = new Set(["akun.hapus", "data.bersihkan", "kartu.cabut"]);

export async function ambilJejak(batas = 100): Promise<BarisJejak[]> {
  const r = await panggilApi<{ jejak: BarisJejak[] }>("/api/users", { aksi: "jejak", batas });
  return r.jejak;
}

export async function ambilGalat(): Promise<BarisGalat[]> {
  const r = await panggilApi<{ galat: BarisGalat[] }>("/api/galat", { aksi: "daftar" });
  return r.galat;
}

export async function hapusGalat(): Promise<number> {
  const r = await panggilApi<{ dihapus: number }>("/api/galat", { aksi: "hapus" });
  return r.dihapus;
}

/**
 * Unduh seluruh isi Firestore sebagai satu berkas JSON.
 *
 * Firebase paket gratis tidak menyediakan pencadangan terjadwal, jadi ini
 * satu-satunya jaring pengaman bila ada yang terhapus tidak sengaja.
 * Simpan hasilnya di luar Firebase — cadangan yang berada di tempat yang
 * sama dengan aslinya bukan cadangan.
 */
export async function unduhCadangan(): Promise<{ nama: string; jumlah: Record<string, number> }> {
  const r = await panggilApi<any>("/api/users", { aksi: "cadangan" });

  const nama = `cadangan-infranexia-${new Date().toISOString().slice(0, 10)}.json`;
  const berkas = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(berkas);

  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.click();
  // Beri jeda sebelum dilepas; sebagian browser membatalkan unduhan bila
  // URL-nya dicabut pada saat yang sama dengan kliknya.
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { nama, jumlah: r.jumlah || {} };
}

export function waktuRelatif(ms: number): string {
  if (!ms) return "—";
  const detik = Math.round((Date.now() - ms) / 1000);
  if (detik < 60) return "baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  if (detik < 604800) return `${Math.floor(detik / 86400)} hari lalu`;
  return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
