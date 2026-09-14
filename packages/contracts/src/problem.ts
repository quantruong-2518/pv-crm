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
  'rate-limited',
  /** A 403 that CAN be opened: the caller has the permission, they just have
   *  not retyped their password inside the sudo window.
   *
   *  Its own `type` rather than a fifth `DenyReason`. `DenyReason` is E2's
   *  vocabulary — four verdicts about roles, licences and scope — and
   *  `apps/web/src/app/api/errors.ts` translates those four straight into the
   *  engine's words. "Not re-authenticated" is not an E2 verdict: it says
   *  nothing about a role, and the way out is a password rather than a grant.
   *  Filing it under `DenyReason` would teach the engine a concept it does not
   *  have, and the screen would show its permission-hidden sentence for
   *  something the user can in fact do. */
  'reauth-required',
  /** A 403 that means "you owe a password change first", raised by
   *  `PasswordChangeGuard` on every door but the four it lets through.
   *
   *  Its own `type` for `reauth-required`'s reason, one step further along: it
   *  is not an E2 verdict, and it is not the sudo window either. The way out is
   *  a different screen rather than a dialog on this one, so a screen that
   *  cannot tell it from `reauth-required` would pop the confirm box, take a
   *  correct password, and refuse again — forever. */
  'password-change-required',
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
  /** Per-field errors. Key is the field name, value is every complaint about it.
   *
   *  NOT exclusive to `type === 'invalid'` any more, and that is the point of
   *  this note. The Postgres error translator now answers a duplicate mailbox
   *  with 409 `conflict`, and that 409 has to carry the field name `email` or
   *  the landing form has nowhere to put the red outline — it would have to
   *  read the sentence in `title` and guess, which is how a form ends up
   *  highlighting the wrong field.
   *
   *  So the rule is: whenever the server can name the field that caused the
   *  refusal, it fills this in — `invalid` from the zod pipe, `conflict` from a
   *  unique index. Absent means "the failure is not about one field", not "this
   *  status never carries fields". */
  errors: z.record(z.string(), z.array(z.string())).optional(),
  /** Nối một dòng log ở màn với một dòng log ở máy chủ. */
  traceId: z.string().optional(),
})

export type ProblemKind = z.infer<typeof ProblemKind>
export type DenyReason = z.infer<typeof DenyReason>
export type Problem = z.infer<typeof Problem>
