import type { AiUnavailableReason, LeadAiJobErrorKind } from '@pv/contracts'
import { denied, type PvError } from '@api/platform/http/problem'
import type { AiFillBlock } from './lead-ai-fill.rule'

/** The AI fill's sentences, one copy for the press, the worker and the tray's
 *  undo: the same refusal reads the same on a 4xx and on a failed job. */

export const notHeld = (code: string): PvError =>
  denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)

export const AI_FILL_BLOCKED: Record<AiFillBlock, string> = {
  'no-company-or-contact': 'Cần có tên công ty và người liên hệ trước khi điền.',
  'nothing-empty': 'Không còn ô trống nào để điền.',
}

/** Same split as the scan door: off is a setting (409 at the press), a daily
 *  limit passes on its own (429). `kind` is what a failed job stores. */
export const AI_FILL_REFUSED: Record<
  AiUnavailableReason,
  { kind: Extract<LeadAiJobErrorKind, 'unavailable' | 'limit'>; error: string }
> = {
  disabled: { kind: 'unavailable', error: 'Chưa bật điền bằng AI. Báo quản trị viên.' },
  'no-key': { kind: 'unavailable', error: 'Chưa bật điền bằng AI. Báo quản trị viên.' },
  'user-limit': {
    kind: 'limit',
    error: 'Bạn đã hết lượt điền bằng AI trong 24 giờ qua. Thử lại sau.',
  },
  budget: { kind: 'limit', error: 'Đã hết hạn mức điền bằng AI trong 24 giờ qua. Thử lại sau.' },
}
