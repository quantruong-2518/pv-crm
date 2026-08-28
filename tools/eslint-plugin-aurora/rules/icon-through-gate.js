/** Luật 11 · Icon Hugeicons Stroke Rounded, stroke 1.75, size 16 trong nút / 20 trong nav.
 *
 *  `<Icon>` là CỬA DUY NHẤT vào Hugeicons — ở đó `size` và `strokeWidth` là union
 *  hẹp nên không đặt sai được. Render thẳng `<House />` thì đi vòng qua cửa đó
 *  và lấy stroke mặc định 2, size mặc định 24.
 *
 *  Import tên icon để TRUYỀN vào `<Icon icon={House} />` hoặc vào prop dữ liệu
 *  vẫn hợp lệ — rule chỉ chặn việc dùng nó làm thẻ JSX.
 *
 *  File định nghĩa `<Icon>` được miễn trong eslint.config.js. */
export default {
  meta: {
    type: 'problem',
    docs: { description: 'Icon Hugeicons phải đi qua <Icon> (luật 11 · Aurora v2.0)' },
    schema: [],
    messages: {
      direct:
        'Đừng render <{{name}} /> trực tiếp. Dùng <Icon icon={{{name}}} size={16} /> — <Icon> là cửa duy nhất vào Hugeicons, nơi stroke 1.75 và size được khoá ở tầng kiểu (luật 11).',
    },
  },
  create(context) {
    const fromHugeicons = new Set()

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@hugeicons/react') return
        for (const spec of node.specifiers) {
          if (spec.local?.name) fromHugeicons.add(spec.local.name)
        }
      },
      JSXOpeningElement(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        if (name && fromHugeicons.has(name)) {
          context.report({ node: node.name, messageId: 'direct', data: { name } })
        }
      },
    }
  },
}
