module.exports = {
  content: ["./index.html", "./app.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        background: "#121212",
        surface: "#1E1E1E",
        surface_hover: "#27272A",
        border: "#333333",
        text: "#F5F5F5",
        muted: "#A0A0A0",
        danger: "#EF4444"
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      }
    }
  },
  plugins: []
};