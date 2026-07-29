import { describe, it, expect } from "vitest";
import {
  buatKode, normalkanKode, kodeValid, hashKode, formatKode, labelAman, muatanQr, AWALAN_QR,
} from "@/server/kartu";

describe("penerbitan kode kartu", () => {
  it("selalu 12 karakter dari alfabet tanpa huruf yang mirip", () => {
    const ALFABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < 200; i++) {
      const k = buatKode();
      expect(k).toHaveLength(12);
      expect([...k].every((c) => ALFABET.includes(c))).toBe(true);
    }
  });

  it("tidak pernah memuat 0, 1, I, L, O, atau U", () => {
    // Karakter ini dibuang justru karena kodenya kadang diketik ulang dari
    // kartu yang tercetak buram — 0/O dan 1/I/L paling sering tertukar.
    const gabung = Array.from({ length: 300 }, () => buatKode()).join("");
    for (const c of ["0", "1", "I", "L", "O", "U"]) {
      expect(gabung).not.toContain(c);
    }
  });

  it("tidak menghasilkan kode kembar dalam jumlah besar", () => {
    const set = new Set(Array.from({ length: 5000 }, () => buatKode()));
    expect(set.size).toBe(5000);
  });

  it("memakai seluruh alfabet secara merata", () => {
    const hitung = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      for (const c of buatKode()) hitung.set(c, (hitung.get(c) || 0) + 1);
    }
    expect(hitung.size).toBe(30);
    const nilai = [...hitung.values()];
    // Sebaran acak yang benar tidak akan pincang lebih dari sepertiga
    expect(Math.max(...nilai) / Math.min(...nilai)).toBeLessThan(1.35);
  });
});

describe("pembacaan kode", () => {
  const KODE = "H7K2M9PQ4RTV";

  it("menerima semua bentuk tulisan yang sama", () => {
    const bentuk = [
      KODE,
      KODE.toLowerCase(),
      "H7K2-M9PQ-4RTV",
      "h7k2-m9pq-4rtv",
      "  H7K2 M9PQ 4RTV  ",
      AWALAN_QR + KODE,
      "inx1:" + KODE.toLowerCase(),
    ];
    for (const b of bentuk) {
      expect(normalkanKode(b)).toBe(KODE);
      expect(kodeValid(b)).toBe(true);
      expect(hashKode(b)).toBe(hashKode(KODE));
    }
  });

  it("menolak QR dan ketikan yang bukan kartu kami", () => {
    const tolak = [
      "", "   ", "halo", "https://contoh.com", "ABCD", "H7K2M9PQ4RT",
      "H7K2M9PQ4RTVX", "0O1IL2345678", AWALAN_QR, null, undefined, 12345,
      "WA.ME/628123456789", "{\"nama\":\"budi\"}",
    ];
    for (const t of tolak) expect(kodeValid(t)).toBe(false);
  });

  it("menghasilkan sidik yang sama untuk kode sama, berbeda untuk kode lain", () => {
    expect(hashKode(KODE)).toBe(hashKode(KODE));
    expect(hashKode(KODE)).not.toBe(hashKode(buatKode()));
    expect(hashKode(KODE)).toHaveLength(64);
  });

  it("tidak bisa dikembalikan ke kode aslinya dari sidiknya", () => {
    const sidik = hashKode(KODE);
    expect(sidik).not.toContain(KODE);
    expect(sidik).not.toContain(KODE.toLowerCase());
  });
});

describe("tampilan kode", () => {
  it("dicetak berkelompok empat", () => {
    expect(formatKode("H7K2M9PQ4RTV")).toBe("H7K2-M9PQ-4RTV");
    expect(formatKode("h7k2m9pq4rtv")).toBe("H7K2-M9PQ-4RTV");
  });

  it("label ringkas hanya membuka empat karakter terakhir", () => {
    expect(labelAman("H7K2M9PQ4RTV")).toBe("…4RTV");
    expect(labelAman("AB")).toBe("AB");
  });

  it("muatan QR selalu berawalan penanda kami", () => {
    expect(muatanQr("h7k2-m9pq-4rtv")).toBe("INX1:H7K2M9PQ4RTV");
  });
});
