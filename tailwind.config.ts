import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Aliases to the CSS custom properties in globals.css — the single
      // source of truth for the palette. `text-gold` and `text-[var(--gold)]`
      // resolve identically; new code should prefer the short tokens.
      colors: {
        parchment: 'var(--parchment)',
        'parchment-dark': 'var(--parchment-dark)',
        'dragon-red': 'var(--dragon-red)',
        'dragon-red-light': 'var(--dragon-red-light)',
        'dungeon-dark': 'var(--dungeon-dark)',
        'dungeon-mid': 'var(--dungeon-mid)',
        'dungeon-accent': 'var(--dungeon-accent)',
        gold: 'var(--gold)',
        'gold-light': 'var(--gold-light)',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        medieval: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
