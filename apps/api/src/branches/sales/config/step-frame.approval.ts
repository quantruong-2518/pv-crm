import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type StateAddress,
  type StateRule,
  type StepTemplatePatch,
} from '@pv/contracts'
import type { StepTemplateDraft } from './step-frame.repository'

/** The journey frame's members of `ConfigChange` (ADR 0080 §4) and the
 *  sentence the director reads for each.
 *
 *  `was`, `kindName`, `names` and `activeTemplates` are WORDS ONLY, read off the
 *  book in the request that builds the sentence: `consequenceOf` is synchronous
 *  and sees nothing but the payload, and "rename A to B" cannot be said without
 *  A. The apply step never reads them. */
export type FrameChange =
  | { kind: 'step-template-create'; draft: StepTemplateDraft }
  | {
      kind: 'step-template-update'
      id: string
      patch: StepTemplatePatch
      was: { name: string; address: StateAddress }
      kindName?: string
    }
  | { kind: 'step-template-reorder'; address: StateAddress; ids: string[]; names: string[] }
  | { kind: 'state-rule'; rule: StateRule; activeTemplates: number }

const FRAME_KINDS: readonly string[] = [
  'step-template-create',
  'step-template-update',
  'step-template-reorder',
  'state-rule',
] satisfies FrameChange['kind'][]

export const isFrameChange = <T extends { kind: string }>(
  change: T,
): change is Extract<T, FrameChange> => FRAME_KINDS.includes(change.kind)

/** The object word and the state's product label, so the approver never
 *  reads a state key. */
export function stateWords(address: StateAddress): string {
  return address.kind === 'lead'
    ? `lead · ${LEAD_STATE_LABEL[address.state]}`
    : `cơ hội · ${OPPORTUNITY_STAGE_LABEL[address.state]}`
}

export function frameConsequenceOf(change: FrameChange): string {
  if (change.kind === 'step-template-create') {
    return `Thêm mẫu việc tiếp theo "${change.draft.name}" vào ${stateWords(change.draft.address)}`
  }
  if (change.kind === 'step-template-reorder') {
    const order = change.names.map((n) => `"${n}"`).join(' → ')
    return `Xếp lại mẫu việc tiếp theo của ${stateWords(change.address)} theo thứ tự: ${order}`
  }
  if (change.kind === 'state-rule') {
    const where = stateWords(change.rule.address)
    if (change.rule.freeEntry) return `Cho phép tự gõ việc tiếp theo ngoài danh sách ở ${where}`
    /* The count is the consequence: sellers there are left with exactly these. */
    return `Không cho phép tự gõ việc tiếp theo ngoài danh sách ở ${where} — người làm chỉ còn chọn trong ${change.activeTemplates} mẫu đang bật của trạng thái này`
  }
  const { patch, was } = change
  const said: string[] = []
  if (patch.name !== undefined) said.push(`đổi tên thành "${patch.name}"`)
  if (patch.active !== undefined) said.push(patch.active ? 'bật' : 'tắt')
  if (patch.kindId !== undefined) said.push(`loại việc: ${change.kindName ?? patch.kindId}`)
  if (patch.dueDays !== undefined) {
    said.push(patch.dueDays === null ? 'bỏ hạn mặc định' : `hạn mặc định ${patch.dueDays} ngày`)
  }
  return `Mẫu việc tiếp theo "${was.name}" (${stateWords(was.address)}): ${said.join(' · ')}`
}
