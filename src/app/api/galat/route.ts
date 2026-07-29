import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import { KesalahanAbsen, pastikanLogin, pastikanAdmin } from "@/server/absensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Jumlah laporan yang disimpan. Yang terlama dibuang saat penuh. */
const MAKS_SIMPAN = 200;

/**
 * Pelaporan galat dari browser.
 *
 * Tanpa ini, kesalahan yang terjadi di ponsel peserta hanya diketahui
 * peserta itu sendiri — dan biasanya tidak dilaporkan, hanya membuat orang
 * berhenti memakai aplikasinya. Di sini kesalahan dikirim ke server supaya
 * admin melihatnya tanpa perlu menunggu ada yang mengeluh.
 *
 * body.aksi = "lapor" (siapa pun yang login) | "daftar" | "hapus" (admin)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body?.aksi === "daftar") return await daftar(req);
    if (body?.aksi === "hapus") return await hapus(req);
    return await lapor(req, body);
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    let pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) {
      console.error("[/api/galat]", e);
      const kode = e?.code ? `${e.code}: ` : "";
      pesan += ` — ${(kode + String(e?.message || e)).slice(0, 220)}`;
    }
    return NextResponse.json({ pesan }, { status });
  }
}

async function lapor(req: Request, d: any) {
  // Sengaja butuh login: endpoint terbuka akan jadi sasaran empuk untuk
  // dibanjiri sampah, dan kuota tulis Firestore ikut habis.
  const uid = await pastikanLogin(req);

  const pesan = String(d?.pesan || "").slice(0, 500);
  if (!pesan) throw new KesalahanAbsen("Laporan kosong.");

  const profil = await adminDb().doc(`users/${uid}`).get();
  const p = profil.exists ? (profil.data() as any) : {};

  await adminDb().collection("galat").add({
    pesan,
    tumpukan: String(d?.tumpukan || "").slice(0, 2000),
    halaman: String(d?.halaman || "").slice(0, 200),
    perangkat: String(d?.perangkat || "").slice(0, 300),
    uid,
    nama: p.name || "",
    peran: p.role || "",
    pada: FieldValue.serverTimestamp(),
    padaMs: Date.now(),
  });

  await pangkas();
  return NextResponse.json({ ok: true });
}

/** Buang laporan terlama agar koleksinya tidak tumbuh tanpa batas. */
async function pangkas() {
  const snap = await adminDb().collection("galat").get();
  if (snap.size <= MAKS_SIMPAN) return;

  const urut = snap.docs
    .map((d) => ({ ref: d.ref, ms: Number((d.data() as any).padaMs) || 0 }))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, snap.size - MAKS_SIMPAN);

  const batch = adminDb().batch();
  urut.forEach((x) => batch.delete(x.ref));
  await batch.commit();
}

async function daftar(req: Request) {
  await pastikanAdmin(req);
  const snap = await adminDb().collection("galat").get();

  const daftar = snap.docs
    .map((d) => {
      const { pada, ...sisanya } = d.data() as any;
      return { id: d.id, ...sisanya, padaMs: Number(sisanya.padaMs) || 0 };
    })
    .sort((a, b) => b.padaMs - a.padaMs)
    .slice(0, 100);

  return NextResponse.json({ galat: daftar });
}

async function hapus(req: Request) {
  await pastikanAdmin(req);
  const snap = await adminDb().collection("galat").get();
  const batch = adminDb().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return NextResponse.json({ ok: true, dihapus: snap.size });
}
