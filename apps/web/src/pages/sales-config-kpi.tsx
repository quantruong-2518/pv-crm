import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Input, Skeleton, cn } from '@pv/ui'
import { APPROVAL_STATE_LABEL, KpiAlertPatch, type ApprovalState } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { kpiAlertQuery, useProposeKpiAlert } from '@/data/kpi-config'
import { dmhm } from '@/lib/date'
import { KpiMetricMatrix } from './sales-config-kpi-matrix'
import { SENT, Section } from './sales-config-section'

/** The KPI area of the config screen (ADR 0099 §1–3, ADR 0100 §1): which metrics
 *  count per role, the two thresholds behind "about to miss" and "about to hit",
 *  and how far short of pace still counts as on track.
 *  Both go through the approval inbox like every config change; the boxes
 *  keep the stored values until the change is approved. */

type Field = { axis: keyof KpiAlertPatch; label: string; short: string; hint?: string }

const FIELDS: readonly Field[] = [
  {
    axis: 'slipPercent',
    label: 'Sắp trượt khi dự báo cuối tháng dưới',
    short: 'Ngưỡng sắp trượt',
  },
  { axis: 'hitPercent', label: 'Sắp đạt khi tiến độ từ', short: 'Ngưỡng sắp đạt' },
  {
    axis: 'tolerancePercent',
    label: 'Thiếu bao nhiêu vẫn tính Đúng tiến độ',
    short: 'Mức thiếu cho phép',
    hint: 'Tính trên số cần đạt tới hôm nay. Để 0% nếu phải đủ.',
  },
]

type Typed = Record<keyof KpiAlertPatch, string>

const LABEL = 'text-muted-foreground text-[11px]'
const NOTE = 'text-muted-foreground m-0 text-[11.5px] leading-[1.5]'
const ALERT = 'text-destructive-foreground m-0 text-[11.5px] leading-[1.5]'

/** Digits only; anything else is NaN, which the contract refuses in words. */
const toPercent = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** The contract's own sentence; a bound is prefixed with the box it belongs to. */
function issueOf(issue: { code: string; message: string; path: readonly PropertyKey[] }) {
  const field = FIELDS.find((f) => f.axis === issue.path[0])
  return issue.code === 'custom' || !field
    ? issue.message
    : `${field.short}: ${lowerFirst(issue.message)}`
}

function KpiAlertConfig() {
  const { data, error, refetch } = useQuery(kpiAlertQuery)
  const canPropose = useCan('config.propose')
  const propose = useProposeKpiAlert()
  const [typed, setTyped] = useState<Typed | null>(null)
  const [sent, setSent] = useState<(KpiAlertPatch & { state: ApprovalState }) | null>(null)
  const ids = { slipPercent: useId(), hitPercent: useId(), tolerancePercent: useId() }
  const issueId = useId()

  if (error && !data) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className={ALERT}>
          Không tải được ngưỡng cảnh báo. {isApiError(error) ? userMessage(error) : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-12"
          onClick={() => void refetch()}
        >
          Thử lại
        </Button>
      </div>
    )
  }

  if (!data) return <Skeleton className="h-24 w-full" />

  const shown: Typed = typed ?? {
    slipPercent: String(data.slipPercent),
    hitPercent: String(data.hitPercent),
    tolerancePercent: String(data.tolerancePercent),
  }
  const parsed = KpiAlertPatch.safeParse({
    slipPercent: toPercent(shown.slipPercent),
    hitPercent: toPercent(shown.hitPercent),
    tolerancePercent: toPercent(shown.tolerancePercent),
  })
  const issue = typed && !parsed.success ? parsed.error.issues[0] : undefined
  const unchanged =
    !parsed.success ||
    (data.slipPercent === parsed.data.slipPercent &&
      data.hitPercent === parsed.data.hitPercent &&
      data.tolerancePercent === parsed.data.tolerancePercent)

  const send = () => {
    if (!parsed.success) return
    propose.mutate(parsed.data, {
      onSuccess: (receipt) => {
        setSent({ ...parsed.data, state: receipt.state })
        setTyped(null)
        toastDone(SENT)
      },
    })
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-6">
        {FIELDS.map((f) => (
          <div key={f.axis} className="flex flex-col gap-2">
            {canPropose ? (
              <label htmlFor={ids[f.axis]} className={LABEL}>
                {f.label}
              </label>
            ) : (
              <span className={LABEL}>{f.label}</span>
            )}
            {/* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */}
            <span className="flex items-center gap-2">
              {canPropose ? (
                <Input
                  id={ids[f.axis]}
                  value={shown[f.axis]}
                  inputMode="numeric"
                  invalid={issue?.path[0] === f.axis}
                  aria-describedby={
                    cn(issue && issueId, f.hint && `${ids[f.axis]}-hint`) || undefined
                  }
                  className="pointer-coarse:h-12 tnum font-num w-24 text-right"
                  onChange={(e) => setTyped({ ...shown, [f.axis]: e.target.value })}
                />
              ) : (
                <span className="tnum font-num text-[13px] font-semibold">{shown[f.axis]}</span>
              )}
              <span className="text-muted-foreground text-[12px]">%</span>
            </span>
          </div>
        ))}
        {canPropose && (
          <Button
            size="md"
            className="pointer-coarse:h-12"
            disabled={unchanged || propose.isPending}
            onClick={send}
          >
            Gửi đề nghị
          </Button>
        )}
      </div>

      {FIELDS.map(
        (f) =>
          f.hint && (
            <p key={f.axis} id={`${ids[f.axis]}-hint`} className={NOTE}>
              {f.hint}
            </p>
          ),
      )}

      {(issue ?? propose.error) && (
        <p id={issueId} role="alert" className={ALERT}>
          {issue ? issueOf(issue) : propose.error ? userMessage(propose.error) : null}
        </p>
      )}
      {sent && (
        <p className={cn(NOTE, 'tnum font-num')}>
          Đã gửi: sắp trượt dưới {sent.slipPercent}%, sắp đạt từ {sent.hitPercent}%, thiếu{' '}
          {sent.tolerancePercent}% vẫn tính Đúng tiến độ. {APPROVAL_STATE_LABEL[sent.state]}.
        </p>
      )}
      <p className={cn(NOTE, 'tnum font-num')}>
        {data.isDefault || !data.updatedBy || !data.updatedAt
          ? 'Đang dùng mức mặc định.'
          : `${data.updatedBy.name} đổi lúc ${dmhm(data.updatedAt)}.`}
      </p>
    </GlassCard>
  )
}

export function KpiArea() {
  return (
    <>
      <Section at="kpi-metrics" hint="Mỗi vai trò có đúng một chỉ số chính.">
        <KpiMetricMatrix />
      </Section>
      <Section at="kpi-alert">
        <KpiAlertConfig />
      </Section>
    </>
  )
}
