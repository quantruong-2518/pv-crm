import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import type { RoleId } from '@pv/engines'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STOP_REASON_OTHER,
  StageKey,
  type OpportunityMilestoneKind,
  type OpportunityStopBody,
  type TouchKind,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { configEntry } from '../config/config.schema'
import { dropStep } from '../next-step/next-step.handover'
import { TouchService } from '../touch/touch.service'
import { NOTE, stageEventOf, toRef, type RefOwner } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'
import { opportunity, type OpportunityRowDb } from './opportunity.schema'

/** EVERY MOVE A DEAL MAKES BEFORE A CONTRACT EXISTS (ADR 0064, 0069).
 *
 *  Three facts move a deal here and nothing else does: the PIC set filled up
 *  (`new` → `assigned`), a milestone was recorded (`sample`/`poc`/`quotation`),
 *  or it was stopped — final, there is no way back. Saving the form moves
 *  nothing — that is what `OpportunityEdit` leaves out of its columns.
 *
 *  The ONE other writer is the sign flow (`closeForSign` in
 *  `opportunity.mapper.ts`), which owns the one-way trip off the board. They
 *  cannot race: signing needs a quotation, a milestone only this class
 *  records, and a signed deal is refused by every move here for good.
 *
 *  Every move is ONE conditional UPDATE naming the column it may leave, so it
 *  is forward-only without a second lock, and carries `stage_since`, a timeline
 *  row, a funnel row and the mirror row at once. Callers pass their own `tx`. */

/** "Head of sales" is a ROLE, not a column on `opportunity_owner` — ADR 0064 §4
 *  refuses to add one, so the rank comes from `platform.actor.role_id`. */
const HEAD_OF_SALES: RoleId = 'head-of-sales'

/** The five columns as an ORDER. Every rule below is a comparison ("below the
 *  current column", "at `assigned` or past it"), so a rank reads better than a
 *  scan of `StageKey.options` at each call. */
const RANK: Record<StageKey, number> = { new: 0, assigned: 1, sample: 2, poc: 3, quotation: 4 }

/** Which column a milestone puts the deal in, and which timeline kind records
 *  it. Two maps rather than one clever mapping: stage keys and touch kinds are
 *  two vocabularies that happen to line up today, and the day one is renamed
 *  the other must not follow silently. */
const MILESTONE_STAGE: Record<OpportunityMilestoneKind, StageKey> = {
  sample: 'sample',
  poc: 'poc',
  quotation: 'quotation',
}

const MILESTONE_TOUCH: Record<OpportunityMilestoneKind, TouchKind> = {
  sample: 'sample-sent',
  poc: 'poc-run',
  quotation: 'quotation-sent',
}

/** The PIC set of a deal — `saleOwners ∪ bdOwners`, counted BY PERSON. One
 *  person carrying both labels is one PIC, which is why this is a set of ids
 *  and not a row count of the join table. */
export type PicSet = { people: number; heads: number }

export function picOf(ids: readonly string[], roles: ReadonlyMap<string, RoleId>): PicSet {
  const people = new Set(ids)
  let heads = 0
  for (const id of people) if (roles.get(id) === HEAD_OF_SALES) heads += 1
  return { people: people.size, heads }
}

/** A PIC set reaches `assigned` when a head of sales stands on the deal beside
 *  at least one other person (ADR 0064 §3). */
export const picQualifies = (pic: PicSet): boolean => pic.heads > 0 && pic.people > 1

/** Why an owners write is refused, or `null` when it may go through.
 *
 *  Only a write that makes things WORSE is refused. A deal already standing
 *  under two PIC predates the rule and stays editable (ADR 0064 §4) — refusing
 *  it would freeze every row the migration left behind, including its name and
 *  its money.
 *
 *  The rank comes from `stage ?? stopped_at_stage`, not from `stage` alone: a
 *  lost deal has no column, and its fail log must keep reading as the PIC set
 *  that stood on it. */
export function picRefusal(
  before: PicSet,
  after: PicSet,
  at: Pick<OpportunityRowDb, 'stage' | 'stoppedAtStage'>,
): string | null {
  if (after.people < 2 && after.people < before.people) {
    return 'Cơ hội phải có ít nhất 2 người phụ trách — thêm người mới trước khi bớt người cũ.'
  }
  const reached = at.stage ?? at.stoppedAtStage
  if (reached !== null && RANK[reached] >= RANK.assigned && after.heads === 0 && before.heads > 0) {
    return 'Cơ hội đã nhận PIC thì phải còn một trưởng phòng đứng đơn — không gỡ người cuối cùng được.'
  }
  return null
}

