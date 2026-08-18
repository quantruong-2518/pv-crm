import { scanClassStrings } from '../lib/classes.js'

/** Luật 4 · Borderless. `--border: transparent`; mép đọc bằng bóng + vệt sáng
 *  inset 1px. Ngoại lệ DUY NHẤT: biến thể tương phản cao cho kiosk tablet
 *  ngoài sáng, viền 2px (khai báo trong eslint.config.js).
 *
 *  Rule đọc luật theo nghĩa hẹp: cấm VIỀN QUANH HỘP. Đường kẻ một cạnh
 *  (`border-b` chia dòng bảng) không phải viền hộp và được cho qua — đó là cách
 *  DataTable đang chia dòng, đã có trong bản chốt 10/08. */
const BOX_BORDER = /^border(-(0|2|4|8|x|y|\[.+\]))?$/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Cấm viền quanh hộp (luật 4 · Aurora v2.0)' },
    schema: [],
    messages: {
      boxBorder:
        'Class "{{token}}" vẽ viền quanh hộp. Hệ là borderless (luật 4) — phân lớp bằng box-shadow + vệt sáng inset, không bằng viền. Ngoại lệ duy nhất là biến thể tương phản cao của kiosk tablet.',
    },
  },
  create(context) {
    return scanClassStrings(context, (token, node) => {
      if (BOX_BORDER.test(token)) {
        context.report({ node, messageId: 'boxBorder', data: { token } })
      }
    })
  },
}
