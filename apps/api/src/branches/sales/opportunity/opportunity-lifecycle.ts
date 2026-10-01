import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { Injectable } from '@nestjs/common'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STOP_REASON_OTHER,
  StageKey,
  type CareActivityKind,
  type OpportunityMilestoneKind,
  type OpportunityStopBody,
  type TouchKind,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { configEntry } from '../config/config.schema'
import { dropStep } from '../next-step/next-step.handover'
import { TouchService } from '../touch/touch.service'
import { MILESTONE_TOUCH, NOTE, stageEventOf, toRef, type RefOwner } from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'
import { opportunity, opportunityStageEvent, type OpportunityRowDb } from './opportunity.schema'

/** EVERY MOVE A DEAL MAKES BEFORE A CONTRACT EXISTS (ADR 0064, 0069).
 *
 *  Four facts move a deal here and nothing else does: a head accepted it
 *  (`new` → `assigned`, ADR 0071), its first care activity was recorded
 *  (`assigned` → `engaged`, ADR 0072), a quotation was recorded, or it was
 *  stopped — final, there is no way back. Saving the form moves nothing.
 *
 *  The ONE other writer is the sign flow (`closeForSign` in
 *  `opportunity.mapper.ts`), which owns the one-way trip off the board. They
 *  cannot race: signing needs a quotation, a milestone only this class
 *  records, and a signed deal is refused by every move here for good.
 *
 *  Every move is ONE conditional UPDATE naming the column it may leave, so it
 *  is forward-only without a second lock, and carries `stage_since`, a timeline
 *  row, a funnel row and the mirror row at once. Callers pass their own `tx`. */

/** The four columns as an ORDER. Every rule below is a comparison ("at
 *  `assigned` or past it"), so a rank reads better than a scan of
 *  `StageKey.options` at each call. */
const RANK: Record<StageKey, number> = { new: 0, assigned: 1, engaged: 2, quotation: 3 }

