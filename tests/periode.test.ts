import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/kartu/route";
import { GET as cronAlpa } from "@/app/api/cron/alpa/route";
import { hashKode } from "@/server/kartu";
import { wadah } from "./bantu/wadah";
import {
  dalamPeriode, statusPeriode, irisanPeriode, hariKerja, sisaHari, labelPeriode, tanggalValid,
} from "@/lib/periode";

const KODE = "H7K2M9PQ4RTV";
const PESERTA = "peserta-1";
const OPERATOR = "pembimbing-1";
const HARI = "2026-07-28";

function panggil(body: any, token: string) {
  return POST(
    new Request("http://uji/api/kartu", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  );
}
async function isi(res: Response) {
  return { status: res.status, body: await res.json() };
}

let tOperator = "";

function siapkan(periode: { mulaiPada?: string; selesaiPada?: string } = {}) {
  wadah.db.taruh(`users/${PESERTA}`, {
    name: "Naufal", role: "magang", status: "aktif", ...periode,
  });
  wadah.db.taruh(`users/${OPERATOR}`, { name: "Bu Sari", role: "pembimbing" });
  wadah.db.taruh(`kartu/${hashKode(KODE)}`, { userId: PESERTA, kode: KODE });
  tOperator = wadah.auth.masuk(OPERATOR);
}

// ============================ Perhitungan murni ============================

describe("perhitungan periode", () => {
  it("tanggal di dalam dan di luar batas", () => {
    const p = { mulaiPada: "2026-07-01", selesaiPada: "2026-07-31" };
    expect(dalamPeriode(p, "2026-07-01")).toBe(true);   // batas ikut
    expect(dalamPeriode(p, "2026-07-31")).toBe(true);
    expect(dalamPeriode(p, "2026-06-30")).toBe(false);
    expect(dalamPeriode(p, "2026-08-01")).toBe(false);
  });

  it("batas yang kosong berarti terbuka", () => {
    expect(dalamPeriode({}, "2020-01-01")).toBe(true);
    expect(dalamPeriode({ mulaiPada: "2026-07-01" }, "2030-01-01")).toBe(true);
    expect(dalamPeriode({ selesaiPada: "2026-07-31" }, "2000-01-01")).toBe(true);
  });

  it("status periode dibaca dari hari ini", () => {
    const p = { mulaiPada: "2026-07-01", selesaiPada: "2026-07-31" };
    expect(statusPeriode(p, "2026-06-15")).toBe("belum-mulai");
    expect(statusPeriode(p, "2026-07-15")).toBe("berjalan");
    expect(statusPeriode(p, "2026-08-15")).toBe("selesai");
    expect(statusPeriode({}, "2026-07-15")).toBe("tanpa-periode");
  });

  it("irisan memotong rentang agar tidak melewati periode", () => {
    const p = { mulaiPada: "2026-07-10", selesaiPada: "2026-07-20" };
    expect(irisanPeriode(p, "2026-07-01", "2026-07-31")).toEqual({
      dari: "2026-07-10", sampai: "2026-07-20",
    });
    // Rentang yang seluruhnya di luar periode tidak menghasilkan apa-apa
    expect(irisanPeriode(p, "2026-03-01", "2026-03-31")).toBeNull();
  });

  it("menghitung hari kerja tanpa akhir pekan", () => {
    // 2026-07-27 Senin sampai 2026-07-31 Jumat = 5 hari kerja
    expect(hariKerja("2026-07-27", "2026-07-31")).toBe(5);
    // Ditambah Sabtu dan Minggu, jumlahnya tidak berubah
    expect(hariKerja("2026-07-27", "2026-08-02")).toBe(5);
    // Satu hari Sabtu saja
    expect(hariKerja("2026-08-01", "2026-08-01")).toBe(0);
    expect(hariKerja("2026-07-31", "2026-07-27")).toBe(0);  // terbalik
  });

  it("sisa hari bisa negatif kalau sudah lewat", () => {
    expect(sisaHari({ selesaiPada: "2026-07-31" }, "2026-07-28")).toBe(3);
    expect(sisaHari({ selesaiPada: "2026-07-20" }, "2026-07-28")).toBe(-8);
    expect(sisaHari({}, "2026-07-28")).toBeNull();
  });

  it("label tidak mengulang tahun bila sama", () => {
    expect(labelPeriode({ mulaiPada: "2026-06-01", selesaiPada: "2026-09-01" }))
      .toBe("1 Juni – 1 September 2026");
    expect(labelPeriode({})).toBe("Belum ditentukan");
  });

  it("menolak tanggal yang tidak masuk akal", () => {
    expect(tanggalValid("2026-07-28")).toBe(true);
    expect(tanggalValid("2026-02-30")).toBe(false);   // tanggal yang tidak ada
    expect(tanggalValid("28-07-2026")).toBe(false);
    expect(tanggalValid("")).toBe(false);
  });
});

// ============================ Penerapan di kios ============================

describe("kios menghormati periode", () => {
  it("menerima pindaian di dalam periode", async () => {
    siapkan({ mulaiPada: "2026-07-01", selesaiPada: "2026-08-31" });
    const { status } = await isi(await panggil({ aksi: "absen", kode: KODE }, tOperator));
    expect(status).toBe(200);
  });

  it("menolak sebelum magang dimulai", async () => {
    siapkan({ mulaiPada: "2026-09-01" });
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tOperator));
    expect(status).toBe(403);
    expect(body.pesan).toContain("belum dimulai");
  });

  it("menolak setelah magang berakhir", async () => {
    siapkan({ selesaiPada: "2026-07-20" });
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tOperator));
    expect(status).toBe(403);
    expect(body.pesan).toContain("sudah berakhir");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`)).toBeUndefined();
  });

  it("peserta tanpa periode tetap bisa absen seperti sebelumnya", async () => {
    // Peserta lama belum punya kolom ini; tidak boleh mendadak terkunci
    siapkan({});
    const { status } = await isi(await panggil({ aksi: "absen", kode: KODE }, tOperator));
    expect(status).toBe(200);
  });
});

// ============================ Antrean offline ============================

describe("pindaian tertunda", () => {
  beforeEach(() => siapkan({}));

  it("jamnya dimundurkan sesuai selisih, bukan jam pengiriman", async () => {
    // Jam beku 08:05 WIB; pindaian terjadi 12 menit lalu → 07:53
    const { body } = await isi(
      await panggil({ aksi: "absen", kode: KODE, mundurDetik: 12 * 60 }, tOperator)
    );
    expect(body.jam).toBe("07:53");
    expect(body.tertunda).toBe(true);
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`).tertunda).toBe(true);
  });

  it("status terlambat dihitung dari jam pindaian sebenarnya", async () => {
    // Dikirim pukul 08:20, tapi pindaiannya terjadi pukul 08:05 — masih tepat waktu
    vi.setSystemTime(new Date("2026-07-28T01:20:00.000Z"));
    const { body } = await isi(
      await panggil({ aksi: "absen", kode: KODE, mundurDetik: 15 * 60 }, tOperator)
    );
    expect(body.jam).toBe("08:05");
    expect(body.status).toBe("hadir");
  });

  it("selisih yang tidak masuk akal dipangkas ke batas atas", async () => {
    // Enam jam ke belakang dipotong jadi 30 menit → 07:35, bukan 02:05
    const { body } = await isi(
      await panggil({ aksi: "absen", kode: KODE, mundurDetik: 6 * 3600 }, tOperator)
    );
    expect(body.jam).toBe("07:35");
  });

  it("selisih negatif diabaikan, tidak bisa dipakai memajukan jam", async () => {
    const { body } = await isi(
      await panggil({ aksi: "absen", kode: KODE, mundurDetik: -3600 }, tOperator)
    );
    expect(body.jam).toBe("08:05");
    expect(body.tertunda).toBe(false);
  });

  it("pindaian biasa tidak ditandai tertunda", async () => {
    const { body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tOperator));
    expect(body.tertunda).toBe(false);
  });
});

