import { Input, SegmentedControl } from '@pv/ui'
import { vnDayOf } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import {
  RECONTACT_CHOICES,
  tomorrowOf,
  type RecontactChoice,
  type RecontactPick,
} from './recontact-pick'

/** The re-contact field — the day a parked lead comes due again (ADR 0125 D5).
 *  Shared by the park drawer (plain park and a hold ended to waiting) and the
 *  deal stop drawer when that stop parks the lead. */

export function RecontactField({
  value,
  onChange,
  disabled = false,
}: {
  value: RecontactPick
  onChange: (next: RecontactPick) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label={t(message('Hẹn liên hệ lại', 'Follow up on', '재연락 예정'))}
        tone="quiet"
        className="flex-col items-start"
        value={value.choice}
        options={RECONTACT_CHOICES.map((c) => ({ value: c.value, label: t(c.label), disabled }))}
        onChange={(choice) => onChange({ ...value, choice: choice as RecontactChoice })}
      />
      {value.choice === 'pick' && (
        <Input
          type="date"
          aria-label={t(message('Ngày liên hệ lại', 'Follow-up date', '재연락 날짜'))}
          aria-required
          value={value.day}
          min={tomorrowOf(vnDayOf(new Date()))}
          disabled={disabled}
          className="h-12"
          onChange={(e) => onChange({ ...value, day: e.target.value })}
        />
      )}
    </div>
  )
}
