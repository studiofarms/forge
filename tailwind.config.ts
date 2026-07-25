import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0a0f',
          900: '#101018',
          850: '#151522',
          800: '#1c1c2b',
          700: '#282840',
          600: '#3a3a58',
          400: '#7b7b9e',
          300: '#a0a0bf',
          200: '#c5c5da',
        },
        brand: {
          500: '#8b5cf6',
          400: '#a78bfa',
          600: '#7c3aed',
        },
        accent: {
          500: '#22d3ee',
          400: '#67e8f9',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
