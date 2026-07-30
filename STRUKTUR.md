# Struktur InfraNexia — mana Backend, mana Frontend

Proyek ini satu repositori, tapi isinya **dua program yang berjalan di dua
tempat berbeda**. Membedakan keduanya bukan soal kerapian: salah menaruh satu
berkas bisa berarti kunci basis data ikut terkirim ke HP pengguna.

Patokannya satu pertanyaan: **berkas ini sampai ke HP pengguna atau tidak?**

| | Frontend | Backend |
|---|---|---|
| Berjalan di | HP / browser pengguna | server Vercel |
| Bisa dibongkar orang? | **Ya** — tekan F12, semuanya terbaca | Tidak |
| Boleh menyimpan rahasia? | **Tidak pernah** | Ya |
| Akses ke Firestore | terbatas oleh `firestore.rules` | penuh, tanpa batas |

---

## Frontend — yang sampai ke HP pengguna

### `src/app/*/page.tsx` — 10 halaman

| Halaman | Untuk siapa | Isinya |
|---|---|---|
| `page.tsx` | semua | pengalih; membuang pengguna ke halaman yang sesuai perannya |
| `login/` | semua | masuk dengan email & sandi |
| `dashboard/` | peserta & pembimbing | ringkasan kehadiran, jam masuk, rekap bulan ini |
| `kios/` | pembimbing & admin | pemindai kartu QR di meja depan |
| `kegiatan/` | peserta & pembimbing | logbook harian beserta foto bukti |
| `izin/` | peserta & pembimbing | pengajuan izin/sakit dan persetujuannya |
| `riwayat/` | peserta & pembimbing | kalender kehadiran, ekspor Excel |
| `profil/` | semua | data diri, ganti foto |
| `admin/` | admin | kelola peserta, terbitkan & cetak kartu, pengaturan jam kerja |
| `peserta/[uid]/` | pembimbing & admin | rincian satu peserta |

### `src/components/` — 14 komponen

Potongan tampilan yang dipakai berulang: `Navbar`, `Sheet`, `Avatar`,
`Kalender`, `CincinProgres`, `Protected` (penjaga peran), `PWARegister`,
`PenangkapGalat`, `DaftarKartu`, `KartuKredensial`, `KesehatanData`,
`PanelSistem`, `PengaturanAbsensi`, `ui.tsx`.

### `src/lib/` — pembantu sisi browser

Delapan berkas bertanda `"use client"` — hanya masuk akal di browser karena
menyentuh kamera, kanvas, `localStorage`, atau jendela cetak:

| Berkas | Gunanya |
|---|---|
| `pindaiQr.ts` | membaca kode QR dari kamera |
| `gambar.ts` | mengecilkan foto sebelum dikirim |
| `kartuCetak.ts` | menyusun lembar kartu dua sisi untuk dicetak |
| `sertifikat.ts` | surat keterangan selesai magang |
| `logbook.ts` | lembar logbook untuk dicetak |
| `ekspor.ts` | memicu cetak & unduh berkas |
| `antrean.ts` | menyimpan pindaian yang gagal terkirim di `localStorage` |
| `api.ts` | pemanggil API, menyertakan token login |

Sisanya jembatan ke Firestore dari browser: `absensi.ts`, `izin.ts`,
`aktivitas.ts`, `kartu.ts`, `users.ts`, `laporan.ts`, `status.ts`, `sistem.ts`,
`firebase.ts`.

### `src/context/AuthContext.tsx`

Menyimpan siapa yang sedang login, dibaca seluruh halaman.

### `public/` — berkas mentah, disajikan apa adanya

`manifest.json` (identitas aplikasi saat dipasang), `sw.js` (service worker),
ikon 192 dan 512, logo, latar.

---

## Backend — tidak pernah sampai ke HP siapa pun

### `src/app/api/*/route.ts` — 8 pintu masuk

| Route | Tugasnya | Kenapa harus di server |
|---|---|---|
| `kartu/` | menerbitkan, mencabut, dan memindai kartu | jam absen ditentukan server, bukan jam HP yang bisa disetel |
| `izin/` | pengajuan & persetujuan izin | persetujuan sekaligus menulis catatan kehadiran |
| `aktivitas/` | logbook & pemeriksaannya | batas menulis mundur 7 hari tak boleh dilewati dari browser |
| `users/` | membuat, mengubah, menghapus akun | membuat akun butuh kuasa Admin SDK |
| `cron/alpa/` | menandai alpa tiap hari otomatis | dipanggil penjadwal Vercel, tanpa pengguna |
| `status/` | kesehatan sistem untuk panel admin | memeriksa kredensial yang tidak boleh terbaca browser |
| `galat/` | menampung laporan galat dari browser | koleksinya tertutup, hanya server yang boleh menulis |
| `assetlinks/` | pernyataan pemilik aplikasi Android | membaca variabel lingkungan server |

