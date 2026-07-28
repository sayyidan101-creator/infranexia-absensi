# InfraNexia — Absensi Magang

Sistem absensi peserta magang berbasis **kartu NFC**, dibangun dengan Next.js
(App Router) + Firebase. Antarmuka dioptimalkan untuk ponsel dan dapat dipasang
sebagai PWA.

**Seluruhnya berjalan di paket Firebase gratis (Spark).** Logika server berada
di API route Next.js, bukan Cloud Functions.

## Cara kerja

Satu perangkat Android diletakkan di kantor sebagai **mesin absen**. Peserta
datang, menempelkan kartunya, dan kehadirannya tercatat. Peserta tidak bisa
mencatat absensinya sendiri dari ponsel masing-masing — inilah yang membuat
absen dari rumah tidak mungkin.

```
Perangkat kios (Android + NFC)        Server (API route Next.js)
 └── baca nomor seri kartu ─────────► POST /api/kartu   · daftar & catat absen
                                      POST /api/izin    · ajukan & setujui izin
Ponsel peserta                        POST /api/users   · kelola akun & data
 └── lihat status, ajukan izin        GET  /api/status  · diagnosa konfigurasi
                                      GET  /api/cron/alpa · tandai alpa harian
                                             │  Firebase Admin SDK
                                             ▼
                                      Firestore · Firebase Auth
```

### Kartunya

Kartu **apa pun yang ber-NFC** bisa dipakai: kartu kosong, kartu akses kantor,
bahkan kartu uang elektronik. Sistem tidak menulis apa pun ke kartu — yang
dibaca hanya nomor serinya, lalu disimpan dalam bentuk hash.

Kartunya sendiri tidak memuat identitas apa pun. Kalau hilang, cukup cabut lewat
menu Kelola dan kartu itu langsung tidak berlaku.

### Prinsip keamanan

| Ancaman | Penanganan |
|---|---|
| Mengubah jam perangkat | Jam & tanggal dari waktu server, zona `Asia/Jakarta` |
| Menulis absensi lewat console browser | Rules menolak semua tulis dari client |
| Peserta mencatat absennya sendiri dari rumah | Pencatatan hanya bisa dipanggil akun admin/pembimbing |
| Menitipkan kartu ke teman | Perlu kebijakan tatap muka — sistem tidak bisa mendeteksi ini |
| Menyalin pemetaan kartu | Pemetaan disimpan di koleksi tertutup, hanya sidik hash |
| Kartu ditempel dua kali beruntun | Ketukan dalam 20 detik dianggap satu kali |
| Perangkat kios dibawa keluar kantor | Aktifkan geofencing di Pengaturan Absensi |

> Titipan kartu adalah batas jujur sistem berbasis kartu. Kalau itu jadi masalah,
> tambahkan verifikasi visual oleh operator kios — layar kios sudah menampilkan
> foto peserta setiap kartu ditempel.

## Fitur

**Mesin absen** — halaman Kios untuk admin/pembimbing. Tempel kartu, sistem
menampilkan foto dan nama peserta beserta jam yang tercatat. Ada pencatatan
manual sebagai cadangan bila kartu tertinggal.

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

Yang dibutuhkan hanya satu:

- **Android dengan NFC**, menjalankan **Chrome**
- Terhubung internet
- Diletakkan di titik masuk kantor

> **iPhone dan iPad tidak bisa.** Apple tidak mengizinkan halaman web membaca
> NFC. Kalau hanya tersedia perangkat iOS, gunakan pencatatan manual di halaman
> Kios, atau ganti pendekatannya ke QR code.

Cara memakainya: login sebagai admin atau pembimbing → menu **Kios** → **Mulai
Mesin Absen** → biarkan halaman terbuka selama jam kerja. Layar dijaga tetap
menyala selama mesin aktif.

NFC harus aktif di pengaturan sistem Android, dan situs perlu diizinkan
mengakses NFC saat pertama kali diminta.

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

> NFC hanya berfungsi lewat HTTPS. Di `localhost` boleh, tapi untuk uji dari
> perangkat kios pakai tunnel (`npx ngrok http 3000`) atau langsung deploy.

---

## Alur harian

1. **Admin** mendaftarkan kartu tiap peserta: **Kelola** → ikon kartu pada baris
   peserta → **Mulai Pindai Kartu** → tempelkan kartunya → **Daftarkan**
2. **Operator** membuka **Kios** di perangkat kantor dan menyalakan mesin absen
3. **Peserta** menempelkan kartu saat datang dan saat pulang
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
| `kartu` | `{sidik-hash}` | userId, label, dibuatPada — tertutup dari browser |
| `absensi` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, jamMasuk, jamPulang, status, sumber, operator |
| `izin` | `{auto}` | userId, jenis, alasan, tanggal[], status, diprosesOleh |
| `config` | `absensi` | jam kerja, toleransi, geofencing |

Status absensi: `hadir`, `terlambat`, `izin`, `sakit`, `alpha`.

---

## Roadmap

- Kartu QR sebagai alternatif untuk perangkat non-Android
- Foto peserta ditampilkan lebih besar di kios untuk verifikasi visual operator
- Notifikasi pengingat absen
- Mode gelap
