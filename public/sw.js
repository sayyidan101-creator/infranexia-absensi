// Service worker InfraNexia
//
// Naikkan VERSI setiap kali perilaku service worker berubah. Perubahan isi
// berkas ini membuat browser mengunduh ulang dan mengaktifkan versi baru.
const VERSI = "v3";

self.addEventListener("install", () => {
  // Jangan menunggu tab lama ditutup — versi baru langsung menggantikan
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Bersihkan seluruh cache lama dari versi sebelumnya
      const nama = await caches.keys();
      await Promise.all(nama.filter((n) => n !== VERSI).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Halaman, API, dan berkas dari domain lain tidak pernah disentuh cache.
  // Ini yang dulu membuat pembaruan aplikasi tidak terlihat di ponsel:
  // dokumen lama tersaji dari cache sehingga memuat kode versi lama.
  const navigasi = req.mode === "navigate" || req.destination === "document";
  if (navigasi || url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    return; // biarkan browser menanganinya seperti biasa
  }

  // Berkas statis (JS, CSS, gambar, model wajah) boleh dilayani dari cache
  // lebih dulu karena namanya sudah mengandung hash versi.
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSI);
      const tersimpan = await cache.match(req);
      if (tersimpan) return tersimpan;
      try {
        const jawaban = await fetch(req);
        if (jawaban && jawaban.status === 200 && jawaban.type === "basic") {
          cache.put(req, jawaban.clone());
        }
        return jawaban;
      } catch (e) {
        const cadangan = await cache.match(req);
        if (cadangan) return cadangan;
        throw e;
      }
    })()
  );
});
