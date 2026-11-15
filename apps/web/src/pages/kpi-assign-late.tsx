import { useState } from 'react'
import { Avatar, Badge, Button, GlassCard, Icon, Modal, Plus, cn } from '@pv/ui'
import type {
  KpiAssignmentLateCandidate,
  KpiAssignmentPageResponse,
  KpiMetricDef,
} from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { dm } from '@/lib/date'
import { useLateKpiLine } from '@/data/kpi-assignment'
import { kpiMetricText } from '@/data/kpi-i18n'
import { NOTE } from './home-tiles'
import { FailLine } from './kpi-allocate-parts'
import { ValueCell } from './kpi-allocate-teams'
import {
  additiveOf,
  childId,
  rampFactorOf,
  rampHintText,
  rampOf,
  rampWord,
  rampedAverage,
} from './kpi-assign-model'
import { parseTyped } from './kpi-model'

/** People who joined after their unit sent (ADR 0156 §5): the server lists whoever
 *  holds no line in the sent set, so the head adds one by hand. */

type Person = KpiAssignmentLateCandidate

/** Average of the fully ramped people's sent lines × the joiner's factor; `null` with none,
 *  and `null` while the page's set is a draft, since only the sent lines are in force. */
function suggestionOf(page: KpiAssignmentPageResponse, def: KpiMetricDef, factor: number) {
  if (page.set?.status !== 'sent') return null
  const ramped = new Set(
    page.children.flatMap((c) => (c.kind === 'person' && rampOf(c) === null ? [childId(c)] : [])),
  )
  const sent = (page.set?.lines ?? []).filter(
    (l) => l.metricKey === def.key && l.personId !== null && ramped.has(l.personId),
  )
  return rampedAverage(
    sent.map((l) => l.value),
    factor,
  )
}

function LateDialog({
  page,
  defs,
  person,
  unitParam,
  onClose,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
  person: Person
  unitParam: string | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const add = useLateKpiLine(page.period, page.role, unitParam)
  const name = person.name
  const factor = rampFactorOf(person.ramp) ?? 1
  const [texts, setTexts] = useState<Record<string, string>>({})
  const lines = defs.flatMap((d) => {
    const value = parseTyped(d.unit, texts[d.key] ?? '')
    return typeof value === 'number' ? [{ metricKey: d.key, value }] : []
  })
  const broken = defs.some((d) => parseTyped(d.unit, texts[d.key] ?? '') === null)
  const submit = () =>
    add.mutate(
      { unitId: page.unit.id, personId: person.personId, lines },
      {
        onSuccess: () => {
          onClose()
          toastDone(
            t(
              message(
                `Đã thêm chỉ tiêu cho ${name}.`,
                `Targets added for ${name}.`,
                `${name}님의 목표를 추가했습니다.`,
              ),
            ),
          )
        },
      },
    )

  return (
    <Modal
      open
      onClose={onClose}
      className="h-auto max-h-[90dvh] self-end rounded-t-lg sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[480px] sm:self-center"
      title={t(
        message(`Thêm chỉ tiêu cho ${name}`, `Add targets for ${name}`, `${name} 목표 추가`),
      )}
      footer={
        <div className="flex flex-col gap-2">
          <FailLine error={add.error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button size="lg" variant="secondary" type="button" onClick={onClose}>
              {t(message('Đóng', 'Close', '닫기'))}
            </Button>
            <Button
              size="lg"
              type="button"
              disabled={add.isPending || broken || lines.length === 0}
              onClick={submit}
            >
              {t(message('Thêm chỉ tiêu', 'Add targets', '목표 추가'))}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {defs.map((d) => {
          const hint = suggestionOf(page, d, factor)
          return (
            <div key={d.key} className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold">{kpiMetricText(d.key)}</span>
              <ValueCell
                def={d}
                label={`${kpiMetricText(d.key)} · ${name}`}
                editable
                text={texts[d.key] ?? ''}
                saved={null}
                last={null}
                hint={hint === null ? undefined : rampHintText(d, hint)}
                onChange={(text) => setTexts({ ...texts, [d.key]: text })}
              />
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/** The section under the table; nothing when no one is late. */
export function LateJoiners({
  page,
  defs,
  unitParam,
}: {
  page: KpiAssignmentPageResponse
  defs: readonly KpiMetricDef[]
  unitParam: string | null
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState<Person | null>(null)
  const people = page.lateCandidates ?? []
  const additive = additiveOf(defs)
  if (people.length === 0 || additive.length === 0) return null

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <h3 className="text-[13px] font-semibold">
        {t(
          message(
            'Người vào làm sau khi gửi chỉ tiêu',
            'Joined after targets were sent',
            '목표 발송 후 입사한 사람',
          ),
        )}
      </h3>
      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.personId} className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <Avatar name={p.name} size="sm" />
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="max-w-full truncate font-semibold">{p.name}</span>
                {p.startedOn && (
                  <span className={cn(NOTE, 'tnum font-num')}>
                    {t(message('Vào làm', 'Started', '입사'))} {dm(p.startedOn)}
                  </span>
                )}
              </span>
              {rampFactorOf(p.ramp) !== null && (
                <Badge tone="draft">{rampWord(p.ramp!.factor)}</Badge>
              )}
            </span>
            <Button variant="secondary" className="pointer-coarse:h-12" onClick={() => setOpen(p)}>
              <Icon icon={Plus} size={16} />
              {t(
                message(
                  `Thêm chỉ tiêu cho ${p.name}`,
                  `Add targets for ${p.name}`,
                  `${p.name} 목표 추가`,
                ),
              )}
            </Button>
          </li>
        ))}
      </ul>
      {open && (
        <LateDialog
          key={open.personId}
          page={page}
          defs={additive}
          person={open}
          unitParam={unitParam}
          onClose={() => setOpen(null)}
        />
      )}
    </GlassCard>
  )
}
