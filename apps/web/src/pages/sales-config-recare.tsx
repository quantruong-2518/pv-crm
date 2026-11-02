import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Input } from '@pv/ui'
import {
  CUSTOMER_TEMPERATURE_LABEL,
  RecareCycles,
  SETTING_REGISTRY,
  type SettingKey,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import {
  recareCyclesQuery,
  useMyConfigProposals,
  useProposeRecareCycles,
} from '@/data/sales-config'
import { recareWaiting } from './sales-config-model'
import { WaitingNote } from './sales-config-section'
import { sentCopy } from './sales-config-copy'

/** Config section 5.19 — how many quiet days before a bought customer is due
 *  for care, one cycle per temperature (ADR 0121). The three go as ONE
 *  proposal, like the freshness pair, and the boxes keep the stored trio until
 *  it is approved. Mounted by `CareArea`. */

const FIELDS = [
  { axis: 'hotDays', setting: 'sales.after-sale.hot-days', temperature: 'hot' },
  { axis: 'warmDays', setting: 'sales.after-sale.warm-days', temperature: 'warm' },
  { axis: 'coldDays', setting: 'sales.after-sale.cold-days', temperature: 'cold' },
] as const satisfies readonly {
  axis: keyof RecareCycles
  setting: SettingKey
  temperature: keyof typeof CUSTOMER_TEMPERATURE_LABEL
}[]

type Typed = Record<keyof RecareCycles, string>

/* The cold cycle also covers a customer with no reading yet. */
const toDays = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

export function RecareCyclesConfig() {
  const { t } = useI18n()
  const { data, error } = useQuery(recareCyclesQuery)
  const canPropose = useCan('config.propose')
  const propose = useProposeRecareCycles()
  const waiting = recareWaiting(useMyConfigProposals())
  const [typed, setTyped] = useState<Typed | null>(null)

  const shown: Typed = typed ?? {
    hotDays: data ? String(data.hotDays) : '',
    warmDays: data ? String(data.warmDays) : '',
    coldDays: data ? String(data.coldDays) : '',
  }
  const parsed = RecareCycles.safeParse({
    hotDays: toDays(shown.hotDays),
    warmDays: toDays(shown.warmDays),
    coldDays: toDays(shown.coldDays),
  })
  /* The range is worded from the setting's own bounds; zod's default is English. */
  const bad = typed && !parsed.success ? FIELDS.find((f) => !isInRange(f, shown[f.axis])) : null
  const issue = bad
    ? `${labelOf(bad.temperature, t)}: ${t(message('số nguyên từ', 'enter a whole number from', '정수를 입력하세요:'))} ${SETTING_REGISTRY[bad.setting].min} ${t(message('đến', 'to', '부터'))} ${SETTING_REGISTRY[bad.setting].max}.`
    : null
  const unchanged = !parsed.success || FIELDS.every((f) => data?.[f.axis] === parsed.data[f.axis])

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
            'Không tải được kỳ chăm sóc hiện tại.',
            'Could not load current care cycles.',
            '현재 관리 주기를 불러오지 못했습니다.',
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
            <span className="text-muted-foreground text-[11px]">{labelOf(f.temperature, t)}</span>
            <Input
              value={shown[f.axis]}
              inputMode="numeric"
              disabled={!canPropose || !data}
              invalid={bad?.axis === f.axis}
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
      <WaitingNote words={waiting} />
      {(issue ?? propose.error) && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {issue ?? (propose.error ? userMessage(propose.error) : null)}
        </p>
      )}
    </GlassCard>
  )
}

function labelOf(
  temperature: keyof typeof CUSTOMER_TEMPERATURE_LABEL,
  t: ReturnType<typeof useI18n>['t'],
) {
  const name = t(
    message(
      CUSTOMER_TEMPERATURE_LABEL[temperature],
      temperature === 'hot' ? 'High' : temperature === 'warm' ? 'Medium' : 'Low',
      temperature === 'hot' ? '높음' : temperature === 'warm' ? '보통' : '낮음',
    ),
  )
  return `${name}${temperature === 'cold' ? ` · ${t(message('chưa đánh giá', 'not rated', '미평가'))}` : ''} (${t(message('ngày', 'days', '일'))})`
}

function isInRange(f: (typeof FIELDS)[number], value: string) {
  const { min, max } = SETTING_REGISTRY[f.setting]
  const days = toDays(value)
  return Number.isInteger(days) && days >= min && days <= max
}
