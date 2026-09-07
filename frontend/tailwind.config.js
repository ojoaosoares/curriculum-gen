/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"EB Garamond"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        paper: {
          50: '#fdfcf9',
          100: '#f7f2e7',
          200: '#ede6d4',
          300: '#ded4be',
          400: '#c5b699',
          500: '#9e8c6c',
        },
        ink: {
          50: '#f5f4f2',
          100: '#e5e2dc',
          200: '#cbc5bb',
          300: '#aba294',
          400: '#84796a',
          500: '#645a4d',
          600: '#4d4439',
          700: '#3c352c',
          800: '#2c2620',
          900: '#1b1713',
          950: '#100d0a',
        },
        accent: {
          DEFAULT: '#8b5a2b',
          hover: '#73481f',
          light: '#f5ede3',
          border: '#d9be9f',
        }
      }
    },
  },
  plugins: [],
}
