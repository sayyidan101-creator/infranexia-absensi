import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "@/app/api/kartu/route";
import {
  buatTokenLayar, periksaTokenLayar, slotSaatIni, DETIK_PUTAR, AWALAN_LAYAR,
} from "@/server/sesiLayar";
import { wadah } from "./bantu/wadah";

const PESERTA = "peserta-1";
const LAIN = "peserta-2";
const PEMBINA = "pembimbing-1";
const HARI = "2026-07-28";

let tPeserta = "", tLain = "", tPembina = "";

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

beforeEach(() => {
  // Kunci token diturunkan dari kredensial server, jadi harus ada saat uji
  process.env.FIREBASE_SERVICE_ACCOUNT = "kunci-uji-yang-panjang-sekali";

  wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${LAIN}`, { name: "Siti", role: "magang", status: "aktif" });
  wadah.db.taruh(`users/${PEMBINA}`, { name: "Bu Sari", role: "pembimbing" });
  tPeserta = wadah.auth.masuk(PESERTA);
  tLain = wadah.auth.masuk(LAIN);
  tPembina = wadah.auth.masuk(PEMBINA);
});

// ============================ Token itu sendiri ============================

describe("kode berputar di layar", () => {
  it("berganti setiap periode putaran", () => {
    const a = buatTokenLayar(Date.now()).token;
    const b = buatTokenLayar(Date.now() + DETIK_PUTAR * 1000).token;
    expect(a).not.toBe(b);
  });

  it("tetap sama di dalam satu periode", () => {
    const dasar = slotSaatIni() * DETIK_PUTAR * 1000;
    expect(buatTokenLayar(dasar).token).toBe(buatTokenLayar(dasar + 5_000).token);
  });

  it("kode dari satu putaran lalu masih diterima", () => {
    // Kamera bisa menangkap kode sepersekian detik sebelum layarnya berganti;
    // menolaknya akan terbaca sebagai "aplikasinya rusak"
    const lama = buatTokenLayar(Date.now()).token;
    const nanti = Date.now() + DETIK_PUTAR * 1000;
    expect(periksaTokenLayar(lama, nanti).ok).toBe(true);
  });

  it("kode dua putaran lalu sudah kedaluwarsa", () => {
    const lama = buatTokenLayar(Date.now()).token;
    const nanti = Date.now() + 2 * DETIK_PUTAR * 1000 + 1000;
    const h = periksaTokenLayar(lama, nanti);
    expect(h.ok).toBe(false);
    expect(h.alasan).toBe("kedaluwarsa");
  });

  it("kode masa depan ditolak", () => {
    // Tanpa penjagaan ini, siapa pun yang bisa membuat token bisa menyiapkan
    // kode untuk dipakai besok
    const depan = buatTokenLayar(Date.now() + 10 * DETIK_PUTAR * 1000).token;
    expect(periksaTokenLayar(depan, Date.now()).alasan).toBe("kedaluwarsa");
  });

  it("tanda tangan yang diutak-atik ditolak", () => {
    const { token } = buatTokenLayar();
    const rusak = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(periksaTokenLayar(rusak).alasan).toBe("palsu");
  });

  it("slot yang benar tapi tanda tangan karangan ditolak", () => {
    const palsu = `${AWALAN_LAYAR}${slotSaatIni()}.AAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(periksaTokenLayar(palsu).alasan).toBe("palsu");
  });

  it("bentuk yang tidak dikenali ditolak tanpa melempar", () => {
    for (const jahat of ["", "INX1:H7K2M9PQ4RTV", "https://contoh.com", AWALAN_LAYAR, `${AWALAN_LAYAR}.x`, null, undefined, {}]) {
      expect(periksaTokenLayar(jahat as any).ok).toBe(false);
    }
  });

  it("kunci yang berbeda menghasilkan tanda tangan yang berbeda", () => {
    const { token } = buatTokenLayar();
    process.env.FIREBASE_SERVICE_ACCOUNT = "kunci-lain-sama-sekali";
    expect(periksaTokenLayar(token).alasan).toBe("palsu");
  });
});

// ============================ Penerbitan ============================

describe("hanya pembina yang boleh menerbitkan kode layar", () => {
  it("pembina mendapat kode dan waktu berlakunya", async () => {
    const { status, body } = await isi(await panggil({ aksi: "tokenLayar" }, tPembina));
    expect(status).toBe(200);
    expect(body.token.startsWith(AWALAN_LAYAR)).toBe(true);
    expect(body.detikPutar).toBe(DETIK_PUTAR);
    expect(body.berlakuSampai).toBeGreaterThan(Date.now());
  });

  it("peserta tidak bisa menerbitkan kodenya sendiri", async () => {
    // Kalau bisa, ia tidak perlu datang ke kantor untuk membacanya —
    // seluruh gunanya layar itu hilang
    const { status, body } = await isi(await panggil({ aksi: "tokenLayar" }, tPeserta));
    expect(status).toBe(403);
    expect(body.token).toBeUndefined();
  });

  it("tanpa login pun ditolak", async () => {
    const { status } = await isi(await panggil({ aksi: "tokenLayar" }));
    expect(status).toBe(401);
  });
});

// ============================ Absen mandiri ============================

