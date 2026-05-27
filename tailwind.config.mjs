/** @type {import('tailwindcss').Config} */
// Tailwind is kept only for the `base / components / utilities` reset that
// `styles.css` imports. The Editorial Ledger UI is hand-authored CSS with
// `pt-*` classes and CSS variables — no Tailwind utilities are used in components.
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {},
  plugins: []
}
