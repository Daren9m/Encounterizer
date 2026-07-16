import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Aliases to the CSS custom properties in globals.css — the single
      // source of truth for the palette. `text-bronze` and
      // `text-[var(--bronze)]` resolve identically.
      colors: {
        steel: {
          950: 'var(--steel-950)',
          900: 'var(--steel-900)',
          800: 'var(--steel-800)',
          700: 'var(--steel-700)',
        },
        bronze: {
          DEFAULT: 'var(--bronze)',
          light: 'var(--bronze-light)',
          deep: 'var(--bronze-deep)',
        },
        ink: {
          1: 'var(--text-1)',
          2: 'var(--text-2)',
          3: 'var(--text-3)',
        },
        danger: 'var(--accent-danger)',
        difficulty: {
          easy: 'var(--difficulty-easy)',
          medium: 'var(--difficulty-medium)',
          hard: 'var(--difficulty-hard)',
          deadly: 'var(--difficulty-deadly)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-body)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
