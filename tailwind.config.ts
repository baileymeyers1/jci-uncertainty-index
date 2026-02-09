import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#111418",
          800: "#1a1f24",
          700: "#2a2f36",
          600: "#3a4048"
        },
        sand: {
          50: "#f7f5f2",
          100: "#f0ede7",
          200: "#e4dfd5"
        },
        ember: {
          500: "#d95d39",
          600: "#c44f2f"
        },
        moss: {
          500: "#3f7d6a",
          600: "#2f6556"
        }
      },
      fontFamily: {
        serif: ["Libre Baskerville", "ui-serif", "Georgia", "serif"],
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 8px 30px rgba(17, 20, 24, 0.08)",
        subtle: "0 2px 10px rgba(17, 20, 24, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
