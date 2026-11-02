import { Badge, cn, type BadgeProps } from '@pv/ui'
import { CustomerTemperature, type CustomerTemperature as Temperature } from '@pv/contracts'
import { BADGE_INK } from '@/data/opportunities'
import { AFTER_SALE_COPY as COPY, temperatureText } from '@/data/after-sale-copy'
import { useI18n } from '@/app/i18n'
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
  const { lang } = useI18n()
  return (
    <Badge
      tone={value ? TEMPERATURE_TONE[value] : 'draft'}
      title={title}
      className={cn(BADGE_INK, className)}
    >
      {temperatureText(value, lang)}
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
  const { lang, t } = useI18n()
  return (
    <fieldset className="m-0 min-w-0 p-0">
      <legend className="mb-3 p-0 text-[14px] font-semibold leading-[1.5]">
        {t(COPY.temperature)}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {CustomerTemperature.options.map((t) => (
          <RadioCard
            key={t}
            name="customer-temperature"
            checked={value === t}
            onSelect={() => onPick(t)}
          >
            {temperatureText(t, lang)}
          </RadioCard>
        ))}
      </div>
    </fieldset>
  )
}
