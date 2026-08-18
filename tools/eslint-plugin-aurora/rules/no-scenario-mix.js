/** docs/kien-truc-san-pham.md · Kịch bản dữ liệu: "Không trộn hai kịch bản trên cùng một màn."
 *
 *  Có đúng hai kịch bản — Sao Đỏ (khách đã mua, đóng băng 10/08 07:58) và
 *  DAS Vina (khách chưa mua, đóng băng 17/08 09:10). Trộn chúng trên một màn
 *  tạo ra một thế giới không có thật: cùng lúc đã ký và chưa ký.
 *
 *  Đây là loại lỗi con người review rất khó thấy — hai import cách nhau vài
 *  dòng, tên biến không gợi gì. Máy thì thấy ngay. */
const SCENARIO = /fixtures\/(sao-do|das-vina)$/

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Một file không được dùng cả hai kịch bản dữ liệu (docs/kien-truc-san-pham.md)',
    },
    schema: [],
    messages: {
      mixed:
        'File này dùng cả hai kịch bản: "{{first}}" và "{{second}}". docs/kien-truc-san-pham.md cấm trộn — Sao Đỏ là khách ĐÃ mua (đóng băng 10/08 07:58), DAS Vina là khách CHƯA mua (17/08 09:10). Tách thành hai màn, hoặc chọn một.',
      barrel:
        'Màn không import barrel "{{source}}". Import thẳng kịch bản cần dùng — @pv/engines/fixtures/sao-do hoặc @pv/engines/fixtures/das-vina — để rule kiểm được là màn chỉ dùng một kịch bản.',
    },
  },
  create(context) {
    const seen = new Map()

    return {
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source !== 'string') return

        if (/@pv\/engines\/fixtures$/.test(source) || /fixtures\/index$/.test(source)) {
          context.report({ node, messageId: 'barrel', data: { source } })
          return
        }

        const m = source.match(SCENARIO)
        if (!m) return
        const id = m[1]
        if (!seen.has(id)) seen.set(id, source)
        if (seen.size > 1) {
          const [first, second] = [...seen.keys()]
          context.report({ node, messageId: 'mixed', data: { first, second } })
        }
      },
    }
  },
}
