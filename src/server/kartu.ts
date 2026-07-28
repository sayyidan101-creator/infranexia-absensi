import "server-only";
import { createHash } from "crypto";

/**
 * Nomor seri kartu disimpan dalam bentuk hash, bukan aslinya.
 *
 * Alasannya: dokumen `users` bisa dibaca pembimbing, dan serial mentah adalah
 * satu-satunya hal yang membuat sebuah kartu sah. Menyimpannya apa adanya sama
 * saja menaruh kunci di daftar yang bisa dibaca banyak orang.
 */
const GARAM = "infranexia-kartu-v1";

export function hashSerial(serial: string): string {
  const bersih = String(serial).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return createHash("sha256").update(GARAM + ":" + bersih).digest("hex");
}

/** Potongan yang aman ditampilkan di antarmuka, misalnya "…7A3F". */
export function labelAman(serial: string): string {
  const bersih = String(serial).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return bersih.length <= 4 ? bersih : "…" + bersih.slice(-4);
}

export function serialValid(serial: unknown): boolean {
  const bersih = String(serial || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  return bersih.length >= 6 && bersih.length <= 64;
}
