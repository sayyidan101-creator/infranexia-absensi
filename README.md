# InfraNexia — Absensi Magang

Sistem absensi peserta magang berbasis **pengenalan wajah**, dibangun dengan
Next.js (App Router) + Firebase. Antarmuka dioptimalkan untuk ponsel dan dapat
dipasang sebagai PWA.

**Seluruhnya berjalan di paket Firebase gratis (Spark).** Logika server berada
di API route Next.js, bukan Cloud Functions, sehingga tidak perlu upgrade Blaze.

## Arsitektur

```
Browser (Next.js PWA)                 Server (API route Next.js)
 ├── face-api.js → descriptor 128-d   POST /api/absen      · cocokkan wajah + catat
 ├── liveness challenge acak          POST /api/wajah      · daftarkan wajah
 ├── GPS (opsional)                   POST /api/izin       · ajukan & setujui izin
 └── onSnapshot (dashboard live)      POST /api/users      · kelola akun & data
                                      GET  /api/status     · diagnosa konfigurasi
                                      GET  /api/cron/alpa  · tandai alpa harian
                                             │  Firebase Admin SDK
                                             ▼
                                      Firestore · Firebase Auth
```

### Prinsip keamanan

Koleksi `absensi`, `faceData`, dan `izin` **tidak bisa ditulis dari browser** —
Firestore Rules menutupnya rapat. Semua penulisan melewati API route.

| Ancaman | Penanganan |
|---|---|
| Mengubah jam perangkat agar tidak terlambat | Jam & tanggal dari waktu server, zona `Asia/Jakarta` |
| Menulis absensi lewat console browser | Rules menolak semua tulis dari client |
| Mencuri descriptor wajah orang lain | `faceData` tertutup total dari browser; pencocokan di server |
| Absen dari luar kantor | Geofencing haversine divalidasi server |
| Foto/rekaman wajah di layar lain | Liveness challenge **acak** (kedip / toleh kanan / kiri / buka mulut) |
| Mengirim ulang payload absen yang sama | Server menolak sidik descriptor yang identik dengan 20 terakhir |
| Akun dihapus tapi masih bisa login | Penghapusan mencakup akun Auth, profil, wajah, dan riwayat |

> Liveness berjalan di sisi klien sehingga sifatnya **penghalang**, bukan jaminan
> mutlak. Yang mengunci sistem adalah pencocokan wajah di server, waktu server,
> dan geofencing.

## Fitur

**Absensi** — verifikasi wajah dengan dua tantangan liveness acak, geofencing
opsional, jam dari server.

**Izin & sakit** — peserta mengajukan lewat menu Izin, pembimbing menyetujui atau
menolak. Yang disetujui otomatis tercatat di riwayat kehadiran.

**Alpa otomatis** — cron harian pukul 17.00 WIB menandai peserta tanpa catatan
sebagai alpa, melewati akhir pekan.

**Rekap & laporan** — halaman detail per peserta dengan rekap bulanan, ekspor
`.xlsx`, dan laporan kehadiran siap cetak berkop resmi.

**Pengelolaan akun** — admin membuat akun, kredensial dikirim otomatis lewat
email atau WhatsApp. Ada pemeriksa kesehatan data untuk mendeteksi akun tanpa
profil dan sebaliknya.

**Dashboard langsung** — angka kehadiran hari ini berubah sendiri tanpa refresh.

---

## Setup

### 1. Firebase (paket gratis)

1. Buat project di https://console.firebase.google.com
2. **Authentication → Sign-in method** → aktifkan **Email/Password**
3. **Firestore Database → Create database** (mode production)
4. **Project Settings → General → Your apps** → tambahkan Web app, salin konfigurasi

### 2. Service account

Kunci ini dipakai server untuk menulis data. **Jangan pernah di-commit.**

