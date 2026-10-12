import { Select } from '@pv/ui'
import { SALE_LANE, SALE_PRIMARY_LABEL } from '@/data/opportunities'

/** Which person of the SALE lane is its primary (ADR 0086) — shared by the
 *  open-deal form and the seller modal. Draws nothing for a lane of one: there
 *  is nothing to choose, and the server takes that person. Whether the lane has
 *  a primary at all is read from the PIC rule table, not decided here.
 *  What it shows is what will be saved: with no `value` it shows a placeholder
 *  and the caller keeps its save shut until one is chosen. */
export function SalePrimaryPick({
  people,
  value,
  errors,
  onChange,
}: {
  people: readonly { id: string; name: string }[]
  value: string | undefined
  /** What the server said about this choice; takes the hint's place. */
  errors?: string[] | undefined
  onChange: (id: string) => void
}) {
  if (!SALE_LANE.primary || people.length < 2) return null

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Select
        label={SALE_PRIMARY_LABEL}
        value={value ?? ''}
        /* Not a filter: no choice here is "the active one", so none lights up. */
        neutralValue={value ?? ''}
        valueContent={
          value === undefined ? (
            <span className="text-muted-foreground">Chọn Sale chính</span>
          ) : undefined
        }
        options={people.map((p) => ({ value: p.id, label: p.name }))}
        onChange={onChange}
        size="lg"
      />
      {errors?.length ? (
        <p role="alert" className="text-destructive-foreground m-0 text-[11px] leading-[1.5]">
          {errors.join(' · ')}
        </p>
      ) : (
        <p className="text-muted-foreground m-0 text-[11px] leading-[1.5]">
          Người chịu trách nhiệm chính của cơ hội.
        </p>
      )}
    </div>
  )
}
