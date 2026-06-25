import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        velvet: {
          950: "#020403",
          900: "#070908",
          850: "#0b0d0c",
          800: "#101312",
          700: "#171b19"
        },
        apothecary: {
          moss: "#243b2f",
          fern: "#2f6d4d",
          sage: "#8fb69d",
          mint: "#b7ffd0",
          neon: "#6dff9c",
          lotus: "#e5a6b2",
          pollen: "#d4c28f"
        },
        receipt: {
          bone: "#f2ead8",
          ink: "#141512"
        }
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      boxShadow: {
        "glass-soft": "0 24px 80px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        "garden-glow": "0 0 46px rgba(109, 255, 156, 0.16)",
        "lotus-glow": "0 0 52px rgba(229, 166, 178, 0.14)",
        ticket: "0 36px 120px rgba(0, 0, 0, 0.62), inset 0 1px 0 rgba(255, 255, 255, 0.14)"
      },
      backgroundImage: {
        "velvet-radial": "radial-gradient(circle at 24% 12%, rgba(47, 109, 77, 0.28), transparent 34%), radial-gradient(circle at 80% 72%, rgba(229, 166, 178, 0.1), transparent 32%), linear-gradient(135deg, #020403 0%, #070908 45%, #101312 100%)",
        "ticket-sheen": "linear-gradient(135deg, rgba(255,255,255,0.13), rgba(255,255,255,0.02) 40%, rgba(109,255,156,0.08))"
      },
      keyframes: {
        spinSoft: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" }
        },
        scan: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" }
        }
      },
      animation: {
        "spin-soft": "spinSoft 1.2s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        scan: "scan 2.2s cubic-bezier(0.16, 1, 0.3, 1) infinite"
      }
    }
  },
  plugins: []
};

export default config;
