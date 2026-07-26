import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0a1f44", 800: "#102a56", 700: "#1a3a6b" },
        telkomRed: "#e60012",
      },
    },
  },
  plugins: [],
};
export default config;
