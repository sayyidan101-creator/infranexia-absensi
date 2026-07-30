import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/assetlinks/route";
import { rapikanSidik, daftarSidik } from "@/lib/assetlinks";

const SIDIK =
  "A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90";

const asal = { ...process.env };
beforeEach(() => {
  delete process.env.ANDROID_PACKAGE;
  delete process.env.ANDROID_FINGERPRINTS;
});
afterEach(() => {
  process.env = { ...asal };
});

async function baca() {
  const res = await GET();
  return { status: res.status, body: await res.json() };
}

describe("merapikan sidik jari", () => {
  it("menerima bentuk keytool apa adanya", () => {
    expect(rapikanSidik(SIDIK)).toBe(SIDIK);
  });

  it("menerima huruf kecil dan tanpa titik dua", () => {
    // Play Console dan Gradle menempelkannya dalam bentuk berbeda-beda;
    // ketiganya sidik yang sama dan tidak boleh salah satunya ditolak
    expect(rapikanSidik(SIDIK.toLowerCase())).toBe(SIDIK);
    expect(rapikanSidik(SIDIK.replace(/:/g, ""))).toBe(SIDIK);
    expect(rapikanSidik(`  ${SIDIK.toLowerCase()}\n`)).toBe(SIDIK);
  });

  it("menolak yang panjangnya bukan SHA-256", () => {
    expect(rapikanSidik("A1:B2:C3")).toBeNull();               // terlalu pendek
    expect(rapikanSidik(SIDIK + ":FF")).toBeNull();            // terlalu panjang
    expect(rapikanSidik("")).toBeNull();
    // Sidik SHA-1 (40 digit) masih sering tertukar; harus ditolak
    expect(rapikanSidik("A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4")).toBeNull();
  });

  it("mengumpulkan beberapa sidik dan membuang duplikat", () => {
    const lain = SIDIK.replace(/^A1/, "FF");
    expect(daftarSidik(`${SIDIK}, ${lain}`)).toEqual([SIDIK, lain]);
    expect(daftarSidik(`${SIDIK} ${SIDIK.toLowerCase()}`)).toEqual([SIDIK]);
  });

  it("membuang nilai cacat tanpa menjatuhkan yang sah", () => {
    // Satu nilai cacat yang lolos membuat Chrome menolak seluruh berkasnya
    expect(daftarSidik(`belum-diisi, ${SIDIK}`)).toEqual([SIDIK]);
    expect(daftarSidik("GANTI_DENGAN_SIDIKMU")).toEqual([]);
  });
});

describe("berkas assetlinks", () => {
  it("kosong selama sidiknya belum diisi", async () => {
    const { status, body } = await baca();
    expect(status).toBe(200);
    // Tetap JSON yang sah. Chrome menyimpulkan verifikasi gagal lalu
    // menampilkan bilah URL — keadaan yang benar, dan galatnya mudah dilacak.
    expect(body).toEqual([]);
  });

  it("menyusun pernyataan yang diminta Chrome", async () => {
    process.env.ANDROID_FINGERPRINTS = SIDIK;
    const { body } = await baca();

    expect(body).toHaveLength(1);
    expect(body[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(body[0].target.namespace).toBe("android_app");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([SIDIK]);
  });

  it("memakai nama paket bawaan bila tidak disetel", async () => {
    process.env.ANDROID_FINGERPRINTS = SIDIK;
    const { body } = await baca();
    expect(body[0].target.package_name).toBe("id.infranexia.absensi");
  });

  it("nama paket bisa diganti dari lingkungan", async () => {
    process.env.ANDROID_FINGERPRINTS = SIDIK;
    process.env.ANDROID_PACKAGE = "com.telkom.infranexia";
    const { body } = await baca();
    expect(body[0].target.package_name).toBe("com.telkom.infranexia");
  });

  it("menampung sidik kunci Play sekaligus kunci unggahan", async () => {
    // Play App Signing menandatangani ulang aplikasinya, jadi sidik yang
    // sampai ke HP pengguna bukan sidik kunci unggahan. Dua-duanya wajib ada.
    const kunciPlay = SIDIK.replace(/^A1:B2/, "11:22");
    process.env.ANDROID_FINGERPRINTS = `${SIDIK},${kunciPlay}`;
    const { body } = await baca();
    expect(body[0].target.sha256_cert_fingerprints).toEqual([SIDIK, kunciPlay]);
  });

  it("tidak pernah membocorkan isi lingkungan lain", async () => {
    process.env.ANDROID_FINGERPRINTS = SIDIK;
    process.env.FIREBASE_SERVICE_ACCOUNT = '{"private_key":"rahasia"}';
    const { body } = await baca();
    expect(JSON.stringify(body)).not.toContain("rahasia");
    expect(JSON.stringify(body)).not.toContain("private_key");
  });
});
