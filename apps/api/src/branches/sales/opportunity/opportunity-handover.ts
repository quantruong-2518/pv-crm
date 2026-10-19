import { and, arrayContains, eq, exists, inArray, isNull, sql } from 'drizzle-orm'
import type { RoleId } from '@pv/engines'
import type { TouchHolder } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import type { ObjectMirror } from '@api/platform/graph/object-mirror'
import { invalid } from '@api/platform/http/problem'
import { nextStep } from '../next-step/next-step.schema'
import { dealOpen, dealSignWaiting } from '../open-deal'
import type { TouchService } from '../touch/touch.service'
import { acceptorOf, holderOf, NOTE, toRef } from './opportunity.mapper'
import { primaryOf, salePrimaryOf } from './opportunity-owners'
import { ACCEPTOR_NAME } from './opportunity.repository'
import { opportunity, opportunityOwner } from './opportunity.schema'

/** What a lead hand-over does to that lead's deals (ADR 0069 §10), inside the
 *  hand-over's own transaction.
 *
 *  Every OPEN deal where the old holder stands as SALE follows the lead: that
 *  SALE row is replaced by the new holder, the old holder's next step on it is
 *  handed over too, and the deal's timeline and mirror row say so. With
 *  `dealCodes` only those follow (`[]` = none); a code that is not such a deal
 *  is a 400 on `dealCodes`. A chosen deal is left behind — with a timeline row
 *  saying why — when a sign request waits on it (the approver read those
 *  owners). A target who cannot hold a deal refuses the whole hand-over.
 *  A plain function over `tx`: the lead module calls it, and an
 *  `OpportunityModule` provider there would be a module cycle. The deals are
 *  locked AFTER the lead — the order the stop door takes. It rings nothing:
 *  the lead's own line counts the deals that moved. `handDealsOverMany` is the
 *  same act for many leads (a leaver's), one statement per step. */

export type Person = {
  code: string
  id: string
  name: string
  role: 'SALE' | 'BD'
  primary: boolean
  roleIds: RoleId[]
}

type HandMove = {
  from: TouchHolder
  to: TouchHolder
  /** The target passes `opportunity.view` through E2 — asked by the caller
   *  before the tx, since the actor book reads on the pool. */
  toSeesDeals: boolean
  by: { by: string; actorId?: string }
  note: string
  /** The user's choice; absent = every eligible deal. */
  dealCodes?: readonly string[]
}

export function handDealsOver(
  tx: Db,
  deps: { mirror: ObjectMirror; touch: TouchService },
  { leadCode, ...move }: HandMove & { leadCode: string },
): Promise<{ moved: string[] }> {
  return handDealsOverMany(tx, deps, { ...move, leadCodes: [leadCode] })
}

export async function handDealsOverMany(
  tx: Db,
  deps: { mirror: ObjectMirror; touch: TouchService },
  move: HandMove & { leadCodes: readonly string[] },
): Promise<{ moved: string[] }> {
  if (move.leadCodes.length === 0) return { moved: [] }
  const rows = await tx
    .select({
      row: opportunity,
      signWaiting: sql<boolean>`${dealSignWaiting(opportunity.code)}`,
      acceptorName: ACCEPTOR_NAME,
    })
    .from(opportunity)
    .where(
      and(
        inArray(opportunity.leadCode, [...move.leadCodes]),
        dealOpen(opportunity.code, opportunity.state),
        exists(
          tx
            .select({ one: sql`1` })
            .from(opportunityOwner)
            .where(
              and(
                eq(opportunityOwner.opportunityCode, opportunity.code),
                eq(opportunityOwner.actorId, move.from.actorId),
                eq(opportunityOwner.role, 'SALE'),
              ),
            ),
        ),
      ),
    )
    .orderBy(opportunity.leadCode, opportunity.code)
    .for('update')
  const strays = (move.dealCodes ?? []).filter((c) => !rows.some((r) => r.row.code === c))
  if (strays.length > 0) {
    throw invalid(
      {
        dealCodes: [
          `${strays.join(', ')} không phải cơ hội đang mở của lead này do người giao đứng tên Sale.`,
        ],
      },
      'Cơ hội chọn không hợp lệ.',
    )
  }
  const chosen = move.dealCodes ? rows.filter((r) => move.dealCodes?.includes(r.row.code)) : rows
  if (chosen.length === 0) return { moved: [] }
  if (!move.toSeesDeals || !(await isLiveSalesActor(tx, move.to.actorId))) {
    throw invalid(
      {
        ownerId: [
          `${move.to.name} không nhận được cơ hội của lead này. Cần nhân sự Sales đang hoạt động và xem được cơ hội.`,
        ],
      },
      'Người nhận không giữ được cơ hội.',
    )
  }

  const skipped = new Map<string, string>()
  for (const { row, signWaiting } of chosen) {
    if (signWaiting) skipped.set(row.code, 'cơ hội đang chờ duyệt ký')
  }
  const moving = chosen.filter((r) => !skipped.has(r.row.code))
  await swapSale(
    tx,
    moving.map((r) => r.row.code),
    move,
  )

  const after = groupByCode(
    await peopleOf(
      tx,
      moving.map((r) => r.row.code),
    ),
  )
  /* The mirror row names the holder AFTER the swap — `holderOf`, not the new
     holder blindly: a deal may keep another Sale ahead of them. */
  await deps.mirror.putMany(
    tx,
    moving.map(({ row, acceptorName }) =>
      toRef(row, holderOf(after.get(row.code) ?? [], acceptorOf(row, acceptorName))),
    ),
  )
  await deps.touch.record(tx, [
    ...moving.map(({ row }) => ({
      subjectCode: row.code,
      subjectKind: 'opportunity' as const,
      kind: 'handed-over' as const,
      ...move.by,
      from: move.from,
      to: move.to,
      note: move.note,
    })),
    /* No hand-over happened on these, so no `handed-over` row: its two ends
       would draw a step the deal never took. */
    ...[...skipped].map(([code, why]) => ({
      subjectCode: code,
      subjectKind: 'opportunity' as const,
      kind: 'field-filled' as const,
      ...move.by,
      note: NOTE.handOverSkipped(move.to.name, why),
    })),
  ])
  return { moved: moving.map((r) => r.row.code) }
}

