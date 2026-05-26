import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink: "#071018",
          foreground: "#eef4fb",
          cyan: "#8ae6ff",
          gold: "#f2d7a1",
          orange: "#ea8d3d",
        },
      },
    },
  },
  plugins: [],
};

export default config;