### `src/server/` — 5 berkas, semuanya bertanda `"server-only"`

Tanda itu bukan komentar. Kalau ada berkas frontend keliru mengimpornya,
**build langsung gagal** — bukan tayang lalu membocorkan diam-diam.

| Berkas | Isinya |
|---|---|
| `firebaseAdmin.ts` | menyalakan Admin SDK memakai kunci service account |
| `absensi.ts` | jam kerja, zona waktu, hitung terlambat, pemeriksa token |
| `kartu.ts` | membuat kode kartu & sidiknya (SHA-256) |
| `jejak.ts` | menulis jejak audit |
| `email.ts` | mengirim kredensial akun baru |

### `firestore.rules`

Bukan Vercel, bukan browser — aturan yang dijalankan Firebase sendiri. Inilah
lapisan yang menahan browser walaupun seseorang memanggil Firestore langsung
dari konsol. Koleksi `kartu`, `jejak`, dan `galat` di sini **tertutup penuh**,
termasuk dari admin.

### `vercel.json`

Jadwal cron: `/api/cron/alpa` tiap hari pukul 10 UTC (17.00 WIB).

---

## Yang dipakai kedua sisi

Dua berkas ini murni hitungan, tanpa menyentuh basis data, jadi aman dipakai
di mana saja:

- **`src/lib/periode.ts`** — tanggal mulai/selesai magang. Dipakai halaman
  admin untuk lencana periode, **dan** oleh `api/kartu` serta `api/cron/alpa`
  untuk menolak absen di luar periode. Sengaja satu berkas: kalau aturannya
  ditulis dua kali, keduanya akan berbeda cepat atau lambat.
- **`src/lib/assetlinks.ts`** — merapikan sidik jari kunci Android.

---

## Aturan yang menjaga pemisahan ini

1. **Browser tidak pernah menulis ke `absensi`, `izin`, `aktivitas`, atau
   `kartu`.** `firestore.rules` menolaknya. Semua penulisan lewat API route.
2. **`FIREBASE_SERVICE_ACCOUNT` tidak berawalan `NEXT_PUBLIC_`.** Awalan itu
   yang menentukan sebuah variabel ikut dibundel ke browser atau tidak. Tanpa
   awalan, ia tinggal di server.
3. **Waktu selalu dari server.** Jam HP bisa disetel maju-mundur; kalau jam
   absen diambil dari HP, seluruh sistem ini tidak membuktikan apa pun.
4. **`import "server-only"`** di seluruh `src/server/`, supaya kekeliruan
   impor tertangkap saat build, bukan setelah tayang.

---

## Berkas di akar proyek

| Berkas | Gunanya |
|---|---|
| `package.json` | daftar dependensi; `build` menjalankan tes lebih dulu |
| `next.config.mjs` | pengalihan, rewrite `assetlinks.json`, penyesuaian webpack |
| `tailwind.config.ts` | warna & titik henti layar |
| `vitest.config.mts` | penyiapan tes |
| `tsconfig.json` | alias `@/` menunjuk ke `src/` |
| `firebase.json`, `.firebaserc`, `firestore.indexes.json` | penyebaran aturan & indeks |
| `.env.local` | **rahasia — tidak pernah masuk Git** |
| `tests/` | 8 berkas tes, 139 pemeriksaan |
| `scripts/` | perkakas sekali pakai |

---

## Satu hal yang perlu dijaga

Folder proyek ini bersarang: nama `infranexia-absensi` muncul **dua kali** di
jalurnya.

```
C:\Users\VICTUS\Downloads\infranexia-absensi\      <- folder pembungkus, BUKAN proyek
└── infranexia-absensi\                            <- proyek yang sebenarnya
    ├── src\  public\  tests\  package.json  ...
```

Kalau berkas diekstrak di folder pembungkus, hasilnya `src\` dan `public\`
kedua yang tidak dipakai siapa pun. Diamnya berbahaya: folder pembungkus tidak
punya `.git`, jadi `git status` tidak akan pernah menyebutnya, dan `npm run
build` tetap berhasil karena membaca yang bersarang. Perubahannya seolah
terpasang padahal tidak.

**Kebiasaan yang menutup ini:** sebelum mengekstrak, pastikan dulu kamu berada
di folder yang benar.

```powershell
# Harus menampilkan package.json. Kalau tidak, kamu di folder yang salah.
Test-Path package.json
```
