import { describe, it, expect } from "vitest";
import { lolos, lolosBaris, sumberGambarAman, CSP_CETAK } from "@/lib/aman";
import { denganCsp } from "@/lib/ekspor";
import { layakDiantre } from "@/lib/antrean";

/**
 * Nilai yang benar-benar bisa ditulis peserta ke dokumennya sendiri.
 * `firestore.rules` mengizinkan `name`, `foto`, `nim`, `kampus`, `jurusan`.
 */
const SERANGAN = [
  `<img src=x onerror="alert(1)">`,
  `"><script>alert(1)</script>`,
  `Budi" onmouseover="alert(1)`,
  `</td></tr><tr><td>palsu`,
  `' onload='alert(1)`,
];

describe("meloloskan karakter HTML", () => {
  it("melumpuhkan seluruh percobaan penyisipan", () => {
    for (const jahat of SERANGAN) {
      const hasil = lolos(jahat);
      expect(hasil).not.toContain("<");
      expect(hasil).not.toContain(">");
      expect(hasil).not.toContain('"');
      expect(hasil).not.toContain("'");
    }
  });

  it("nama biasa tetap terbaca apa adanya", () => {
    expect(lolos("Naufal Sayyidan Ramadhan")).toBe("Naufal Sayyidan Ramadhan");
    // Ampersand diloloskan sekali saja, tidak berlipat
    expect(lolos("Teknik & Informatika")).toBe("Teknik &amp; Informatika");
    expect(lolos("&amp;")).toBe("&amp;amp;");
  });

  it("nilai kosong tidak jadi kata \"undefined\"", () => {
    expect(lolos(undefined)).toBe("");
    expect(lolos(null)).toBe("");
    expect(lolos(0)).toBe("0");
  });

  it("baris baru jadi <br /> setelah diloloskan, bukan sebelum", () => {
    expect(lolosBaris("a\nb")).toBe("a<br />b");
    // Tag jahat tetap mati meski dipisah baris
    expect(lolosBaris("<b>\n<script>")).toBe("&lt;b&gt;<br />&lt;script&gt;");
  });
});

describe("alamat gambar yang aman", () => {
  it("menerima data URL gambar yang wajar", () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    expect(sumberGambarAman(png)).toBe(png);
    expect(sumberGambarAman("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toContain("data:image/jpeg");
  });

  it("menerima tautan https", () => {
    expect(sumberGambarAman("https://contoh.com/foto.png")).toBe("https://contoh.com/foto.png");
  });

  it("membuang skema yang bisa menjalankan skrip", () => {
    // Meloloskan karakter saja tidak menolong di sini: atribut src memang
    // menerima skema-skema ini tanpa perlu keluar dari tanda kutip.
    expect(sumberGambarAman("javascript:alert(1)")).toBe("");
    expect(sumberGambarAman("JaVaScRiPt:alert(1)")).toBe("");
    expect(sumberGambarAman("data:text/html;base64,PHNjcmlwdD4=")).toBe("");
    expect(sumberGambarAman("data:image/svg+xml,<svg onload=alert(1)>")).toBe("");
    expect(sumberGambarAman("http://contoh.com/a.png")).toBe("");
  });

  it("membuang percobaan keluar dari atribut", () => {
    // Inti bug aslinya: foto peserta dipasang mentah ke src="..."
    expect(sumberGambarAman(`x" onerror="alert(1)`)).toBe("");
    expect(sumberGambarAman(`https://a.com/x.png" onerror="alert(1)`)).toBe("");
    expect(sumberGambarAman(`data:image/png;base64,AAA" onerror="alert(1)`)).toBe("");
  });

  it("nilai kosong dan sampah jadi string kosong", () => {
    expect(sumberGambarAman("")).toBe("");
    expect(sumberGambarAman(undefined)).toBe("");
    expect(sumberGambarAman("bukan alamat apa pun")).toBe("");
  });
});

describe("kebijakan keamanan pada dokumen cetak", () => {
  it("disisipkan tepat sesudah <head>", () => {
    const hasil = denganCsp("<html><head><title>x</title></head><body>a</body></html>");
    expect(hasil).toContain(CSP_CETAK);
    expect(hasil.indexOf(CSP_CETAK)).toBeLessThan(hasil.indexOf("<title>"));
  });

  it("mematikan skrip", () => {
    expect(CSP_CETAK).toContain("default-src 'none'");
  });

  it("tetap terpasang walau tidak ada <head>", () => {
    expect(denganCsp("<p>a</p>").startsWith(CSP_CETAK)).toBe(true);
  });

  it("tidak dipasang dua kali", () => {
    const sekali = denganCsp("<html><head></head></html>");
    expect(denganCsp(sekali)).toBe(sekali);
  });
});

describe("keputusan mengulang kiriman antrean", () => {
  it("gangguan yang pantas dicoba lagi tetap diantre", () => {
    // Inilah yang dulu menghapus seluruh antrean: satu 500 dianggap penolakan
    // tetap karena kalimatnya tidak cocok dengan daftar kata kunci.
    for (const status of [0, 401, 408, 429, 500, 502, 503, 504]) {
      expect(layakDiantre({ status, message: "apa pun" })).toBe(true);
    }
  });

  it("penolakan tetap tidak diulang", () => {
    for (const status of [400, 403, 404, 409, 412, 422]) {
      expect(layakDiantre({ status, message: "Kartu tidak sah." })).toBe(false);
    }
  });

  it("galat tanpa kode status masih dikenali dari kalimatnya", () => {
    expect(layakDiantre(new Error("Tidak bisa terhubung ke server."))).toBe(true);
    expect(layakDiantre(new Error("Failed to fetch"))).toBe(true);
    expect(layakDiantre(new Error("Peserta ini sudah nonaktif."))).toBe(false);
  });
});