1. **Project Settings → Service accounts → Generate new private key** → unduh JSON
2. Ubah menjadi satu baris base64 dan langsung tulis ke `.env.local`:

   ```powershell
   $f = Get-ChildItem "$env:USERPROFILE" -Filter "*firebase-adminsdk*.json" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
   $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
   Add-Content -Path ".env.local" -Value "`nFIREBASE_SERVICE_ACCOUNT=$b64"
   ```

   ```bash
   # macOS / Linux
   echo "FIREBASE_SERVICE_ACCOUNT=$(base64 -i serviceAccountKey.json | tr -d '\n')" >> .env.local
   ```

> Variabel ini **tanpa** awalan `NEXT_PUBLIC_` — itu disengaja, supaya tidak
> pernah ikut terkirim ke browser.

### 3. Environment

```bash
cp .env.local.example .env.local
```

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | ya | Enam nilai dari Firebase Console |
| `FIREBASE_SERVICE_ACCOUNT` | ya | Base64 kunci service account |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | tidak | Pengiriman email akun — lihat `PANDUAN-EMAIL.md` |
| `NEXT_PUBLIC_APP_URL` | tidak | Alamat aplikasi, dipakai pada tautan di email |
| `CRON_SECRET` | tidak | Melindungi endpoint cron. Isi bila deploy ke Vercel |

### 4. Dependency & model wajah

```bash
npm install
./download-models.sh      # mengunduh 7 file model ke public/models
```

### 5. Deploy Rules & Index

Index wajib, karena penyaringan riwayat memakai rentang tanggal.

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

### 6. Membuat admin pertama

Rules menutup pembuatan dokumen `users` dari client, jadi admin pertama dibuat
lewat skrip:

```bash
node scripts/buat-admin.mjs admin@contoh.com "PasswordKuat123" "Admin InfraNexia"
```

Skrip membuat akun bila belum ada, memperbaiki profilnya, dan menjadikannya
admin. Di akhir ia mencetak daftar seluruh akun beserta statusnya.

### 7. Jalankan

```bash
npm run dev     # http://localhost:3000
```

> Kamera hanya aktif di `localhost` atau HTTPS. Untuk uji dari ponsel gunakan
> tunnel (`npx ngrok http 3000`) atau langsung deploy.

---

## Deploy ke Vercel

1. Tambahkan seluruh variabel environment di **Settings → Environment Variables**,
   centang **Production** dan **Preview**
2. `git push` — Vercel membangun ulang otomatis
3. Buka `/api/status` untuk memastikan kredensial terbaca

Cron alpa harian sudah dikonfigurasi di `vercel.json` (10.00 UTC = 17.00 WIB).
Isi `CRON_SECRET` agar endpoint itu tidak bisa dipanggil sembarang orang.

Untuk menandai alpa pada tanggal tertentu secara manual:

```
GET /api/cron/alpa?tanggal=2026-07-27
Authorization: Bearer <CRON_SECRET>
```

---

## Diagnosa

`/api/status` menampilkan status konfigurasi tanpa membocorkan rahasia: apakah
service account terbaca, apakah project-nya cocok, dan apakah koneksi ke Firebase
berhasil. Buka ini lebih dulu setiap kali ada yang tidak beres.

Menu **Kelola → Kesehatan Data** memeriksa keselarasan antara akun Firebase Auth
dan dokumen profil. Akun tanpa profil akan tertahan di layar pembuka; profil
tanpa akun muncul sebagai peserta hantu di statistik.

---

## Struktur data Firestore

| Koleksi | Dokumen | Isi |
|---|---|---|
| `users` | `{uid}` | name, email, role, nim, kampus, jurusan, telepon, status, wajahTerdaftar |
| `faceData` | `{uid}` | descriptors (array 128 angka), sidikTerakhir, updatedAt |
| `absensi` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, jamMasuk, jamPulang, status, matchScore, koordinat |
| `izin` | `{auto}` | userId, jenis, alasan, tanggal[], status, diprosesOleh |
| `config` | `absensi` | jam kerja, toleransi, threshold wajah, geofencing |

Status absensi: `hadir`, `terlambat`, `izin`, `sakit`, `alpha`.

---

## Pengaturan dari aplikasi

Menu **Kelola → Pengaturan Absensi** (khusus admin), tersimpan di
`config/absensi` dan langsung berlaku tanpa deploy ulang: jam kerja, toleransi,
jeda minimum absen pulang, ambang ketelitian wajah, serta titik dan radius kantor.

---

## Roadmap

- Notifikasi pengingat absen lewat push notification
- Mode gelap
- Catatan penilaian pembimbing pada halaman peserta
- Sertifikat akhir magang dengan tanda tangan digital
