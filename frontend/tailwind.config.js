/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#0284c7',
          600: '#004f90', // matches primaryColor in resume
          700: '#003a6b',
          900: '#06203a',
        }
      }
    },
  },
  plugins: [],
}
