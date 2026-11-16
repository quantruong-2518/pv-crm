import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Input, Skeleton, cn } from '@pv/ui'
import { KpiAlertPatch, type ApprovalState } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { kpiAlertQuery, useProposeKpiAlert } from '@/data/kpi-config'
import { dmhm } from '@/lib/date'
import { KpiMetricMatrix } from './sales-config-kpi-matrix'
import { OrgSection } from './sales-config-org'
import { Section } from './sales-config-section'
import { approvalStateCopy, sentCopy } from './sales-config-copy'

/** The KPI area of the config screen (ADR 0099 §1–3, ADR 0100 §1): which metrics
 *  count per role, the two thresholds behind "about to miss" and "about to hit",
 *  and how far short of pace still counts as on track.
 *  Both go through the approval inbox like every config change; the boxes
 *  keep the stored values until the change is approved. The org section (5.18)
 *  below them (ADR 0118) is the exception: tree edits apply directly. */

type Axis = keyof KpiAlertPatch
type Field = { axis: Axis; hint?: true }

const FIELDS: readonly Field[] = [
  { axis: 'slipPercent' },
  { axis: 'hitPercent' },
  { axis: 'tolerancePercent', hint: true },
  { axis: 'gradeA' },
  { axis: 'gradeB' },
  { axis: 'gradeC', hint: true },
]

const fieldCopy = (axis: Axis) => {
  if (axis === 'slipPercent')
    return {
      label: message(
        'Sắp trượt khi dự báo cuối tháng dưới',
        'At risk when month-end forecast is below',
        '월말 예상치가 다음 미만이면 위험',
      ),
      short: message('Ngưỡng sắp trượt', 'At-risk threshold', '위험 기준'),
    }
  if (axis === 'hitPercent')
    return {
      label: message(
        'Sắp đạt khi tiến độ từ',
        'On track when progress reaches',
        '진행률이 다음 이상이면 정상',
      ),
      short: message('Ngưỡng sắp đạt', 'On-track threshold', '정상 기준'),
    }
  if (axis === 'gradeA')
    return {
      label: message('Loại A từ (%)', 'Grade A from (%)', 'A등급 기준 (%)'),
      short: message('Mức loại A', 'Grade A level', 'A등급 기준'),
    }
  if (axis === 'gradeB')
    return {
      label: message('Loại B từ (%)', 'Grade B from (%)', 'B등급 기준 (%)'),
      short: message('Mức loại B', 'Grade B level', 'B등급 기준'),
    }
  if (axis === 'gradeC')
    return {
      label: message('Loại C từ (%)', 'Grade C from (%)', 'C등급 기준 (%)'),
      short: message('Mức loại C', 'Grade C level', 'C등급 기준'),
      hint: message(
        'Dưới mức loại C là loại D.',
        'Below grade C is grade D.',
        'C등급 기준 미만은 D등급입니다.',
      ),
    }
  return {
    label: message(
      'Thiếu bao nhiêu vẫn tính Đúng tiến độ',
      'Allowed shortfall that still counts as on track',
      '정상으로 간주할 수 있는 허용 미달률',
    ),
    short: message('Mức thiếu cho phép', 'Allowed shortfall', '허용 미달률'),
    hint: message(
      'Tính trên số cần đạt tới hôm nay. Để 0% nếu phải đủ.',
      'Compared with the amount due by today. Set to 0% to require the full amount.',
      '오늘까지 달성해야 하는 목표를 기준으로 합니다. 전부 달성해야 하면 0%로 설정하세요.',
    ),
  }
}

type Typed = Record<Axis, string>

/** What a submitted change says, for the boxes it moved only. */
const SENT_PHRASE: Record<Axis, (n: number) => Message> = {
  slipPercent: (n) => message(`sắp trượt dưới ${n}%`, `at risk below ${n}%`, `${n}% 미만은 위험`),
  hitPercent: (n) => message(`sắp đạt từ ${n}%`, `on track from ${n}%`, `${n}%부터 정상`),
  tolerancePercent: (n) =>
    message(
      `thiếu ${n}% vẫn tính Đúng tiến độ`,
      `up to ${n}% behind still counts as on track`,
      `${n}%까지 미달해도 정상으로 계산`,
    ),
  gradeA: (n) => message(`loại A từ ${n}%`, `grade A from ${n}%`, `A등급 ${n}% 이상`),
  gradeB: (n) => message(`loại B từ ${n}%`, `grade B from ${n}%`, `B등급 ${n}% 이상`),
  gradeC: (n) => message(`loại C từ ${n}%`, `grade C from ${n}%`, `C등급 ${n}% 이상`),
}

const sentList = (
  sent: { patch: KpiAlertPatch; changed: readonly Axis[] },
  lang: 'vi' | 'en' | 'ko',
) => sent.changed.map((a) => translate(SENT_PHRASE[a](sent.patch[a]), lang)).join(', ')

const LABEL = 'text-muted-foreground text-[11px]'
const NOTE = 'text-muted-foreground m-0 text-[11.5px] leading-[1.5]'
const ALERT = 'text-destructive-foreground m-0 text-[11.5px] leading-[1.5]'

