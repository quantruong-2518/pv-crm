import { useMemo, type ReactNode } from 'react'
import { Input, cn } from '@pv/ui'
import { OPPORTUNITY_NAME_MAX } from '@pv/contracts'
import type { OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { FieldErrors } from '@/app/api'
import { closeChips } from '@/data/opportunity-open'
import { AmountField } from './deal-fields'
import { Field, type SetDraft } from './ops-fields'

/** The deal section of the opening drawer: name, money, expected close.
 *
 *  A seed tag stays only while the box still holds what the lead gave it —
 *  edit the box and the tag goes, since the figure no longer comes from there. */

export const SectionHead = ({ children, note }: { children: ReactNode; note?: ReactNode }) => (
  <h3 className="m-0 flex items-baseline gap-2 text-[14px] font-semibold">
    {children}
    {note && <span className="text-muted-foreground text-[12px] font-normal">{note}</span>}
  </h3>
)

const SeedTag = ({ children }: { children: ReactNode }) => (
  <span className="bg-surface-ink/9 text-muted-foreground rounded-sm px-2 text-[11px] font-medium">
    {children}
  </span>
)

export function BasicsSection({
  draft,
  seed,
  errors,
  onSet,
}: {
  draft: OpportunityDraft
  seed: OpportunityDraft
  errors: FieldErrors
  onSet: SetDraft
}) {
  const fromBudget =
    seed.amount !== null && draft.amount === seed.amount && draft.currency === seed.currency

  return (
    <section className="flex flex-col gap-4" aria-label="Cơ hội">
      <SectionHead>Cơ hội</SectionHead>

      <Field
        label={
          <>
            Tên cơ hội
            {draft.name === seed.name && <SeedTag>từ lead</SeedTag>}
          </>
        }
        required
        errors={errors.name}
      >
        <Input
          value={draft.name}
          aria-label="Tên cơ hội"
          aria-required
          maxLength={OPPORTUNITY_NAME_MAX}
          className="pointer-coarse:h-12"
          invalid={Boolean(errors.name)}
          onChange={(e) => onSet('name', e.target.value)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <AmountField
          draft={draft}
          onSet={onSet}
          errors={errors.amount}
          tag={fromBudget && <SeedTag>từ ngân sách</SeedTag>}
          onCurrency={(code) => onSet('currency', code)}
        />
        <CloseDate value={draft.closedDate} errors={errors.closedDate} onChange={onSet} />
      </div>
    </section>
  )
}

/** The date box and its four shortcuts, counted from the real today. Built
 *  when the drawer opens (the panel is not mounted while shut), so a tab left
 *  open overnight does not keep yesterday's shortcuts. */
function CloseDate({
  value,
  errors,
  onChange,
}: {
  value: string
  errors?: string[]
  onChange: SetDraft
}) {
  const chips = useMemo(() => closeChips(new Date()), [])

  return (
    <Field label="Ngày chốt dự kiến" required plain errors={errors}>
      <Input
        type="date"
        value={value}
        aria-label="Ngày chốt dự kiến"
        aria-required
        className="pointer-coarse:h-12"
        invalid={Boolean(errors?.length)}
        onChange={(e) => onChange('closedDate', e.target.value)}
      />
      <div role="group" aria-label="Chọn nhanh ngày chốt" className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const on = chip.day === value
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange('closedDate', chip.day)}
              className={cn(
                'motion-std pointer-coarse:h-12 h-8 rounded-md px-3 text-[12px] font-medium',
                on
                  ? 'bg-primary/24 text-on-tint-primary'
                  : 'bg-surface-ink/9 text-muted-foreground hover:bg-surface-ink/16',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </Field>
  )
}
