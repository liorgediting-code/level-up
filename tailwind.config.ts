import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  // Night mode flips via [data-mode="dark"] on <html>; this lets `dark:`
  // variants target it for the few spots that use fixed Tailwind colors.
  darkMode: ["selector", '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        // Neutrals + semantics resolve through CSS variables so the whole
        // palette flips under [data-mode="dark"]. Light values live in :root,
        // dark overrides in globals.css. Accent is a separate axis (orange/blue).
        bg: "var(--bg)",
        surface: "var(--surface)",
        elevated: "var(--elevated)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        muted: "var(--muted)",
        "muted-soft": "var(--muted-soft)",
        fg: "var(--fg)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        good: "var(--good)",
        "good-soft": "var(--good-soft)",
        bad: "var(--bad)",
        "bad-soft": "var(--bad-soft)",
        warn: "var(--warn)",
      },
      borderColor: {
        // Bare `border` (no color class) flips with the theme instead of
        // falling back to Tailwind's fixed gray-200.
        DEFAULT: "var(--border)",
      },
      fontFamily: {
        sans: ["var(--font-heebo)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px var(--shadow-1), 0 1px 3px var(--shadow-2)",
        "card-hover": "0 4px 12px var(--shadow-3), 0 1px 3px var(--shadow-2)",
        sidebar: "0 1px 2px var(--shadow-1)",
      },
      borderRadius: {
        "2xl": "1.125rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
