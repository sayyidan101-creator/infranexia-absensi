import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/bantu/siapkan.ts"],
    // `server-only` sengaja meledak bila diimpor dari kode klien. Di dalam uji
    // kita memang menjalankan modul server langsung, jadi paketnya digantikan
    // modul kosong.
    alias: { "server-only": fileURLToPath(new URL("./tests/bantu/kosong.ts", import.meta.url)) },
  },
});
