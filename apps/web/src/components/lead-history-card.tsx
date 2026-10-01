import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from '@pv/ui'
import { Button, GlassCard, Icon, MetaPill, SectionTitle, SegmentedControl, Timeline } from '@pv/ui'
import type { TouchKind } from '@pv/contracts'
import { dm } from '@/lib/date'
import { subjectLettersQuery } from '@/data/mail-letters'
import { lifecycleTitle, type TouchFocus } from '@/data/touches'
import { NO_TOUCHES } from '@/data/lead-profile'
import type { TouchEvent } from '@/data/touches'
import { useCan } from '@/app/auth'
import { objectThreadsQuery } from '@/data/comms'
import { leadStopReasonsQuery } from '@/data/leads'
import { salesCatalogQuery, stopReasonLabel } from '@/data/sales-config'
import { CommsPanel } from './comms-card'
import { LetterLines } from './mail-letter/letter-lines'

/** The three timelines of a lead behind three doors — mail, activity, talk.
 *
 *  They were three cards in a row, and nobody could say which would answer a
 *  given question. They are one object seen three ways, so they are one tab row.
 *
 *  NO GLASS OF ITS OWN since 17/09: it draws inside the activity card — a
 *  second glass surface there would stack two panels, a thing this app avoids
 *  by convention (law 12 covers only the screen's single glow layer).
 *
 *  The tab row carries the button of the OPEN tab only — a button aimed at
 *  content nobody is looking at gets pressed by accident. Writing a letter is
 *  not one of those: it is the card's own head button.
 *
 *  A tab prints no count until its query has answered — `0` is a wrong answer
 *  about data nobody knows yet. */
type HistoryTab = 'activity' | 'mail' | 'comms'

const TAB_HINT: Record<HistoryTab, string> = {
  activity: 'Những gì đã xảy ra với hồ sơ này.',
  mail: 'Email đã gửi và tín hiệu trả về.',
  comms: 'Nội dung hai bên đã trao đổi.',
}

export function LeadHistoryPanel({
  code,
  touches,
  focus,
  seedAddress,
}: {
  code: string
  /** The lead's touch rows, `undefined` while the read has not answered. */
  touches: readonly TouchEvent[] | undefined
  /** The `sales.touch` row to jump to — normally a vector face just pressed. */
  focus?: TouchFocus | null
  seedAddress?: string | null
}) {
  const [tab, setTab] = useState<HistoryTab>('activity')
  /* The capture drawer opens from the tab row, which the panel does not own. */
  const [capturing, setCapturing] = useState(false)
  const mail = useQuery(subjectLettersQuery('lead', code))
  const comms = useCommsTabHead(code)

  useEffect(() => {
    setTab('activity')
    setCapturing(false)
  }, [code])

  /* A vector face points at a touch row, and only this tab draws those rows —
     land on it first, or the press lands inside a closed tab and does nothing.
     The scroll itself waits for the row to mount; see `ActivityTimeline`. */
  useEffect(() => {
    if (focus) setTab('activity')
  }, [focus])

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Lịch sử">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Dòng lịch sử"
          hideLabel
          tone="quiet"
          value={tab}
          onChange={(value) => setTab(value as HistoryTab)}
          options={[
            { value: 'activity', label: 'Hoạt động', count: touches?.length },
            { value: 'mail', label: 'Email', count: mail.data?.rows.length },
            { value: 'comms', label: 'Trao đổi', count: comms.count },
          ]}
        />
        {tab === 'comms' && comms.canCapture && (
          <Button size="md" variant="secondary" onClick={() => setCapturing(true)}>
            <Icon icon={Plus} size={16} />
            Ghi một trao đổi
          </Button>
        )}
      </div>

      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">{TAB_HINT[tab]}</p>

      {tab === 'activity' && <ActivityTimeline history={touches ?? NO_TOUCHES} focus={focus} />}
      {tab === 'mail' && <LetterLines door="lead" code={code} />}
      {tab === 'comms' && (
        <CommsPanel
          code={code}
          seedAddress={seedAddress ?? undefined}
          capturing={capturing}
          onCapture={setCapturing}
        />
      )}
    </section>
  )
}

/** What the conversation tab needs to draw its own head: how many threads, and
 *  whether this reader may add one. Kept here rather than exported from
 *  `comms-card` so that file keeps exporting components only.
 *
 *  Same query key as `CommsPanel`, so the count costs no second request and the
 *  panel keeps owning its own read. */
