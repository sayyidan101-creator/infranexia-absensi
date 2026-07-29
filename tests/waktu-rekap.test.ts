import { describe, it, expect } from "vitest";
import { waktuLokal, keMenit, jarakMeter } from "@/server/absensi";
import { hitungRekap, batasBulan, geserHari } from "@/lib/absensi";
import { gaya, terhitungHadir, URUTAN } from "@/lib/status";

describe("waktu kantor", () => {
  it("menerjemahkan waktu server ke zona kantor, bukan zona perangkat", () => {
    // Inilah yang membuat mengubah jam ponsel tidak ada gunanya
    const utc = new Date("2026-07-28T01:05:00.000Z");
    const w = waktuLokal("Asia/Jakarta", utc);
    expect(w.tanggal).toBe("2026-07-28");
    expect(w.jam).toBe("08:05");
    expect(w.menit).toBe(8 * 60 + 5);
  });

  it("tanggalnya ikut zona kantor saat melewati tengah malam UTC", () => {
    // 27 Juli 17:30 UTC sudah tanggal 28 di Jakarta
    const w = waktuLokal("Asia/Jakarta", new Date("2026-07-27T17:30:00.000Z"));
    expect(w.tanggal).toBe("2026-07-28");
    expect(w.jam).toBe("00:30");
  });

  it("mengikuti zona lain bila kantornya di WITA", () => {
    const w = waktuLokal("Asia/Makassar", new Date("2026-07-28T01:05:00.000Z"));
    expect(w.jam).toBe("09:05");
  });

  it("mengubah jam tertulis menjadi menit", () => {
    expect(keMenit("08:00")).toBe(480);
    expect(keMenit("00:00")).toBe(0);
    expect(keMenit("16:30")).toBe(990);
    expect(keMenit("")).toBe(0);
  });
});

describe("jarak ke kantor", () => {
  it("titik yang sama berjarak nol", () => {
    expect(jarakMeter(-2.9761, 104.7754, -2.9761, 104.7754)).toBe(0);
  });

  it("seperseribu derajat lintang kira-kira 111 meter", () => {
    const d = jarakMeter(-2.9761, 104.7754, -2.9771, 104.7754);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("jarak antarkota terhitung dalam ratusan kilometer", () => {
    // Palembang – Jakarta, kira-kira 420 km
    const d = jarakMeter(-2.9761, 104.7754, -6.2088, 106.8456);
    expect(d).toBeGreaterThan(400_000);
    expect(d).toBeLessThan(450_000);
  });
});

describe("rekap kehadiran", () => {
  const buat = (daftar: string[]) => daftar.map((status) => ({ status } as any));

  it("menghitung persentase dari hari kerja yang tercatat", () => {
    const r = hitungRekap(buat(["hadir", "hadir", "terlambat", "izin", "alpha"]));
    expect(r.hadir).toBe(2);
    expect(r.terlambat).toBe(1);
    expect(r.hariKerja).toBe(5);
    // Terlambat tetap terhitung masuk kerja
    expect(r.persenKehadiran).toBe(60);
  });

  it("tidak membagi dengan nol saat belum ada catatan", () => {
    const r = hitungRekap([]);
    expect(r.hariKerja).toBe(0);
    expect(r.persenKehadiran).toBe(0);
  });

  it("kehadiran penuh menghasilkan seratus persen", () => {
    expect(hitungRekap(buat(["hadir", "terlambat"])).persenKehadiran).toBe(100);
  });

  it("izin dan sakit tidak dihitung sebagai kehadiran", () => {
    expect(hitungRekap(buat(["izin", "sakit"])).persenKehadiran).toBe(0);
  });
});

describe("batas bulan dan geser hari", () => {
  it("mengetahui panjang tiap bulan", () => {
    expect(batasBulan(2026, 7)).toEqual({ dari: "2026-07-01", sampai: "2026-07-31" });
    expect(batasBulan(2026, 2)).toEqual({ dari: "2026-02-01", sampai: "2026-02-28" });
    expect(batasBulan(2026, 4)).toEqual({ dari: "2026-04-01", sampai: "2026-04-30" });
  });

  it("mengenali tahun kabisat", () => {
    expect(batasBulan(2028, 2).sampai).toBe("2028-02-29");
  });

  it("geser hari melompati batas bulan dan tahun dengan benar", () => {
    expect(geserHari("2026-07-28", 1)).toBe("2026-07-29");
    expect(geserHari("2026-07-31", 1)).toBe("2026-08-01");
    expect(geserHari("2026-01-01", -1)).toBe("2025-12-31");
    expect(geserHari("2026-07-28", -30)).toBe("2026-06-28");
  });
});

describe("gaya status", () => {
  it("tiap status punya label dan warna", () => {
    for (const s of URUTAN) {
      expect(gaya(s).pendek).toBeTruthy();
      expect(gaya(s).heks).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("status tak dikenal tidak membuat tampilan rusak", () => {
    expect(gaya(undefined).pendek).toBe("—");
    expect(gaya(null).lencana).toContain("gray");
    expect(gaya("entah-apa").pendek).toBe("ENTAH-APA");
  });

  it("hanya hadir dan terlambat yang terhitung masuk", () => {
    expect(terhitungHadir("hadir")).toBe(true);
    expect(terhitungHadir("terlambat")).toBe(true);
    expect(terhitungHadir("izin")).toBe(false);
    expect(terhitungHadir("sakit")).toBe(false);
    expect(terhitungHadir("alpha")).toBe(false);
    expect(terhitungHadir(undefined)).toBe(false);
  });
});
