import { vi, beforeEach, afterAll } from "vitest";

/**
 * Berkas penyiapan global.
 *
 * Firestore, Firebase Auth, dan pengiriman email digantikan tiruan dalam
 * memori. Pabrik `vi.mock` diangkat ke atas berkas, jadi modul tiruannya
 * diimpor secara malas di dalam pabrik — bukan lewat impor biasa di atas.
 */
vi.mock("@/server/firebaseAdmin", async () => {
  const { wadah } = await import("./wadah");
  return {
    adminDb: () => wadah.db,
    adminAuth: () => wadah.auth,
  };
});

vi.mock("firebase-admin/firestore", async () => {
  const { FieldValuePalsu, TimestampPalsu } = await import("./firestorePalsu");
  return { FieldValue: FieldValuePalsu, Timestamp: TimestampPalsu };
});

// SDK Firebase sisi klien menuntut kunci API yang sah begitu diimpor.
// Uji hanya memanggil fungsi murni dari `@/lib/absensi` — perhitungan rekap,
// batas bulan, geser hari — jadi lapisan koneksinya cukup dikosongkan.
vi.mock("@/lib/firebase", () => ({ auth: {}, db: {}, storage: {} }));

// Uji tidak boleh benar-benar mengirim email.
vi.mock("@/server/email", () => ({
  emailAktif: () => false,
  kirimEmailAkun: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  const { resetWadah } = await import("./wadah");
  resetWadah();
  // Jam dibekukan pada 28 Juli 2026 pukul 08:05 WIB — sedikit lewat jam masuk
  // 08:00 tapi masih di dalam toleransi 15 menit.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-28T01:05:00.000Z"));
});

afterAll(() => {
  vi.useRealTimers();
});
