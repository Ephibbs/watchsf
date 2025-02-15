import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: false,
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
        },
        error: {
          DEFAULT: '#dc2626',
          hover: '#b91c1c',
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  darkMode: 'media',
};

export default config;
