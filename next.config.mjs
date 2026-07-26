/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // hindari double init kamera saat dev
  webpack: (config) => {
    // face-api butuh fallback ini agar tidak error di bundler
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      encoding: false,
    };
    return config;
  },
};
export default nextConfig;
