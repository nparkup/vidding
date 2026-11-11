import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "-apple-system", "system-ui", "sans-serif"],
      },
      colors: {
        ink: { DEFAULT: "#0E1B2C", 700: "#22324A", 500: "#4A5B73", 300: "#8D9AAD", 100: "#E3E8EF" },
        paper: "#F6F5F1",
        mint: { DEFAULT: "#0FA37F", 600: "#0B8768", 100: "#DDF4EC", 50: "#EEFAF5" },
        amber: { DEFAULT: "#E8A33D", 100: "#FBEFD9" },
        coral: { DEFAULT: "#E0614A", 100: "#FBE3DE" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,27,44,.04), 0 8px 24px -12px rgba(14,27,44,.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
