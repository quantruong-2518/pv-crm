import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Drawer, GlassCard, Select, Timeline, cn, type TimelineItem } from '@pv/ui'
import {
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
import { message, useI18n } from '@/app/i18n'
import { kpiMetricText, kpiRoleText } from '@/data/kpi-i18n'

/** The target history panel — a target's versions in one month, read-only (ADR 0099
 *  §5), opened from the allocation screen (the role target, or one holder's
 *  line) and the receipt screen (the reader's own line). Newest first.
 *
 *  Each moment reads as one sentence: who did what, at which value, when. */

/** A counter reads differently by who filed it: the holder asks for a change,
 *  a manager offers another level. */
type Said = KpiTargetHistoryEvent | 'requested'

/** What each event says after the actor's name; one map for every screen. */
const EVENT_VERB: Record<Said, ReturnType<typeof message>> = {
  proposed: message('đề nghị', 'proposed', '제안'),
  agreed: message('duyệt', 'approved', '승인'),
  submitted: message('gửi duyệt', 'submitted for review', '검토 요청'),
  returned: message('trả lại', 'returned', '반려'),
  superseded: message(
    'bị thay bởi lần giao mới',
    'superseded by a new assignment',
    '새 배정으로 대체됨',
  ),
  requested: message('xin đổi thành', 'requested a change to', '변경 요청'),
  countered: message('đề nghị mức khác', 'proposed a different value', '다른 값 제안'),
  accepted: message('đồng ý', 'accepted', '수락'),
  kept: message('giữ mức cũ', 'kept the current value', '현재 값 유지'),
}

const EVENT_DOT: Partial<Record<KpiTargetHistoryEvent, TimelineItem['state']>> = {
  agreed: 'ok',
  accepted: 'ok',
  returned: 'warning',
}

/** Whose history: the reader's own line, or the role target with a pick among its holders.
 *  `roleTarget: false` drops the role target from the pick: a team lead reads members' lines only. */
export type HistorySubject =
  | { actorId: string }
  | { holders: readonly { actorId: string; name: string }[]; roleTarget?: boolean }

const ROLE_TARGET = ''

/** `holder` is whose line is read; absent on the role target, which has no counters. */
function itemOf(
  entry: KpiTargetHistoryEntry,
  def: KpiMetricDef,
  holder: string | undefined,
  i: number,
  lang: 'vi' | 'en' | 'ko',
): TimelineItem {
  const said: Said =
    entry.event === 'countered' && entry.actor?.actorId === holder ? 'requested' : entry.event
  const verb = EVENT_VERB[said][lang]
  /* A replaced version names no one and moves no number. */
  const replaced = entry.event === 'superseded'
  const what =
    entry.value === null || replaced ? verb : `${verb} ${printValue(def.unit, entry.value, true)}`
  return {
    id: `${i}/${entry.at}/${entry.event}`,
    state: EVENT_DOT[entry.event] ?? 'next',
    marker:
      lang === 'vi'
        ? `Lần ${entry.version}`
        : lang === 'en'
          ? `Version ${entry.version}`
          : `${entry.version}차`,
    title: (
      <span className="tnum font-num">
        {actedAt(replaced ? null : entry.actor, what, entry.at)}
      </span>
    ),
    children: entry.note
      ? `${lang === 'vi' ? 'Lý do' : lang === 'en' ? 'Reason' : '사유'}: ${entry.note}`
      : undefined,
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
  const { t, lang } = useI18n()
  const [key, setKey] = useState(() => (defs.find((d) => d.primary) ?? defs[0]).key)
  const [person, setPerson] = useState(() =>
    'holders' in subject && subject.roleTarget === false
      ? (subject.holders[0]?.actorId ?? ROLE_TARGET)
      : ROLE_TARGET,
  )
  const def = defs.find((d) => d.key === key) ?? defs[0]
  const actorId = 'actorId' in subject ? subject.actorId : person || undefined
  const history = useQuery(kpiHistoryQuery(period, { role, metricKey: def.key, actorId }))

  return (
    <div className="flex flex-col gap-4">
      {(defs.length > 1 || 'holders' in subject) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {defs.length > 1 && (
            <Select
              label={t(message('Chỉ số', 'Metric', '지표'))}
              size="lg"
              value={def.key}
              options={defs.map((d) => ({ value: d.key, label: kpiMetricText(d.key, lang) }))}
              onChange={(next) => setKey(next as KpiMetricDef['key'])}
            />
          )}
          {'holders' in subject && (
            <Select
              label={t(message('Chỉ tiêu của', 'Targets for', '목표 대상'))}
              size="lg"
              value={person}
              options={[
                ...(subject.roleTarget === false
                  ? []
                  : [
                      {
                        value: ROLE_TARGET,
                        label: t(message('Cả vai trò', 'Entire role', '역할 전체')),
                      },
                    ]),
                ...subject.holders.map((h) => ({ value: h.actorId, label: h.name })),
              ]}
              onChange={setPerson}
            />
          )}
        </div>
      )}
      <QueryBlock
        query={history}
        what={t(message('lịch sử chỉ tiêu', 'target history', '목표 이력'))}
        variant="b"
      >
        {(data) =>
          data.entries.length === 0 ? (
            <p className={cn(NOTE, 'text-[12.5px] leading-5')}>
              {t(
                message(
                  'Tháng này chưa có thay đổi nào.',
                  'No changes this month.',
                  '이번 달 변경 사항이 없습니다.',
                ),
              )}
            </p>
          ) : (
            <GlassCard variant="b" className="p-4">
              <Timeline
                items={[...data.entries]
                  .reverse()
                  .map((entry, i) => itemOf(entry, def, actorId, i, lang))}
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
  const { t } = useI18n()
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
        {t(message('Xem lịch sử', 'View history', '이력 보기'))}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={t(message('Lịch sử chỉ tiêu', 'Target history', '목표 이력'))}
        subtitle={`${kpiRoleText(role)} · ${periodLabel(period)}`}
      >
        <HistoryBody period={period} role={role} defs={[first, ...rest]} subject={subject} />
      </Drawer>
    </>
  )
}
