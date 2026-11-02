import { useState, type ReactNode } from 'react'
import { Button, DataTable, GlassCard, Input, cn } from '@pv/ui'
import type { ConfigBundle, ConfigList } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import {
  isEditDone,
  useMyConfigProposals,
  useProposeConfigEdits,
  type LadderRow,
} from '@/data/sales-config'
import {
  WAITING,
  addsWaiting,
  editsOf,
  entryWaiting,
  isDays,
  sectionOf,
  type SectionId,
} from './sales-config-model'
import { sectionCopy as sectionMessage, sentCopy } from './sales-config-copy'

/** The draft of typed deadlines, keyed `${list}/${id}`. It lives on the page,
 *  not in an area, so switching areas never drops a half-typed number. */
export type LadderDraft = {
  typed: Record<string, string>
  onType: (next: (prev: Record<string, string>) => Record<string, string>) => void
}

/** What every area receives. Areas draw only once the catalog has been read;
 *  the type stays optional because rows of a list may still be absent. */
export type AreaProps = {
  catalog: ConfigBundle | undefined
  draft: LadderDraft
}

/** Clears the sticky app header (two rows at its tallest), so a section
 *  scrolled to by its `#id` lands below it instead of under it. */
export const SECTION_ANCHOR = 'scroll-mt-[128px]'

/** One configuration section, named by its entry in `CONFIG_AREAS`. The number
 *  is not printed, only carried in the group's accessible name. */
