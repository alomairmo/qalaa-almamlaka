/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── قلاع المملكة · design.md §2 tokens ──
        teal: {
          900: "#0B3E43",
          700: "#0F5E63",
          500: "#17A2A0",
        },
        "turquoise-glaze": "#2EC4B6",
        gold: {
          600: "#B8860B",
          500: "#E8B93B",
          300: "#F5D76E",
        },
        sand: { 200: "#E9D8A6" },
        parchment: "#F6EED9",
        wood: {
          700: "#4A2F1B",
          900: "#2E1B0E",
        },
        ink: "#2B2118",
        night: { 800: "#123B4F" },
        stone: { 400: "#8D99AE" },
        danger: { 500: "#D64545" },
        success: { 500: "#43A95C" },
        sky: { 300: "#AEE3F5" },
        // team colors (design.md §2.2)
        team: {
          1: "#2E9E5B",
          2: "#C94F3D",
          3: "#3B7DD8",
          4: "#E8912D",
          5: "#8E5BB5",
          6: "#D85B8E",
        },
        // ── shadcn tokens (kept) ──
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        display: ['"Aref Ruqaa"', "serif"],
        heading: ['"Cairo"', "sans-serif"],
        body: ['"Tajawal"', "sans-serif"],
      },
      borderRadius: {
        panel: "16px",
        btn: "14px",
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        card: "0 4px 12px rgba(43,33,24,.25)",
        modal: "0 12px 32px rgba(43,33,24,.35)",
        screen: "0 24px 64px rgba(11,62,67,.5)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "logo-float": {
          "0%,100%": { transform: "translateY(-8px)" },
          "50%": { transform: "translateY(8px)" },
        },
        "sparkle-sweep": {
          "0%": { transform: "translateX(-130%) skewX(-18deg)", opacity: "0" },
          "15%": { opacity: "0.9" },
          "100%": { transform: "translateX(230%) skewX(-18deg)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "logo-float": "logo-float 4s ease-in-out infinite",
        "sparkle-sweep": "sparkle-sweep 0.8s ease-in-out 1",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
