# InfraNexia — Absensi Magang

Sistem absensi peserta magang berbasis **kartu QR**, dibangun dengan Next.js
(App Router) + Firebase. Antarmuka dioptimalkan untuk ponsel dan dapat dipasang
sebagai PWA.

**Seluruhnya berjalan di paket Firebase gratis (Spark).** Logika server berada
di API route Next.js, bukan Cloud Functions.

## Cara kerja

Satu perangkat berkamera diletakkan di kantor sebagai **mesin absen**. Peserta
datang, mengarahkan kartunya ke kamera, dan kehadirannya tercatat. Peserta tidak
bisa mencatat absensinya sendiri dari ponsel masing-masing — inilah yang membuat
absen dari rumah tidak mungkin.

```
Perangkat kios (berkamera)            Server (API route Next.js)
 └── pindai QR kartu ──────────────► POST /api/kartu   · terbit, cetak & catat absen
                                      POST /api/izin    · ajukan & setujui izin
Ponsel peserta                        POST /api/users   · kelola akun & data
 └── lihat status, ajukan izin        GET  /api/status  · diagnosa konfigurasi
                                      GET  /api/cron/alpa · tandai alpa harian
                                             │  Firebase Admin SDK
                                             ▼
                                      Firestore · Firebase Auth
```

### Kartunya

Kartu **diterbitkan sendiri oleh sistem**. Server membuat kode acak 12 karakter,
menanamnya di dalam QR, lalu kartunya dicetak seukuran KTP dan boleh dilaminasi.
Hanya kode yang pernah diterbitkan yang dikenali — QR dari luar, kartu e-money,
maupun kartu akses kantor tidak ada artinya di mesin absen.

Kartunya tidak memuat identitas apa pun, hanya kodenya. Kalau hilang, cabut lewat
menu Kelola atau terbitkan ulang: kartu lamanya langsung mati.

Di bawah QR tercetak kode yang sama dalam bentuk huruf (`ABCD-EFGH-JKMN`), memakai
alfabet tanpa 0, 1, I, L, O, dan U supaya tidak salah baca. Bila QR-nya tergores,
operator tinggal mengetikkan kode itu.

### Prinsip keamanan

| Ancaman | Penanganan |
|---|---|
| Mengubah jam perangkat | Jam & tanggal dari waktu server, zona `Asia/Jakarta` |
| Menulis absensi lewat console browser | Rules menolak semua tulis dari client |
| Peserta mencatat absennya sendiri dari rumah | Pencatatan hanya bisa dipanggil akun admin/pembimbing |
| Menitipkan kartu ke teman | Perlu kebijakan tatap muka — sistem tidak bisa mendeteksi ini |
| Memakai QR buatan sendiri | Kode dibuat server dan hanya yang terbit yang dikenali |
| Menyalin pemetaan kartu | Pemetaan disimpan di koleksi tertutup, dicari lewat hash |
| Kartu terpindai berulang | Pindaian dalam 20 detik dianggap satu kali |
| Perangkat kios dibawa keluar kantor | Aktifkan geofencing di Pengaturan Absensi |

> Titipan kartu adalah batas jujur sistem berbasis kartu. Kalau itu jadi masalah,
> tambahkan verifikasi visual oleh operator kios — layar kios sudah menampilkan
> foto peserta setiap kartu ditempel.

## Fitur

**Mesin absen** — halaman Kios untuk admin/pembimbing. Arahkan kartu ke kamera,
sistem menampilkan foto dan nama peserta beserta jam yang tercatat. Ada entri
kode dan pencatatan manual sebagai cadangan bila kartunya tertinggal.

**Kartu siap cetak** — lembar A4 berisi sepuluh kartu ukuran KTP, lengkap dengan
QR, nama, NIM, dan kode cadangan. Bisa per peserta atau sekaligus semuanya.

**Logbook kegiatan** — peserta menulis apa yang dikerjakannya tiap hari, boleh
disertai satu foto bukti. Pembimbing memberi catatan lalu menandai sudah
diperiksa. Seluruhnya bisa dicetak jadi lampiran laporan magang kampus.

**Izin & sakit** — peserta mengajukan lewat menu Izin, pembimbing menyetujui.
Yang disetujui otomatis tercatat di riwayat kehadiran.

**Alpa otomatis** — cron harian 17.00 WIB menandai peserta tanpa catatan sebagai
alpa, melewati akhir pekan.

**Rekap & laporan** — halaman detail per peserta dengan rekap bulanan, ekspor
`.xlsx`, dan laporan siap cetak berkop resmi.

**Pengelolaan akun** — kredensial dikirim otomatis lewat email atau WhatsApp,
plus pemeriksa kesehatan data.

**Dashboard langsung** — angka kehadiran berubah sendiri tanpa refresh.
Pembimbing punya halamannya sendiri: izin yang menunggu, siapa yang belum
datang, dan pintasan ke mesin absen.

