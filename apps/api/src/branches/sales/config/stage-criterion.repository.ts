import { eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { StageKey } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { stageCriterion, type StageCriterionRowDb } from './stage-criterion.schema'

/** What an approved create writes. `id` and `ord` are absent for the reason
 *  `ConfigDraft` gives: they are minted at apply time, not at proposal time. */
export type StageCriterionDraft = { stage: StageKey; label: string }

/** Absent = untouched. Both fields are plain values, never `null`. */
export type StageCriterionPatchDb = { label?: string; active?: boolean }

/** Own advisory lock space, next to `config.repository.ts`'s 61_001. One key
 *  for the whole table: the `SC-NN` sequence is table-wide, not per stage. */
const LOCK_SPACE = 61_002

/** The only SQL for `sales.stage_criterion`. Decides nothing. */
@Injectable()
export class StageCriterionRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every row, inactive included, in ladder order then `ord`. Sorted here by
   *  `StageKey.options` rather than by the text column, which would sort
   *  'awaiting-signature' first. */
  async all(db: Db = this.db): Promise<StageCriterionRowDb[]> {
    const order = StageKey.options
    const rows = await db.select().from(stageCriterion).orderBy(stageCriterion.ord)
    return rows.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage))
  }

  /** Mint `SC-NN` from the highest number ever used and `ord` from the stage's
   *  highest, under a transaction-scoped lock — the same race and the same
   *  answer as `SalesConfigRepository.create`. */
  async create(tx: Db, draft: StageCriterionDraft): Promise<StageCriterionRowDb> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(CAST(${LOCK_SPACE} AS int), 0)`)

    const [top] = await tx
      .select({
        seq: sql<number | null>`max(CAST(split_part(${stageCriterion.id}, '-', 2) AS int))`,
        ord: sql<
          number | null
        >`max(${stageCriterion.ord}) FILTER (WHERE ${stageCriterion.stage} = ${draft.stage})`,
      })
      .from(stageCriterion)

    const [row] = await tx
      .insert(stageCriterion)
      .values({
        id: `SC-${String(Number(top?.seq ?? 0) + 1).padStart(2, '0')}`,
        stage: draft.stage,
        label: draft.label,
        ord: Number(top?.ord ?? 0) + 1,
      })
      .returning()

    if (!row) throw new Error('stage_criterion: INSERT returned no row')
    return row
  }

  /** `null` when the id does not resolve. */
  async patch(
    tx: Db,
    id: string,
    patch: StageCriterionPatchDb,
  ): Promise<StageCriterionRowDb | null> {
    const set: StageCriterionPatchDb = {}
    if (patch.label !== undefined) set.label = patch.label
    if (patch.active !== undefined) set.active = patch.active

    const [row] = await tx
      .update(stageCriterion)
      .set(set)
      .where(eq(stageCriterion.id, id))
      .returning()
    return row ?? null
  }
}