/** A stored deal plus the two facts every move needs beside its columns: the
 *  owner the mirror row names, and whether a contract already exists. Both are
 *  already in the door's hand (`OpportunityRead`), so no move re-reads them. */
export type DealAt = {
  row: OpportunityRowDb
  owner: RefOwner | null
  signed: boolean
  /** A `contract-sign` request is waiting on this deal. Read under the same
   *  row lock a move takes, so the answer is the approval the apply step will
   *  actually see — not one a screen was looking at a moment earlier. */
  pendingSign: boolean
}

/** A read deal → what a move needs. The mirror row names the deal's holder
 *  (`holderOf`, ADR 0069 §10), as every door that writes it does. */
export const dealAtOf = (
  found: { row: OpportunityRowDb; holder: RefOwner | null; signed: boolean },
  pendingSign: boolean,
): DealAt => ({ row: found.row, owner: found.holder, signed: found.signed, pendingSign })

type By = { id: string; name: string }

@Injectable()
export class OpportunityLifecycle {
  constructor(
    private readonly repo: OpportunityRepository,
    private readonly mirror: ObjectMirror,
    private readonly touch: TouchService,
  ) {}

  /** `new` → `assigned`, the moment the PIC set qualifies. Idempotent by its
   *  WHERE: a deal already past `new` matches nothing, and `null` comes back so
   *  the caller keeps the row it already had. */
  async assigned(tx: Db, deal: DealAt, by: By, at: Date): Promise<OpportunityRowDb | null> {
    const [written] = await tx
      .update(opportunity)
      .set({ stage: 'assigned', stageSince: at })
      .where(
        and(
          eq(opportunity.code, deal.row.code),
          eq(opportunity.state, 'open'),
          eq(opportunity.stage, 'new'),
        ),
      )
      .returning()
    if (!written) return null

    const note = NOTE.moved('new', 'assigned')
    await this.after(tx, deal, written, by, {
      at,
      from: 'new',
      kind: 'stage-changed',
      note,
    })
    return written
  }

  /** A milestone was recorded — `POST /:code/milestones`.
   *
   *  Guards in the order a person hits them: a signed deal, a lost deal, a deal
   *  that has not taken its PIC yet, then a milestone BELOW where
   *  the deal already stands. Re-recording the column it is standing in is
   *  allowed and writes only the timeline row: a second quotation is another
   *  round of the same column, not a second entry into it, so the rot clock
   *  must not be pushed back by it. */
  async milestone(
    tx: Db,
    deal: DealAt,
    kind: OpportunityMilestoneKind,
    by: By,
    opts: { at: Date; note?: string | undefined },
  ): Promise<OpportunityRowDb> {
    const code = deal.row.code
    const to = MILESTONE_STAGE[kind]
    const from = this.onBoard(deal, 'ghi mốc')
    if (RANK[from] < RANK.assigned) {
      throw conflict(
        `Cơ hội ${code} chưa đủ PIC nên chưa ghi mốc được — thêm trưởng phòng và một người nữa trước.`,
      )
    }
    if (RANK[from] > RANK[to]) {
      throw conflict(
        `Cơ hội ${code} đã ở "${OPPORTUNITY_STAGE_LABEL[from]}" — không ghi lùi về "${OPPORTUNITY_STAGE_LABEL[to]}".`,
      )
    }

    const note = NOTE.milestone(kind, opts.note)
    if (from === to) {
      await this.record(tx, code, MILESTONE_TOUCH[kind], by, note, opts.at)
      return deal.row
    }

    const [written] = await tx
      .update(opportunity)
      .set({ stage: to, stageSince: opts.at })
      .where(
        and(
          eq(opportunity.code, code),
          eq(opportunity.state, 'open'),
          inArray(opportunity.stage, StageKey.options.filter(between(RANK.assigned, RANK[to]))),
        ),
      )
      .returning()
    if (!written) throw raced(code)

    await this.after(tx, deal, written, by, {
      at: opts.at,
      from,
      kind: MILESTONE_TOUCH[kind],
      note,
    })
    return written
  }

