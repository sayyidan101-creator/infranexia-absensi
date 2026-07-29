import { describe, it, expect, beforeEach } from "vitest";
import { POST as kartuPOST } from "@/app/api/kartu/route";
import { POST as izinPOST } from "@/app/api/izin/route";
import { wadah } from "./bantu/wadah";

const PESERTA = "peserta-1";
const ADMIN = "admin-1";
const PEMBINA = "pembimbing-1";

function panggil(jalur: string, fn: any, body: any, token: string) {
  return fn(
    new Request(`http://uji${jalur}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  );
}

/**
 * Seluruh catatan jejak menurut urutan penulisan.
 * Jam uji dibekukan, jadi dua catatan berurutan punya `padaMs` yang sama —
 * mengurutkannya berdasar waktu tidak menentukan apa-apa.
 */
function jejak(): any[] {
  const kol = (wadah.db as any).data.get("jejak") as Map<string, any> | undefined;
  return [...(kol?.values() || [])];
}
const terakhir = () => jejak()[jejak().length - 1];

let tAdmin = "", tPembina = "", tPeserta = "";

beforeEach(() => {
  wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${ADMIN}`, { name: "Admin InfraNexia", role: "admin" });
  wadah.db.taruh(`users/${PEMBINA}`, { name: "Bu Sari", role: "pembimbing" });
  tAdmin = wadah.auth.masuk(ADMIN);
  tPembina = wadah.auth.masuk(PEMBINA);
  tPeserta = wadah.auth.masuk(PESERTA);
});

describe("jejak audit", () => {
  it("mencatat penerbitan kartu beserta pelakunya", async () => {
    await panggil("/api/kartu", kartuPOST, { aksi: "terbitkan", uid: PESERTA }, tAdmin);

    const j = terakhir();
    expect(j.aksi).toBe("kartu.terbit");
    expect(j.pelaku).toBe(ADMIN);
    expect(j.namaPelaku).toBe("Admin InfraNexia");
    expect(j.namaSasaran).toBe("Naufal");
  });

  it("mencatat pencabutan kartu", async () => {
    await panggil("/api/kartu", kartuPOST, { aksi: "terbitkan", uid: PESERTA }, tAdmin);
    await panggil("/api/kartu", kartuPOST, { aksi: "cabut", uid: PESERTA }, tAdmin);

    expect(terakhir().aksi).toBe("kartu.cabut");
    expect(jejak()).toHaveLength(2);
  });

  it("mencatat siapa menyetujui izin siapa", async () => {
    const res = await panggil("/api/izin", izinPOST, {
      aksi: "ajukan", jenis: "sakit", alasan: "Demam sejak semalam.",
      tanggalMulai: "2026-07-29",
    }, tPeserta);
    const { id } = await (res as Response).json();

    await panggil("/api/izin", izinPOST, { aksi: "proses", id, keputusan: "disetujui" }, tPembina);

    const j = terakhir();
    expect(j.aksi).toBe("izin.setujui");
    expect(j.pelaku).toBe(PEMBINA);
    expect(j.namaSasaran).toBe("Naufal");
    expect(j.rincian).toContain("sakit");
  });

  it("penolakan izin tercatat berbeda dari persetujuan", async () => {
    const res = await panggil("/api/izin", izinPOST, {
      aksi: "ajukan", jenis: "izin", alasan: "Ada keperluan keluarga.",
      tanggalMulai: "2026-07-29",
    }, tPeserta);
    const { id } = await (res as Response).json();

    await panggil("/api/izin", izinPOST, { aksi: "proses", id, keputusan: "ditolak" }, tPembina);
    expect(terakhir().aksi).toBe("izin.tolak");
  });

  it("tindakan yang gagal tidak meninggalkan jejak palsu", async () => {
    // Pembimbing tidak berhak menerbitkan kartu
    await panggil("/api/kartu", kartuPOST, { aksi: "terbitkan", uid: PESERTA }, tPembina);
    expect(jejak()).toHaveLength(0);
  });
});
