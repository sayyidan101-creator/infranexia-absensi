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

**Izin & sakit** — peserta mengajukan lewat menu Izin, pembimbing menyetujui.
Yang disetujui otomatis tercatat di riwayat kehadiran.

**Alpa otomatis** — cron harian 17.00 WIB menandai peserta tanpa catatan sebagai
alpa, melewati akhir pekan.

**Rekap & laporan** — halaman detail per peserta dengan rekap bulanan, ekspor
`.xlsx`, dan laporan siap cetak berkop resmi.

**Pengelolaan akun** — kredensial dikirim otomatis lewat email atau WhatsApp,
plus pemeriksa kesehatan data.

**Dashboard langsung** — angka kehadiran berubah sendiri tanpa refresh.

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

> Kamera hanya berfungsi lewat HTTPS. Di `localhost` boleh, tapi untuk uji dari
> perangkat kios pakai tunnel (`npx ngrok http 3000`) atau langsung deploy.

---

## Alur harian

1. **Admin** menerbitkan kartu tiap peserta: **Kelola** → ikon kartu pada baris
   peserta → **Terbitkan Kartu** → **Cetak Kartu**. Untuk sekaligus banyak,
   pakai tombol **Cetak Kartu** di kepala halaman Kelola
2. **Operator** membuka **Kios** di perangkat kantor dan menyalakan mesin absen
3. **Peserta** memindai kartu saat datang dan saat pulang
4. Yang berhalangan mengajukan **Izin** lewat ponselnya, pembimbing menyetujui
5. Pukul 17.00 sistem menandai yang tidak punya catatan sebagai alpa

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
| `absensi` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, jamMasuk, jamPulang, status, sumber, operator |
| `izin` | `{auto}` | userId, jenis, alasan, tanggal[], status, diprosesOleh |
| `config` | `absensi` | jam kerja, toleransi, geofencing |

Status absensi: `hadir`, `terlambat`, `izin`, `sakit`, `alpha`.

---

## Roadmap

- Kartu digital di ponsel peserta sebagai pendamping kartu cetak
- Notifikasi pengingat absen
- Mode gelap
