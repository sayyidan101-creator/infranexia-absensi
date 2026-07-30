import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET, POST } from "@/app/api/status/route";
import { wadah } from "./bantu/wadah";

const ADMIN = "admin-1";
const PEMBINA = "pembimbing-1";
const PESERTA = "peserta-1";
const RAHASIA = "rahasia-uji-panjang";

let tAdmin = "", tPembina = "", tPeserta = "";

const asal = { ...process.env };

beforeEach(() => {
  process.env.CRON_SECRET = RAHASIA;
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "proyek-uji";
  delete process.env.FIREBASE_SERVICE_ACCOUNT;

  wadah.db.taruh(`users/${ADMIN}`, { name: "Admin", role: "admin" });
  wadah.db.taruh(`users/${PEMBINA}`, { name: "Bu Sari", role: "pembimbing" });
  wadah.db.taruh(`users/${PESERTA}`, { name: "Naufal", role: "magang", status: "aktif" });
  tAdmin = wadah.auth.masuk(ADMIN);
  tPembina = wadah.auth.masuk(PEMBINA);
  tPeserta = wadah.auth.masuk(PESERTA);
});

afterEach(() => {
  process.env = { ...asal };
});

const ambil = (token?: string) =>
  GET(new Request("http://uji/api/status", token ? { headers: { Authorization: `Bearer ${token}` } } : undefined));

const kirim = (token?: string) =>
  POST(
    new Request("http://uji/api/status", {
      method: "POST",
      headers: token
        ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
        : { "Content-Type": "application/json" },
      body: "{}",
    })
  );

async function isi(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("laporan status tidak lagi terbuka untuk umum", () => {
  it("GET tanpa apa pun hanya menjawab bahwa server hidup", async () => {
    const { status, body } = await isi(await ambil());
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // Semua yang dulu bocor ke siapa pun di internet kini tidak ada di sini
    expect(body.env).toBeUndefined();
    expect(body.deployment).toBeUndefined();
    expect(body.serviceAccount).toBeUndefined();
    expect(body.projectIdAplikasi).toBeUndefined();
    expect(body.namaMiripCron).toBeUndefined();
    expect(body.koneksiFirebase).toBeUndefined();
  });

  it("peserta magang tidak bisa membaca laporan penuh", async () => {
    const { status, body } = await isi(await kirim(tPeserta));
    expect(status).toBe(403);
    expect(body.env).toBeUndefined();
  });

  it("pembimbing pun tidak bisa — ini urusan admin", async () => {
    const { status } = await isi(await kirim(tPembina));
    expect(status).toBe(403);
  });

  it("tanpa token sama sekali ditolak", async () => {
    const { status } = await isi(await kirim());
    expect(status).toBe(401);
  });
});

describe("laporan penuh untuk yang berwenang", () => {
  it("admin menerima laporan lengkap", async () => {
    const { status, body } = await isi(await kirim(tAdmin));
    expect(status).toBe(200);
    expect(body.env).toBeTruthy();
    expect(body.deployment).toBeTruthy();
    expect(body.projectIdAplikasi).toBe("proyek-uji");
  });

  it("pembawa CRON_SECRET juga bisa — jalan keluar saat Firebase tumbang", async () => {
    // Alasannya: kalau kredensial servernya rusak, tidak ada yang bisa login,
    // dan diagnosa yang menuntut login akan mati bersama hal yang didiagnosa.
    const { status, body } = await isi(await ambil(RAHASIA));
    expect(status).toBe(200);
    expect(body.env).toBeTruthy();
    expect(body.deployment).toBeTruthy();
  });

  it("rahasia yang salah tidak membuka apa pun", async () => {
    const { body } = await isi(await ambil("rahasia-palsu"));
    expect(body.env).toBeUndefined();
    expect(body.ok).toBe(true);
  });

  it("bila CRON_SECRET belum diatur, jalan keluarnya tertutup", async () => {
    delete process.env.CRON_SECRET;
    const { body } = await isi(await ambil("Bearer undefined"));
    expect(body.env).toBeUndefined();
  });
});

describe("pemeriksaan variabel lingkungan", () => {
  it("membedakan belum ada, kosong, dan terisi", async () => {
    process.env.CRON_SECRET = "x".repeat(64);
    process.env.ANDROID_FINGERPRINTS = "   ";           // ada tapi kosong
    delete process.env.NEXT_PUBLIC_ZONA_WAKTU;          // belum ada

    const { body } = await isi(await kirim(tAdmin));

    expect(body.env.CRON_SECRET).toEqual({ terpasang: true, kosong: false, panjang: 64 });
    expect(body.env.ANDROID_FINGERPRINTS).toEqual({ terpasang: true, kosong: true, panjang: 3 });
    expect(body.env.NEXT_PUBLIC_ZONA_WAKTU).toEqual({ terpasang: false, kosong: null, panjang: 0 });
  });

  it("tidak pernah menyertakan nilai variabel apa pun", async () => {
    process.env.CRON_SECRET = "RAHASIA-YANG-TIDAK-BOLEH-BOCOR";
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"private_key":"JANGAN-BOCOR"}';

    const { body } = await isi(await kirim(tAdmin));
    const teks = JSON.stringify(body);

    expect(teks).not.toContain("RAHASIA-YANG-TIDAK-BOLEH-BOCOR");
    expect(teks).not.toContain("JANGAN-BOCOR");
    expect(teks).not.toContain("private_key");
  });

  it("nama variabel ditulis dalam kurung siku agar spasi tersembunyi terlihat", async () => {
    process.env["CRON_SECRET_SALAH "] = "apa pun";
    const { body } = await isi(await kirim(tAdmin));
    expect(body.namaMiripCron).toContain("[CRON_SECRET_SALAH ]");
    delete process.env["CRON_SECRET_SALAH "];
  });
});