**Jejak audit** — setiap pembuatan akun, penerbitan kartu, dan keputusan izin
tercatat beserta pelakunya. Koleksinya tertutup bahkan dari admin; pembacaannya
lewat API yang hanya melayani baca.

**Laporan galat otomatis** — kesalahan yang terjadi di perangkat pengguna
dikirim ke server dan muncul di menu Kelola, tanpa perlu menunggu ada yang
mengeluh.

**Cadangan sekali klik** — seluruh isi Firestore diunduh sebagai satu berkas
JSON. Firebase paket gratis tidak mencadangkan otomatis.

---

## Perangkat kios

Apa pun yang punya kamera dan browser:

- Ponsel Android, iPhone, iPad, atau laptop
- Terhubung internet
- Diletakkan di titik masuk kantor

Pemindaiannya memakai `BarcodeDetector` bawaan browser bila tersedia (Chrome),
dan jatuh ke dekoder JavaScript bila tidak (Safari, Firefox). Keduanya berjalan
di perangkat — tidak ada gambar yang dikirim ke mana pun.

Cara memakainya: login sebagai admin atau pembimbing → menu **Kios** → **Mulai
Mesin Absen** → izinkan akses kamera → biarkan halaman terbuka selama jam kerja.
Layar dijaga tetap menyala selama mesin aktif.

> Kamera hanya bisa diakses lewat **HTTPS**. Di Vercel sudah otomatis; untuk uji
> lokal pakai `localhost` atau tunnel.

---

## Setup

### 1. Firebase (paket gratis)

1. Buat project di https://console.firebase.google.com
2. **Authentication → Sign-in method** → aktifkan **Email/Password**
3. **Firestore Database → Create database** (mode production)
4. **Project Settings → General → Your apps** → tambahkan Web app, salin konfigurasi

### 2. Service account

1. **Project Settings → Service accounts → Generate new private key** → unduh JSON
2. Ubah ke base64 dan tulis ke `.env.local`:

   ```powershell
   $f = Get-ChildItem "$env:USERPROFILE" -Filter "*firebase-adminsdk*.json" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
   $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
   Add-Content -Path ".env.local" -Value "`nFIREBASE_SERVICE_ACCOUNT=$b64"
   ```

### 3. Environment

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | ya | Enam nilai dari Firebase Console |
| `FIREBASE_SERVICE_ACCOUNT` | ya | Base64 kunci service account |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | tidak | Email akun — lihat `PANDUAN-EMAIL.md` |
| `NEXT_PUBLIC_APP_URL` | tidak | Alamat aplikasi, dipakai pada tautan di email |
| `CRON_SECRET` | tidak | Melindungi endpoint cron di Vercel |

`NEXT_PUBLIC_JAM_MASUK`, `NEXT_PUBLIC_JAM_PULANG`, dan
`NEXT_PUBLIC_TOLERANSI_MENIT` hanya dipakai sebagai cadangan sebelum admin
mengisi Pengaturan Absensi.

### 4. Install & deploy Rules

```bash
npm install
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

Index wajib — penyaringan riwayat memakai rentang tanggal.

### 5. Admin pertama

```bash
node scripts/buat-admin.mjs admin@contoh.com "PasswordKuat123" "Admin InfraNexia"
```

### 6. Jalankan

```bash
npm run dev     # http://localhost:3000
```

---

## Uji otomatis

```bash
npm test          # sekali jalan
npm run test:pantau   # jalan terus sambil menyunting
```

`npm run build` menjalankan uji lebih dulu dan berhenti bila ada yang gagal —
termasuk saat Vercel membangun. Perubahan yang merusak alur absensi tidak akan
sampai ke produksi.

Yang diuji, dengan Firestore dan Firebase Auth tiruan dalam memori sehingga
tidak butuh jaringan maupun kredensial:

| Berkas | Cakupan |
|---|---|
| `tests/absensi-kios.test.ts` | absen masuk & pulang, ambang keterlambatan, jeda minimum, pindaian kembar, kartu tidak sah, geofencing, siapa yang berhak mencatat |
| `tests/izin.test.ts` | pengajuan, tabrakan tanggal, persetujuan yang menulis absensi, pembatalan |
| `tests/kartu.test.ts` | penerbitan kode, sebaran acak, pembacaan QR, penolakan QR asing |
| `tests/kegiatan.test.ts` | batas menulis mundur, penguncian setelah diperiksa, pemisahan foto, batas ukuran |
| `tests/jejak.test.ts` | jejak audit tertulis untuk tindakan yang berhasil, dan tidak untuk yang gagal |
| `tests/waktu-rekap.test.ts` | zona waktu kantor, jarak geofencing, perhitungan rekap, batas bulan |

