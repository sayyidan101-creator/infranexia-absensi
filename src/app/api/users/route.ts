import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, adminAuth } from "@/server/firebaseAdmin";
import { KesalahanAbsen, pastikanAdmin } from "@/server/absensi";
import { emailAktif, kirimEmailAkun } from "@/server/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pengelolaan akun oleh admin. Semua lewat Admin SDK supaya Firestore Rules
 * bisa menutup rapat operasi create/delete pada koleksi `users`.
 *
 * body.aksi = "buat" | "hapus" | "sinkron"
 */
export async function POST(req: Request) {
  try {
    const pelaku = await pastikanAdmin(req);
    const body = await req.json().catch(() => ({}));

    if (body?.aksi === "buat") return await buat(body, req);
    if (body?.aksi === "ubah") return await ubah(body);
    if (body?.aksi === "hapus") return await hapus(body, pelaku);
    if (body?.aksi === "sinkron") return await sinkron();
    if (body?.aksi === "kesehatan") return await kesehatan();
    if (body?.aksi === "bersihkan") return await bersihkan(body, pelaku);

    throw new KesalahanAbsen("Aksi tidak dikenal.");
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/users]", e);
    return NextResponse.json({ pesan }, { status });
  }
}

// ---------- Buat akun ----------
async function buat(d: any, req: Request) {
  if (!d.name?.trim()) throw new KesalahanAbsen("Nama wajib diisi.");
  if (!d.email?.trim()) throw new KesalahanAbsen("Email wajib diisi.");
  if (!d.password || d.password.length < 6) {
    throw new KesalahanAbsen("Password minimal 6 karakter.");
  }
  if (!["magang", "pembimbing", "admin"].includes(d.role)) {
    throw new KesalahanAbsen("Role tidak dikenal.");
  }

  let uid: string;
  try {
    const akun = await adminAuth().createUser({
      email: d.email.trim(),
      password: d.password,
      displayName: d.name.trim(),
    });
    uid = akun.uid;
  } catch (e: any) {
    if (e?.code === "auth/email-already-exists") {
      throw new KesalahanAbsen("Email sudah terpakai.", 409);
    }
    if (e?.code === "auth/invalid-email") {
      throw new KesalahanAbsen("Format email tidak valid.");
    }
    throw new KesalahanAbsen(e?.message || "Gagal membuat akun.", 500);
  }

  await adminDb().doc(`users/${uid}`).set({
    name: d.name.trim(),
    email: d.email.trim(),
    role: d.role,
    nim: d.nim || "",
    kampus: d.kampus || "",
    jurusan: d.jurusan || "",
    telepon: rapikanTelepon(d.telepon),
    status: "aktif",
    wajahTerdaftar: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  // Kirim email berisi kredensial — opsional, kegagalannya tidak membatalkan
  // pembuatan akun karena akunnya sendiri sudah jadi.
  let emailTerkirim = false;
  let alasanEmail: string | null = null;

  if (!emailAktif()) {
    alasanEmail = "Pengiriman email belum diatur (SMTP_USER / SMTP_PASS kosong).";
  } else {
    try {
      await kirimEmailAkun({
        nama: d.name.trim(),
        email: d.email.trim(),
        password: d.password,
        peran: d.role,
        urlApp: process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin,
      });
      emailTerkirim = true;
    } catch (e: any) {
      console.error("[email akun]", e);
      alasanEmail = ringkasErrorEmail(e);
    }
  }

  return NextResponse.json({ uid, emailTerkirim, alasanEmail });
}

/** 08xx / +62xx / 62xx → 62xxxxxxxxxx (format yang dipakai tautan wa.me). */
function rapikanTelepon(nomor: unknown): string {
  const angka = String(nomor || "").replace(/\D/g, "");
  if (!angka) return "";
  if (angka.startsWith("0")) return "62" + angka.slice(1);
  if (angka.startsWith("62")) return angka;
  if (angka.startsWith("8")) return "62" + angka;
  return angka;
}

function ringkasErrorEmail(e: any): string {
  const kode = String(e?.code || "");
  const pesan = String(e?.message || "");
  if (kode === "EAUTH" || /Username and Password not accepted|Invalid login/i.test(pesan)) {
    return "Login SMTP ditolak. Untuk Gmail, pastikan memakai App Password 16 karakter, bukan password akun biasa.";
  }
  if (kode === "ECONNECTION" || kode === "ETIMEDOUT") {
    return "Tidak bisa terhubung ke server email. Periksa SMTP_HOST dan SMTP_PORT.";
  }
  return pesan || "Gagal mengirim email.";
}

// ---------- Ubah akun ----------
/**
 * Perubahan profil dijalankan di server agar Firebase Auth dan Firestore
 * tidak pernah berbeda isi — email dan nama tersimpan di dua tempat.
 */
async function ubah(d: any) {
  const uid = d?.uid;
  if (!uid) throw new KesalahanAbsen("UID wajib diisi.");
  if (!d.name?.trim()) throw new KesalahanAbsen("Nama wajib diisi.");
  if (!["magang", "pembimbing", "admin"].includes(d.role)) {
    throw new KesalahanAbsen("Role tidak dikenal.");
  }

  const snap = await adminDb().doc(`users/${uid}`).get();
  if (!snap.exists) throw new KesalahanAbsen("Pengguna tidak ditemukan.", 404);
  const lama = snap.data() as any;

  const emailBaru = String(d.email || "").trim();
  const gantiEmail = !!emailBaru && emailBaru !== lama.email;
  const gantiPassword = !!d.password;

  if (gantiPassword && String(d.password).length < 6) {
    throw new KesalahanAbsen("Password baru minimal 6 karakter.");
  }

  if (gantiEmail || gantiPassword || d.name.trim() !== lama.name) {
    const perubahan: Record<string, string> = { displayName: d.name.trim() };
    if (gantiEmail) perubahan.email = emailBaru;
    if (gantiPassword) perubahan.password = d.password;
    try {
      await adminAuth().updateUser(uid, perubahan);
    } catch (e: any) {
      if (e?.code === "auth/email-already-exists") {
        throw new KesalahanAbsen("Email sudah dipakai akun lain.", 409);
      }
      if (e?.code === "auth/invalid-email") {
        throw new KesalahanAbsen("Format email tidak valid.");
      }
      if (e?.code === "auth/user-not-found") {
        throw new KesalahanAbsen("Akun login tidak ditemukan di Firebase Auth.", 404);
      }
      throw new KesalahanAbsen(e?.message || "Gagal memperbarui akun login.", 500);
    }
  }

  await adminDb().doc(`users/${uid}`).set(
    {
      name: d.name.trim(),
      email: gantiEmail ? emailBaru : lama.email,
      role: d.role,
      nim: d.nim || "",
      kampus: d.kampus || "",
      jurusan: d.jurusan || "",
      telepon: rapikanTelepon(d.telepon),
      status: d.status || "aktif",
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, emailBerubah: gantiEmail, passwordBerubah: gantiPassword });
}

// ---------- Hapus akun ----------
async function hapus(d: any, pelaku: string) {
  const target = d?.uid;
  if (!target) throw new KesalahanAbsen("UID wajib diisi.");
  if (target === pelaku) throw new KesalahanAbsen("Tidak bisa menghapus akun sendiri.", 412);

  // Hapus akun Auth agar pengguna benar-benar tidak bisa login lagi
  await adminAuth().deleteUser(target).catch(() => undefined);
  await adminDb().doc(`faceData/${target}`).delete().catch(() => undefined);
  await adminDb().doc(`users/${target}`).delete();

  const absen = await adminDb().collection("absensi").where("userId", "==", target).get();
  const batch = adminDb().batch();
  absen.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  return NextResponse.json({ ok: true, absensiDihapus: absen.size });
}

// ---------- Pemeriksaan kesehatan data ----------
/**
 * Membandingkan akun Firebase Auth dengan dokumen profil di Firestore.
 * Ketidakcocokan antar keduanya adalah sumber kebingungan paling sering:
 * akun yang bisa login tapi tidak punya profil akan tersangkut di layar
 * pembuka, sedangkan profil tanpa akun muncul sebagai peserta hantu.
 */
async function kesehatan() {
  const [authList, profilSnap] = await Promise.all([
    adminAuth().listUsers(1000),
    adminDb().collection("users").get(),
  ]);

  const petaProfil = new Map(profilSnap.docs.map((d) => [d.id, d.data() as any]));
  const uidAuth = new Set(authList.users.map((u) => u.uid));

  const tanpaProfil = authList.users
    .filter((u) => !petaProfil.has(u.uid))
    .map((u) => ({ uid: u.uid, email: u.email || "(tanpa email)" }));

  const tanpaAkun = profilSnap.docs
    .filter((d) => !uidAuth.has(d.id))
    .map((d) => ({ uid: d.id, email: (d.data() as any).email || "(tanpa email)", nama: (d.data() as any).name || "" }));

  const belumWajah = profilSnap.docs
    .filter((d) => {
      const p = d.data() as any;
      return p.role === "magang" && (p.status || "aktif") === "aktif" && p.wajahTerdaftar !== true;
    })
    .map((d) => ({ uid: d.id, nama: (d.data() as any).name || d.id }));

  return NextResponse.json({
    totalAkun: authList.users.length,
    totalProfil: profilSnap.size,
    tanpaProfil,
    tanpaAkun,
    belumWajah,
    sehat: tanpaProfil.length === 0 && tanpaAkun.length === 0,
  });
}

// ---------- Bersihkan data yatim ----------
async function bersihkan(d: any, pelaku: string) {
  const jenis = String(d?.jenis || "");
  let dihapus = 0;

  if (jenis === "tanpaProfil") {
    // Akun login tanpa profil: hapus akunnya, tidak ada data yang hilang
    const [authList, profilSnap] = await Promise.all([
      adminAuth().listUsers(1000),
      adminDb().collection("users").get(),
    ]);
    const punyaProfil = new Set(profilSnap.docs.map((x) => x.id));
    for (const u of authList.users) {
      if (u.uid === pelaku || punyaProfil.has(u.uid)) continue;
      await adminAuth().deleteUser(u.uid).catch(() => undefined);
      dihapus++;
    }
  } else if (jenis === "tanpaAkun") {
    // Profil tanpa akun login: hapus dokumennya beserta sisa absensinya
    const [authList, profilSnap] = await Promise.all([
      adminAuth().listUsers(1000),
      adminDb().collection("users").get(),
    ]);
    const uidAuth = new Set(authList.users.map((u) => u.uid));
    for (const dok of profilSnap.docs) {
      if (uidAuth.has(dok.id)) continue;
      const absen = await adminDb().collection("absensi").where("userId", "==", dok.id).get();
      const batch = adminDb().batch();
      absen.docs.forEach((a) => batch.delete(a.ref));
      batch.delete(dok.ref);
      await batch.commit();
      await adminDb().doc(`faceData/${dok.id}`).delete().catch(() => undefined);
      dihapus++;
    }
  } else {
    throw new KesalahanAbsen("Jenis pembersihan tidak dikenal.");
  }

  return NextResponse.json({ ok: true, dihapus });
}

// ---------- Sinkronisasi penanda wajah ----------
async function sinkron() {
  const users = await adminDb().collection("users").get();
  const wajah = await adminDb().collection("faceData").get();

  const punyaWajah = new Set<string>();
  wajah.docs.forEach((d) => {
    const jumlah = ((d.data() as any).descriptors || []).length;
    if (jumlah > 0) punyaWajah.add(d.id);
  });

  const batch = adminDb().batch();
  let diperbarui = 0;
  users.docs.forEach((d) => {
    const seharusnya = punyaWajah.has(d.id);
    if ((d.data() as any).wajahTerdaftar !== seharusnya) {
      batch.set(d.ref, { wajahTerdaftar: seharusnya }, { merge: true });
      diperbarui++;
    }
  });
  await batch.commit();

  return NextResponse.json({ diperiksa: users.size, diperbarui });
}
