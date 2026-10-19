import { Badge, Input, cn } from '@pv/ui'
import type { KpiAllocation, KpiMetricDef } from '@pv/contracts'
import { NOTE } from './home-tiles'
import { teamStatusOf, type TeamRow } from './kpi-allocate-model'
import { DASH, UNIT_WORD, parseTyped, printShort, printValue } from './kpi-model'

/** The pieces of the allocation table that differ between a person's row and a
 *  team's row (ADR 0101): both are a figure per metric, but a team's figure is
 *  its share of the role target, saved in `pkg.shares` rather than `pkg.lines`.
 *
 *  The keys and the saved-share lookup live in `kpi-allocate-model.ts`. */

const NOTE_NUM = cn(NOTE, 'tnum font-num')

/** One figure: an input while the package is open, the saved number after. */
export function ValueCell({
  def,
  label,
  editable,
  text,
  saved,
  last,
  onChange,
}: {
  def: KpiMetricDef
  /** The accessible name of the box: metric and whose figure. */
  label: string
  editable: boolean
  text: string
  /** The saved figure; `null` when nothing is saved. */
  saved: number | null
  /** Last month's actual, when it could be read. */
  last: number | null
  onChange: (text: string) => void
}) {
  const unit = UNIT_WORD[def.unit]
  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      {editable ? (
        /* The unit beside the box, not `suffix`: the suffix shell is fixed at 40px, under law 13's 48. */
        <span className="flex w-full items-center gap-2">
          <Input
            inputMode="decimal"
            aria-label={label}
            className="pointer-coarse:h-12 tnum font-num min-w-0 text-right"
            value={text}
            invalid={parseTyped(def.unit, text) === null}
            onChange={(e) => onChange(e.target.value)}
          />
          {unit && <span className={cn(NOTE, 'shrink-0')}>{unit}</span>}
        </span>
      ) : (
        <span className="tnum font-num font-semibold">
          {saved === null ? DASH : printValue(def.unit, saved)}
        </span>
      )}
      {last !== null && (
        <span className={NOTE_NUM}>Tháng trước đạt {printShort(def.unit, last)}</span>
      )}
    </span>
  )
}

/** First cell of a team row: its name and headcount, and under it where the
 *  team's own package stands. */
export function TeamNameCell({ team, pkg }: { team: TeamRow; pkg: KpiAllocation | undefined }) {
  const status = teamStatusOf(pkg)
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="truncate font-semibold">
        Nhóm {team.name} · {team.memberCount} người
      </span>
      <Badge tone={status.tone} className="whitespace-normal">
        {status.text}
      </Badge>
    </span>
  )
}
