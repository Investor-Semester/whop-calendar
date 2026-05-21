import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Whop-inspired color palette
        whop: {
          bg: "#0a0a0a",
          surface: "#141414",
          card: "#1c1c1c",
          border: "#2a2a2a",
          text: "#f5f5f5",
          muted: "#888888",
          accent: "#6366f1",        // indigo-500
          "accent-hover": "#4f46e5", // indigo-600
          success: "#22c55e",
          danger: "#ef4444",
          warning: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};

export default config;
