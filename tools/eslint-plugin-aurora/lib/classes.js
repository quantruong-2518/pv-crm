/** Tiện ích chung: rút các token class Tailwind ra khỏi mọi chuỗi trong file.
 *
 *  Không parse `cn()` / `cva()` riêng — class Tailwind luôn nằm trong chuỗi,
 *  nên quét mọi chuỗi là đủ và không bỏ sót nhánh nào. Đổi lại có thể chạm vào
 *  chuỗi văn xuôi; các regex dưới đây đều neo chặt nên văn xuôi không khớp. */

/** Bỏ tiền tố variant (`lg:`, `hover:`, `dark:lg:`) và dấu `!` quan trọng. */
export function bare(token) {
  const last = token.split(':').pop() ?? token
  return last.replace(/^!/, '')
}

/** Duyệt mọi chuỗi trong file và gọi `visit(token, node)` cho từng class. */
export function scanClassStrings(context, visit) {
  const fromText = (text, node) => {
    if (!text || text.length > 4000) return
    for (const raw of text.split(/\s+/)) {
      const token = bare(raw.trim())
      if (token) visit(token, node)
    }
  }

  return {
    Literal(node) {
      if (typeof node.value === 'string') fromText(node.value, node)
    },
    TemplateElement(node) {
      fromText(node.value.raw, node)
    },
  }
}
