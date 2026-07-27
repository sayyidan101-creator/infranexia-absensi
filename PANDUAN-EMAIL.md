# Mengaktifkan pengiriman email akun

Saat admin membuat akun magang baru, sistem bisa mengirim email berisi
kredensial secara otomatis. Fitur ini **opsional** — kalau belum diatur,
pembuatan akun tetap berhasil dan kredensial bisa dikirim manual lewat
tombol WhatsApp / Salin pesan.

## Cara tercepat: Gmail + App Password

Gmail tidak menerima password akun biasa untuk SMTP. Kamu butuh
**App Password** 16 karakter, dan itu hanya muncul kalau verifikasi 2 langkah
sudah aktif.

### 1. Aktifkan verifikasi 2 langkah

Buka https://myaccount.google.com/security → **Verifikasi 2 Langkah** → aktifkan.

### 2. Buat App Password

Buka https://myaccount.google.com/apppasswords

Isi nama aplikasi, misalnya `InfraNexia Absensi`, lalu **Buat**.
Google menampilkan 16 huruf dalam 4 kelompok, contoh `abcd efgh ijkl mnop`.
Salin, **spasinya boleh dibuang**.

> Kalau halaman App Passwords tidak bisa dibuka, biasanya verifikasi 2 langkah
> belum aktif, atau akunmu akun sekolah/kantor yang dibatasi administratornya.

### 3. Isi `.env.local`

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=emailkamu@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM=InfraNexia <emailkamu@gmail.com>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`SMTP_PASS` diisi App Password tadi, **bukan** password Gmail kamu.
`NEXT_PUBLIC_APP_URL` diisi alamat aplikasi yang dipakai peserta magang —
kalau sudah online, ganti dengan alamat deploy-nya.

Restart dev server setelah menyimpan.

### 4. Di Vercel

Tambahkan lima variabel yang sama di **Settings → Environment Variables**.
`SMTP_PASS` sebaiknya ditandai sebagai *Sensitive*.

## Batas pemakaian

Gmail biasa membatasi sekitar 500 email per hari — jauh lebih dari cukup untuk
mendaftarkan peserta magang. Kalau nanti butuh volume besar atau pengiriman
dari domain sendiri, pindah ke layanan seperti Resend atau Brevo cukup dengan
mengganti nilai `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, dan `SMTP_PASS`.

## Kalau email gagal terkirim

Akun tetap dibuat. Panel hasil akan menampilkan alasannya, dan kamu bisa
mengirim kredensial lewat tombol **Kirim via WhatsApp** atau **Salin pesan**.

Pesan yang sering muncul:

| Pesan | Artinya |
|---|---|
| Login SMTP ditolak | `SMTP_PASS` masih password biasa, bukan App Password |
| Tidak bisa terhubung ke server email | `SMTP_HOST` / `SMTP_PORT` salah, atau jaringan memblokir port 465 |
| Pengiriman email belum diatur | `SMTP_USER` / `SMTP_PASS` masih kosong |

Kalau port 465 diblokir jaringan kampus, coba `SMTP_PORT=587`.

## Catatan keamanan

Mengirim password lewat email atau WhatsApp berarti password itu tersimpan di
riwayat percakapan. Karena itu email yang dikirim sistem sudah memuat instruksi
agar peserta segera mengganti password lewat menu **Edit Profil** pada login
pertama. Biasakan menagih itu sebagai bagian dari onboarding.
