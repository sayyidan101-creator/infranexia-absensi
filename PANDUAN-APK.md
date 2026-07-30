# Membuat APK InfraNexia

Aplikasi ini dibungkus dengan **Trusted Web Activity** — isi APK-nya cuma
pembungkus, yang ditampilkan tetap situs Vercel-mu, dijalankan oleh Chrome yang
sudah ada di HP.

Akibatnya ada dua, dan keduanya penting dipahami sebelum mulai:

- **Setiap `git push` langsung terasa di HP semua orang.** Tidak perlu bikin APK
  baru, tidak perlu menunggu tinjauan Play Store. Ini keuntungan terbesarnya.
- **Pemindai QR, cetak kartu, dan tombol kamera untuk surat dokter tetap jalan
  apa adanya.** Karena mesinnya Chrome sungguhan, bukan WebView polos yang harus
  dipasangi plugin satu per satu.

APK baru perlu dibuat ulang hanya kalau ikon, nama aplikasi, atau alamat
situsnya berganti.

---

## Yang harus ada dulu

| Kebutuhan | Cara memastikan |
|---|---|
| Node.js | `node -v` — sudah ada, dipakai proyek ini |
| JDK 17 atau lebih baru | `java -version` |
| Android SDK | Paling mudah lewat **Android Studio** → SDK Manager |
| Situs sudah tayang di Vercel | Buka `https://situsmu/manifest.json`, harus tampil JSON |

Kalau `java -version` tidak dikenali, pasang **Temurin JDK 17** atau pakai JDK
yang sudah dibawa Android Studio.

---

## 1. Pasang Bubblewrap

```powershell
npm install -g @bubblewrap/cli
bubblewrap --version
```

Saat pertama dijalankan, Bubblewrap menawarkan mengunduh JDK dan Android SDK
sendiri. Terima saja kalau kamu belum punya — ukurannya sekitar 1 GB, jadi
lakukan di jaringan yang lapang.

---

## 2. Siapkan proyeknya

Kerjakan di folder **terpisah**, di luar folder proyek web, supaya keluaran
Android tidak bercampur dengan kode Next.js.

```powershell
mkdir "$env:USERPROFILE\Downloads\infranexia-apk"
cd "$env:USERPROFILE\Downloads\infranexia-apk"

bubblewrap init --manifest https://GANTI-ALAMAT-SITUSMU/manifest.json
```

Bubblewrap akan bertanya beberapa hal. Jawaban yang dianjurkan:

| Pertanyaan | Jawab |
|---|---|
| Domain | alamat Vercel-mu, tanpa `https://` |
| Application name | `InfraNexia Absensi Magang` |
| Short name | `InfraNexia` |
| Application ID | `id.infranexia.absensi` |
| Display mode | `standalone` |
| Status bar color | `#0a1f44` |
| Splash screen color | `#0a1f44` |
| Include support for Play Billing | `No` |
| Request geolocation permission | `Yes` — kios memeriksa jarak dari kantor |
| Key store location | tekan Enter (dibuat baru: `android.keystore`) |
| Key alias | `android` |

Kata sandi keystore akan diminta dua kali. **Catat di pengelola sandi sekarang,
jangan nanti.** Tanpa sandi itu kamu tidak bisa membuat pembaruan aplikasi.

> **Nama paket tidak bisa diubah setelah terbit.** `id.infranexia.absensi`
> selamanya jadi identitas aplikasi ini di Play Store dan di HP orang. Pastikan
> kamu puas dengan namanya sebelum lanjut.

---

## 3. Amankan keystore-nya

Berkas `android.keystore` yang baru dibuat itu **satu-satunya** kunci untuk
memperbarui aplikasimu. Hilang berarti aplikasi yang sudah dipasang orang tidak
bisa diperbarui lagi — mereka harus uninstall dan pasang ulang dari nol.

```powershell
# Salin ke tempat yang tidak ikut terhapus bersama folder proyek
Copy-Item android.keystore "$env:USERPROFILE\OneDrive\kunci-infranexia.keystore"
```

`.gitignore` sudah saya siapkan untuk menolak `*.keystore` dan `*.jks`, jadi
tidak akan ikut ter-`git push` walaupun folder ini kebetulan di dalam repo.

