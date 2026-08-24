/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  corePlugins: {
    preflight: false, // Prevents Tailwind from resetting all frontend styles!
  },
  plugins: [],
}
