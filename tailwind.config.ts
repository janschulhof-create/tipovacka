import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1220',      // pozadí
        panel: '#121a2b',    // karty
        line: '#1f2b44',     // oddělovače
        brand: '#22c55e',    // akční zelená
        gold: '#f5b301',
      },
    },
  },
  plugins: [],
} satisfies Config;
