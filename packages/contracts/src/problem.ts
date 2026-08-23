import { z } from 'zod'

/** Hình của MỘT lỗi trả về từ máy chủ.
 *
 *  Bám theo RFC 9457 (Problem Details) ở bốn trường đầu, cộng hai trường của
 *  riêng hệ này. Lý do không bịa một hình mới: mai có proxy, có gateway, có
 *  client thứ hai — tất cả đều đã biết đọc `application/problem+json`.
 *
 *  ------------------------------------------------------------------
 *  BỐN LÝ DO TỪ CHỐI PHẢI SỐNG SÓT QUA HTTP
 *  ------------------------------------------------------------------
 *  `e2-access.ts` đã nói rõ: trộn `unauthenticated` với `permission-denied` là
 *  lỗi nặng nhất, vì nó đá một người ĐÃ đăng nhập về màn đăng nhập và họ sẽ
 *  đăng nhập lại vòng vo mà không bao giờ vào được. Mã HTTP chỉ có 401/403 nên
 *  nó KHÔNG chở đủ bốn lý do — `reason` ở dưới là chỗ chở phần còn lại, và
 *  `apps/web/src/app/api/errors.ts` đã có sẵn trường để nhận. */

/** Trùng đúng `ApiFailure` bên `apps/web/src/app/api/errors.ts`. `network` và
 *  `aborted` cố tình VẮNG: hai thứ đó xảy ra ở phía client, máy chủ không bao
 *  giờ tự khai mình là chúng. */
export const ProblemKind = z.enum([
  'unauthenticated',
  'forbidden',
  'not-found',
  'conflict',
  'invalid',
  'server',
])

/** Bốn lý do của E2 — copy nguyên chữ từ `DenyReason`. Không import thẳng
 *  `DenyReason` vào đây để `packages/contracts` không kéo theo cả engine chỉ
 *  vì một union bốn phần tử; đổi lại `apps/api` có một phép gán kiểu bắt lệch
 *  ngay lúc biên dịch (xem `problem.filter.ts`). */
export const DenyReason = z.enum([
  'unauthenticated',
  'branch-not-licensed',
  'permission-denied',
  'out-of-scope',
])

export const Problem = z.object({
  /** Định danh loại lỗi, ASCII. */
  type: ProblemKind,
  /** Câu nói được với người dùng. Tiếng Việt — đây là NHÃN, không phải khoá. */
  title: z.string(),
  status: z.number().int(),
  /** Đường dẫn đã gọi. */
  instance: z.string(),
  /** Chỉ có khi `type === 'forbidden'` hoặc `'unauthenticated'`. */
  reason: DenyReason.optional(),
  /** Chỉ có khi `type === 'invalid'` — lỗi theo từng trường, từ zod. */
  errors: z.record(z.string(), z.array(z.string())).optional(),
  /** Nối một dòng log ở màn với một dòng log ở máy chủ. */
  traceId: z.string().optional(),
})

export type ProblemKind = z.infer<typeof ProblemKind>
export type DenyReason = z.infer<typeof DenyReason>
export type Problem = z.infer<typeof Problem>
