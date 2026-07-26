import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "InfraNexia — Absensi Magang",
  description: "Absensi anak magang berbasis pengenalan wajah",
};

// Semua halaman butuh Firebase (client-side) — jangan di-prerender statis
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
