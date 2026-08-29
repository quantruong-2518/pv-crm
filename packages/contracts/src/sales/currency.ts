import type { CurrencyCode } from './enums'

/** Bảng tỉ giá — MỘT bảng, HAI ĐẦU DÂY.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NÓ RỜI KHỎI FIXTURE
 *  ------------------------------------------------------------------
 *  Ba thứ dưới đây sống ở `@pv/engines/fixtures/das-vina` cho tới 29/08, và
 *  chỗ đó thôi đúng kể từ lúc MÁY CHỦ phải cộng tiền:
 *  `GET /sales/opportunities/scorecard` quy mọi đơn về đồng ngay trong SQL, còn
 *  màn quy lần thứ hai để in ra. Hai phép cộng, một bảng tỉ giá — hoặc chúng
 *  đọc chung một bảng, hoặc tổng của máy chủ và tổng của màn lệch nhau mà không
 *  ai thấy, vì cả hai đều trả về một con số trông hợp lý.
 *
 *  Để nguyên trong fixture thì chỉ còn hai lối, và cả hai đều sai: chép con số
 *  sang máy chủ (hai bản, ngày một bản đổi là ngày chúng lệch), hoặc để nhánh
 *  máy chủ nhập từ fixture của một kịch bản demo. Hợp đồng dữ liệu là chỗ duy
 *  nhất cả hai đầu VỐN ĐÃ cùng đọc.
 *
 *  `das-vina.ts` xuất lại đúng bốn tên này, nên mọi `import … from
 *  '@pv/engines/fixtures/das-vina'` đang có chạy y nguyên. */

/** Tỷ giá quy đổi, đồng/USD. Vietcombank bán ra 18/08/2026 — là số ĐO, nhưng
 *  vẫn phải khoá một mốc, nếu không mọi đơn giá USD trôi theo ngày chạy và hai
 *  lần mở màn ra hai con số.
 *
 *  **Mốc ĐẶT bởi Trần Thu Hà · 20/08.** */
export const USD_VND = 26_400

/** Hai đồng tiền, không hơn.
 *
 *  Thêm EUR hay JPY thì phải bịa tỷ giá — mà `USD_VND` là mốc ĐẶT có người chịu
 *  trách nhiệm, không phải một con số tiện tay. Cần đồng thứ ba thì thêm mốc tỷ
 *  giá trước, đừng thêm dòng select trước.
 *
 *  `rate` là thứ SQL cũng đọc: `OpportunityRepository` dựng biểu thức
 *  `CASE currency WHEN … THEN amount * rate` từ chính mảng này, nên thêm một
 *  dòng ở đây là câu truy vấn biết luôn — không có bảng thứ hai để quên. */
export const CURRENCIES = [
  { code: 'VND', label: 'VND · Việt Nam đồng', symbol: '₫', rate: 1 },
  { code: 'USD', label: 'USD · đô la Mỹ', symbol: '$', rate: USD_VND },
] as const satisfies readonly { code: CurrencyCode; label: string; symbol: string; rate: number }[]

/** Quy về đồng. Mọi chỗ CỘNG tiền phải đi qua đây — sổ cơ hội cộng bằng đồng,
 *  cộng thẳng số USD vào đó là sai 26.400 lần. */
export function toDong(amount: number, currency: CurrencyCode): number {
  return amount * (CURRENCIES.find((c) => c.code === currency)?.rate ?? 1)
}