// ============================ Cron alpa ============================

describe("alpa otomatis mengikuti periode", () => {
  const jalankan = (tanggal: string) =>
    cronAlpa(new Request(`http://uji/api/cron/alpa?tanggal=${tanggal}`));

  beforeEach(() => {
    wadah.db.taruh("users/berjalan", {
      name: "Sedang Magang", role: "magang", status: "aktif",
      mulaiPada: "2026-07-01", selesaiPada: "2026-08-31",
    });
    wadah.db.taruh("users/belum", {
      name: "Belum Mulai", role: "magang", status: "aktif", mulaiPada: "2026-09-01",
    });
    wadah.db.taruh("users/sudah", {
      name: "Sudah Selesai", role: "magang", status: "aktif", selesaiPada: "2026-07-20",
    });
  });

  it("hanya menandai peserta yang sedang dalam periodenya", async () => {
    const r = await (await jalankan(HARI)).json();
    expect(r.nama).toEqual(["Sedang Magang"]);
    expect(wadah.db.ambil(`absensi/berjalan_${HARI}`).status).toBe("alpha");
    expect(wadah.db.ambil(`absensi/belum_${HARI}`)).toBeUndefined();
    expect(wadah.db.ambil(`absensi/sudah_${HARI}`)).toBeUndefined();
  });

  it("menonaktifkan peserta yang periodenya sudah lewat", async () => {
    const r = await (await jalankan(HARI)).json();
    expect(r.dinonaktifkan).toEqual(["Sudah Selesai"]);
    expect(wadah.db.ambil("users/sudah").status).toBe("nonaktif");
    expect(wadah.db.ambil("users/sudah").alasanNonaktif).toBe("periode magang selesai");
    // Yang masih berjalan tidak ikut terbawa
    expect(wadah.db.ambil("users/berjalan").status).toBe("aktif");
  });

  it("akhir pekan dilewati sama sekali", async () => {
    const r = await (await jalankan("2026-08-01")).json();  // Sabtu
    expect(r.dilewati).toBe("akhir pekan");
    expect(r.ditandai).toBe(0);
  });
});
