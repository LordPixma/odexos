/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // OdexOS brand — a warm jade/teal. Calm, premium, not generic-indigo.
        brand: {
          50: "#eefbf4",
          100: "#d6f5e3",
          200: "#b0e9cb",
          300: "#7bd7ac",
          400: "#43be8b",
          500: "#1fa471",
          600: "#0f8a5f", // primary
          700: "#0c6e4d",
          800: "#0d573f",
          900: "#0c4835",
          950: "#04271d",
        },
        // Warm honey accent for highlights.
        accent: {
          50: "#fef8ec",
          100: "#faead0",
          200: "#f4d29c",
          300: "#eeb85f",
          400: "#e9a234",
          500: "#d9841a",
          600: "#bd6413",
          700: "#9c4a14",
          800: "#7f3b16",
          900: "#693115",
        },
        // Warm neutral canvas + ink (replaces the cold slate default look).
        sand: {
          50: "#faf8f4",
          100: "#f4f1ea",
          200: "#e9e3d8",
          300: "#d8cfbf",
        },
      },
      fontFamily: {
        sans: [
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        display: [
          "Space Grotesk",
          "Plus Jakarta Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(20, 30, 25, 0.04), 0 8px 24px -12px rgba(20, 30, 25, 0.12)",
        lift: "0 2px 6px rgba(20, 30, 25, 0.06), 0 18px 40px -18px rgba(20, 30, 25, 0.22)",
      },
      borderRadius: {
        "2xl": "1.1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
