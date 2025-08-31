import type { Config } from "tailwindcss"

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))"
      },
      boxShadow: {
        soft: "0 2px 10px 0 hsla(var(--foreground), 0.06)"
      },
      borderRadius: {
        lg: "var(--radius)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
} satisfies Config
