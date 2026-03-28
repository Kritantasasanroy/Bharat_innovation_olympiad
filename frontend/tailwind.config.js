/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/admin/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/admin/**/*.{js,ts,jsx,tsx,mdx}",
    // The copied admin components don't exist in src/components/admin yet. I should update them or just include the necessary ones.
    // Wait, let me check where admin copied components are.
  ],
  theme: {
    extend: {},
  },
  corePlugins: {
    preflight: false, // Prevents Tailwind from resetting all frontend styles!
  },
  plugins: [],
}
