import { and, asc, eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { StateAddress, StateRule, StepTemplatePatch } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { configEntry } from './config.schema'
import {
  stateRule,
  stepTemplate,
  type StateRuleRowDb,
  type StepTemplateRowDb,
} from './step-frame.schema'

/** What a new template is made of. No `id`, `ord` or `active`: the table and
 *  `create` make them at APPLY time, `ConfigDraft`'s reason — a pending
 *  proposal holding an `ord` would land with a stale one. */
export type StepTemplateDraft = {
  address: StateAddress
  name: string
  kindId: string
  dueDays?: number
}

const at = (a: StateAddress) =>
  and(eq(stepTemplate.objectKind, a.kind), eq(stepTemplate.stateKey, a.state))

/** `ord`, then age: `ord` is not unique, so two approvals landing together
 *  tie and the older row goes first. `id` only makes a same-instant tie stable. */
const IN_ORDER = [asc(stepTemplate.ord), asc(stepTemplate.createdAt), asc(stepTemplate.id)]

/** SQL of the journey frame (ADR 0080). Decides nothing.
 *
 *  Every read takes a handle: the apply step and the next-step doors ask from
 *  inside a transaction, and on PGlite's one connection a pool read there
 *  waits forever. */
@Injectable()
export class StepFrameRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every template, switched-off ones included — the config screen's read. */
  async all(): Promise<StepTemplateRowDb[]> {
    return this.db
      .select()
      .from(stepTemplate)
      .orderBy(asc(stepTemplate.objectKind), asc(stepTemplate.stateKey), ...IN_ORDER)
  }

  /** One state's templates, off ones included — the caller filters `active`. */
  async ofAddress(address: StateAddress, handle: Db = this.db): Promise<StepTemplateRowDb[]> {
    return handle
      .select()
      .from(stepTemplate)
      .where(at(address))
      .orderBy(...IN_ORDER)
  }

  async byId(id: string, handle: Db = this.db): Promise<StepTemplateRowDb | null> {
    const [row] = await handle.select().from(stepTemplate).where(eq(stepTemplate.id, id)).limit(1)
    return row ?? null
  }

  /** Only the states somebody has ruled on; a missing row is the default. */
  async rules(): Promise<StateRuleRowDb[]> {
    return this.db.select().from(stateRule)
  }

  async rule(address: StateAddress, handle: Db = this.db): Promise<StateRuleRowDb | null> {
    const [row] = await handle
      .select()
      .from(stateRule)
      .where(and(eq(stateRule.objectKind, address.kind), eq(stateRule.stateKey, address.state)))
      .limit(1)
    return row ?? null
  }

  /** The `STEP_KIND` list, off rows included — the caller judges `active`. */
  async stepKinds(handle: Db = this.db) {
    return handle
      .select({ id: configEntry.id, name: configEntry.name, active: configEntry.active })
      .from(configEntry)
      .where(eq(configEntry.list, 'STEP_KIND'))
  }

  // ── writes · the apply half of an approved proposal ──────────────────────

  /** Lands last in its state. No advisory lock, unlike `config_entry`: `ord`
   *  is not unique here, so a race costs a tie that `IN_ORDER` already breaks. */
  async create(tx: Db, draft: StepTemplateDraft): Promise<void> {
    const [top] = await tx
      .select({ ord: sql<number | null>`max(${stepTemplate.ord})` })
      .from(stepTemplate)
      .where(at(draft.address))
    await tx.insert(stepTemplate).values({
      objectKind: draft.address.kind,
      stateKey: draft.address.state,
      name: draft.name,
      kindId: draft.kindId,
      dueDays: draft.dueDays ?? null,
      /* `Number`: some drivers answer an aggregate as a string, and `+` would join. */
      ord: Number(top?.ord ?? 0) + 1,
    })
  }

  /** `false` = no such row. `undefined` keys are left alone by Drizzle, and
   *  `dueDays: null` is written — the contract's "clear it". */
  async patch(tx: Db, id: string, patch: StepTemplatePatch): Promise<boolean> {
    const rows = await tx
      .update(stepTemplate)
      .set({
        name: patch.name,
        kindId: patch.kindId,
        dueDays: patch.dueDays,
        active: patch.active,
      })
      .where(eq(stepTemplate.id, id))
      .returning({ id: stepTemplate.id })
    return rows.length > 0
  }

  /** One statement, `SalesConfigRepository.reorder`'s shape; the address rides
   *  in the WHERE so an id of another state is never renumbered. */
  async reorder(tx: Db, address: StateAddress, ids: readonly string[]): Promise<void> {
    const pairs = sql.join(
      ids.map((id, i) => sql`(CAST(${id} AS uuid), CAST(${i + 1} AS int))`),
      sql`, `,
    )
    await tx.execute(sql`
      UPDATE ${stepTemplate} AS t
         SET "ord" = v.ord
        FROM (VALUES ${pairs}) AS v(id, ord)
       WHERE t."id" = v.id AND t."object_kind" = ${address.kind} AND t."state_key" = ${address.state}
    `)
  }

  async putRule(tx: Db, rule: StateRule): Promise<void> {
    await tx
      .insert(stateRule)
      .values({
        objectKind: rule.address.kind,
        stateKey: rule.address.state,
        freeEntry: rule.freeEntry,
      })
      .onConflictDoUpdate({
        target: [stateRule.objectKind, stateRule.stateKey],
        set: { freeEntry: rule.freeEntry },
      })
  }
}
