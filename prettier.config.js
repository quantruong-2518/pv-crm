/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: 'all',

  // Auto-sort Tailwind classes. This matters more than aesthetics: a stable
  // class order makes agent diffs readable, and ends the "which class goes
  // first" argument in review.
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './packages/tokens/globals.css',
  tailwindFunctions: ['cn', 'cva'],
}