  /** Stopped for good — `POST /:code/stop` (ADR 0069 §1). The deal leaves the
   *  board: stage and its clock go to NULL, `closed_at` is stamped, and the fail
   *  log (column, reason, note) lands on the row; who concluded it is the stage
   *  event's `by_id`. Its open next step goes with it (§10). */
  async stop(
    tx: Db,
    deal: DealAt,
    by: By,
    body: OpportunityStopBody,
    at: Date,
  ): Promise<OpportunityRowDb> {
    const code = deal.row.code
    const from = this.onBoard(deal, 'dừng')
    await this.assertReason(tx, body.reasonKey, from)

    const [written] = await tx
      .update(opportunity)
      .set({
        state: 'lost',
        stage: null,
        stageSince: null,
        closedAt: at,
        stoppedAtStage: from,
        stopReason: body.reasonKey,
        stopNote: body.note ?? null,
      })
      .where(and(eq(opportunity.code, code), eq(opportunity.state, 'open')))
      .returning()
    if (!written) throw raced(code)

    await this.after(tx, deal, written, by, {
      at,
      from,
      kind: 'exited',
      note: NOTE.stopped(body.reasonKey, body.note),
    })
    await dropStep(tx, code)
    return written
  }

  /** The reason has to name a live row of the `LOSS_REASON` catalogue, scoped
   *  either to every column (`stage IS NULL`) or to the one being left — the
   *  reason a deal is parked at `new` is not the reason it is parked after a
   *  quotation. Keyed by `config_entry.id`, the same real key `PRODUCT` uses.
   *
   *  `other` is the one key with no row: it is a VIRTUAL value the seed
   *  deliberately leaves out, so five per-stage catch-alls never collide on
   *  `config_name_live`. Read on the move's own `tx`, so the catalogue judged is
   *  the one the UPDATE two statements later writes against. */
  private async assertReason(tx: Db, reasonKey: string, from: StageKey): Promise<void> {
    if (reasonKey === OPPORTUNITY_STOP_REASON_OTHER) return

    const [found] = await tx
      .select({ id: configEntry.id })
      .from(configEntry)
      .where(
        and(
          eq(configEntry.list, 'LOSS_REASON'),
          eq(configEntry.id, reasonKey),
          eq(configEntry.active, true),
          or(isNull(configEntry.stage), eq(configEntry.stage, from)),
        ),
      )
      .limit(1)

    if (!found) {
      throw conflict(
        `Lý do không có trong danh mục của cột "${OPPORTUNITY_STAGE_LABEL[from]}" — chọn lại lý do.`,
      )
    }
  }

  /** The column a deal is standing in, or the refusal for one that has left the
   *  board. Won and lost deals both read `stage IS NULL`, and they get two
   *  different sentences because they lead to two different next actions. */
  private onBoard(deal: DealAt, action: string): StageKey {
    const code = deal.row.code
    if (deal.signed) throw conflict(`Cơ hội ${code} đã ký hợp đồng — không ${action} được nữa.`)
    if (deal.pendingSign) {
      throw conflict(`Cơ hội ${code} đang chờ duyệt ký — không ${action} được lúc này.`)
    }
    if (deal.row.state === 'lost') {
      throw conflict(
        `Cơ hội ${code} đã dừng — không ${action} được nữa. Muốn chăm lại thì đi từ lead.`,
      )
    }
    if (deal.row.stage === null) {
      throw conflict(`Cơ hội ${code} đã ra khỏi bảng nên không ${action} được.`)
    }
    return deal.row.stage
  }

  /** The three rows every move owes beside the deal: the funnel row, the
   *  timeline row and the mirror row. One place, so no move can write two of
   *  the three — the failure that leaves a ContextRail printing the old column
   *  with nothing red to show for it. */
  private async after(
    tx: Db,
    deal: DealAt,
    written: OpportunityRowDb,
    by: By,
    step: { at: Date; from: StageKey | null; kind: TouchKind; note: string },
  ): Promise<void> {
    await this.repo.insertStageEvent(
      tx,
      stageEventOf({
        code: written.code,
        from: step.from,
        to: written.stage,
        stageSince: deal.row.stageSince,
        at: step.at,
        by,
        note: step.note,
      }),
    )
    await this.record(tx, written.code, step.kind, by, step.note, step.at)
    await this.mirror.put(tx, toRef(written, deal.owner))
  }

  private async record(
    tx: Db,
    code: string,
    kind: TouchKind,
    by: By,
    note: string,
    at: Date,
  ): Promise<void> {
    await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'opportunity',
        kind,
        by: by.name,
        actorId: by.id,
        note,
        at,
      },
    ])
  }
}

/** The stages a forward-only move may LEAVE: at `assigned` or past it, and
 *  strictly below where it is going. */
const between =
  (floor: number, ceiling: number) =>
  (stage: StageKey): boolean =>
    RANK[stage] >= floor && RANK[stage] < ceiling

/** Nobody saw this row while it moved: the WHERE named the column the deal was
 *  standing in one statement ago, and it is not standing there any more. */
const raced = (code: string) =>
  conflict(`Cơ hội ${code} vừa được ai đó chuyển cột — tải lại rồi thử lại.`)
