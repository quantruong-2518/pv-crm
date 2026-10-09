import type { ReactNode } from 'react'
import { DataTable, GlassCard, Input, cn } from '@pv/ui'
import type { ConfigBundle, ConfigList } from '@pv/contracts'
import { useCan } from '@/app/auth'
import type { LadderRow } from '@/data/sales-config'
import { isDays, sectionOf, type SectionId } from './sales-config-model'

/** The draft of typed deadlines, keyed `${list}/${id}`. It lives on the page,
 *  not in an area, so switching areas never drops a half-typed number and the
 *  send bar can read every area's edits at once. */
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
 *  scrolled to from the nav lands below it instead of under it. */
export const SECTION_ANCHOR = 'scroll-mt-[128px]'

/** One configuration section, named by its entry in `CONFIG_AREAS`. The number
 *  is not printed, only carried in the group's accessible name. */
export function Section({
  at,
  hint,
  children,
}: {
  at: SectionId
  hint?: string
  children: ReactNode
}) {
  const { no, title } = sectionOf(at)
  return (
    <GlassCard
      id={at}
      role="group"
      aria-label={`${no} ${title}`}
      className={cn('flex flex-col gap-4 p-5 lg:p-6', SECTION_ANCHOR)}
    >
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-semibold">{title}</span>
        {hint && <p className="text-muted-foreground text-[11.5px] leading-[1.5]">{hint}</p>}
      </div>
      {children}
    </GlassCard>
  )
}

/** One rung's deadline, typed into the page's draft under `${list}/${id}` —
 *  the one key the send bar reads, so a table cell (5.5) and a deal stage's
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
  /* The route needs only `config.view`; a reader without `config.propose`
     sees the deadlines but cannot type a draft nobody could send. */
  const canPropose = useCan('config.propose')
  const key = `${list}/${row.id}`
  const shown = draft.typed[key] ?? (row.limitDays === null ? '' : String(row.limitDays))
  /* `Input` has no disabled paint, so a reader who cannot propose gets plain
     text instead of a box that looks editable. */
  if (!canPropose) return <span className="tnum font-num">{shown === '' ? 'chưa đặt' : shown}</span>
  return (
    <Input
      aria-label={`Hạn của ${row.label}`}
      value={shown}
      placeholder="chưa đặt"
      inputMode="numeric"
      invalid={shown.trim() !== '' && !isDays(shown)}
      className="pointer-coarse:h-12 tnum h-10 w-24"
      onChange={(e) => draft.onType((prev) => ({ ...prev, [key]: e.target.value }))}
    />
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
  return (
    <DataTable
      columns={[
        { header: head, width: '1.4fr' },
        { header: 'Hạn · ngày', width: '1fr' },
        { header: 'Đang có', width: '0.9fr', align: 'right' },
      ]}
      rows={rows.map((row) => ({
        id: row.id,
        cells: [
          row.label,
          <DeadlineBox key="d" list={list} row={row} draft={draft} />,
          <span key="u" className="tnum font-num">
            {row.usage} {unit}
          </span>,
        ],
      }))}
    />
  )
}
