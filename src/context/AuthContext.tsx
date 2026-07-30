"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type Role = "admin" | "pembimbing" | "magang";

export interface Profil {
  uid: string;
  name: string;
  email: string;
  role: Role;
  nim?: string;
  kampus?: string;
  jurusan?: string;
  status?: string;
  foto?: string;
}

interface AuthState {
  user: User | null;
  profil: Profil | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profil: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) {
          const snap = await getDoc(doc(db, "users", u.uid));
          setProfil(snap.exists() ? { uid: u.uid, ...(snap.data() as any) } : null);
        } else {
          setProfil(null);
        }
      } catch (e) {
        // Membaca profil butuh jaringan, dan sekarang aplikasi ini bisa dipasang
        // di HP — dibuka di tempat bersinyal buruk jadi hal biasa.
        //
        // Dulu galat ini tidak ditangkap sama sekali. Firebase tidak menunggu
        // callback ini, jadi penolakannya senyap: `setLoading(false)` tidak
        // pernah tercapai dan seluruh aplikasi berhenti di layar "Menyiapkan
        // aplikasi" selamanya. Menutup lalu membuka lagi pun sama saja.
        console.error("[AuthContext] gagal membaca profil", e);
        setProfil(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profil, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);