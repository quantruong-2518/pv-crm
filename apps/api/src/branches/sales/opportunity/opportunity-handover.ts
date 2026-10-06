import { and, arrayContains, eq, exists, inArray, isNull, sql } from 'drizzle-orm'
import type { RoleId } from '@pv/engines'
import type { TouchHolder } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import type { ObjectMirror } from '@api/platform/graph/object-mirror'
import { invalid } from '@api/platform/http/problem'
import { handStepOver } from '../next-step/next-step.handover'
import { dealOpen, dealSignWaiting } from '../open-deal'
import type { TouchService } from '../touch/touch.service'
import { acceptorOf, holderOf, NOTE, toRef } from './opportunity.mapper'
import { ACCEPTOR_NAME } from './opportunity.repository'
import { opportunity, opportunityOwner, type OpportunityRowDb } from './opportunity.schema'

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
 *
 *  A plain function over `tx`: the lead module calls it, and an
 *  `OpportunityModule` provider there would be a module cycle. The deals are
 *  locked AFTER the lead — the order the stop door takes. */

type Person = { code: string; id: string; name: string; role: 'SALE' | 'BD'; roleIds: RoleId[] }

export async function handDealsOver(
  tx: Db,
  deps: { mirror: ObjectMirror; touch: TouchService },
  move: {
    leadCode: string
    from: TouchHolder
    to: TouchHolder
    /** The target passes `opportunity.view` through E2 — asked by the caller
     *  before the tx, since the actor book reads on the pool. */
    toSeesDeals: boolean
    by: { by: string; actorId?: string }
    note: string
    /** The user's choice; absent = every eligible deal. */
    dealCodes?: readonly string[]
  },
): Promise<void> {
  const rows = await tx
    .select({
      row: opportunity,
      signWaiting: sql<boolean>`${dealSignWaiting(opportunity.code)}`,
      acceptorName: ACCEPTOR_NAME,
    })
    .from(opportunity)
    .where(
      and(
        eq(opportunity.leadCode, move.leadCode),
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
    .orderBy(opportunity.code)
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
  if (chosen.length === 0) return
  if (!move.toSeesDeals || !(await isLiveSalesActor(tx, move.to.actorId))) {
    throw invalid(
      {
        ownerId: [
          `${move.to.name} không giữ được cơ hội của lead này — cần nhân sự Sales đang hoạt động, xem được cơ hội.`,
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
    moving.map((r) => r.row),
    move,
  )

  const after = await peopleOf(
    tx,
    moving.map((r) => r.row.code),
  )
  /* The mirror row names the holder AFTER the swap — `holderOf`, not the new
     holder blindly: a deal may keep another Sale ahead of them. */
  await deps.mirror.putMany(
    tx,
    moving.map(({ row, acceptorName }) =>
      toRef(
        row,
        holderOf(
          after.filter((p) => p.code === row.code),
          acceptorOf(row, acceptorName),
        ),
      ),
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
}

async function swapSale(
  tx: Db,
  deals: readonly OpportunityRowDb[],
  move: { from: TouchHolder; to: TouchHolder },
): Promise<void> {
  if (deals.length === 0) return
  const codes = deals.map((r) => r.code)
  await tx
    .delete(opportunityOwner)
    .where(
      and(
        inArray(opportunityOwner.opportunityCode, codes),
        eq(opportunityOwner.actorId, move.from.actorId),
        eq(opportunityOwner.role, 'SALE'),
      ),
    )
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
  for (const code of codes) await handStepOver(tx, code, move.from.actorId, move.to.actorId)
}

async function peopleOf(tx: Db, codes: readonly string[]): Promise<Person[]> {
  if (codes.length === 0) return []
  return tx
    .select({
      code: opportunityOwner.opportunityCode,
      id: opportunityOwner.actorId,
      name: actor.name,
      role: opportunityOwner.role,
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
