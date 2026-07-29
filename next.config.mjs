/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // hindari pemindai kartu dijalankan dua kali saat dev

  // Registrasi publik ditutup — akun hanya dibuat admin. Cukup satu baris di
  // sini, tidak perlu satu folder halaman yang isinya hanya mengalihkan.
  async redirects() {
    return [{ source: "/register", destination: "/login", permanent: false }];
  },

  experimental: {
    // firebase-admin hanya dipakai di API route; jangan ikut dibundel.
    // Di Next.js 15 opsi ini bernama `serverExternalPackages` (tanpa experimental).
    serverComponentsExternalPackages: ["firebase-admin"],
  },

  webpack: (config, { isServer }) => {
    // `xlsx` mencoba mengimpor modul Node saat dibundel untuk BROWSER.
    // Jangan diterapkan ke bundle server, karena firebase-admin butuh `fs`.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        encoding: false,
      };
    }
    return config;
  },
};
export default nextConfig;
