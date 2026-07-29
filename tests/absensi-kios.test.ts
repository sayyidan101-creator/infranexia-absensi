import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/kartu/route";
import { hashKode } from "@/server/kartu";
import { wadah } from "./bantu/wadah";

const KODE = "H7K2M9PQ4RTV";
const PESERTA = "peserta-1";
const OPERATOR = "pembimbing-1";
const HARI = "2026-07-28";

function panggil(body: any, token?: string) {
  return POST(
    new Request("http://uji/api/kartu", {
      method: "POST",
      headers: token
        ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
        : { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function isi(res: Response) {
  return { status: res.status, body: await res.json() };
}

/** Keadaan awal: satu peserta aktif berkartu, satu pembimbing, satu admin. */
function siapkanOrang() {
  wadah.db.taruh(`users/${PESERTA}`, {
    name: "Naufal", role: "magang", status: "aktif", jurusan: "Teknik Informatika",
  });
  wadah.db.taruh(`users/${OPERATOR}`, { name: "Bu Sari", role: "pembimbing" });
  wadah.db.taruh("users/admin-1", { name: "Admin", role: "admin" });
  wadah.db.taruh(`kartu/${hashKode(KODE)}`, { userId: PESERTA, kode: KODE, label: "…4RTV" });
}

let tokenOperator = "";
let tokenAdmin = "";
let tokenPeserta = "";

beforeEach(() => {
  siapkanOrang();
  tokenOperator = wadah.auth.masuk(OPERATOR);
  tokenAdmin = wadah.auth.masuk("admin-1");
  tokenPeserta = wadah.auth.masuk(PESERTA);
});

describe("absen masuk", () => {
  it("mencatat hadir ketika masih di dalam toleransi", async () => {
    // Jam beku 08:05 WIB, jam masuk 08:00, toleransi 15 menit
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(status).toBe(200);
    expect(body.mode).toBe("masuk");
    expect(body.status).toBe("hadir");
    expect(body.nama).toBe("Naufal");
    expect(body.jam).toBe("08:05");

    const catatan = wadah.db.ambil(`absensi/${PESERTA}_${HARI}`);
    expect(catatan.status).toBe("hadir");
    expect(catatan.sumber).toBe("kartu");
    expect(catatan.operator).toBe(OPERATOR);
    expect(catatan.jamMasuk).toBeTruthy();
    expect(catatan.jamPulang).toBeUndefined();
  });

  it("menandai terlambat begitu melewati toleransi", async () => {
    vi.setSystemTime(new Date("2026-07-28T01:16:00.000Z")); // 08:16 WIB
    const { body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(body.status).toBe("terlambat");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`).status).toBe("terlambat");
  });

  it("menghormati toleransi yang diubah admin", async () => {
    wadah.db.taruh("config/absensi", { jamMasuk: "07:30", toleransiMenit: 0 });
    const { body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));
    expect(body.status).toBe("terlambat"); // 08:05 sudah lewat 07:30
  });
});

describe("absen pulang", () => {
  it("pindai kedua mengisi jam pulang tanpa mengubah status", async () => {
    await panggil({ aksi: "absen", kode: KODE }, tokenOperator);

    vi.setSystemTime(new Date("2026-07-28T09:02:00.000Z")); // 16:02 WIB
    const { body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(body.mode).toBe("pulang");
    expect(body.status).toBe("hadir");
    expect(body.jam).toBe("16:02");

    const catatan = wadah.db.ambil(`absensi/${PESERTA}_${HARI}`);
    expect(catatan.jamMasuk).toBeTruthy();
    expect(catatan.jamPulang).toBeTruthy();
  });

  it("menolak pindai ketiga di hari yang sama", async () => {
    await panggil({ aksi: "absen", kode: KODE }, tokenOperator);
    vi.setSystemTime(new Date("2026-07-28T09:02:00.000Z"));
    await panggil({ aksi: "absen", kode: KODE }, tokenOperator);

    vi.setSystemTime(new Date("2026-07-28T09:30:00.000Z"));
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(status).toBe(412);
    expect(body.pesan).toContain("sudah absen masuk dan pulang");
  });

  it("menahan absen pulang bila jeda minimum belum terpenuhi", async () => {
    wadah.db.taruh("config/absensi", { minJedaMenit: 60 });
    await panggil({ aksi: "absen", kode: KODE }, tokenOperator);

    vi.setSystemTime(new Date("2026-07-28T01:35:00.000Z")); // baru 30 menit
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(status).toBe(412);
    expect(body.pesan).toContain("60 menit");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`).jamPulang).toBeUndefined();
  });
});

describe("pindaian berulang", () => {
  it("kartu yang terbaca dua kali beruntun dihitung sekali", async () => {
    await panggil({ aksi: "absen", kode: KODE }, tokenOperator);

    vi.setSystemTime(new Date("2026-07-28T01:05:08.000Z")); // 8 detik kemudian
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(status).toBe(200);
    expect(body.diulang).toBe(true);
    // Yang penting: jam pulang TIDAK ikut terisi oleh pindaian kembar
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`).jamPulang).toBeUndefined();
  });

  it("setelah lewat jendela anti-ganda, pindaian dianggap absen pulang", async () => {
    await panggil({ aksi: "absen", kode: KODE }, tokenOperator);

    vi.setSystemTime(new Date("2026-07-28T01:05:25.000Z")); // 25 detik, lewat 20
    const { body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));

    expect(body.diulang).toBe(false);
    expect(body.mode).toBe("pulang");
  });
});

describe("kartu yang tidak sah", () => {
  it("menolak QR yang bukan terbitan sistem", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "absen", kode: "https://contoh.com" }, tokenOperator)
    );
    expect(status).toBe(400);
    expect(body.pesan).toContain("bukan kartu absen InfraNexia");
  });

  it("menolak kode berbentuk benar tapi belum pernah diterbitkan", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "absen", kode: "ZZZZ9999ZZZZ" }, tokenOperator)
    );
    expect(status).toBe(404);
    expect(body.pesan).toContain("tidak berlaku");
  });

  it("menolak kartu milik peserta yang sudah tidak aktif", async () => {
    wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "nonaktif" });
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));
    expect(status).toBe(403);
    expect(body.pesan).toContain("tidak aktif");
  });

  it("kartu yang dicabut langsung berhenti berlaku", async () => {
    await panggil({ aksi: "cabut", uid: PESERTA }, tokenAdmin);
    const { status } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));
    expect(status).toBe(404);
  });
});

describe("siapa yang boleh mencatat", () => {
  it("peserta tidak bisa mencatat absensinya sendiri dari ponselnya", async () => {
    // Inilah yang membuat absen dari rumah mustahil
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenPeserta));
    expect(status).toBe(403);
    expect(body.pesan).toContain("Hanya admin atau pembimbing");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`)).toBeUndefined();
  });

  it("tanpa sesi login sama sekali ditolak", async () => {
    const { status } = await isi(await panggil({ aksi: "absen", kode: KODE }));
    expect(status).toBe(401);
  });

  it("pembimbing tidak boleh menerbitkan kartu", async () => {
    const { status } = await isi(await panggil({ aksi: "terbitkan", uid: PESERTA }, tokenOperator));
    expect(status).toBe(403);
  });
});

describe("geofencing", () => {
  beforeEach(() => {
    // Kantor di Palembang, radius 150 m
    wadah.db.taruh("config/absensi", {
      geofenceAktif: true, kantorLat: -2.9761, kantorLng: 104.7754, radiusMeter: 150,
    });
  });

  it("menerima pindaian dari dalam radius", async () => {
    const { status } = await isi(
      await panggil({ aksi: "absen", kode: KODE, lat: -2.9762, lng: 104.7755 }, tokenOperator)
    );
    expect(status).toBe(200);
  });

  it("menolak pindaian dari luar radius", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "absen", kode: KODE, lat: -2.99, lng: 104.79 }, tokenOperator)
    );
    expect(status).toBe(403);
    expect(body.pesan).toMatch(/di luar radius/);
  });

  it("menolak bila perangkat tidak memberi lokasi", async () => {
    const { status, body } = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));
    expect(status).toBe(412);
    expect(body.pesan).toContain("Lokasi perangkat");
  });
});

