import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light theme, neutrals tinted toward the brand blue.
        bg: "oklch(0.965 0.008 250)",
        surface: "oklch(1 0 0)",
        elevated: "oklch(0.99 0.004 250)",
        border: "oklch(0.92 0.008 250)",
        "border-strong": "oklch(0.86 0.012 250)",
        muted: "oklch(0.52 0.02 250)",
        "muted-soft": "oklch(0.68 0.015 250)",
        fg: "oklch(0.22 0.02 250)",
        accent: "oklch(0.56 0.22 258)",
        "accent-soft": "oklch(0.95 0.05 258)",
        "accent-ink": "oklch(0.36 0.18 258)",
        good: "oklch(0.66 0.17 150)",
        "good-soft": "oklch(0.94 0.06 150)",
        bad: "oklch(0.62 0.22 25)",
        "bad-soft": "oklch(0.95 0.05 25)",
        warn: "oklch(0.78 0.16 75)",
      },
      fontFamily: {
        sans: ["var(--font-heebo)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px oklch(0.5 0.02 250 / 0.05), 0 1px 3px oklch(0.5 0.02 250 / 0.04)",
        "card-hover": "0 4px 12px oklch(0.5 0.02 250 / 0.08), 0 1px 3px oklch(0.5 0.02 250 / 0.05)",
        sidebar: "0 1px 2px oklch(0.5 0.02 250 / 0.04)",
      },
      borderRadius: {
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