/** Vietnam calendar day, `YYYY-MM-DD` — the unit a back-dated pick is judged in. */
const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
/** The same day as the refusal prints it. */
const VN_DAY_SHOWN = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })

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
 *  (`holderOf`, ADR 0071 §5), as every door that writes it does. */
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

  /** `new` → `assigned`: `by` accepted the deal (ADR 0071 §3). The acceptor is
   *  written in the SAME UPDATE as the stage — `opportunity_accepted_pair` wants
   *  name and moment together, and a stage without its acceptor would be a move
   *  nobody did. Forward-only by its WHERE: a deal already past `new` matches
   *  nothing and `null` comes back, so the caller decides what to answer. */
  async assigned(tx: Db, deal: DealAt, by: By, at: Date): Promise<OpportunityRowDb | null> {
    const [written] = await tx
      .update(opportunity)
      .set({ stage: 'assigned', stageSince: at, acceptedById: by.id, acceptedAt: at })
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

  /** A milestone was recorded — `POST /:code/milestones` (ADR 0072). Guards in
   *  the order a person hits them: signed, pending sign, lost, not accepted
   *  yet, then the date. `at` defaults to now and is the moment every row
   *  written here carries. */
  async milestone(
    tx: Db,
    deal: DealAt,
    kind: OpportunityMilestoneKind,
    by: By,
    opts: { at?: Date | undefined; note?: string | undefined },
  ): Promise<OpportunityRowDb> {
    const from = this.onBoard(deal, 'ghi hoạt động hay báo giá')
    const now = new Date()
    const step = { asked: opts.at, now, note: NOTE.milestone(kind, opts.note) }
    return kind === 'quotation'
      ? this.quotation(tx, deal, from, by, step)
      : this.activity(tx, deal, from, kind, by, step)
  }

  /** A care activity: repeatable, in any order, never at `new`. Only the first
   *  one on a deal standing at `assigned` moves it — to `engaged`, with the
   *  activity's own moment as the column's clock. Anywhere else it is a
   *  timeline row and nothing more. */
  private async activity(
    tx: Db,
    deal: DealAt,
    from: StageKey,
    kind: CareActivityKind,
    by: By,
    step: Step,
  ): Promise<OpportunityRowDb> {
    const code = deal.row.code
    if (from === 'new') throw conflict('Cơ hội chưa được nhận PIC — chưa ghi hoạt động được.')
    const at = effectiveAt(step, await this.acceptedAt(tx, deal.row), 'ngày nhận PIC')

    const touchKind = MILESTONE_TOUCH[kind]
    if (from !== 'assigned') {
      await this.record(tx, code, touchKind, by, step.note, at)
      return deal.row
    }

    const [written] = await tx
      .update(opportunity)
      .set({ stage: 'engaged', stageSince: at })
      .where(
        and(
          eq(opportunity.code, code),
          eq(opportunity.state, 'open'),
          eq(opportunity.stage, 'assigned'),
        ),
      )
      .returning()
    if (!written) throw raced(code)

    await this.after(tx, deal, written, by, { at, from, kind: touchKind, note: step.note })
    return written
  }

  /** A quotation: forward-only into `quotation`, skipping `engaged` when none
   *  was recorded. Re-recording it while standing there is another round —
   *  the timeline row only, so the rot clock is not pushed back. Its moment
   *  may not precede the entry into the column it leaves. */
  private async quotation(
    tx: Db,
    deal: DealAt,
    from: StageKey,
    by: By,
    step: Step,
  ): Promise<OpportunityRowDb> {
    const code = deal.row.code
    if (RANK[from] < RANK.assigned) {
      throw conflict(
        `Cơ hội ${code} chưa được nhận PIC nên chưa ghi hoạt động hay báo giá được — chờ trưởng phòng bấm Nhận PIC trước.`,
      )
    }
    const at = effectiveAt(step, deal.row.stageSince ?? deal.row.createdAt, 'ngày vào cột hiện tại')

    if (from === 'quotation') {
      await this.record(tx, code, MILESTONE_TOUCH.quotation, by, step.note, at)
      return deal.row
    }

    const [written] = await tx
      .update(opportunity)
      .set({ stage: 'quotation', stageSince: at })
      .where(
        and(
          eq(opportunity.code, code),
          eq(opportunity.state, 'open'),
          inArray(
            opportunity.stage,
            StageKey.options.filter(between(RANK.assigned, RANK.quotation)),
          ),
        ),
      )
      .returning()
    if (!written) throw raced(code)

    const kind = MILESTONE_TOUCH.quotation
    await this.after(tx, deal, written, by, { at, from, kind, note: step.note })
    return written
  }

  /** The floor of an activity's date: the accept. A deal accepted before ADR
   *  0071 has no acceptor on the row, so its first entry into `assigned`
   *  stands in, and a deal with neither falls back to its creation. */
  private async acceptedAt(tx: Db, row: OpportunityRowDb): Promise<Date> {
    if (row.acceptedAt) return row.acceptedAt
    const [entered] = await tx
      .select({ at: opportunityStageEvent.at })
      .from(opportunityStageEvent)
      .where(
        and(
          eq(opportunityStageEvent.opportunityCode, row.code),
          eq(opportunityStageEvent.toStage, 'assigned'),
        ),
      )
      .orderBy(asc(opportunityStageEvent.at))
      .limit(1)
    return entered?.at ?? row.createdAt
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
   *  deliberately leaves out, so per-stage catch-alls never collide on
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
   *  different sentences because they lead to two different next actions.
   *  Public for the accept door, which refuses in these same words. */
  onBoard(deal: DealAt, action: string): StageKey {
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

/** What a milestone door hands its two paths: the moment asked for, if any. */
type Step = { asked: Date | undefined; now: Date; note: string }

/** The moment a milestone is stored at. The screen picks a DAY, so the bounds
 *  are Vietnam days: [the floor's day, today] or a 400 on `at`. Inside them the
 *  instant is clamped to [floor, now], and a pick of today reads as now — so a
 *  same-day pick never sorts before the fact that allowed it. */
function effectiveAt(step: Step, floor: Date, floorName: string): Date {
  const { asked, now } = step
  if (asked === undefined) return now
  const day = VN_DAY.format(asked)
  if (day > VN_DAY.format(now)) throw invalid({ at: ['Ngày ghi không được ở tương lai.'] })
  if (day < VN_DAY.format(floor)) {
    throw invalid({
      at: [`Ngày ghi không được trước ${floorName} (${VN_DAY_SHOWN.format(floor)}).`],
    })
  }
  if (day === VN_DAY.format(now)) return now
  return asked < floor ? floor : asked
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
