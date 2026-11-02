import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Input } from '@pv/ui'
import { ActivityFreshness, SETTING_REGISTRY, type SettingKey } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import {
  activityFreshnessQuery,
  useMyConfigProposals,
  useProposeActivityFreshness,
} from '@/data/sales-config'
import { freshnessWaiting } from './sales-config-model'
import { WaitingNote } from './sales-config-section'
import { sentCopy } from './sales-config-copy'

/** Config section for the deal book's last-activity column (ADR 0077 §4):
 *  from how many quiet days a row turns amber, then red. Mounted by
 *  `sales-config-deal.tsx`. Both numbers go as ONE proposal through the approval
 *  inbox, and the box keeps the stored pair until it is approved. */

const FRESHNESS_RULE = message(
  'Không có hoạt động từ {warn} thì tô vàng, từ {alert} thì tô đỏ.',
  'No activity for {warn} turns the row yellow; from {alert} turns it red.',
  '{warn} 동안 활동이 없으면 노란색, {alert} 이후에는 빨간색으로 표시합니다.',
)

const FIELDS = [
  { axis: 'warnDays', setting: 'sales.activity.warn-days' },
  { axis: 'alertDays', setting: 'sales.activity.alert-days' },
] as const satisfies readonly {
  axis: keyof ActivityFreshness
  setting: SettingKey
}[]

type Typed = Record<keyof ActivityFreshness, string>
type ParseIssue = { code: string; message: string; path: readonly PropertyKey[] }

/** Digits only; anything else is NaN, which the contract refuses. */
const toDays = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

/** The contract's own sentence for the pair rule; a range miss is worded here
 *  from the setting's bounds, since zod's default wording is English. */
function issueOf(
  error: { issues: readonly ParseIssue[] },
  t: ReturnType<typeof useI18n>['t'],
): string {
  const first = error.issues[0]
  if (!first || first.code === 'custom') return first?.message ?? ''
  const field = FIELDS.find((f) => f.axis === first.path[0]) ?? FIELDS[0]
  const { min, max } = SETTING_REGISTRY[field.setting]
  const label =
    field.axis === 'warnDays'
      ? t(message('Vàng từ (ngày)', 'Yellow from (days)', '주의 기준 (일)'))
      : t(message('Đỏ từ (ngày)', 'Red from (days)', '위험 기준 (일)'))
  return `${label}: ${t(message(`số nguyên từ ${min} đến ${max}.`, `enter a whole number from ${min} to ${max}.`, `${min}부터 ${max} 사이의 정수를 입력하세요.`))}`
}

export function ActivityFreshnessConfig() {
  const { t } = useI18n()
  const { data, error } = useQuery(activityFreshnessQuery)
  const canPropose = useCan('config.propose')
  const propose = useProposeActivityFreshness()
  const waiting = freshnessWaiting(useMyConfigProposals())
  const [typed, setTyped] = useState<Typed | null>(null)

  const shown: Typed = typed ?? {
    warnDays: data ? String(data.warnDays) : '',
    alertDays: data ? String(data.alertDays) : '',
  }
  const parsed = ActivityFreshness.safeParse({
    warnDays: toDays(shown.warnDays),
    alertDays: toDays(shown.alertDays),
  })
  const issue = typed && !parsed.success ? issueOf(parsed.error, t) : null
  const unchanged =
    !parsed.success ||
    (data?.warnDays === parsed.data.warnDays && data.alertDays === parsed.data.alertDays)

  const send = () => {
    if (!parsed.success) return
    propose.mutate(parsed.data, {
      onSuccess: () => {
        setTyped(null)
        toastDone(sentCopy())
      },
    })
  }

  if (error) {
    return (
      <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
        {t(
          message(
            'Không tải được ngưỡng hiện tại.',
            'Could not load current thresholds.',
            '현재 임계값을 불러오지 못했습니다.',
          ),
        )}{' '}
        {isApiError(error)
          ? userMessage(error)
          : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))}
      </p>
    )
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        {FIELDS.map((f) => (
          <label key={f.axis} className="flex w-40 flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">
              {f.axis === 'warnDays'
                ? t(message('Vàng từ (ngày)', 'Yellow from (days)', '주의 기준 (일)'))
                : t(message('Đỏ từ (ngày)', 'Red from (days)', '위험 기준 (일)'))}
            </span>
            <Input
              value={shown[f.axis]}
              inputMode="numeric"
              disabled={!canPropose || !data}
              invalid={issue !== null}
              className="pointer-coarse:h-12 tnum"
              onChange={(e) => setTyped({ ...shown, [f.axis]: e.target.value })}
            />
          </label>
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

      {parsed.success && (
        <p className="m-0 text-[11.5px] leading-[1.5]">
          {t(FRESHNESS_RULE)
            .split(/(\{warn\}|\{alert\})/)
            .map((part, i) =>
              part === '{warn}' ? (
                <span key={i} className="text-warning tnum font-num font-semibold">
                  {t(
                    message(
                      `${parsed.data.warnDays} ngày`,
                      `${parsed.data.warnDays} days`,
                      `${parsed.data.warnDays}일`,
                    ),
                  )}
                </span>
              ) : part === '{alert}' ? (
                <span key={i} className="text-destructive-foreground tnum font-num font-semibold">
                  {t(
                    message(
                      `${parsed.data.alertDays} ngày`,
                      `${parsed.data.alertDays} days`,
                      `${parsed.data.alertDays}일`,
                    ),
                  )}
                </span>
              ) : (
                part
              ),
            )}
        </p>
      )}
      <WaitingNote words={waiting} />
      {(issue ?? propose.error) && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {issue ?? (propose.error ? userMessage(propose.error) : null)}
        </p>
      )}
    </GlassCard>
  )
}
