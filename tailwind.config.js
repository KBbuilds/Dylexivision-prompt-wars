/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDFBF6',
          100: '#FAF6EC',
          200: '#E6DEC8',
        },
        navy: {
          900: '#0F1B2E',
          800: '#16263D',
          700: '#223552',
          400: '#475973',
          300: '#7B8AA1',
        },
        teal: {
          700: '#0A6458',
          600: '#0D7D6E',
          500: '#12988A',
          400: '#1FAF9C',
          100: '#D7F2ED',
          50: '#EFFAF8',
        },
        coral: {
          600: '#C94439',
          500: '#E2574C',
        },
        amber: {
          400: '#E8A13C',
        },
        green: {
          500: '#2E9E5B',
        },
      },
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'Atkinson Hyperlegible',
          'Noto Sans Tamil',
          'Noto Sans Devanagari',
          'Noto Sans Telugu',
          'Noto Sans Malayalam',
          'Noto Sans Kannada',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'Lexend',
          'Plus Jakarta Sans',
          'Noto Sans Tamil',
          'Noto Sans Devanagari',
          'Noto Sans Telugu',
          'Noto Sans Malayalam',
          'Noto Sans Kannada',
          'system-ui',
          'sans-serif',
        ],
        tamil: ['Noto Sans Tamil', 'Atkinson Hyperlegible', 'system-ui', 'sans-serif'],
        indic: [
          'Noto Sans Tamil',
          'Noto Sans Devanagari',
          'Noto Sans Telugu',
          'Noto Sans Malayalam',
          'Noto Sans Kannada',
          'Atkinson Hyperlegible',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
