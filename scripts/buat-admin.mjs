/**
 * Membuat atau mempromosikan sebuah akun menjadi ADMIN.
 *
 * Dipakai untuk admin pertama, atau ketika akun terlanjur ada di Firebase Auth
 * tapi belum punya dokumen profil di Firestore sehingga aplikasi menolaknya.
 *
 * Cara pakai (dari folder project):
 *   node scripts/buat-admin.mjs <email> [password] [nama]
 *
 * Contoh:
 *   node scripts/buat-admin.mjs admin@contoh.com RahasiaKuat123 "Admin InfraNexia"
 *   node scripts/buat-admin.mjs admin@contoh.com          → password dibuat acak
 *
 * Skrip membaca FIREBASE_SERVICE_ACCOUNT dari .env.local, jadi tidak ada
 * kredensial yang perlu ditempel di sini.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ---------- Baca kredensial dari .env.local ----------
const KUNCI = "FIREBASE_SERVICE_ACCOUNT=";

let kredensialTersimpan = null;
function kredensial() {
  if (kredensialTersimpan) return kredensialTersimpan;
  kredensialTersimpan = bacaKredensial();
  return kredensialTersimpan;
}

function bacaKredensial() {
  let isi;
  try {
    // Buang BOM bila file disimpan editor Windows sebagai UTF-8 with BOM
    isi = readFileSync(".env.local", "utf8").replace(/^﻿/, "");
  } catch {
    gagal("File .env.local tidak ditemukan. Jalankan skrip ini dari folder project.");
  }

  const semuaBaris = isi.split(/\r?\n/);
  const posisi = semuaBaris
    .map((b, i) => (b.trimStart().startsWith(KUNCI) ? i : -1))
    .filter((i) => i !== -1);

  if (posisi.length === 0) gagal("FIREBASE_SERVICE_ACCOUNT belum ada di .env.local.");

  // Baris ini bisa muncul lebih dari sekali — misalnya satu placeholder kosong
  // yang diketik manual, lalu satu lagi yang ditambahkan otomatis. Ambil yang
  // isinya paling panjang, bukan yang pertama ditemukan.
  const kandidat = posisi.map((idx) => {
    // Nilai boleh terlanjur terpotong ke beberapa baris; sambung sampai
    // bertemu baris kosong atau baris variabel berikutnya.
    let mentah = semuaBaris[idx].trimStart().slice(KUNCI.length);
    for (let i = idx + 1; i < semuaBaris.length; i++) {
      const b = semuaBaris[i];
      if (b.trim() === "" || /^[A-Za-z_][A-Za-z0-9_]*=/.test(b.trim())) break;
      mentah += b;
    }
    return mentah.trim();
  });

  let nilai = kandidat.sort((a, b) => b.length - a.length)[0];

  if (posisi.length > 1) {
    console.log(
      `  Catatan : ada ${posisi.length} baris FIREBASE_SERVICE_ACCOUNT di .env.local, ` +
        `dipakai yang isinya paling lengkap. Sebaiknya hapus yang kosong.`
    );
  }
  // Lepas tanda kutip pembungkus bila ada
  if (/^".*"$/s.test(nilai) || /^'.*'$/s.test(nilai)) nilai = nilai.slice(1, -1);

  let teks;
  if (nilai.startsWith("{")) {
    teks = nilai;
  } else {
    // Buang spasi, tab, dan baris baru yang mungkin terselip di base64
    const bersih = nilai.replace(/\s+/g, "");
    teks = Buffer.from(bersih, "base64").toString("utf8");
  }

  let akun;
  try {
    akun = JSON.parse(teks);
  } catch {
    console.error(`
  GAGAL: Isi FIREBASE_SERVICE_ACCOUNT tidak bisa dibaca sebagai JSON.

  Petunjuk dari isinya:
    panjang nilai      : ${nilai.length} karakter  (normalnya sekitar 3000+)
    diawali "eyJ"      : ${nilai.startsWith("eyJ") ? "ya" : "TIDAK — bukan base64 JSON yang benar"}
    diawali "{"        : ${nilai.startsWith("{") ? "ya" : "tidak"}
    hasil dekode mulai : ${JSON.stringify(teks.slice(0, 24))}

  Kalau panjangnya jauh di bawah 3000, nilainya terpotong saat ditempel.
  Perbaiki dengan menghapus baris FIREBASE_SERVICE_ACCOUNT di .env.local,
  lalu tulis ulang otomatis memakai perintah PowerShell yang menambahkannya
  langsung dari file kunci JSON.
`);
    process.exit(1);
  }

  if (typeof akun.private_key === "string") {
    akun.private_key = akun.private_key.replace(/\\n/g, "\n");
  }
  if (!akun.project_id || !akun.private_key) {
    gagal("JSON terbaca, tapi tidak memuat project_id atau private_key.");
  }
  return akun;
}

function gagal(pesan) {
  console.error("\n  GAGAL: " + pesan + "\n");
  process.exit(1);
}

// ---------- Argumen ----------
const [, , email, passwordArg, ...sisaNama] = process.argv;

if (!email || !email.includes("@")) {
  console.log(`
  Cara pakai:
    node scripts/buat-admin.mjs <email> [password] [nama]

  Contoh:
    node scripts/buat-admin.mjs admin@contoh.com RahasiaKuat123 "Admin InfraNexia"
`);
  process.exit(1);
}

const password = passwordArg || randomBytes(6).toString("base64url") + "9A";
const nama = sisaNama.join(" ") || email.split("@")[0];
const dibuatOtomatis = !passwordArg;

// ---------- Jalankan ----------
const app = initializeApp({ credential: cert(kredensial()) });
const auth = getAuth(app);
const db = getFirestore(app);

console.log(`\n  Project : ${kredensial().project_id}`);
console.log(`  Email   : ${email}\n`);

let akun;
let statusAkun;

try {
  akun = await auth.getUserByEmail(email);
  statusAkun = "sudah ada";
  await auth.updateUser(akun.uid, { password, displayName: nama, disabled: false });
} catch (e) {
  if (e?.code === "auth/user-not-found") {
    akun = await auth.createUser({ email, password, displayName: nama });
    statusAkun = "baru dibuat";
  } else {
    gagal(e?.message || String(e));
  }
}

const ref = db.doc(`users/${akun.uid}`);
const adaSebelumnya = (await ref.get()).exists;

await ref.set(
  {
    name: nama,
    email,
    role: "admin",
    status: "aktif",
    ...(adaSebelumnya ? {} : { wajahTerdaftar: false, createdAt: FieldValue.serverTimestamp() }),
  },
  { merge: true }
);

console.log(`  Akun Auth   : ${statusAkun} (UID ${akun.uid})`);
console.log(`  Profil      : ${adaSebelumnya ? "diperbarui" : "dibuat"} dengan role admin`);
console.log(`  Password    : ${password}${dibuatOtomatis ? "   <- dibuat acak, catat sekarang" : ""}`);

// ---------- Ringkasan seluruh akun ----------
console.log("\n  Daftar akun di project ini:\n");
const semua = await auth.listUsers(1000);
const profilSnap = await db.collection("users").get();
const peta = new Map(profilSnap.docs.map((d) => [d.id, d.data()]));

for (const u of semua.users) {
  const p = peta.get(u.uid);
  const info = p ? `${p.role || "?"} · ${p.status || "aktif"}` : "TANPA PROFIL — tidak bisa masuk aplikasi";
  console.log(`   ${(u.email || "(tanpa email)").padEnd(34)} ${info}`);
}

const yatim = profilSnap.docs.filter((d) => !semua.users.some((u) => u.uid === d.id));
if (yatim.length) {
  console.log("\n  Profil tanpa akun login (sisa penghapusan):");
  for (const d of yatim) console.log(`   ${d.data().email || d.id}`);
}

console.log("\n  Selesai. Silakan login dengan email dan password di atas.\n");
process.exit(0);
