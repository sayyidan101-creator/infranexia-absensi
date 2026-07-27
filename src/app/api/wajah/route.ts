import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/server/firebaseAdmin";
import { KesalahanAbsen, pastikanLogin, validasiDescriptor } from "@/server/absensi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_SAMPEL = 5;

/**
 * Pendaftaran wajah. Ditulis lewat server agar koleksi `faceData` bisa
 * ditutup sepenuhnya dari browser — tidak bisa dibaca maupun ditulis client.
 */
export async function POST(req: Request) {
  try {
    const uid = await pastikanLogin(req);
    const body = await req.json().catch(() => ({}));
    const daftar = body?.descriptors;

    if (!Array.isArray(daftar) || daftar.length === 0) {
      throw new KesalahanAbsen("Belum ada sampel wajah yang dikirim.");
    }
    if (daftar.length > MAKS_SAMPEL) {
      throw new KesalahanAbsen(`Maksimal ${MAKS_SAMPEL} sampel wajah.`);
    }

    const descriptors = daftar.map(validasiDescriptor);

    // Pastikan akun berhak mendaftarkan wajah
    const userSnap = await adminDb().doc(`users/${uid}`).get();
    if (!userSnap.exists) throw new KesalahanAbsen("Profil tidak ditemukan.", 403);
    const user = userSnap.data() as any;
    if ((user.status || "aktif") !== "aktif") {
      throw new KesalahanAbsen("Akun kamu tidak aktif. Hubungi admin.", 403);
    }

    await adminDb().doc(`faceData/${uid}`).set(
      { descriptors, sidikTerakhir: [], updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await adminDb().doc(`users/${uid}`).set(
      { wajahTerdaftar: true, wajahDiperbaruiPada: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return NextResponse.json({ ok: true, jumlah: descriptors.length });
  } catch (e: any) {
    const status = e instanceof KesalahanAbsen ? e.status : 500;
    const pesan = e instanceof KesalahanAbsen ? e.message : "Terjadi kesalahan di server.";
    if (status === 500) console.error("[/api/wajah]", e);
    return NextResponse.json({ pesan }, { status });
  }
}
