import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0a1f44", 800: "#102a56", 700: "#1a3a6b", 600: "#24508f" },
        telkomRed: "#e60012",
      },
      boxShadow: {
        soft: "0 2px 14px -6px rgba(10,31,68,0.18)",
        lift: "0 12px 32px -12px rgba(10,31,68,0.35)",
        tab: "0 -6px 24px -12px rgba(10,31,68,0.35)",
      },
      screens: {
        xs: "360px",
      },
    },
  },
  plugins: [],
};
export default config;
