import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, GlassCard, Select, Timeline, cn, type TimelineItem } from '@pv/ui'
import {
  KPI_METRIC_LABEL,
  ROLE_LABEL,
  type KpiMetricDef,
  type KpiTargetHistoryEntry,
  type KpiTargetHistoryEvent,
  type RoleId,
} from '@pv/contracts'
import { kpiHistoryQuery } from '@/data/kpi-history'
import { periodLabel } from './home-model'
import { NOTE } from './home-tiles'
import { actedAt } from './kpi-allocate-model'
import { printValue } from './kpi-model'
import { QueryBlock } from './kpi-parts'

/** The target history panel — a target's versions in one month, read-only (ADR 0099
 *  §5), opened from the allocation screen (the role target, or one holder's
 *  line) and the receipt screen (the reader's own line). Newest first.
 *
 *  Each moment reads as one sentence: who did what, at which value, when. */

/** A counter reads differently by who filed it: the holder asks for a change,
 *  a manager offers another level. */
type Said = KpiTargetHistoryEvent | 'requested'

/** What each event says after the actor's name; one map for every screen. */
const EVENT_VERB: Record<Said, string> = {
  proposed: 'đề nghị',
  agreed: 'duyệt',
  submitted: 'gửi duyệt',
  returned: 'trả lại',
  superseded: 'bị thay bởi lần giao mới',
  requested: 'xin đổi thành',
  countered: 'đề nghị mức khác',
  accepted: 'đồng ý',
  kept: 'giữ mức cũ',
}

const EVENT_DOT: Partial<Record<KpiTargetHistoryEvent, TimelineItem['state']>> = {
  agreed: 'ok',
  accepted: 'ok',
  returned: 'warning',
}

/** Whose history: the reader's own line, or the role target with a pick among its holders. */
export type HistorySubject =
  { actorId: string } | { holders: readonly { actorId: string; name: string }[] }

const ROLE_TARGET = ''

/** `holder` is whose line is read; absent on the role target, which has no counters. */
function itemOf(
  entry: KpiTargetHistoryEntry,
  def: KpiMetricDef,
  holder: string | undefined,
  i: number,
): TimelineItem {
  const said: Said =
    entry.event === 'countered' && entry.actor?.actorId === holder ? 'requested' : entry.event
  const verb = EVENT_VERB[said]
  /* A replaced version names no one and moves no number. */
  const replaced = entry.event === 'superseded'
  const what =
    entry.value === null || replaced ? verb : `${verb} ${printValue(def.unit, entry.value, true)}`
  return {
    id: `${i}/${entry.at}/${entry.event}`,
    state: EVENT_DOT[entry.event] ?? 'next',
    marker: `Lần ${entry.version}`,
    title: (
      <span className="tnum font-num">
        {actedAt(replaced ? null : entry.actor, what, entry.at)}
      </span>
    ),
    children: entry.note ? `Lý do: ${entry.note}` : undefined,
  }
}

function HistoryBody({
  period,
  role,
  defs,
  subject,
}: {
  period: string
  role: RoleId
  defs: readonly [KpiMetricDef, ...KpiMetricDef[]]
  subject: HistorySubject
}) {
  const [key, setKey] = useState(() => (defs.find((d) => d.primary) ?? defs[0]).key)
  const [person, setPerson] = useState(ROLE_TARGET)
  const def = defs.find((d) => d.key === key) ?? defs[0]
  const actorId = 'actorId' in subject ? subject.actorId : person || undefined
  const history = useQuery(kpiHistoryQuery(period, { role, metricKey: def.key, actorId }))

  return (
    <div className="flex flex-col gap-4">
      {(defs.length > 1 || 'holders' in subject) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {defs.length > 1 && (
            <Select
              label="Chỉ số"
              size="lg"
              value={def.key}
              options={defs.map((d) => ({ value: d.key, label: KPI_METRIC_LABEL[d.key] }))}
              onChange={(next) => setKey(next as KpiMetricDef['key'])}
            />
          )}
          {'holders' in subject && (
            <Select
              label="Chỉ tiêu của"
              size="lg"
              value={person}
              options={[
                { value: ROLE_TARGET, label: 'Cả vai trò' },
                ...subject.holders.map((h) => ({ value: h.actorId, label: h.name })),
              ]}
              onChange={setPerson}
            />
          )}
        </div>
      )}
      <QueryBlock query={history} what="lịch sử chỉ tiêu" variant="b">
        {(data) =>
          data.entries.length === 0 ? (
            <p className={cn(NOTE, 'text-[12.5px] leading-5')}>Tháng này chưa có thay đổi nào.</p>
          ) : (
            <GlassCard variant="b" className="p-4">
              <Timeline
                items={[...data.entries]
                  .reverse()
                  .map((entry, i) => itemOf(entry, def, actorId, i))}
              />
            </GlassCard>
          )
        }
      </QueryBlock>
    </div>
  )
}

/** The button and its panel. Nothing is read until the panel opens. */
export function TargetHistoryButton({
  period,
  role,
  defs,
  subject,
}: {
  period: string
  role: RoleId
  /** The metrics to pick from, in catalog order; the primary opens first. */
  defs: readonly KpiMetricDef[]
  subject: HistorySubject
}) {
  const [open, setOpen] = useState(false)
  const [first, ...rest] = defs
  if (!first) return null
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="pointer-coarse:h-12"
        onClick={() => setOpen(true)}
      >
        Xem lịch sử
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Lịch sử chỉ tiêu"
        subtitle={`${ROLE_LABEL[role]} · ${periodLabel(period)}`}
      >
        <HistoryBody period={period} role={role} defs={[first, ...rest]} subject={subject} />
      </Drawer>
    </>
  )
}
