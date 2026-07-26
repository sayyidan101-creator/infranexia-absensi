# InfraNexia — Absensi Magang (Next.js + Firebase + Face Recognition)

Aplikasi absensi anak magang berbasis **pengenalan wajah**. Wajah dikenali di sisi browser
memakai `@vladmandic/face-api`, data disimpan di **Firebase Firestore**, autentikasi
memakai **Firebase Auth**.

## Arsitektur

```
Next.js (browser)                         Firebase
 ├── face-api.js  ── descriptor 128-d ──►  Firestore (users, faceData, absensi)
 ├── kamera + liveness (kedip)             Firebase Auth (login)
 └── pencocokan Euclidean (client)
```

> **Catatan arsitektur:** karena tanpa server (serverless/Firebase),
> pencocokan wajah dilakukan di browser. Untuk keamanan lebih tinggi (agar descriptor
> referensi tidak pernah dikirim ke klien), pindahkan pencocokan ke **Cloud Functions**.
> Untuk skala magang, pendekatan client-side ini sudah memadai dan sudah dibatasi lewat
> Firestore Rules (data wajah hanya bisa dibaca pemiliknya).

---

## Langkah Setup

### 1. Buat project Firebase
1. Buka https://console.firebase.google.com → **Add project**.
2. Menu **Build → Authentication → Sign-in method** → aktifkan **Email/Password**.
3. Menu **Build → Firestore Database** → **Create database** (mode production).
4. Menu **Project Settings → General → Your apps** → tambahkan **Web app** (</>) →
   salin nilai konfigurasi SDK.

### 2. Konfigurasi environment
```bash
cp .env.local.example .env.local
```
Isi `.env.local` dengan nilai dari Firebase (apiKey, authDomain, projectId, dst).

### 3. Pasang Firestore Rules
Salin isi `firestore.rules` ke tab **Firestore → Rules** di Console, lalu **Publish**.

### 4. Install dependency
```bash
npm install
```

### 5. Unduh model face-api
```bash
./download-models.sh
```
(atau unduh manual 7 file model dari repo vladmandic/face-api ke `public/models/`)

### 6. Jalankan
```bash
npm run dev
```
Buka http://localhost:3000

> **Penting:** akses kamera hanya jalan di `localhost` atau **HTTPS**. Saat deploy, wajib SSL.

---

## Membuat Akun Admin Pertama
Registrasi lewat halaman `/register` selalu membuat role **magang**. Untuk membuat admin:
1. Daftar 1 akun lewat `/register`.
2. Buka **Firestore → Console → koleksi `users`** → dokumen user tersebut →
   ubah field `role` menjadi `admin`.
3. Login ulang. Setelah jadi admin, kamu bisa mengubah role user lain di menu **Kelola**.

---

## Alur Pemakaian
1. **Magang** login → menu **Daftar Wajah** → ambil 3 sampel → simpan.
2. Menu **Absensi** → hadapkan wajah + **berkedip** (liveness) → **Absen Masuk**.
   Status otomatis `hadir`/`terlambat` berdasar jam masuk + toleransi.
3. Saat pulang, buka lagi **Absensi** → **Absen Pulang**.
4. **Admin/Pembimbing** melihat rekap di **Dashboard** & **Riwayat**.

---

## Struktur Data Firestore
| Koleksi | Dokumen | Isi |
|---|---|---|
| `users` | `{uid}` | name, email, role, nim, kampus, jurusan, status |
| `faceData` | `{uid}` | descriptors: array of [128 angka], updatedAt |
| `absensi` | `{uid}_{YYYY-MM-DD}` | userId, tanggal, jamMasuk, jamPulang, status, matchScore, lat/lng |

---

## Konfigurasi Absensi
Diatur lewat `.env.local`:
- `NEXT_PUBLIC_JAM_MASUK`, `NEXT_PUBLIC_JAM_PULANG`, `NEXT_PUBLIC_TOLERANSI_MENIT`
- `NEXT_PUBLIC_FACE_THRESHOLD` — ambang kecocokan wajah (0.5 default; makin kecil makin ketat)

---

## Roadmap Lanjutan
- Pindahkan matching ke Cloud Functions (keamanan descriptor).
- Validasi radius lokasi kantor (geofencing) dari GPS.
- Modul izin/sakit + approval pembimbing.
- Export rekap ke Excel/PDF.
- Anti-spoofing lebih kuat (challenge gerakan acak).
