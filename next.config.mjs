/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // hindari double init kamera saat dev

  experimental: {
    // firebase-admin hanya dipakai di API route; jangan ikut dibundel.
    // Di Next.js 15 opsi ini bernama `serverExternalPackages` (tanpa experimental).
    serverComponentsExternalPackages: ["firebase-admin"],
  },

  webpack: (config, { isServer }) => {
    // face-api butuh fallback ini agar tidak error di bundler BROWSER.
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
