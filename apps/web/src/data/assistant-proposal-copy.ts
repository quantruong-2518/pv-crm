import type { AssistantProposal, AssistantProposalState } from '@pv/contracts'
import { message as m, translate, type Lang, type Message } from '@/app/i18n'
import { dm } from '@/lib/date'

/** What a proposal card prints (ADR 0162 §5), in the three languages. The
 *  next-step, due-day and "done, no new task" words are those the step form on the
 *  record already uses, so the card and the record say the same thing. */

export const PROPOSAL_COPY = {
  confirm: m('Làm', 'Do it', '실행'),
  dismiss: m('Bỏ', 'Drop', '버리기'),
  before: m('Trước', 'Before', '이전'),
  after: m('Sau', 'After', '이후'),
  noStep: m('chưa có việc nào', 'no task yet', '업무 없음'),
  noNewStep: m('xong, không đặt việc mới', 'done, no new task', '완료, 새 업무 없음'),
  applied: m('Đã lưu vào hồ sơ', 'Saved to the record', '기록에 저장됨'),
  dismissed: m('Đã bỏ', 'Dropped', '버렸음'),
  stale: m(
    'Việc tiếp theo đã đổi, chưa lưu gì.',
    'The next task has changed. Nothing was saved.',
    '다음 업무가 바뀌었습니다. 저장된 내용은 없습니다.',
  ),
  expired: m(
    'Đề xuất đã hết hạn, chưa lưu gì.',
    'This has expired. Nothing was saved.',
    '기한이 지났습니다. 저장된 내용은 없습니다.',
  ),
  cannot: m(
    'Chưa lưu gì vào hồ sơ.',
    'Nothing has been saved to the record.',
    '기록에 저장된 내용이 없습니다.',
  ),
  emptySet: m(
    'Chưa lưu gì vào hồ sơ.',
    'Nothing is saved to the record yet.',
    '아직 기록에 저장된 내용이 없습니다.',
  ),
  emptyDone: m('Chưa đánh dấu xong.', 'Not marked done yet.', '아직 완료 처리되지 않았습니다.'),
  emptyDoneThen: m(
    'Chưa đánh dấu xong, chưa lưu việc mới.',
    'Not marked done, new task not saved yet.',
    '아직 완료 처리되지 않았고 새 업무도 저장되지 않았습니다.',
  ),
} as const

/** One sentence naming the record and the change. A due-only move is a `set` that keeps the text. */
export function proposalSentence(p: AssistantProposal, lang: Lang): string {
  const l = p.label
  if (p.action === 'next-step-done') {
    return translate(
      p.after
        ? m(
            `Đánh dấu xong việc tiếp theo của ${l} và đặt việc mới.`,
            `Mark the next task for ${l} done and set a new one.`,
            `${l}의 다음 업무를 완료 처리하고 새 업무를 설정합니다.`,
          )
        : m(
            `Đánh dấu xong việc tiếp theo của ${l}.`,
            `Mark the next task for ${l} done.`,
            `${l}의 다음 업무를 완료 처리합니다.`,
          ),
      lang,
    )
  }
  if (!p.before) {
    return translate(
      m(
        `Đặt việc tiếp theo cho ${l}.`,
        `Set the next task for ${l}.`,
        `${l}의 다음 업무를 설정합니다.`,
      ),
      lang,
    )
  }
  return translate(
    p.before.text === p.after?.text
      ? m(
          `Đổi hạn việc tiếp theo của ${l}.`,
          `Change the due date of the next task for ${l}.`,
          `${l}의 다음 업무 기한을 변경합니다.`,
        )
      : m(
          `Đổi việc tiếp theo của ${l}.`,
          `Change the next task for ${l}.`,
          `${l}의 다음 업무를 변경합니다.`,
        ),
    lang,
  )
}

export const proposalEmpty = (p: AssistantProposal): Message =>
  p.action === 'next-step-set'
    ? PROPOSAL_COPY.emptySet
    : p.after
      ? PROPOSAL_COPY.emptyDoneThen
      : PROPOSAL_COPY.emptyDone

/** "text · due 20/11"; the day is read as a calendar day, not an instant. */
export function stepLine(step: { text: string; due: string }, lang: Lang): string {
  const due = translate(
    m(`hạn ${dm(step.due)}`, `due ${dm(step.due)}`, `기한 ${dm(step.due)}`),
    lang,
  )
  return `${step.text} · ${due}`
}

const ENDED: Partial<Record<AssistantProposalState, { copy: Message; tone: 'success' | 'muted' }>> =
  {
    applied: { copy: PROPOSAL_COPY.applied, tone: 'success' },
    dismissed: { copy: PROPOSAL_COPY.dismissed, tone: 'muted' },
    stale: { copy: PROPOSAL_COPY.stale, tone: 'muted' },
    expired: { copy: PROPOSAL_COPY.expired, tone: 'muted' },
  }

/** The line that replaces the buttons, or null while the card can still be pressed. */
export function proposalEnd(p: AssistantProposal) {
  const ended = ENDED[p.state]
  if (ended) return ended
  return p.canPress ? null : { copy: PROPOSAL_COPY.cannot, tone: 'muted' as const }
}
