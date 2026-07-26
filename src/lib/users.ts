// Helper untuk admin membuat akun user baru (magang / pembimbing)
// tanpa membuat admin ikut logout, dengan memakai instance Firebase kedua.
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseConfig } from "@/lib/firebase";

export interface UserBaru {
  name: string;
  email: string;
  password: string;
  role: "magang" | "pembimbing";
  nim?: string;
  kampus?: string;
  jurusan?: string;
}

export async function buatUser(data: UserBaru): Promise<string> {
  // Instance sekunder: buat akun Auth di sini agar sesi admin (instance utama) tidak berubah
  const secondary = initializeApp(firebaseConfig, "secondary-" + Date.now());
  const secAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secAuth, data.email, data.password);
    const uid = cred.user.uid;
    await signOut(secAuth);

    // Tulis profil sebagai ADMIN (instance utama) -> lolos Firestore Rules isAdmin()
    await setDoc(doc(db, "users", uid), {
      name: data.name,
      email: data.email,
      role: data.role,
      nim: data.nim || "",
      kampus: data.kampus || "",
      jurusan: data.jurusan || "",
      status: "aktif",
      createdAt: serverTimestamp(),
    });
    return uid;
  } finally {
    await deleteApp(secondary);
  }
}