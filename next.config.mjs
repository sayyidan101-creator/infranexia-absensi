/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // hindari pemindai kartu dijalankan dua kali saat dev

  // Registrasi publik ditutup — akun hanya dibuat admin. Cukup satu baris di
  // sini, tidak perlu satu folder halaman yang isinya hanya mengalihkan.
  async redirects() {
    return [{ source: "/register", destination: "/login", permanent: false }];
  },

  // firebase-admin hanya dipakai di API route; jangan ikut dibundel.
  // Sejak Next.js 15 namanya `serverExternalPackages`, tanpa `experimental`.
  serverExternalPackages: ["firebase-admin"],

  // Sejak Next.js 16 Turbopack yang dipakai secara baku, dan resolusi modul
  // Node-nya sudah menangani `xlsx` tanpa perlu daftar fallback manual.
  turbopack: { root: import.meta.dirname },
};
export default nextConfig;
