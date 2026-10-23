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
import { toastDone } from '@/app/toast'
import {
  recareCyclesQuery,
  useMyConfigProposals,
  useProposeRecareCycles,
} from '@/data/sales-config'
import { recareWaiting } from './sales-config-model'
import { SENT, WaitingNote } from './sales-config-section'

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
const labelOf = (f: (typeof FIELDS)[number]) =>
  `${CUSTOMER_TEMPERATURE_LABEL[f.temperature]}${f.temperature === 'cold' ? ' · chưa đánh giá' : ''} (ngày)`

const toDays = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : Number.NaN)

export function RecareCyclesConfig() {
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
    ? `${labelOf(bad)}: số nguyên từ ${SETTING_REGISTRY[bad.setting].min} đến ${SETTING_REGISTRY[bad.setting].max}.`
    : null
  const unchanged = !parsed.success || FIELDS.every((f) => data?.[f.axis] === parsed.data[f.axis])

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
      <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
        Không tải được kỳ chăm sóc hiện tại. {isApiError(error) ? userMessage(error) : 'Thử lại.'}
      </p>
    )
  }

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        {FIELDS.map((f) => (
          <label key={f.axis} className="flex w-40 flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">{labelOf(f)}</span>
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
            Gửi đề nghị
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

function isInRange(f: (typeof FIELDS)[number], value: string) {
  const { min, max } = SETTING_REGISTRY[f.setting]
  const days = toDays(value)
  return Number.isInteger(days) && days >= min && days <= max
}
