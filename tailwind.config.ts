import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // jednobarevné tmavě modré pozadí + odstíny panelů (navy slate)
        terrain: {
          950: '#0b1220', // pozadí stránky
          900: '#0f1830', // brand lišta / tmavší plochy
          800: '#15213d', // panel / karta
          700: '#25324f', // ohraničení
          600: '#33425f', // jemnější ohraničení / chip
        },
        // fotbalová tráva (primární akce) – akcent
        pitch: {
          DEFAULT: '#22c55e',
          dark: '#16a34a',
          light: '#4ade80',
        },
        // orientační běh – kontrolka (oranžovo-červená) a kontrola (magenta) – akcenty
        flag: '#ff5a2c',
        control: '#e6007e',
        gold: '#f5b301',
        silver: '#cbd5e1',
        bronze: '#d08b52',

        // zpětně kompatibilní aliasy (staré komponenty)
        ink: '#0b1220',
        panel: '#15213d',
        line: '#25324f',
        brand: '#22c55e',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Oswald', 'sans-serif'],
      },
      boxShadow: {
        pitch: '0 14px 34px -14px rgba(34,197,94,0.6)',
      },
    },
  },
  plugins: [],
} satisfies Config;
