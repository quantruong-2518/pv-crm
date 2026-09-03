import { StageKey } from '@pv/contracts'

/** What the configuration says about one column of the board. */
export type StageConfig = { label: string; limitDays: number | null }

/** `sales.config_entry` rows of the STAGE list, keyed by stage — THE ONE PLACE
 *  that pairing is made.
 *
 *  ------------------------------------------------------------------
 *  THE TWO SIDES DO NOT SHARE A KEY, SO THE JOIN IS BY POSITION
 *  ------------------------------------------------------------------
 *  `opportunity.stage` holds a key ('tim-hieu'); `config_entry` holds a label
 *  ('Dang tim hieu') and an id of its own ('ST-01'). No column carries both, so
 *  there is no join on a key to write. The only join that holds is ORDINAL
 *  POSITION, and it holds because somebody made it hold: `seed.ts` writes the
 *  STAGE list straight from `PIPELINE_STAGES` with `ord` starting at 1, and
 *  `StageKey.options` keeps that same order.
 *
 *  Joining by position is the quietest thing in this repo to break, so it lives
 *  in exactly one function, with a fence: a count that does not match means the
 *  labels are dropped and the key is printed instead. A column reading
 *  'tim-hieu' is ugly and TRUE; a column pairing one stage's name with another
 *  stage's limit is pretty and lying, and nobody would catch it.
 *
 *  Same discipline, same reason as `exitReasonRows` in
 *  `apps/web/src/data/sales-config.ts`. The way out is the same too: the day
 *  `config_entry` carries the stage key, this collapses into one lookup.
 *
 *  `rows` must arrive ACTIVE ONLY and ordered by `ord` — a disabled column
 *  still occupying a slot would shift every stage after it. */
export function stageConfigOf(
  rows: { name: string; limitDays: number | null }[],
): Map<StageKey, StageConfig> {
  const aligned = rows.length === StageKey.options.length

  return new Map(
    StageKey.options.map((key, i) => {
      const row = aligned ? rows[i] : undefined
      return [key, { label: row?.name ?? key, limitDays: row?.limitDays ?? null }]
    }),
  )
}