---

## 4. Bangun APK-nya

```powershell
bubblewrap build
```

Hasilnya dua berkas:

- `app-release-signed.apk` — untuk dipasang langsung ke HP
- `app-release-bundle.aab` — untuk diunggah ke Play Store

---

## 5. Ambil sidik jarinya

Ini langkah yang paling sering terlewat, dan akibatnya paling terasa: **bilah
URL tidak mau hilang.**

```powershell
keytool -list -v -keystore android.keystore -alias android
```

Cari baris `SHA256:` lalu salin seluruh nilainya, yang bentuknya seperti:

```
A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90
```

Tidak perlu risau soal bentuknya — huruf besar-kecil dan ada-tidaknya titik dua
sudah dirapikan otomatis oleh servernya.

---

## 6. Daftarkan sidiknya di Vercel

Vercel → proyekmu → **Settings** → **Environment Variables**, tambahkan dua:

| Nama | Nilai |
|---|---|
| `ANDROID_PACKAGE` | `id.infranexia.absensi` |
| `ANDROID_FINGERPRINTS` | sidik SHA-256 dari langkah 5 |

Lalu **Redeploy**. Variabel lingkungan baru tidak berlaku pada deploy yang sudah
jalan.

Kalau nanti aplikasinya masuk Play Store, tambahkan sidik **kunci milik Google**
di sini juga, dipisah koma. Play menandatangani ulang aplikasimu dengan kuncinya
sendiri, jadi sidik yang sampai ke HP pengguna bukan sidikmu — kalau hanya
sidikmu yang terdaftar, bilah URL muncul kembali pada aplikasi dari Play Store.
Sidik Google ada di Play Console → **Release** → **Setup** → **App signing**.

---

## 7. Periksa sebelum memasang

Buka di browser:

```
https://situsmu/.well-known/assetlinks.json
```

Harus tampil seperti ini, dengan sidikmu di dalamnya:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "id.infranexia.absensi",
      "sha256_cert_fingerprints": ["A1:B2:..."]
    }
  }
]
```

Kalau yang tampil `[]` kosong, berarti `ANDROID_FINGERPRINTS` belum terbaca —
periksa ejaannya dan pastikan sudah Redeploy.

---

## 8. Pasang ke HP

**Lewat kabel USB** (paling cepat, perlu USB debugging aktif di HP):

```powershell
adb install -r app-release-signed.apk
```

**Tanpa kabel:** salin `app-release-signed.apk` ke HP lewat WhatsApp, Google
Drive, atau kabel biasa, lalu buka berkasnya dari aplikasi Files. Android akan
minta izin **"Install unknown apps"** untuk aplikasi yang membukanya — wajar,
karena APK ini tidak datang dari Play Store.

---

## Kalau bilah URL masih tampil

Berarti verifikasi gagal. Urutan yang paling mungkin, dari yang tersering:

1. `assetlinks.json` masih `[]` — sidiknya belum terbaca di Vercel, atau belum
   Redeploy.
2. Sidik yang didaftarkan berasal dari keystore yang **berbeda** dari yang
   dipakai `bubblewrap build`.
3. Nama paket di Vercel tidak sama persis dengan `packageId` di
   `twa-manifest.json`.
4. Chrome masih menyimpan hasil verifikasi lama. Uninstall aplikasinya, tunggu
   sebentar, pasang lagi.

Perintah untuk memastikan pangkalnya di HP:

```powershell
adb shell dumpsys package d | Select-String -Pattern "infranexia" -Context 2,6
```

---

## Yang tidak berubah

Delapan API route (`/api/kartu`, `/api/izin`, `/api/users`, dan seterusnya)
tetap berjalan di Vercel, dan memang harus di sana. Semuanya memakai Firebase
Admin SDK dengan kunci service account, yang punya akses penuh ke seluruh
database — termasuk kuasa mengubah absensi siapa pun.

Kalau kunci itu diikutkan ke dalam APK, siapa pun bisa membongkar APK-nya dan
mendapat kuasa yang sama. APK ini sengaja tidak membawa satu pun kredensial.