function useCommsTabHead(code: string) {
  const canView = useCan('comm.view')
  const canCapture = useCan('comm.capture-manage')
  const { data } = useQuery({ ...objectThreadsQuery(code), enabled: canView })

  return { count: data?.rows.length, canCapture: canView && canCapture }
}

// ---------------------------------------------------------------------------
// The lead's own moments — `sales.touch`
// ---------------------------------------------------------------------------

/* `care-planned` and `first-action` share a tone, and so do `exchange-logged`
   and `verified`: each new kind replaced a legacy one on the same rung, and two
   tones for one rung would read as two different things happening. */
const EVENT_DOT: Record<TouchKind, 'ok' | 'current' | 'next' | 'bad' | 'warning'> = {
  created: 'next',
  contacted: 'next',
  'field-filled': 'current',
  'handed-over': 'current',
  'care-planned': 'current',
  'first-action': 'current',
  'exchange-logged': 'ok',
  'tier-raised': 'ok',
  verified: 'ok',
  nurtured: 'next',
  resumed: 'current',
  archived: 'next',
  'first-meeting': 'ok',
  'entered-pipeline': 'ok',
  'stage-changed': 'current',
  signed: 'ok',
  exited: 'bad',
  reopened: 'current',
  'next-step-done': 'ok',
  'sample-sent': 'ok',
  'poc-run': 'ok',
  'demo-held': 'ok',
  'site-visited': 'ok',
  'quotation-sent': 'ok',
  'care-left': 'current',
  'mail-failed': 'bad',
  'mail-sync-failed': 'warning',
}

/** What has happened to this record, one row per `sales.touch`.
 *
 *  Rows arrive by PROPS because the two callers read two different timelines —
 *  a deal's and a lead's — and those two do not mix (ADR 0018, decision 5).
 *
 *  Rows are keyed by touch id, not by position: a `FlowVector` face carries a
 *  `touchId`, and `focus` is the other half of that wire. The scroll runs on
 *  mount as well as on change, so a face pressed while another tab was open
 *  still lands once this one is drawn. */
export function ActivityTimeline({
  history,
  focus,
}: {
  history: readonly TouchEvent[]
  focus?: TouchFocus | null
}) {
  /* Draws BOTH a lead's stop touches (`EXIT_REASON`, `lead.view`-safe) and a
     deal's (`LOSS_REASON`, needs `config.view`) — merged below, so a reader
     missing the second still gets the lead half right. */
  const { data: stopReasons } = useQuery(leadStopReasonsQuery)
  const { data: catalog } = useQuery(salesCatalogQuery)
  const reasonRows = [...(stopReasons?.rows ?? []), ...(catalog?.LOSS_REASON ?? [])]

  useEffect(() => {
    if (!focus) return
    const node = document.getElementById(`touch-${focus.id}`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Chưa có hoạt động nào được ghi cho hồ sơ này.
      </p>
    )
  }

  /* The SAME `Timeline` the other two tabs draw with. Hand-rolling a second
     list here meant swapping tabs changed the type scale and the left gutter,
     which reads as three cards stacked rather than three doors of one. */
  return (
    <Timeline
      items={history.map((row) => ({
        id: row.id,
        domId: `touch-${row.id}`,
        highlight: focus?.id === row.id,
        state: EVENT_DOT[row.kind],
        marker: dm(row.at),
        title:
          lifecycleTitle(row) ??
          (row.kind === 'exited' || row.kind === 'nurtured'
            ? stopNote(row.note, reasonRows)
            : row.note),
        meta: <MetaPill avatar={row.by}>{row.by}</MetaPill>,
      }))}
    />
  )
}

/** An `exited` or `nurtured` note arrives as "<prefix> · <reason-key>[ ·
 *  note]" (ADR 0070, both stop events share one note shape) — swap the key
 *  for its configured label. Anything else is printed as the server wrote it. */
function stopNote(note: string, rows: readonly { id: string; name: string }[]): string {
  const [head, key, ...rest] = note.split(' · ')
  const label = key === undefined ? undefined : stopReasonLabel(rows, key)
  return label === undefined ? note : [head, label, ...rest].join(' · ')
}

/** The same timeline as its own card, for a screen that shows only this one.
 *  The deal profile has no second history stream to put beside it. */
export function ActivityCard({
  history,
  focus,
}: {
  history: readonly TouchEvent[]
  focus?: TouchFocus | null
}) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Lịch sử">
      <SectionTitle size="lg" hint="Những gì đã xảy ra với hồ sơ này.">
        Lịch sử
      </SectionTitle>
      <ActivityTimeline history={history} focus={focus} />
    </GlassCard>
  )
}
