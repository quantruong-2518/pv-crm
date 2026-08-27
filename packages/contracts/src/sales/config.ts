import { z } from 'zod'
import { Moc, textNhap, textNhapTuyChon } from '../primitives'

/** Cấu hình danh mục Sales — module 6. `/sales/config`.
 *
 *  ------------------------------------------------------------------
 *  TỪ VỰNG NGHIỆP VỤ THÔI LÀ CODE, THÀNH DỮ LIỆU NGƯỜI NHẬP
 *  ------------------------------------------------------------------
 *  Sáu danh mục dưới đây hôm nay còn là `z.enum` trong `./enums.ts` và một bản
 *  chép trong fixture. Đổi tên một cột sổ là một lần sửa code, một lần build,
 *  một lần deploy — cho một việc mà người dùng phải tự làm được. File này là
 *  hợp đồng của phiên bản DỮ LIỆU: cùng sáu danh mục ấy, nhưng nằm trong
 *  `sales.config_entry`.
 *
 *  ------------------------------------------------------------------
 *  BA LUẬT CHỊU LỰC — đọc trước khi thêm bất cứ thứ gì vào đây
 *  ------------------------------------------------------------------
 *  1 · **ID định danh · TÊN hiển thị · THỨ TỰ NHẬP là thứ tự nghiệp vụ.**
 *      Sửa tên không đụng tới dữ liệu đang trỏ vào dòng đó; đổi thứ tự không
 *      đụng tới id. Đó là lý do lead trỏ vào `id`, không trỏ vào `name`.
 *
 *  2 · **Ngữ nghĩa nằm ở THUỘC TÍNH và THỨ TỰ, KHÔNG nằm ở id.**
 *      Không bao giờ được viết `if (stage.id === 'ST-05')`. "Bậc cuối" là
 *      `ord` lớn nhất; "đã qua đầu mối" là `ord > 1`; "hạn của cột" là thuộc
 *      tính `limitDays`. Một câu `if` so id là một câu hỏi sai chỗ: nó hỏi
 *      "dòng nào" trong khi thứ cần biết là "dòng đó có tính chất gì" — và nó
 *      sai lặng lẽ đúng vào ngày người dùng chèn thêm một bậc.
 *
 *  3 · **Không xoá cứng.** Dòng đã có lead trỏ vào chỉ TẮT được
 *      (`active: false`); khoá ngoại chặn xoá. Bảng không có endpoint DELETE,
 *      và đó là chủ ý chứ không phải chỗ quên. */

/** Sáu danh mục. Khoá ASCII viết hoa — chúng đi vào URL và vào cột `list`.
 *
 *  CỐ TÌNH để ngoài, đừng thêm vào: `IntakeChannel` (hệ tự ghi, không ai gõ),
 *  `CurrencyCode` (chuẩn ISO, không phải từ vựng của phòng kinh doanh), và
 *  `Permission`/`RoleId`/`Branch` (ma trận quyền là hợp đồng của platform —
 *  cho phòng kinh doanh tự thêm một quyền là mở một lỗ hổng, không phải mở một
 *  ô cấu hình). */
export const ConfigList = z.enum(['STAGE', 'TIER', 'CATEGORY', 'EXIT_REASON', 'CHANNEL', 'SOURCE'])

export type ConfigList = z.infer<typeof ConfigList>

/** Tiền tố id của từng danh mục. Máy chủ sinh `<tiền tố>-<số thứ tự>`.
 *
 *  Tiền tố mang tên danh mục để một mã lạc chỗ đọc ra được ngay ('ST-05' rơi
 *  vào ô `tier` là nhìn thấy). Đó là tiện nghi cho người đọc log — KHÔNG phải
 *  chỗ để rẽ nhánh: luật 2 ở đầu file vẫn nguyên, cả tiền tố lẫn con số đều
 *  không mang nghĩa nghiệp vụ nào. */
export const CONFIG_PREFIX: Record<ConfigList, string> = {
  STAGE: 'ST',
  TIER: 'TR',
  CATEGORY: 'CT',
  EXIT_REASON: 'EX',
  CHANNEL: 'CH',
  SOURCE: 'SR',
}

/** Mã một dòng cấu hình — 'ST-01', 'EX-06'. BẤT BIẾN kể từ lúc sinh.
 *
 *  Hẹp hơn `MaObject` (`[A-Z]{1,3}-\d{3,6}`) đúng một bậc, và cố ý: sáu tiền tố
 *  liệt kê thẳng ra nên một mã sai danh mục bị chặn ngay ở cổng zod, không phải
 *  đợi tới câu truy vấn. Cũng vì thế `PATCH /sales/config/:list/order` không bị
 *  `:id` nuốt mất — chuỗi 'order' không khớp dạng này. */
export const MaConfig = z.string().regex(/^(ST|TR|CT|EX|CH|SR)-\d{2,4}$/, 'Mã cấu hình sai dạng')

export type MaConfig = z.infer<typeof MaConfig>

/** Một dòng của bất kỳ danh mục nào.
 *
 *  Năm trường đầu chung cho cả sáu danh mục; ba trường cuối là thuộc tính
 *  RIÊNG, mỗi cái chỉ có nghĩa với đúng một danh mục — và ở tầng bảng chúng
 *  được ép bằng CHECK, không nhờ người nhớ. */
