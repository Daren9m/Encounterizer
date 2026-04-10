import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        parchment: '#f4e4c1',
        'parchment-dark': '#d4c4a1',
        'dragon-red': '#8b1a1a',
        'dragon-red-light': '#a52a2a',
        'dungeon-dark': '#1a1a2e',
        'dungeon-mid': '#16213e',
        'dungeon-accent': '#0f3460',
        'gold': '#d4a017',
        'gold-light': '#f0c040',
      },
      fontFamily: {
        medieval: ['Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
