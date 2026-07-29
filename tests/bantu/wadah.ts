import { FirestorePalsu, AuthPalsu } from "./firestorePalsu";

/**
 * Satu wadah bersama supaya berkas penyiapan dan berkas uji menunjuk instans
 * tiruan yang sama. Diletakkan terpisah karena pabrik `vi.mock` diangkat ke
 * atas berkas, sehingga tidak boleh menyentuh variabel yang dideklarasikan
 * setelahnya.
 */
export const wadah = {
  db: new FirestorePalsu(),
  auth: new AuthPalsu(),
};

/** Kembalikan seluruh keadaan ke titik nol di antara uji. */
export function resetWadah() {
  wadah.db.bersihkan();
  wadah.auth.token.clear();
  wadah.auth.akun.clear();
}