/** Digits only; anything else is NaN, which the contract refuses in words. */
const toPercent = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** The contract's own sentence; a bound is prefixed with the box it belongs to. */
function issueOf(
  issue: { code: string; message: string; path: readonly PropertyKey[] },
  t: (copy: Message) => string,
) {
  const field = FIELDS.find((f) => f.axis === issue.path[0])
  return issue.code === 'custom' || !field
    ? issue.message
    : `${t(fieldCopy(field.axis).short)}: ${lowerFirst(issue.message)}`
}

function useFieldIds() {
  return {
    slipPercent: useId(),
    hitPercent: useId(),
    tolerancePercent: useId(),
    gradeA: useId(),
    gradeB: useId(),
    gradeC: useId(),
  }
}

function KpiAlertConfig() {
  const { t } = useI18n()
  const { data, error, refetch } = useQuery(kpiAlertQuery)
  const canPropose = useCan('config.propose')
  const propose = useProposeKpiAlert()
  const [typed, setTyped] = useState<Typed | null>(null)
  const [sent, setSent] = useState<{
    patch: KpiAlertPatch
    changed: Axis[]
    state: ApprovalState
  } | null>(null)
  const ids = useFieldIds()
  const issueId = useId()

  if (error && !data) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className={ALERT}>
          {t(
            message(
              'Không tải được ngưỡng cảnh báo.',
              'Could not load alert thresholds.',
              '알림 임계값을 불러오지 못했습니다.',
            ),
          )}{' '}
          {isApiError(error) ? userMessage(error) : ''}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:h-12"
          onClick={() => void refetch()}
        >
          {t(message('Thử lại', 'Try again', '다시 시도'))}
        </Button>
      </div>
    )
  }

  if (!data) return <Skeleton className="h-24 w-full" />

  const shown: Typed = typed ?? {
    slipPercent: String(data.slipPercent),
    hitPercent: String(data.hitPercent),
    tolerancePercent: String(data.tolerancePercent),
    gradeA: String(data.gradeA),
    gradeB: String(data.gradeB),
    gradeC: String(data.gradeC),
  }
  const parsed = KpiAlertPatch.safeParse(
    Object.fromEntries(FIELDS.map((f) => [f.axis, toPercent(shown[f.axis])])),
  )
  const issue = typed && !parsed.success ? parsed.error.issues[0] : undefined
  const unchanged = !parsed.success || FIELDS.every((f) => data[f.axis] === parsed.data[f.axis])

  const send = () => {
    if (!parsed.success) return
    const changed = FIELDS.map((f) => f.axis).filter((a) => data[a] !== parsed.data[a])
    propose.mutate(parsed.data, {
      onSuccess: (receipt) => {
        setSent({ patch: parsed.data, changed, state: receipt.state })
        setTyped(null)
        toastDone(sentCopy())
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
                {t(fieldCopy(f.axis).label)}
              </label>
            ) : (
              <span className={LABEL}>{t(fieldCopy(f.axis).label)}</span>
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
            {t(message('Gửi đề nghị', 'Submit proposal', '변경 제안'))}
          </Button>
        )}
      </div>

      {FIELDS.map(
        (f) =>
          f.hint && (
            <p key={f.axis} id={`${ids[f.axis]}-hint`} className={NOTE}>
              {t(fieldCopy(f.axis).hint ?? message('', '', ''))}
            </p>
          ),
      )}

      {(issue ?? propose.error) && (
        <p id={issueId} role="alert" className={ALERT}>
          {issue ? issueOf(issue, t) : propose.error ? userMessage(propose.error) : null}
        </p>
      )}
      {sent && (
        <p className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              `Đã gửi: ${sentList(sent, 'vi')}. ${translate(approvalStateCopy(sent.state), 'vi')}.`,
              `Submitted: ${sentList(sent, 'en')}. ${translate(approvalStateCopy(sent.state), 'en')}.`,
              `제출됨: ${sentList(sent, 'ko')}. ${translate(approvalStateCopy(sent.state), 'ko')}.`,
            ),
          )}
        </p>
      )}
      <p className={cn(NOTE, 'tnum font-num')}>
        {data.isDefault || !data.updatedBy || !data.updatedAt
          ? t(
              message(
                'Đang dùng mức mặc định.',
                'Using the default settings.',
                '기본 설정 사용 중입니다.',
              ),
            )
          : t(
              message(
                `${data.updatedBy.name} đổi lúc ${dmhm(data.updatedAt)}.`,
                `Updated by ${data.updatedBy.name} at ${dmhm(data.updatedAt)}.`,
                `${data.updatedBy.name}님이 ${dmhm(data.updatedAt)}에 수정했습니다.`,
              ),
            )}
      </p>
    </GlassCard>
  )
}

export function KpiArea() {
  const { t } = useI18n()
  const canView = useCan('kpi.view')
  return (
    <>
      <Section
        at="kpi-metrics"
        hint={t(
          message(
            'Mỗi vai trò có đúng một chỉ số chính.',
            'Each role has exactly one primary metric.',
            '각 역할에는 기본 지표가 하나씩 지정됩니다.',
          ),
        )}
      >
        <KpiMetricMatrix />
      </Section>
      <Section at="kpi-alert">
        <KpiAlertConfig />
      </Section>
      {canView && <OrgSection />}
    </>
  )
}