export function Section({
  at,
  hint,
  summary,
  children,
}: {
  at: SectionId
  hint?: string
  /** How much the section holds, at the right end of the title row. */
  summary?: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()
  const { no } = sectionOf(at)
  const localizedTitle = t(sectionMessage(at))
  return (
    <GlassCard
      id={at}
      role="group"
      aria-label={`${no} ${localizedTitle}`}
      className={cn('flex flex-col gap-4 p-5 lg:p-6', SECTION_ANCHOR)}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold">{localizedTitle}</span>
          {summary && <span className="text-muted-foreground tnum text-[11.5px]">{summary}</span>}
        </div>
        {hint && <p className="text-muted-foreground text-[11.5px] leading-[1.5]">{hint}</p>}
      </div>
      {children}
    </GlassCard>
  )
}

/** The reader's own change still waiting, said under what it changes. */
export function WaitingNote({ words }: { words: string | null }) {
  const { t } = useI18n()
  if (words === null) return null
  return (
    <p className="text-muted-foreground m-0 text-[11.5px]">
      {t(WAITING)}: {words}
    </p>
  )
}

/** Rows waiting to join a list, drawn where the list ends. */
export function WaitingAdds({ list, criterionId }: { list: ConfigList; criterionId?: string }) {
  const sentences = addsWaiting(useMyConfigProposals(), list, criterionId)
  if (sentences.length === 0) return null
  return (
    <ul className="m-0 flex w-full flex-col gap-1">
      {sentences.map((sentence, at) => (
        <li key={`${at}/${sentence}`}>
          <WaitingNote words={sentence} />
        </li>
      ))}
    </ul>
  )
}

/** For a section whose rows this screen cannot match a change to. */
export function WaitingCount({ count }: { count: number }) {
  const { t, number } = useI18n()
  if (count === 0) return null
  return (
    <p className="text-muted-foreground m-0 text-[11.5px]">
      {t(
        message(
          `Có ${number(count)} đề nghị của bạn đang chờ duyệt`,
          `${number(count)} of your proposals are awaiting approval`,
          `${number(count)}개 제안이 승인 대기 중입니다`,
        ),
      )}
    </p>
  )
}

/** Callers name the list in Vietnamese, so that word is the lookup key. */
const NOUNS: Record<string, Message> = {
  'lý do': message('lý do', 'reasons', '사유'), // i18n-ignore
  mục: message('mục', 'items', '항목'), // i18n-ignore
  loại: message('loại', 'types', '유형'), // i18n-ignore
  nhãn: message('nhãn', 'labels', '라벨'), // i18n-ignore
  câu: message('câu', 'questions', '질문'), // i18n-ignore
  nhóm: message('nhóm', 'groups', '그룹'), // i18n-ignore
}

/** A catalog's size for `Section.summary`. Nothing for an empty list: the
 *  section body already says so in words. */
export function EntryCount({ rows, noun }: { rows: { active: boolean }[]; noun: string }) {
  const { t, number } = useI18n()
  if (rows.length === 0) return null
  const nounCopy = NOUNS[noun] ?? message(noun, noun, noun)
  return t(
    message(
      `${number(rows.length)} ${nounCopy.vi} · ${number(rows.filter((r) => r.active).length)} đang bật`,
      `${number(rows.length)} ${nounCopy.en} · ${number(rows.filter((r) => r.active).length)} active`,
      `${number(rows.length)}개 ${nounCopy.ko} · ${number(rows.filter((r) => r.active).length)}개 활성`,
    ),
  )
}

/** One rung's deadline, typed into the page's draft under `${list}/${id}` —
 *  the one key `LadderSend` reads, so a table cell (5.5) and a deal stage's
 *  box in the journey frame (5.14) cannot write two stores. CONTROLLED: an
 *  uncontrolled box would keep the previous send's text after the draft clears. */
export function DeadlineBox({
  list,
  row,
  draft,
}: {
  list: ConfigList
  row: LadderRow
  draft: LadderDraft
}) {
  const { t } = useI18n()
  /* The route needs only `config.view`; a reader without `config.propose`
     sees the deadlines but cannot type a draft nobody could send. */
  const canPropose = useCan('config.propose')
  const waiting = entryWaiting(useMyConfigProposals(), list, row.id)
  const key = `${list}/${row.id}`
  const shown = draft.typed[key] ?? (row.limitDays === null ? '' : String(row.limitDays))
  /* `Input` has no disabled paint, so a reader who cannot propose gets plain
     text instead of a box that looks editable. */
  const box = canPropose ? (
    <Input
      aria-label={t(
        message(`Hạn của ${row.label}`, `Deadline for ${row.label}`, `${row.label} 기한`),
      )}
      value={shown}
      placeholder={t(message('Chưa đặt', 'Not set', '미설정'))}
      inputMode="numeric"
      invalid={shown.trim() !== '' && !isDays(shown)}
      className="pointer-coarse:h-12 tnum h-10 w-full max-w-24"
      onChange={(e) => draft.onType((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  ) : (
    <span className="tnum font-num">
      {shown === '' ? t(message('Chưa đặt', 'Not set', '미설정')) : shown}
    </span>
  )
  if (waiting === null) return box
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {box}
      <WaitingNote words={waiting} />
    </div>
  )
}

/** One ladder, one deadline box per rung. */
export function LadderTable({
  list,
  head,
  rows,
  unit,
  draft,
}: {
  list: ConfigList
  /** What one rung is called: a deal stands in a COLUMN, a lead on a GRADE. */
  head: string
  rows: LadderRow[]
  unit: string
  draft: LadderDraft
}) {
  const { t, number } = useI18n()
  return (
    <DataTable
      columns={[
        { header: head, width: '1.4fr' },
        { header: t(message('Hạn · ngày', 'Deadline · days', '기한 · 일')), width: '1fr' },
        { header: t(message('Đang có', 'Current', '현재')), width: '0.9fr', align: 'right' },
      ]}
      rows={rows.map((row) => ({
        id: row.id,
        cells: [
          row.label,
          <DeadlineBox key="d" list={list} row={row} draft={draft} />,
          <span key="u" className="tnum font-num">
            {number(row.usage)} {unit}
          </span>,
        ],
      }))}
    />
  )
}

/** What a rung is called in the sentence of its pending edit. */
const RUNG = { STAGE: 'giai đoạn', TIER: 'bậc' } as const // i18n-ignore: the vi variant of a message

/** The send of ONE ladder, drawn next to its boxes. It sends every pending
 *  edit of the list, not of the rows in sight: a box typed under another
 *  state stays in the draft. Each edit becomes its own line in the approval
 *  inbox (reasoning at `useProposeConfigEdits`). */
export function LadderSend({
  list,
  rows,
  draft,
}: {
  list: keyof typeof RUNG
  rows: LadderRow[]
  draft: LadderDraft
}) {
  const { t, number } = useI18n()
  const canPropose = useCan('config.propose')
  const propose = useProposeConfigEdits()
  const [failed, setFailed] = useState<string[]>([])

  const edits = editsOf(
    rows.map((row) => ({
      list,
      row,
      what: t(
        message(
          `Hạn ${RUNG[list]} "${row.label}"`,
          `${list === 'STAGE' ? 'Deadline for stage' : 'Deadline for tier'} "${row.label}"`,
          `${row.label} ${list === 'STAGE' ? '단계' : '등급'} 기한`,
        ),
      ),
    })),
    draft.typed,
  )
  /* A non-number blocks the send rather than being dropped: dropping it would
     send four of five edits and say five went. */
  const bad = rows.filter((row) => {
    const v = draft.typed[`${list}/${row.id}`] ?? ''
    return v.trim() !== '' && !isDays(v)
  })

  if (!canPropose || (edits.length === 0 && bad.length === 0 && failed.length === 0)) return null

  const send = () =>
    propose.mutate(edits, {
      onSuccess: (answers) => {
        /* Only an accepted edit leaves the draft, and only if the box still
           holds what was sent: a refused number stays typed for a retry. */
        const done = new Map(
          edits
            .filter((e) => answers.some((a) => a.what === e.what && isEditDone(a)))
            .map((e) => [`${e.list}/${e.id}`, e.limitDays]),
        )
        draft.onType((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([key, v]) => Number(v) !== done.get(key)),
          ),
        )
        setFailed(answers.flatMap((a) => (isEditDone(a) ? [] : [`${a.what}: ${a.failure}`])))
        if (done.size > 0) toastDone(sentCopy())
      },
    })

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {edits.length > 0 && (
        <>
          <ul className="m-0 flex flex-col gap-1 text-[11.5px]">
            {edits.map((e) => (
              <li key={e.id}>
                {e.what} → <span className="tnum font-num">{number(e.limitDays)}</span>{' '}
                {t(message('ngày', 'days', '일'))}
              </li>
            ))}
          </ul>
          <Button
            size="md"
            className="pointer-coarse:h-12 self-start"
            disabled={bad.length > 0 || propose.isPending}
            onClick={send}
          >
            {t(
              message(
                `Gửi đề nghị · ${edits.length} thay đổi`,
                `Submit ${edits.length} changes`,
                `${edits.length}개 변경 제안`,
              ),
            )}
          </Button>
        </>
      )}
      {bad.length > 0 && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {t(
            message(
              `Hạn của ${bad.map((row) => `"${row.label}"`).join(', ')} phải là số ngày.`,
              `Deadlines for ${bad.map((row) => `"${row.label}"`).join(', ')} must be a number of days.`,
              `${bad.map((row) => `"${row.label}"`).join(', ')} 기한은 일수로 입력해야 합니다.`,
            ),
          )}
        </p>
      )}
      {failed.length > 0 && (
        <ul
          role="alert"
          className="text-destructive-foreground m-0 flex flex-col gap-1 text-[11.5px]"
        >
          {failed.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
