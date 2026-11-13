import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "-apple-system", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#050B17",
          900: "#081022",
          DEFAULT: "#0B1426",
          800: "#121D33",
          700: "#24304A",
          500: "#4D586F",
          400: "#6C778D",
          300: "#98A1B4",
          200: "#CBD2DE",
          100: "#E5E9F0",
          50: "#F3F5F9",
        },
        paper: "#F5F7FA",
        mint: {
          DEFAULT: "#12B886",
          700: "#077A59",
          600: "#0B9A70",
          400: "#3DD6A3",
          300: "#86EBC8",
          100: "#D5F6E9",
          50: "#ECFBF5",
        },
        sky: { DEFAULT: "#3B82F6", 400: "#60A5FA", 300: "#93C5FD", 100: "#DBEAFE" },
        amber: { DEFAULT: "#F0A63A", 100: "#FDF0DA" },
        coral: { DEFAULT: "#EF5A43", 100: "#FDE4DF" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,20,38,.04), 0 12px 32px -16px rgba(11,20,38,.14)",
        lift: "0 2px 4px rgba(11,20,38,.04), 0 24px 48px -20px rgba(11,20,38,.28)",
        glow: "0 0 0 1px rgba(18,184,134,.25), 0 16px 48px -12px rgba(18,184,134,.45)",
      },
      borderRadius: { "4xl": "2rem" },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(12px)" }, to: { opacity: "1", transform: "none" } },
        "loading-slide": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(250%)" } },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 8s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        "fade-up": "fade-up .7s ease-out both",
        "loading-slide": "loading-slide 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
