import { LeadTier, StageKey } from '@pv/contracts'
import type { PhaseSpec } from '@pv/engines'

/** What the configuration says about one rung of a ladder. */
export type PhaseConfig = { label: string; limitDays: number | null }

/** Kept as a name because the deal side reads in these words. */
export type StageConfig = PhaseConfig

/** `sales.config_entry` rows of a LADDER list, keyed by the slug the rest of
 *  `sales` stores — THE ONE PLACE on this side that pairing is made.
 *
 *  ------------------------------------------------------------------
 *  THE TWO SIDES DO NOT SHARE A KEY, SO THE JOIN IS BY POSITION
 *  ------------------------------------------------------------------
 *  `opportunity.stage` holds a key ('tim-hieu'), `lead.tier` holds one
 *  ('dau-moi'); `config_entry` holds a display label and an id of its own
 *  ('ST-01'). No column carries both, so there is no join on a key to
 *  write. The only join that holds is ORDINAL POSITION, and it holds because
 *  somebody made it hold: `seed.ts` writes both lists straight from the fixture
 *  arrays with `ord` starting at 1, and `StageKey.options` / `LeadTier.options`
 *  keep that same order.
 *
 *  Joining by position is the quietest thing in this repo to break, so it lives
 *  in exactly one function, with a fence: a count that does not match means the
 *  labels are dropped and the key is printed instead. A rung reading 'tim-hieu'
 *  is ugly and TRUE; a rung pairing one phase's name with another phase's limit
 *  is pretty and lying, and nobody would catch it.
 *
 *  Same discipline, same reason as `exitReasonRows` and `ladderRows` in
 *  `apps/web/src/data/sales-config.ts`. The way out is the same too: the day
 *  `config_entry` carries the slug, this collapses into one lookup.
 *
 *  Moved up here from `opportunity/stage-config.ts` on 14/09, when `TIER`
 *  became a ladder too (`0038`) and the lead profile started asking the same
 *  question. Two copies of a fence are two chances for the later one to be the
 *  one nobody remembered to fence.
 *
 *  `rows` must arrive ACTIVE ONLY and ordered by `ord` — a disabled rung still
 *  occupying a slot would shift every phase after it. */
export function ladderConfigOf<K extends string>(
  rows: { name: string; limitDays: number | null }[],
  keys: readonly K[],
): Map<K, PhaseConfig> {
  const aligned = rows.length === keys.length

  return new Map(
    keys.map((key, i) => {
      const row = aligned ? rows[i] : undefined
      return [key, { label: row?.name ?? key, limitDays: row?.limitDays ?? null }]
    }),
  )
}

export const stageConfigOf = (rows: { name: string; limitDays: number | null }[]) =>
  ladderConfigOf(rows, StageKey.options)

/** The ladder as `pipelinePosition` wants it: every rung in order, each with
 *  the clock configured for it — or `null` where nobody has set one, which is
 *  every `TIER` rung today (§8.5).
 *
 *  Built from the same map the labels come from, so a screen printing a phase
 *  name and an engine judging its deadline cannot be looking at two different
 *  readings of the list. */
export function phasesOf<K extends string>(
  config: Map<K, PhaseConfig>,
  keys: readonly K[],
): PhaseSpec[] {
  return keys.map((key) => ({ key, limitDays: config.get(key)?.limitDays ?? null }))
}

export const tierConfigOf = (rows: { name: string; limitDays: number | null }[]) =>
  ladderConfigOf(rows, LeadTier.options)
