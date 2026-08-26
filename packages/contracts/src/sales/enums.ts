import { z } from 'zod'

/** Enum của nhánh Sales — BẢN CHÍNH THỨC.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO Ở ĐÂY CHỨ KHÔNG IMPORT TỪ FIXTURE
 *  ------------------------------------------------------------------
 *  Hôm nay `LeadCategory`, `LeadTier`, `StageKey`, `ExitReason` đều đang được
 *  định nghĩa bên trong `@pv/engines/fixtures/das-vina.ts` — tức tên một khách
 *  hàng đang nằm trong đường import của hệ kiểu. Kéo đường đó vào
 *  `packages/contracts` là hàn tên khách vào cả hợp đồng dữ liệu.
 *
 *  Nên bản chính thức đặt ở đây. Bước B của `docs/ban-giao-backend.md` (tách
 *  domain khỏi fixture) sẽ để fixture NHẬP từ file này, không phải ngược lại.
 *  Trong lúc chưa tách, hai bên còn là hai bản chép tay — chốt chặn duy nhất là
 *  test khoá số của fixture. Đây là nợ ĐÃ BIẾT, không phải chỗ quên. */

export const LeadCategory = z.enum(['chip', 'co-khi', 'o-to', 'duoc'])

export const LeadTier = z.enum(['dau-moi', 'mql', 'sql'])

/** Năm cột của sổ cơ hội. Không có cột thứ sáu. */
export const StageKey = z.enum(['moi', 'tim-hieu', 'da-demo', 'da-bao-gia', 'cho-ky'])

/** SÁU lý do rơi — KHOÁ ASCII, không phải nhãn tiếng Việt.
 *
 *  Đây là nợ số 4 của `docs/ban-giao-backend.md` được trả ngay: fixture đang
 *  lưu thẳng NHÃN ('Không gọi được ai') làm giá trị của `Lead.exitReason`, nên
 *  sửa một chữ trên màn là đổi dữ liệu 52 dòng sổ. Trả bây giờ tốn một bảng
 *  tra; trả sau khi có dữ liệu thật thì tốn một migration.
 *
 *  Nhãn hiển thị KHÔNG nằm ở đây — nhãn là việc của tầng màn. */
export const ExitReason = z.enum([
  'khong-goi-duoc',
  'khong-phai-khach-cua-minh',
  'khong-co-ngan-sach',
  'nguoi-lien-he-nghi',
  'chon-ben-khac',
  'im-sau-bao-gia',
])

export type LeadCategory = z.infer<typeof LeadCategory>
export type LeadTier = z.infer<typeof LeadTier>
export type StageKey = z.infer<typeof StageKey>
export type ExitReason = z.infer<typeof ExitReason>

/** Lead vào hệ bằng đường nào. Hệ tự ghi, không ai gõ tay.
 *
 *  Khác hẳn `source` — `source` nói lead về từ NGUỒN nào (một mã trong sổ
 *  nguồn của module 1), còn cái này nói nó đi qua CỬA nào để vào cơ sở dữ
 *  liệu. Một lead có thể tới từ nguồn 'hoi-thao-q3' mà vào bằng cửa 'import'. */
export const IntakeChannel = z.enum(['landing', 'bd', 'import'])

/** Kênh gọi lại được khách — ô 5 của cổng init data.
 *
 *  Cùng bộ với kênh của module 1 (`WaveChannel` bên fixture): một chiến dịch
 *  bắn qua kênh nào thì khách trả lời qua đúng kênh đó, nên hai bảng phải là
 *  MỘT. Ngày bước B tách domain khỏi fixture, fixture nhập từ đây. */
export const ContactChannel = z.enum([
  'email',
  'zalo-oa',
  'telegram',
  'in-app',
  'linkedin',
  'facebook',
  'website',
])

/** Đơn vị tiền. Nợ số 7 của `docs/ban-giao-backend.md`: mọi cột tiền phải đi
 *  kèm một cột này, và ràng buộc "có tiền thì phải có đơn vị" được ép ở tầng
 *  bảng bằng CHECK chứ không nhờ người nhớ. */
export const CurrencyCode = z.enum(['VND', 'USD'])

export type IntakeChannel = z.infer<typeof IntakeChannel>
export type ContactChannel = z.infer<typeof ContactChannel>
export type CurrencyCode = z.infer<typeof CurrencyCode>
