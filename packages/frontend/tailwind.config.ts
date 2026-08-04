import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#111315',
          1: '#15181B',
          2: '#1B1F23',
          3: '#202428',
          hover: '#252A2F',
        },
        border: {
          DEFAULT: '#2C3137',
          subtle: '#222629',
        },
        content: {
          primary: '#F2F1ED',
          secondary: '#A6ABB0',
          tertiary: '#747B82',
        },
        amber: {
          400: '#E5A823',
          500: '#C8911A',
        },
        fault: {
          red: '#D84A4A',
        },
        health: {
          green: '#36A875',
        },
        info: {
          blue: '#4A90C4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;

