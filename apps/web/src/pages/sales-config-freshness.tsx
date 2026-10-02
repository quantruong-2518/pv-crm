import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Input } from '@pv/ui'
import { ActivityFreshness, SETTING_REGISTRY, type SettingKey } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { activityFreshnessQuery, useProposeActivityFreshness } from '@/data/sales-config'

/** Config section for the deal book's last-activity column (ADR 0077 §4):
 *  from how many quiet days a row turns amber, then red. Mounted by
 *  `sales-config.tsx`. Both numbers go as ONE proposal through the approval
 *  inbox, and the box keeps the stored pair until it is approved. */

/* Who approves is the server's chain, not a role this screen may name. */
const SENT = 'Đã gửi đề nghị · chờ duyệt.'

const FIELDS = [
  { axis: 'warnDays', setting: 'sales.activity.warn-days', label: 'Vàng từ (ngày)' },
  { axis: 'alertDays', setting: 'sales.activity.alert-days', label: 'Đỏ từ (ngày)' },
] as const satisfies readonly {
  axis: keyof ActivityFreshness
  setting: SettingKey
  label: string
}[]

type Typed = Record<keyof ActivityFreshness, string>
type ParseIssue = { code: string; message: string; path: readonly PropertyKey[] }

/** Digits only; anything else is NaN, which the contract refuses. */
const toDays = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

/** The contract's own sentence for the pair rule; a range miss is worded here
 *  from the setting's bounds, since zod's default wording is English. */
function issueOf(error: { issues: readonly ParseIssue[] }): string {
  const first = error.issues[0]
  if (!first || first.code === 'custom') return first?.message ?? ''
  const field = FIELDS.find((f) => f.axis === first.path[0]) ?? FIELDS[0]
  const { min, max } = SETTING_REGISTRY[field.setting]
  return `${field.label}: số nguyên từ ${min} đến ${max}.`
}

export function ActivityFreshnessConfig() {
  const { data, error } = useQuery(activityFreshnessQuery)
  const canPropose = useCan('config.propose')
  const propose = useProposeActivityFreshness()
  const [typed, setTyped] = useState<Typed | null>(null)

  const shown: Typed = typed ?? {
    warnDays: data ? String(data.warnDays) : '',
    alertDays: data ? String(data.alertDays) : '',
  }
  const parsed = ActivityFreshness.safeParse({
    warnDays: toDays(shown.warnDays),
    alertDays: toDays(shown.alertDays),
  })
  const issue = typed && !parsed.success ? issueOf(parsed.error) : null
  const unchanged =
    !parsed.success ||
    (data?.warnDays === parsed.data.warnDays && data.alertDays === parsed.data.alertDays)

  const send = () => {
    if (!parsed.success) return
    propose.mutate(parsed.data, {
      onSuccess: () => {
        setTyped(null)
        toastDone(SENT)
      },
    })
  }

  if (error) {
    return (
      <p role="alert" className="text-warning m-0 text-[11.5px]">
        Không đọc được ngưỡng hiện tại.{' '}
        {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
    )
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        {FIELDS.map((f) => (
          <label key={f.axis} className="flex w-40 flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">{f.label}</span>
            <Input
              value={shown[f.axis]}
              inputMode="numeric"
              disabled={!canPropose || !data}
              invalid={issue !== null}
              suffix="ngày"
              className="pointer-coarse:h-12"
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
            Gửi đề nghị
          </Button>
        )}
      </div>

      {parsed.success && (
        <p className="m-0 text-[11.5px] leading-[1.5]">
          Không có hoạt động từ{' '}
          <span className="text-warning tnum font-num font-semibold">
            {parsed.data.warnDays} ngày
          </span>{' '}
          thì tô vàng, từ{' '}
          <span className="text-destructive-foreground tnum font-num font-semibold">
            {parsed.data.alertDays} ngày
          </span>{' '}
          thì tô đỏ.
        </p>
      )}
      {(issue ?? propose.error) && (
        <p role="alert" className="text-warning m-0 text-[11.5px]">
          {issue ?? (propose.error ? userMessage(propose.error) : null)}
        </p>
      )}
    </GlassCard>
  )
}