describe("peserta absen dengan memindai layar", () => {
  const kode = () => buatTokenLayar().token;

  it("kode yang sah mencatat kehadiran atas nama pemindainya", async () => {
    const { status, body } = await isi(await panggil({ aksi: "hadir", token: kode() }, tPeserta));
    expect(status).toBe(200);
    expect(body.mode).toBe("masuk");
    expect(body.nama).toBe("Naufal");

    const catatan = wadah.db.ambil(`absensi/${PESERTA}_${HARI}`);
    expect(catatan.userId).toBe(PESERTA);
    expect(catatan.sumber).toBe("layar");
  });

  it("dua peserta bisa memakai kode yang sama — mereka berdiri di layar yang sama", async () => {
    await panggil({ aksi: "hadir", token: kode() }, tPeserta);
    const { status } = await isi(await panggil({ aksi: "hadir", token: kode() }, tLain));
    expect(status).toBe(200);
    expect(wadah.db.ambil(`absensi/${LAIN}_${HARI}`).userId).toBe(LAIN);
  });

  it("kode kedaluwarsa ditolak dengan pesan yang bisa ditindak", async () => {
    const lama = buatTokenLayar(Date.now()).token;
    vi.setSystemTime(new Date(Date.now() + 3 * DETIK_PUTAR * 1000));

    const { status, body } = await isi(await panggil({ aksi: "hadir", token: lama }, tPeserta));
    expect(status).toBe(410);
    expect(body.pesan).toContain("berganti");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`)).toBeUndefined();
  });

  it("kode karangan tidak mencatat apa pun", async () => {
    const { status } = await isi(
      await panggil({ aksi: "hadir", token: `${AWALAN_LAYAR}${slotSaatIni()}.karangan` }, tPeserta)
    );
    expect(status).toBe(400);
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`)).toBeUndefined();
  });

  it("kartu QR biasa tidak bisa dipakai sebagai kode layar", async () => {
    const { status } = await isi(await panggil({ aksi: "hadir", token: "INX1:H7K2M9PQ4RTV" }, tPeserta));
    expect(status).toBe(400);
  });

  it("tanpa login tidak bisa absen walau kodenya benar", async () => {
    const { status } = await isi(await panggil({ aksi: "hadir", token: kode() }));
    expect(status).toBe(401);
  });

  it("peserta nonaktif tetap ditolak", async () => {
    wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "nonaktif" });
    const { status, body } = await isi(await panggil({ aksi: "hadir", token: kode() }, tPeserta));
    expect(status).toBe(403);
    expect(body.pesan).toContain("tidak aktif");
  });

  it("di luar periode magang tetap ditolak", async () => {
    wadah.db.taruh(`users/${PESERTA}`, {
      name: "Naufal", role: "magang", status: "aktif", selesaiPada: "2026-07-01",
    });
    const { status, body } = await isi(await panggil({ aksi: "hadir", token: kode() }, tPeserta));
    expect(status).toBe(403);
    expect(body.pesan).toContain("sudah berakhir");
  });

  it("pembina yang ikut memindai layar tidak tercatat sebagai peserta", async () => {
    const { status, body } = await isi(await panggil({ aksi: "hadir", token: kode() }, tPembina));
    expect(status).toBe(403);
    expect(body.pesan).toContain("bukan milik peserta magang");
  });

  it("memindai dua kali beruntun tidak membuat catatan pulang", async () => {
    await panggil({ aksi: "hadir", token: kode() }, tPeserta);
    vi.setSystemTime(new Date("2026-07-28T01:05:30.000Z"));   // 30 detik kemudian
    const { body } = await isi(await panggil({ aksi: "hadir", token: kode() }, tPeserta));

    expect(body.mode).toBe("masuk");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`).jamPulang).toBeUndefined();
  });

  it("sore hari, pindaian yang sama mencatat pulang", async () => {
    await panggil({ aksi: "hadir", token: kode() }, tPeserta);
    vi.setSystemTime(new Date("2026-07-28T09:02:00.000Z"));   // 16.02 WIB
    const { body } = await isi(await panggil({ aksi: "hadir", token: kode() }, tPeserta));

    expect(body.mode).toBe("pulang");
    expect(body.jam).toBe("16:02");
  });
});

// ============================ Geofence tetap berlaku ============================

describe("geofence tetap menjaga absen mandiri", () => {
  beforeEach(() => {
    wadah.db.taruh("config/absensi", {
      geofenceAktif: true, kantorLat: -2.976, kantorLng: 104.775, radiusMeter: 150,
    });
  });

  it("di luar radius ditolak", async () => {
    const { status, body } = await isi(
      await panggil(
        { aksi: "hadir", token: buatTokenLayar().token, lat: -2.9, lng: 104.9 },
        tPeserta
      )
    );
    expect(status).toBe(403);
    expect(body.pesan).toContain("di luar radius");
    expect(wadah.db.ambil(`absensi/${PESERTA}_${HARI}`)).toBeUndefined();
  });

  it("tanpa izin lokasi ditolak, tidak dilewatkan begitu saja", async () => {
    const { status, body } = await isi(
      await panggil({ aksi: "hadir", token: buatTokenLayar().token }, tPeserta)
    );
    expect(status).toBe(412);
    expect(body.pesan).toContain("Lokasi perangkat");
  });

  it("di dalam radius diterima", async () => {
    const { status } = await isi(
      await panggil(
        { aksi: "hadir", token: buatTokenLayar().token, lat: -2.9761, lng: 104.7751 },
        tPeserta
      )
    );
    expect(status).toBe(200);
  });
});
