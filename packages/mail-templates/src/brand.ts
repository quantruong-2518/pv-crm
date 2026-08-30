/** AI GỬI LÁ THƯ NÀY — một nguồn duy nhất cho chân thư của mọi template.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ HẰNG SỐ TRONG CODE CHỨ KHÔNG PHẢI BIẾN MÔI TRƯỜNG
 *  ------------------------------------------------------------------
 *  Địa chỉ văn phòng và hộp thư liên hệ là NHẬN DIỆN, không phải cấu hình
 *  triển khai. Chúng giống nhau trên máy dev, trên staging và trên Fly; một
 *  bản triển khai đặt sai chúng không phải là "cấu hình khác" mà là thư đứng
 *  tên sai công ty. Thứ thật sự đổi theo bản triển khai — gốc URL của ảnh —
 *  đi vào theo props (`assetBaseUrl`), và chỉ nó mà thôi.
 *
 *  Đây cũng là chỗ duy nhất giữ chuỗi địa chỉ. `PV_MAS_SENDER_POSTAL` bên
 *  `apps/api/src/platform/config/env.ts` giữ MỘT BẢN SAO của cùng chuỗi đó,
 *  và bản sao ấy là cố ý: chân thư MAS dựng từ dữ liệu của `mail_run` đã
 *  chụp lại lúc tạo lô, nên nó phải đọc được địa chỉ mà không cần biết gói
 *  này tồn tại. Hai chỗ, một sự thật — sửa thì sửa cả hai.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÓ MÃ SỐ THUẾ Ở ĐÂY
 *  ------------------------------------------------------------------
 *  Cố ý bỏ trống. Một MST bịa trong chân thư là loại sai không ai bắt được
 *  cho tới khi người nhận đối chiếu — thiếu một dòng thì rõ ràng hơn nhiều so
 *  với sai một dòng. Khi chủ dự án cấp số thật thì thêm vào đây, một chỗ. */
export const BRAND = {
  /** Tên sản phẩm — thứ người nhận thấy trên đầu thư. */
  product: 'PV One',
  /** Tên gọi ngắn, dùng ở câu chữ trong thân thư. */
  org: 'Pebble Vina',
  /** Tên đứng ở chân thư. */
  legalName: 'Pebble Vina Technology',
  contactEmail: 'contact@pebblevina.com',
  site: 'pebblevina.com',
  siteUrl: 'https://pebblevina.com',
  /** Địa chỉ bưu chính đầy đủ. Bắt buộc phải có mặt trong thư thương mại —
   *  và có mặt cả trong thư giao dịch thì người nhận biết mình đang nói
   *  chuyện với một công ty có địa chỉ thật, không phải một hộp thư. */
  postal:
    'Văn phòng O1912, Tầng 19, Landmark 72 Tower, Khu E6, ' +
    'Khu đô thị mới Cầu Giấy, P. Yên Hoà, Hà Nội',
} as const

/** Hai bản của dấu hiệu nhận diện, và đây là toàn bộ lý do có hai bản:
 *  bản `light` là nét trắng nên chỉ đọc được trên nền tối, bản `blue` là nét
 *  Pebble Blue nên chỉ đọc được trên nền sáng. Đặt nhầm bản là một ô trống.
 *
 *  PNG chứ không WebP: Outlook desktop không giải mã WebP, và một logo không
 *  hiện ở đúng client doanh nghiệp là chỗ tệ nhất để tiết kiệm vài KB. Cả hai
 *  file là 128×128 — gấp bốn lần cỡ hiển thị lớn nhất (32px), đủ cho màn hình
 *  retina mà vẫn dưới 20KB.
 *
 *  Ảnh trong email PHẢI là URL tuyệt đối công khai: `data:` URI bị Gmail và
 *  Outlook chặn thẳng, còn đường dẫn tương đối thì không có gốc nào để nối. */
export type MarkVariant = 'light' | 'blue'

/** Ghép gốc asset với tên file. Gốc tới từ props vì nó là sự thật của bản
 *  triển khai (xem `PV_BRAND_ASSET_URL`), không phải của gói này. */
export function markUrl(assetBaseUrl: string, variant: MarkVariant): string {
  return `${assetBaseUrl.replace(/\/+$/, '')}/mark-${variant}.png`
}

/** The long lockup is reserved for placements wide enough to keep its custom
 *  lettering legible. Email uses PNG because Outlook does not decode WebP. */
export function wordmarkUrl(assetBaseUrl: string, variant: MarkVariant): string {
  return `${assetBaseUrl.replace(/\/+$/, '')}/wordmark-${variant}.png`
}
