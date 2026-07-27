# InfraNexia — Absensi Magang

Aplikasi absensi peserta magang berbasis **pengenalan wajah**, dibangun dengan
Next.js (App Router) + Firebase. Antarmuka dioptimalkan untuk ponsel dan dapat
dipasang sebagai PWA.

**Seluruhnya berjalan di paket Firebase gratis (Spark).** Logika server berada
di API route Next.js, bukan Cloud Functions, sehingga tidak perlu upgrade Blaze
dan tidak perlu kartu kredit.

## Arsitektur

```
Browser (Next.js PWA)                    Server (API route Next.js)
 ├── face-api.js → descriptor 128-d ──►  POST /api/absen   · cocokkan wajah + catat
 ├── liveness challenge acak             POST /api/wajah   · daftarkan wajah
 └── GPS (opsional)                      POST /api/users   · buat / hapus / sinkron
                                                 │  Firebase Admin SDK
                                                 ▼
                                         Firestore (users, faceData, absensi, config)
                                         Firebase Auth
```

### Prinsip keamanan

Koleksi `absensi` dan `faceData` **tidak bisa disentuh dari browser** — Firestore
Rules menutupnya rapat. Semua penulisan melewati API route yang memakai Admin SDK.

| Ancaman | Penanganan |
|---|---|
| Mengubah jam perangkat agar tidak terlambat | Jam & tanggal diambil dari waktu server (zona `Asia/Jakarta`) |
| Menulis absensi lewat console browser | Rules menolak semua tulis dari client; hanya Admin SDK yang bisa |
| Mencuri descriptor wajah orang lain | `faceData` tidak bisa dibaca **maupun** ditulis client; pencocokan di server |
| Absen dari luar kantor | Geofencing haversine divalidasi di server terhadap titik & radius kantor |
| Foto/rekaman wajah di layar lain | Liveness challenge **acak** (kedip / toleh kanan / toleh kiri / buka mulut) |
| Mengirim ulang payload absen yang sama | Server menyimpan sidik jari 20 descriptor terakhir dan menolak duplikat persis |
| Akun dihapus tapi masih bisa login | `/api/users` menghapus akun Auth, profil, data wajah, dan riwayat sekaligus |

> Liveness berjalan di sisi klien sehingga sifatnya **penghalang**, bukan jaminan
> mutlak. Yang benar-benar mengunci sistem adalah pencocokan wajah di server,
> waktu server, dan geofencing.

---

## Setup

### 1. Firebase (paket gratis)

1. Buat project di https://console.firebase.google.com
2. **Authentication → Sign-in method** → aktifkan **Email/Password**
3. **Firestore Database → Create database** (mode production)
4. **Project Settings → General → Your apps** → tambahkan Web app, salin konfigurasi

Tidak perlu upgrade ke Blaze.

### 2. Service account

Kunci ini dipakai server untuk menulis data atas nama sistem. **Jangan pernah
di-commit ke Git.**

1. **Project Settings → Service accounts → Generate new private key** → unduh JSON
2. Ubah menjadi satu baris base64:

   ```bash
   # macOS / Linux
   base64 -i serviceAccountKey.json | tr -d '\n'

   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccountKey.json"))
   ```

3. Tempel hasilnya ke `.env.local`:

   ```
   FIREBASE_SERVICE_ACCOUNT=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50Iiw...
   ```

   Di Vercel: **Settings → Environment Variables**, nama `FIREBASE_SERVICE_ACCOUNT`,
   nilai string base64 tadi, centang semua environment.

> Variabel ini **tanpa** awalan `NEXT_PUBLIC_` — itu disengaja, supaya tidak
> pernah ikut terkirim ke browser.

### 3. Environment lainnya

```bash
cp .env.local.example .env.local
```

Isi nilai `NEXT_PUBLIC_FIREBASE_*` dari Firebase Console.

### 4. Dependency & model wajah

```bash
npm install
./download-models.sh      # mengunduh 7 file model ke public/models
```

### 5. Deploy Firestore Rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # pilih project Firebase kamu
firebase deploy --only firestore:rules,firestore:indexes
```

### 6. Membuat admin pertama

Rules menutup pembuatan dokumen `users` dari client, jadi admin pertama dibuat
manual satu kali:

1. **Authentication → Users → Add user** → isi email & password
2. Salin **User UID**-nya
3. **Firestore → Start collection** `users` → **Document ID = UID tadi**, isi:

   | Field | Tipe | Nilai |
   |---|---|---|
   | `name` | string | Nama Admin |
   | `email` | string | email yang sama |
   | `role` | string | `admin` |
   | `status` | string | `aktif` |

4. Login. Selanjutnya semua akun dibuat lewat menu **Kelola**.

### 7. Jalankan

```bash
npm run dev     # http://localhost:3000
```

> Kamera hanya aktif di `localhost` atau HTTPS. Untuk uji dari ponsel gunakan
> tunnel (`npx ngrok http 3000`) atau langsung deploy.

---

## Setelah upgrade dari versi lama

Peserta yang sudah mendaftar wajah sebelum versi ini belum punya penanda
`wajahTerdaftar`. Login sebagai admin → **Kelola → Pengaturan Absensi →
Pemeliharaan → Sinkronkan status pendaftaran wajah**. Cukup dijalankan sekali.

---

## Pengaturan dari aplikasi

Menu **Kelola → Pengaturan Absensi** (khusus admin), tersimpan di
`config/absensi` dan langsung berlaku tanpa deploy ulang:

- Jam masuk, jam pulang, toleransi keterlambatan, jeda minimum absen pulang
- Ambang ketelitian wajah (0.35–0.65; makin kecil makin ketat)
- Titik kantor (latitude/longitude, bisa diambil dari GPS perangkat), radius, dan
  saklar aktif/nonaktif geofencing

---

## Alur pemakaian

1. **Magang** login → **Daftar Wajah** → ambil 3 sampel → simpan
2. **Absensi** → selesaikan 2 tantangan liveness acak → **Absen Sekarang**.
   Server menentukan ini absen masuk atau pulang, jamnya, dan statusnya
   (`hadir` / `terlambat`)
3. **Admin / Pembimbing** memantau di **Dashboard** dan **Riwayat**, ekspor
   CSV atau cetak PDF

---

## Struktur data Firestore

| Koleksi | Dokumen | Isi |
|---|---|---|
| `users` | `{uid}` | name, email, role, nim, kampus, jurusan, status, wajahTerdaftar |
| `faceData` | `{uid}` | descriptors (array 128 angka), sidikTerakhir, updatedAt |
| `absensi` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, jamMasuk, jamPulang, status, matchScore, koordinat, jarakKantor |
| `config` | `absensi` | jam kerja, toleransi, threshold wajah, geofencing |

---

## Catatan hosting

API route butuh runtime Node.js, jadi aplikasi harus di-deploy sebagai aplikasi
Next.js biasa (Vercel, Netlify, Railway, VPS). **Static export tidak didukung.**
Pada Vercel paket Hobby seluruhnya masih gratis.

---

## Roadmap

- Modul izin & sakit dengan approval pembimbing
- Penandaan alpa otomatis harian (cron job)
- Halaman detail per peserta magang
- Ekspor `.xlsx` asli dan sertifikat akhir magang (PDF)
- Dashboard realtime dengan `onSnapshot`
- Pagination berbasis cursor untuk riwayat berukuran besar