Uji ini bukan hiasan: mematikan jendela anti-ketuk-ganda, melucuti pemeriksaan
peran, atau mengabaikan toleransi keterlambatan — ketiganya langsung ditangkap.

> Kamera hanya berfungsi lewat HTTPS. Di `localhost` boleh, tapi untuk uji dari
> perangkat kios pakai tunnel (`npx ngrok http 3000`) atau langsung deploy.

---

## Alur harian

1. **Admin** menerbitkan kartu tiap peserta: **Kelola** → ikon kartu pada baris
   peserta → **Terbitkan Kartu** → **Cetak Kartu**. Untuk sekaligus banyak,
   pakai tombol **Cetak Kartu** di kepala halaman Kelola
2. **Operator** membuka **Kios** di perangkat kantor dan menyalakan mesin absen
3. **Peserta** memindai kartu saat datang dan saat pulang
4. **Peserta** menulis kegiatan hari itu di menu **Kegiatan**, boleh dengan foto
5. **Pembimbing** meninjau catatan yang masuk, memberi umpan balik, lalu menandainya
6. Yang berhalangan mengajukan **Izin** lewat ponselnya, pembimbing menyetujui
7. Pukul 17.00 sistem menandai yang tidak punya catatan sebagai alpa

---

## Diagnosa

`/api/status` menampilkan status konfigurasi tanpa membocorkan rahasia.
Buka ini lebih dulu setiap kali ada yang tidak beres.

Menu **Kelola → Kesehatan Data** memeriksa keselarasan akun Auth dengan profil
Firestore, dan mendaftar peserta yang belum punya kartu.

---

## Struktur data Firestore

| Koleksi | Dokumen | Isi |
|---|---|---|
| `users` | `{uid}` | name, email, role, nim, kampus, jurusan, telepon, status, kartuTerdaftar |
| `kartu` | `{sidik-hash}` | userId, kode, label, dibuatPada — tertutup dari browser |
| `jejak` | `{auto}` | aksi, pelaku, sasaran, rincian, padaMs — tertutup, dibaca lewat API |
| `galat` | `{auto}` | pesan, tumpukan, halaman, perangkat, uid — tertutup, dibaca lewat API |
| `absensi` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, jamMasuk, jamPulang, status, sumber, operator |
| `izin` | `{auto}` | userId, jenis, alasan, tanggal[], status, diprosesOleh |
| `aktivitas` | `{uid}_{YYYY-MM-DD}` | userId, nama, tanggal, kegiatan, kendala, adaFoto, status, catatanPembimbing |
| `aktivitasFoto` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, foto — dipisah agar daftar kegiatan tetap ringan |
| `config` | `absensi` | jam kerja, toleransi, geofencing |

Status absensi: `hadir`, `terlambat`, `izin`, `sakit`, `alpha`.

---

## Diagnosa lanjutan

**Kelola → Sistem & Riwayat Perubahan** memuat tiga hal: jejak audit siapa
mengubah apa, laporan galat dari perangkat pengguna, dan tombol unduh cadangan.

Cadangan sebaiknya disimpan di luar Firebase — cadangan yang berada di tempat
yang sama dengan aslinya bukan cadangan. Kode kartu sengaja tidak disertakan:
berkas cadangan biasanya berakhir di folder Unduhan atau chat, sedangkan kode
kartu adalah satu-satunya hal yang membuat sebuah kartu sah.

---

## Catatan tentang logbook

Catatan hanya bisa ditulis untuk **tujuh hari terakhir**. Batas ini yang membuat
logbook bermakna — tanpanya, sebulan catatan bisa dikarang dalam satu malam di
minggu terakhir, persis kebiasaan yang membuat logbook kehilangan gunanya.

Begitu pembimbing menandai sudah diperiksa, catatannya terkunci. Kalau memang
perlu diperbaiki, pembimbing mencabut tandanya dulu.

Fotonya opsional dan dikecilkan di perangkat peserta sebelum dikirim — 640 piksel,
sekitar 80 KB. Cloud Storage menuntut paket berbayar sejak September 2024, jadi
gambar disimpan di dalam dokumen Firestore. Dengan 20 peserta selama 20 hari
kerja, itu sekitar 40 MB per bulan dari kuota gratis 1 GB.

---

## Yang belum dikerjakan

- **Titipan kartu.** Sistem tidak bisa mendeteksi kartu yang dipinjamkan.
  Layar kios menampilkan foto peserta tiap kali kartu dipindai; selebihnya
  urusan kebijakan.
- **Foto profil disimpan sebagai base64 di dokumen `users`.** Praktis di skala
  puluhan peserta, boros di skala ratusan. Pindah ke Firebase Storage bila
  jumlahnya bertambah banyak.
- **Notifikasi pengingat absen** dan **mode gelap** belum ada.
