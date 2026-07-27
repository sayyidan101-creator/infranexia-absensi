import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import PWARegister from "@/components/PWARegister";

export const metadata: Metadata = {
  title: "InfraNexia — Absensi Magang",
  description: "Absensi anak magang berbasis pengenalan wajah",
  manifest: "/manifest.json",
  applicationName: "InfraNexia",
  appleWebApp: {
    capable: true,
    title: "InfraNexia",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
  formatDetection: { telephone: false },
};

// Viewport khusus mobile: pas di layar penuh + hormati notch
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a1f44" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1f44" },
  ],
};

// Semua halaman butuh Firebase (client-side) — jangan di-prerender statis
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased selection:bg-navy-900/10">
        <AuthProvider>{children}</AuthProvider>
        <PWARegister />
      </body>
    </html>
  );
}
