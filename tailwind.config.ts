import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#07101d',
          deep: '#040a13',
        },
        surface: {
          1: '#0c1829',
          2: '#11213a',
          3: '#172a47',
          hover: '#1b3152',
        },
        line: {
          subtle: '#203552',
          strong: '#30496e',
        },
        copy: {
          primary: '#f7f9fc',
          secondary: '#b4c0d4',
          muted: '#7888a3',
          disabled: '#4d5d75',
        },
        violet: {
          50: '#f6f1ff',
          100: '#ecddff',
          200: '#d8bfff',
          300: '#be94ff',
          400: '#a46af7',
          500: '#8b4eeb',
          600: '#7334d4',
          700: '#5925a8',
          800: '#3f1d75',
          900: '#271345',
        },
        state: {
          success: '#29d17d',
          danger: '#f0526e',
          warning: '#f5b942',
          info: '#49a8ff',
          live: '#ff563d',
        },
        points: {
          exact: '#a46af7',
          difference: '#29d17d',
          winner: '#49a8ff',
          partial: '#f5b942',
          zero: '#f0526e',
        },

        /* Kompatibilní aliasy pro stávající komponenty. */
        terrain: {
          950: '#07101d',
          900: '#091426',
          800: '#0f1d33',
          700: '#203552',
          600: '#30496e',
        },
        pitch: {
          DEFAULT: '#8b4eeb',
          dark: '#7334d4',
          light: '#be94ff',
        },
        flag: '#ff563d',
        control: '#a46af7',
        gold: '#f5b942',
        silver: '#b4c0d4',
        bronze: '#d08b52',
        ink: '#07101d',
        panel: '#0f1d33',
        brand: '#8b4eeb',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        display: [
          'Arial Narrow',
          'Roboto Condensed',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '18px',
        panel: '22px',
      },
      boxShadow: {
        card: '0 10px 30px rgba(0, 0, 0, 0.24)',
        elevated: '0 22px 60px rgba(0, 0, 0, 0.38)',
        violet: '0 0 0 1px rgba(164,106,247,.24), 0 14px 42px rgba(115,52,212,.18)',
        live: '0 0 0 1px rgba(255,86,61,.30), 0 14px 36px rgba(255,86,61,.14)',
        pitch: '0 14px 34px -14px rgba(139,78,235,.72)',
      },
      backgroundImage: {
        'gradient-violet': 'linear-gradient(135deg, #a46af7 0%, #7c3aed 55%, #6366f1 100%)',
        'gradient-panel': 'linear-gradient(145deg, rgba(17,33,58,.96), rgba(8,18,32,.98))',
        'gradient-page': 'radial-gradient(circle at 76% -10%, rgba(139,78,235,.16), transparent 34%), radial-gradient(circle at 5% 35%, rgba(73,168,255,.07), transparent 30%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
