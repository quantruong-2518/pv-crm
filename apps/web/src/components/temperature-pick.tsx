import { Badge, cn, type BadgeProps } from '@pv/ui'
import {
  CUSTOMER_TEMPERATURE_LABEL,
  CustomerTemperature,
  type CustomerTemperature as Temperature,
} from '@pv/contracts'
import { BADGE_INK } from '@/data/opportunities'
import { NO_READING_LABEL } from '@/data/after-sale'
import { RadioCard } from './radio-card'

/** A bought customer's temperature (ADR 0121): the required pick of a
 *  close-out, and the pill the book, the cards and the journey door print.
 *  Hot reads as good news, not alarm: success for hot, running for warm, and
 *  the quiet draft tone for cold and for no reading yet. */

const TEMPERATURE_TONE: Record<Temperature, BadgeProps['tone']> = {
  hot: 'success',
  warm: 'running',
  cold: 'draft',
}

export function TemperatureBadge({
  value,
  title,
  className,
}: {
  value: Temperature | null
  title?: string
  className?: string
}) {
  return (
    <Badge
      tone={value ? TEMPERATURE_TONE[value] : 'draft'}
      title={title}
      className={cn(BADGE_INK, className)}
    >
      {value ? CUSTOMER_TEMPERATURE_LABEL[value] : NO_READING_LABEL}
    </Badge>
  )
}

export function TemperaturePick({
  value,
  onPick,
}: {
  value: Temperature | null
  onPick: (value: Temperature) => void
}) {
  return (
    <fieldset className="m-0 min-w-0 p-0">
      <legend className="mb-3 p-0 text-[14px] font-semibold leading-[1.5]">
        Nhiệt độ khách hàng
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {CustomerTemperature.options.map((t) => (
          <RadioCard
            key={t}
            name="customer-temperature"
            checked={value === t}
            onSelect={() => onPick(t)}
          >
            {CUSTOMER_TEMPERATURE_LABEL[t]}
          </RadioCard>
        ))}
      </div>
    </fieldset>
  )
}
