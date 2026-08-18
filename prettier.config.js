/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: 'all',

  // Sắp xếp class Tailwind tự động. Điều này quan trọng hơn thẩm mỹ:
  // thứ tự class ổn định thì diff của agent đọc được, và không còn tranh cãi
  // "class này đặt trước hay sau" trong review.
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './packages/tokens/globals.css',
  tailwindFunctions: ['cn', 'cva'],
}