async function swapSale(
  tx: Db,
  codes: readonly string[],
  move: { from: TouchHolder; to: TouchHolder },
): Promise<void> {
  if (codes.length === 0) return
  const gone = await tx
    .delete(opportunityOwner)
    .where(
      and(
        inArray(opportunityOwner.opportunityCode, [...codes]),
        eq(opportunityOwner.actorId, move.from.actorId),
        eq(opportunityOwner.role, 'SALE'),
      ),
    )
    .returning({ code: opportunityOwner.opportunityCode, primary: opportunityOwner.isPrimary })
  const wasPrimary = new Set(gone.filter((r) => r.primary).map((r) => r.code))
  /* The new holder may already stand on the deal as SALE: one row, not two. */
  await tx
    .insert(opportunityOwner)
    .values(
      codes.map((code) => ({
        opportunityCode: code,
        actorId: move.to.actorId,
        role: 'SALE' as const,
      })),
    )
    .onConflictDoNothing()
  /* The taker inherits the giver's primary seat when fit for it, and a lane
     left without a primary gets one — `salePrimaryOf` judges both. Clear, then
     set: the one-primary index is checked per row. */
  const after = groupByCode(await peopleOf(tx, codes))
  const fixes = codes.flatMap((code) => {
    const lane = (after.get(code) ?? []).filter((p) => p.role === 'SALE')
    const stored = primaryOf(lane)
    const next = salePrimaryOf(lane, wasPrimary.has(code) ? move.to.actorId : stored)
    return next === stored || next === null ? [] : [{ code, next }]
  })
  if (fixes.length > 0) {
    await tx
      .update(opportunityOwner)
      .set({ isPrimary: false })
      .where(
        inArray(
          opportunityOwner.opportunityCode,
          fixes.map((f) => f.code),
        ),
      )
    await tx.execute(sql`
      UPDATE ${opportunityOwner} SET "is_primary" = true
        FROM (VALUES ${sql.join(
          fixes.map((f) => sql`(${f.code}, ${f.next})`),
          sql`, `,
        )}) AS fix("code", "actor_id")
       WHERE ${opportunityOwner.opportunityCode} = fix."code"
         AND ${opportunityOwner.actorId} = fix."actor_id"
         AND ${opportunityOwner.role} = 'SALE'`)
  }
  /* Same rule as `handStepOver`, one UPDATE for every deal. */
  await tx
    .update(nextStep)
    .set({ doerId: move.to.actorId, updatedAt: sql`now()` })
    .where(and(inArray(nextStep.subjectCode, [...codes]), eq(nextStep.doerId, move.from.actorId)))
}

const groupByCode = (people: readonly Person[]): Map<string, Person[]> => {
  const byCode = new Map<string, Person[]>()
  for (const p of people) {
    const lane = byCode.get(p.code)
    if (lane) lane.push(p)
    else byCode.set(p.code, [p])
  }
  return byCode
}

export async function peopleOf(tx: Db, codes: readonly string[]): Promise<Person[]> {
  if (codes.length === 0) return []
  return tx
    .select({
      code: opportunityOwner.opportunityCode,
      id: opportunityOwner.actorId,
      name: actor.name,
      role: opportunityOwner.role,
      primary: opportunityOwner.isPrimary,
      roleIds: actor.roleIds,
    })
    .from(opportunityOwner)
    .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
    .where(inArray(opportunityOwner.opportunityCode, [...codes]))
}

/** Active and on the Sales branch — the next-step doer's rule
 *  (`NextStepRepository.isLiveSalesActor`), asked on the hand-over's `tx`. */
async function isLiveSalesActor(tx: Db, id: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: actor.id })
    .from(actor)
    .where(
      and(eq(actor.id, id), isNull(actor.disabledAt), arrayContains(actor.branches, ['Sales'])),
    )
    .limit(1)
  return row !== undefined
}