export const ConfigEntry = z.object({
  id: MaConfig,
  list: ConfigList,
  /** NHÃN hiển thị — sửa được, có dấu, không phải khoá của bất cứ thứ gì. */
  name: z.string().min(1),
  /** Thứ tự nhập = thứ tự nghiệp vụ. Đây là chỗ chở ngữ nghĩa "bậc" và "cột
   *  thứ mấy của phễu", nên nó KHÔNG phải số trang trí. Bắt đầu từ 1. */
  ord: z.number().int().positive(),
  /** `false` = đã tắt. Dòng vẫn còn để dữ liệu cũ trỏ vào có chỗ đứng, nhưng
   *  không hiện ra ở ô chọn nữa. Đây là toàn bộ hình thức "xoá" mà hệ có. */
  active: z.boolean(),
  createdAt: Moc,

  /** CHỈ `STAGE` — hạn của cột, tính bằng ngày. Quá hạn thì đơn tô cảnh báo.
   *  Thay cho `stageLimit.get(key)` đang tra một `Map` dựng từ hằng số. */
  limitDays: z.number().int().nonnegative().optional(),
  /** CHỈ `CATEGORY` — Sale phụ trách ngành, `id` của `platform.actor`.
   *  Thay cho `LEAD_CATEGORIES[].sale`, thứ đang so bằng TÊN người. */
  ownerId: z.string().min(1).optional(),
  /** CHỈ `SOURCE` — 'chien-dich' · 'su-kien' · 'tu-nhien'. */
  kind: z.string().min(1).optional(),
})

/** Cả sáu danh mục, trả MỘT lần.
 *
 *  Màn Cấu hình hiện cả sáu cùng lúc, và mọi màn khác cần bảng tra nhãn cũng
 *  cần gần như cả sáu. Sáu lời gọi cho một màn là sáu lần đi vòng mạng cho một
 *  thứ tổng cộng chưa tới ba mươi dòng. */
export const ConfigBundle = z.object({
  STAGE: z.array(ConfigEntry),
  TIER: z.array(ConfigEntry),
  CATEGORY: z.array(ConfigEntry),
  EXIT_REASON: z.array(ConfigEntry),
  CHANNEL: z.array(ConfigEntry),
  SOURCE: z.array(ConfigEntry),
})

/** Một danh mục. Mang theo `list` chứ không trả mảng trần: một mảng rời khỏi
 *  đường dẫn thì không còn tự nói được nó là danh mục nào. */
export const ConfigListResponse = z.object({
  list: ConfigList,
  rows: z.array(ConfigEntry),
})

// ---------------------------------------------------------------------------
// GHI — chuẩn hoá, không chỉ kiểm
// ---------------------------------------------------------------------------

/** Ba schema dưới đây KHÔNG chỉ nói "hợp lệ hay không", chúng còn ĐỔI dữ liệu:
 *  `textNhap`/`textNhapTuyChon` (xem `../primitives`) gộp khoảng trắng trước
 *  khi kiểm, và đổi `''` thành `undefined`. Thứ đi tiếp xuống service là thứ đã
 *  chuẩn hoá — không tầng nào phía dưới phải `trim()` lần nữa, và không tầng
 *  nào được phép quên.
 *
 *  `id` và `ord` KHÔNG có mặt ở đây: cả hai do MÁY CHỦ sinh. Nhận `id` từ ngoài
 *  là cho người gọi tự chọn khoá chính, thứ mà một lần gõ trùng là một lần hai
 *  danh mục đè lên nhau. */

export const ConfigEntryCreate = z.object({
  name: textNhap(120),
  /** Bắt buộc với `STAGE`, cấm với năm danh mục còn lại — ràng buộc đó là
   *  QUAN HỆ giữa `list` (nằm ở đường dẫn) và trường này, nên zod của thân yêu
   *  cầu không nhìn thấy đủ để kiểm. Service kiểm, và `CHECK
   *  config_limit_only_stage` ở tầng bảng là lưới thứ hai. */
  limitDays: z.number().int().nonnegative().max(365).optional(),
  ownerId: textNhapTuyChon(64),
  kind: textNhapTuyChon(32),
})

/** Sửa MỘT dòng. Trường vắng mặt = không đụng tới.
 *
 *  `null` của `ownerId` là "xoá người phụ trách", khác hẳn `undefined` là
 *  "giữ nguyên". Phải tách hai thứ đó ra vì `''` đã bị `textNhapTuyChon` đổi
 *  thành `undefined` từ trước — nếu không có `null` thì không có cách nào gỡ
 *  một Sale ra khỏi ngành. */
export const ConfigEntryPatch = z
  .object({
    name: textNhap(120).optional(),
    active: z.boolean().optional(),
    limitDays: z.number().int().nonnegative().max(365).optional(),
    ownerId: textNhapTuyChon(64).nullable(),
    kind: textNhapTuyChon(32),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'Không có trường nào để sửa',
  })

/** Đổi thứ tự cả danh mục bằng MỘT lần gửi.
 *
 *  Gửi ĐỦ danh sách id theo thứ tự mới, không gửi "chuyển dòng X lên trên dòng
 *  Y": một danh sách đầy đủ là thứ máy chủ kiểm được (đúng ngần ấy dòng, không
 *  thiếu, không lặp), còn một lệnh dời tương đối thì kết quả phụ thuộc vào việc
 *  màn và bảng có đang nhìn cùng một thứ tự hay không.
 *
 *  `ord` mới = vị trí trong mảng, bắt đầu từ 1. */
export const ConfigOrderPatch = z
  .object({ ids: z.array(MaConfig).min(1) })
  .refine((p) => new Set(p.ids).size === p.ids.length, {
    message: 'Có mã lặp lại trong thứ tự mới',
    path: ['ids'],
  })

export type ConfigEntry = z.infer<typeof ConfigEntry>
export type ConfigBundle = z.infer<typeof ConfigBundle>
export type ConfigListResponse = z.infer<typeof ConfigListResponse>
export type ConfigEntryCreate = z.infer<typeof ConfigEntryCreate>
export type ConfigEntryPatch = z.infer<typeof ConfigEntryPatch>
export type ConfigOrderPatch = z.infer<typeof ConfigOrderPatch>