describe("penerbitan dan pencabutan kartu", () => {
  it("menerbitkan kartu baru sekaligus mematikan kartu lama", async () => {
    const { body } = await isi(await panggil({ aksi: "terbitkan", uid: PESERTA }, tokenAdmin));

    expect(body.kode).toHaveLength(12);
    expect(body.kode).not.toBe(KODE);

    // Kartu lama tidak lagi dikenali
    const lama = await isi(await panggil({ aksi: "absen", kode: KODE }, tokenOperator));
    expect(lama.status).toBe(404);

    // Kartu baru langsung berlaku
    const baru = await isi(await panggil({ aksi: "absen", kode: body.kode }, tokenOperator));
    expect(baru.status).toBe(200);
    expect(baru.body.nama).toBe("Naufal");
  });

  it("menandai peserta sudah punya kartu", async () => {
    await panggil({ aksi: "terbitkan", uid: PESERTA }, tokenAdmin);
    const u = wadah.db.ambil(`users/${PESERTA}`);
    expect(u.kartuTerdaftar).toBe(true);
    expect(u.kartuLabel).toMatch(/^…/);
  });

  it("menolak menerbitkan kartu untuk yang bukan peserta magang", async () => {
    const { status } = await isi(await panggil({ aksi: "terbitkan", uid: OPERATOR }, tokenAdmin));
    expect(status).toBe(400);
  });

  it("pencabutan membersihkan penanda di profil", async () => {
    await panggil({ aksi: "cabut", uid: PESERTA }, tokenAdmin);
    expect(wadah.db.ambil(`users/${PESERTA}`).kartuTerdaftar).toBe(false);
  });
});

describe("pencatatan manual", () => {
  it("pembimbing boleh mencatat tanpa kartu, dan sumbernya tercatat", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "manual", uid: PESERTA }, tokenOperator)
    );
    expect(status).toBe(200);
    expect(body.mode).toBe("masuk");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`).sumber).toBe("manual");
  });

  it("peserta tidak bisa mencatat manual untuk dirinya sendiri", async () => {
    const { status } = await isi(await panggil({ aksi: "manual", uid: PESERTA }, tokenPeserta));
    expect(status).toBe(403);
  });
});
