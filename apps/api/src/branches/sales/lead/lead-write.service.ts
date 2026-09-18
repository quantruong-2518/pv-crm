import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, Edge } from '@pv/engines'
import {
  LeadCreateResponse,
  LeadImportCommitResponse,
  LeadImportPreviewResponse,
  LeadOwnerResponse,
  LeadTier,
  type LeadPatchResponse,
  type LeadCreate,
  type LeadImportBody,
  type LeadOwnerWrite,
  type LeadPatch,
  type ObjectCode,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { AccountService } from '../account/account.service'
import { identityOfLead } from '../account/account.mapper'
import type { Db } from '@api/platform/db/db.module'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { checkBatch, keyOf, type ImportCheck } from './lead-import.check'
import { fromCreate, fromPatch, LEAD_NOTE, refOf } from './lead-write.mapper'
import { toContract } from './lead.mapper'
import { LeadService } from './lead.service'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadStateWriter, stateAfterOwnerChange } from './lead-state'
import { WorkstreamRepository } from '../workstream/workstream.repository'

/** THE THREE DOORS A LEAD CAN COME IN THROUGH. One of them writes nothing.
 *
 *  ------------------------------------------------------------------
 *  THE INVARIANT EVERY DOOR OBEYS: MIRROR ROW FIRST
 *  ------------------------------------------------------------------
 *  `sales.lead.code` carries a foreign key into `platform.object(code)`, so
 *  the order is not a style: mint the code, write the mirror row, write the
 *  lead — and all of it inside ONE transaction. Postgres refuses the insert
 *  otherwise, which is exactly why the key is shaped that way; a lead with no
 *  mirror row is a lead the object graph cannot see, its ContextRail comes up
 *  empty (rule 10), and nothing anywhere turns red.
 *
 *  `ObjectMirror` deliberately opens no transaction of its own. This service
 *  holds it, because this service is the layer that knows what else belongs in
 *  the same unit of work.
 *
 *  ------------------------------------------------------------------
 *  WHY THE CODES ARE MINTED BEFORE THE TRANSACTION OPENS
 *  ------------------------------------------------------------------
 *  `LeadRepository.nextCode()` runs on the pool, not on our handle. Asking it
 *  for a number while our transaction already holds a connection means one
 *  request occupying two connections at once — with a pool of ten, ten
 *  concurrent imports then wait on each other for an eleventh that will never
 *  come. Minting first costs nothing: `nextval` ignores transactions by
 *  design, so a rolled-back batch simply burns its numbers and the next lead
 *  takes the one after. Gaps in the code series are normal and were budgeted
 *  for; a stalled pool is not.
 *
 *  ------------------------------------------------------------------
 *  NOTHING IS RE-NORMALISED HERE
 *  ------------------------------------------------------------------
 *  `LeadCreate` and `LeadImportBody` already trimmed, collapsed, lowercased
 *  the mailbox and turned every `''` into `undefined`. Doing it again in the
 *  service is a second convention that will drift from the first. Likewise the
 *  table's own refusals — a duplicate mailbox, a blank-but-not-empty cell, an
 *  owner who is not in the staff book — are already translated into the right
 *  Problem by `db-error.ts` plus `lead.constraints.ts`. Catching them here to
 *  write a nicer sentence would produce a second wording of a rule that has
 *  one. */
@Injectable()
export class LeadWriteService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly accounts: AccountService,
    /* Every new lead opens its own run; minted here, inserted in the lead's tx. */
    private readonly runs: WorkstreamRepository,
    private readonly states: LeadStateWriter,
    private readonly profiles: LeadService,
    /* The first engine this service holds. `setOwner` asks it one question —
       "does this role hold `lead.assign`" — and that question is trục 1 alone,
       which is why it calls `allows()` and not `check()`: the route guard has
       already settled licence and session, and there is no `ref` yet whose
       owner could be compared. */
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  // ── door 1 · one lead, typed by a person ─────────────────────────────────

  /** `POST /sales/leads`. Answers with the row as the book would show it.
   *
   *  The owner is looked up before the write because the mirror row carries a
   *  display NAME while the column carries an id — and because the response is
   *  a full book row, which prints the owner's mailbox. A missing actor is not
   *  refused here: the insert dies on `lead_owner_id_actor_id_fk` a moment
   *  later, and that fence holds for every door at once rather than only for
   *  the ones that remembered to check. */
  async create(who: Actor, body: LeadCreate): Promise<LeadCreateResponse> {
    const handle = this.repo.readonlyHandle
    const owner = body.ownerId ? await this.repo.actorById(handle, body.ownerId) : null

    const write = fromCreate(body, owner?.name ?? null)
    /* Read before the write, beside the owner lookup and for the same reason:
       the response is a full book row, and a book row prints names, not ids. */
    const campaignName = body.campaignId ? await this.assertCampaign(handle, body.campaignId) : null
    const code = await this.leads.nextCode()
    const run = await this.runs.nextCode()

    const row = await this.repo.run(async (tx) => {
      await this.mirror.put(tx, refOf(code, write))
      /* The company is resolved BEFORE the lead row, in the same transaction:
         `lead.account_code` is a foreign key into `sales.account`, so the other
         order kills the lead insert because its target does not exist yet. */
      const accountCode = await this.accounts.resolveForLead(tx, write.values)
      /* The lead BELONGS TO the company, so the arrow runs lead → company and
         the rail climbs from the lead to the customer it is part of. Written
         after `resolveForLead` and not before: that call is what puts the
         company's mirror row there when the company is new, and
         `edge.to_code` is a foreign key into it. */
      await this.mirror.link(tx, { from: code, to: accountCode, kind: 'belongs-to' })
      await this.runs.insertOpened(tx, [{ code: run, accountCode, openedAt: new Date() }])
      const [written] = await this.repo.insertLeads(tx, [
        { ...write.values, accountCode, code, workstreamCode: run },
      ])
      if (!written) throw new Error(`sales.lead: INSERT ${code} không trả về dòng nào`)

      /* The lead's first timeline row, written in the same commit as the lead.
         A customer whose history starts at the day somebody happened to open
         the profile is a customer with no history — and the row costs one
         INSERT on a path that is already writing two.

         `to` is the holder the lead is BORN with, and it is on this row rather
         than on a `handed-over` row of its own: nobody handed the lead over, it
         arrived with a name on it. Without it the flow vector's first step
         would have to be inferred from `lead.owner_id`, which says who holds it
         TODAY and has no date to stand on. Same place `toTier` sits for a lead
         that entered the book already graded. */
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'created',
          ...byOf(who),
          ...(owner ? { to: { actorId: owner.id, name: owner.name, role: owner.roleId } } : {}),
          note: LEAD_NOTE.typed,
        },
      ])

      return written
    })

    /* `daysHere` is 0 and `signed` is false by construction, not by guesswork:
       `state_since` defaulted to now a millisecond ago, and a lead that has
       existed for a millisecond has no contract. Both are computed at read
       time by `lead.repository.ts`; here the answer is known without asking. */
    return LeadCreateResponse.parse(
      toContract({
        row,
        daysHere: 0,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        campaignName,
        signed: false,
      }),
    )
  }

  // ── door 1b · hand the lead over ─────────────────────────────────────────

  /** `PUT /sales/leads/:code/owner` — the whole of "giao" and "nhận".
   *
   *  ------------------------------------------------------------------
   *  THE RULE, AND WHY IT IS TWO SENTENCES RATHER THAN ONE PERMISSION
   *  ------------------------------------------------------------------
   *  `lead.assign` is held by `director`, `head-of-sales` and `account-executive`
   *  only — Sale and BD deliberately do not have it, because handing somebody
   *  else's customer to a third person re-cuts the commission
   *  (`COMMISSION_SPLIT`). Declaring the
   *  route as `@Need({ permission: 'lead.assign' })` and stopping there would
   *  therefore be correct AND useless: it would also block a Sale from picking
   *  up a lead nobody holds, which is the single most common move on this
   *  screen and takes nothing from anyone.
   *
   *  So the door reads:
   *
   *   · holder of `lead.assign` → may put any lead on anybody, or release it;
   *   · anybody else with `lead.edit` → may take a lead THAT NOBODY HOLDS, and
   *     only for themselves.
   *
   *  Everything else is 403 `out-of-scope`, with a sentence naming who to ask.
   *  Note what is NOT in the list: releasing a lead you hold. It looks
   *  harmless, but a lead put back in the pool leaves the pipeline of the
   *  person who had it, and the person who notices is their manager at the end
   *  of the month — so it stays with the role that already owns re-cutting
   *  credit.
   *
   *  ------------------------------------------------------------------
   *  NO PROPOSAL, NO APPROVAL — AND E3 IS NOT BEING BYPASSED
   *  ------------------------------------------------------------------
   *  The screen this replaces wrote a "đề nghị giao việc" into browser storage
   *  and printed "chờ trưởng phòng gật". Nothing ever gasped: E3 was never
   *  wired to it, so the pending state was a sentence, not a state — and the
   *  lead's owner never changed no matter how many times somebody assigned it.
   *  A promise the system cannot keep is worse than no promise, so the promise
   *  is gone and the write is real. What replaces the approval is the fence
   *  above: the person who could have approved is now the only person who can
   *  do the part that needed approving.
   *
   *  ------------------------------------------------------------------
   *  FOUR WRITES, ONE TRANSACTION
   *  ------------------------------------------------------------------
   *  The column (and the state it may move, ADR 0058), the mirror row in
   *  `platform.object` (or the ContextRail keeps showing the old holder — rule
   *  10), and one `sales.touch` row of kind
   *  `handed-over` carrying BOTH ends of the move — one row, not two; the reasoning
   *  is on the columns in `touch.schema.ts`. The lock is taken first; see
   *  `lockForOwnerChange`. */
  async setOwner(who: Actor, code: ObjectCode, body: LeadOwnerWrite): Promise<LeadOwnerResponse> {
    const mayAssign = this.access.allows(who, 'lead.assign')

    /* Looked up BEFORE the transaction, like `create()` does and for the same
       reason: the mirror row carries a display NAME while the column carries
       an id, and the touch row records the name too. A `null` here means no
       such actor, and the UPDATE then dies on `lead_owner_id_actor_id_fk` —
       the fence that holds for every door rather than only the checked ones. */
    const next = body.ownerId
      ? await this.repo.actorById(this.repo.readonlyHandle, body.ownerId)
      : null

    await this.repo.run(async (tx) => {
      const found = await this.repo.lockForOwnerChange(tx, code)
      if (!found) throw notFound('lead', code)

      if (!mayAssign) {
        if (found.ownerId !== null) {
          throw denied(
            'out-of-scope',
            found.ownerId === who.id
              ? `Lead ${code} đang đứng tên bạn. Trả lead về kho chung là việc của trưởng phòng.`
              : `Lead ${code} đã có người nhận — hỏi trưởng phòng nếu cần chuyển tay.`,
          )
        }
        if (body.ownerId !== who.id) {
          throw denied(
            'out-of-scope',
            'Bạn chỉ nhận lead trong kho chung về cho mình được. Giao cho người khác là việc của trưởng phòng.',
          )
        }
      }

      /* Nothing to do is not an error: two clicks on "Nhận lead" is one lead
         held once. Returning early skips a touch row that would read as a
         second hand-over on the timeline. */
      if (found.ownerId === (body.ownerId ?? null)) return

      /* The holder being replaced, looked up for their NAME — the timeline row
         copies names rather than joining `actor` later. Read here rather than
         beside `next`: it is only needed once the hand-over is really
         happening, and everything above this line can still refuse. A miss is
         not possible while `lead_owner_id_actor_id_fk` holds, and if it ever
         were, the row says "claimed out of the common pool" rather than
         inventing a giver. */
      const prev = found.ownerId ? await this.repo.actorById(tx, found.ownerId) : null

      /* One statement when the state follows the owner: `lead_open_owner_matches`
         refuses a `new` lead with a holder even for the instant between two. */
      const ownerId = body.ownerId ?? null
      const state = stateAfterOwnerChange(found.state, ownerId)
      if (state === found.state) {
        await this.repo.setOwner(tx, code, ownerId)
        await this.states.refresh(tx, [code])
      } else {
        await this.states.move(tx, code, state, { ownerId })
      }

      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'handed-over',
          /* `by`/`actorId` is who PRESSED the button, never who received the
             lead — the timeline answers "who did this", and a head of sales
             moving a lead between two Sales is neither end of it. `byOf` is the
             only way to build that pair. */
          ...byOf(who),
          /* The two ends as DATA, beside the sentence that says the same thing
             in Vietnamese. The note is for the person reading the card; these
             are for the flow vector, which draws one step per holder and must
             not get there by parsing prose. An absent end is the common pool:
             no `from` means claimed out of it, no `to` means released into it —
             and `touch_hand_over_sides` refuses a row with neither. */
          ...(prev ? { from: { actorId: prev.id, name: prev.name } } : {}),
          /* `role` is the role they hold TODAY, which is the day this row is
             written — so freezing it here is what makes it still true in a
             year, when the vector redraws this step. */
          ...(next ? { to: { actorId: next.id, name: next.name, role: next.roleId } } : {}),
          note: next ? `${LEAD_NOTE.handedTo} ${next.name}` : LEAD_NOTE.released,
        },
      ])
    })

    /* Read the row back through the ordinary read path rather than assembling
       an answer from what was just written. The book prints `daysHere`, the
       campaign NAME and `signed`, and all three come out of joins and a
       subquery this service does not run — building them here would be a
       second, quieter implementation of the book row.
       `inScope` is deliberately ignored: a Sale who just handed their lead to
       somebody else is out of scope for it a millisecond later, and answering
       their successful write with a 403 would read as a failure. */
    const after = await this.leads.byCode(who, code)
    if (!after) throw notFound('lead', code)

    return LeadOwnerResponse.parse(toContract(after))
  }

  // ── door 1c · correct what is already in the book ────────────────────────

  /** `PATCH /sales/leads/:code` — the profile card's save button.
   *
   *  ------------------------------------------------------------------
   *  THE SAME TWO REFUSALS AS `GET :code`, IN THE SAME ORDER AND WORDS
   *  ------------------------------------------------------------------
   *  You may correct exactly the leads you may read. `LeadService.profile`
   *  already draws that line — 404 for a code that is in no book, 403
   *  `out-of-scope` for a lead standing in somebody else's name — and this door
   *  asks `byCode` the same question and repeats the same sentence rather than
   *  inventing a second rule. That includes the common pool: `scopeOf` counts
   *  an unclaimed lead as OUT of scope for an `ownOnly` actor, so a Sale cannot
   *  edit a lead they cannot open. Same rule, one place, no surprise.
   *
   *  `setOwner` deliberately ignores `inScope` at the END of its work, and that
   *  is not a contradiction: a Sale who just handed a lead away is out of scope
   *  a millisecond later, and answering their successful write with a 403 would
   *  read as failure. Nothing here changes who holds the lead, so the check
   *  holds for the whole call.
   *
   *  ------------------------------------------------------------------
   *  THE HOLDER'S FIRST EDIT MOVES THE STATE; TIER WAITS FOR VERIFICATION
   *  ------------------------------------------------------------------
   *  A save by the lead's own holder is their first action (ADR 0058), so
   *  `LeadStateWriter.firstAction` runs in the same transaction and refreshes
   *  the mirror row if it moved anything. `tier` is accepted only while the
   *  lead is `working` or `converted`: the first tier is `:code/verify`'s to
   *  set, and a parked lead must not come back verified by a patch. A raise
   *  writes `tier-raised` beside `field-filled`; a lowering writes no tier row.
   *
   *  ------------------------------------------------------------------
   *  ONE TOUCH ROW PER SAVE, COUNTING BOXES
   *  ------------------------------------------------------------------
   *  `field-filled` has been in `TouchKind` since the timeline was drawn, described
   *  as "fields on the profile were filled in or corrected", with no door
   *  writing it. This is that door. One row per save rather than per field:
   *  somebody working through the ten questions fills six boxes in one sitting,
   *  and six timeline rows for one sitting is a timeline nobody can read.
   *
   *  `values` is never empty, so the UPDATE is never a `set({})` — `LeadPatch`
   *  refuses a body in which every field is absent, and that refusal is the
   *  only reason this method needs no empty check of its own. */
  async patch(who: Actor, code: ObjectCode, body: LeadPatch): Promise<LeadPatchResponse> {
    const before = await this.leads.byCode(who, code)
    if (!before) throw notFound('lead', code)

    if (!before.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    if (body.tier !== undefined && !TIER_EDITABLE.has(before.row.state)) {
      throw conflict(
        `Lead ${code} chỉ sửa bậc được khi đang chăm hoặc đã lên cơ hội — bậc đầu tiên chốt ở bước "Xác minh xong".`,
      )
    }
    const values = fromPatch(body)
    const raised = body.tier !== undefined && rungOf(body.tier) > rungOf(before.row.tier)

    await this.repo.run(async (tx) => {
      /* The row was read a moment ago and outside this transaction, so it can
         have been deleted since. `patchLead` answers that and nothing else. */
      const written = await this.repo.patchLead(tx, code, values)
      if (!written) throw notFound('lead', code)
      await this.states.firstAction(tx, [code], who.id)

      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'field-filled',
          ...byOf(who),
          note: LEAD_NOTE.corrected(Object.keys(values).length),
        },
        ...(raised && body.tier
          ? [
              {
                subjectCode: code,
                subjectKind: 'lead' as const,
                kind: 'tier-raised' as const,
                toTier: body.tier,
                ...byOf(who),
                note: LEAD_NOTE.tierRaised(body.tier),
              },
            ]
          : []),
      ])
    })

    /* Read back through the profile door: `requiredFilled` is GENERATED, and
       `LeadPatchResponse` is the whole profile — `position` and `chain` too,
       which only `LeadService.profile` builds. */
    return this.profiles.profile(who, code)
  }

  // ── door 2 · the dry run ─────────────────────────────────────────────────

  /** `POST /sales/leads/import/preview` — READS ONLY.
   *
   *  Not one byte: no lead, no mirror row, no batch record, and above all no
   *  `nextval`. Minting a code is spending a real one, and a person who
   *  presses "xem trước" three times before committing would punch three holes
   *  in the code series for nothing. The preview exists to answer "what would
   *  happen", and a question that changes the thing it asks about is not that
   *  question. */
  async preview(body: LeadImportBody): Promise<LeadImportPreviewResponse> {
    const { report } = await this.check(this.repo.readonlyHandle, body)
    return LeadImportPreviewResponse.parse(report)
  }

  // ── door 3 · the real load ───────────────────────────────────────────────

  /** `POST /sales/leads/import` — the whole batch, or none of it.
   *
   *  Half a file loaded and then a crash is the state nobody can unwind by
   *  hand: the rows that landed look exactly like rows somebody meant to load,
   *  so the only way back is to know which ones, which is the thing that was
   *  lost. One transaction removes the question.
   *
   *  The batch record is written inside that same transaction, and it is
   *  written even when the batch accepted nothing: the load HAPPENED, somebody
   *  pressed the button on a file, and "that file produced zero rows" is one
   *  of the more useful things a log can say six months later. */
  async commit(who: Actor, body: LeadImportBody): Promise<LeadImportCommitResponse> {
    const handle = this.repo.readonlyHandle
    const { report, writes } = await this.check(handle, body)

    /* One code per accepted row, all of them before the transaction opens —
       see the note at the top of this class.

       Minted in parallel and then SORTED before being handed out. The sort is
       not cosmetics: `Promise.all` keeps the results in call order, but the
       numbers themselves come back in whatever order the sequence served
       them, so row 1 of the file ends up holding `LD-0201` and row 3 holding
       `LD-0212`. Every number in the list is already ours, so putting them in
       order costs nothing and buys the one thing a person opening the book
       right after a load expects — the file's order is the code's order.

       Known cost, said out loud rather than hidden: this is one round trip per
       row. A 5.000-row file spends 5.000 of them here. The fix is a single
       `nextval(seq, n)` call minting a block at once, which belongs in
       `lead.repository.ts` next to the sequence it reads. */
    const codes = (await Promise.all(writes.map(() => this.leads.nextCode()))).sort(
      (a, b) => Number(a.slice(3)) - Number(b.slice(3)),
    )
    const runs = await this.runs.nextCodes(writes.length)
    const openedAt = new Date()

    /* Row and mirror row are built together, from the same draft and the same
       code, so the two can never drift apart by an index. */
    const ready = writes.map((write, i) => ({
      row: { ...write.values, code: codes[i]!, workstreamCode: runs[i]! },
      ref: refOf(codes[i]!, write),
    }))

    const batch = await this.repo.run(async (tx) => {
      /* Chunked, and still atomic — every statement below runs in this one
         transaction. The chunking is about a protocol limit, not about
         durability: Postgres accepts at most 65.535 bind parameters per
         statement, and a lead row carries around twenty columns, so a single
         5.000-row INSERT would be refused by the driver before it ever reached
         the server.

         Mirror rows first inside every chunk, for the reason this whole class
         exists: the foreign key on `lead.code` refuses the lead otherwise. */
      for (let i = 0; i < ready.length; i += CHUNK) {
        const slice = ready.slice(i, i + CHUNK)
        await this.mirror.putMany(
          tx,
          slice.map((p) => p.ref),
        )

        /* One company per row, SEQUENTIALLY and with a memo for the batch.
           Sequential because `resolveForLead` is a read-then-write on one
           transaction: `Promise.all` over a single connection only queues them,
           and here it is worse — two rows of the same company both read "not
           there" and both insert, and the second dies on
           `account_identity_uniq`.
           Memoised because a five thousand row import file is usually thirty
           companies: without `seen`, every row is a read that returns a code
           this loop already knew. */
        const seen = new Map<string, string>()
        const rows: (typeof slice)[number]['row'][] = []
        /* Same edge the single-lead door writes, collected HERE rather than
           re-read off `rows`: the row type comes from `$inferInsert`, where the
           company code is still optional, while in this loop it is the string
           `resolveForLead` just returned. */
        const links: Edge[] = []
        const opened: { code: string; accountCode: string; openedAt: Date }[] = []
        for (const p of slice) {
          const key = identityOfLead(p.row)
          const known = seen.get(key)
          const accountCode = known ?? (await this.accounts.resolveForLead(tx, p.row))
          if (!known) seen.set(key, accountCode)
          rows.push({ ...p.row, accountCode })
          links.push({ from: p.row.code, to: accountCode, kind: 'belongs-to' })
          opened.push({ code: p.row.workstreamCode, accountCode, openedAt })
        }

        await this.mirror.linkMany(tx, links)
        await this.runs.insertOpened(tx, opened)
        await this.repo.insertLeads(tx, rows)
        /* One timeline row per lead, in the same chunk as the lead itself. The
           file name goes into the sentence rather than into a column, because
           the batch receipt in `platform.audit` already holds the authoritative
           link and a second copy that can disagree with it is worse than a
           sentence that cannot. */
        await this.touch.record(
          tx,
          slice.map((p): TouchEntry => ({
            subjectCode: p.row.code,
            subjectKind: 'lead',
            kind: 'created',
            /* An imported file may already say who owns each row, so the same
               `to` the manual door writes belongs here — see `create()`. Read
               off the ref rather than looked up again: `refOf` already resolved
               the id into the display name for the mirror row.
               NO `role` here, unlike the other two doors, and the absence is
               deliberate rather than forgotten: the import path resolves owners
               through `ActorLite` (`{ id, name }`), so the role would cost a
               widened type across the whole check module for a label on one
               step. Absent reads as "not recorded" everywhere it surfaces —
               `stepsOf` prints no role — which is the truth about these rows. */
            ...(p.row.ownerId && p.ref.owner
              ? { to: { actorId: p.row.ownerId, name: p.ref.owner } }
              : {}),
            ...byOf(who),
            note: LEAD_NOTE.imported(body.fileName),
          })),
        )
      }

      return this.repo.writeBatchNote(tx, {
        actorId: who.id,
        note: noteOf(body, codes),
      })
    })

    return LeadImportCommitResponse.parse({
      ...report,
      batchId: batch.id,
      at: batch.at.toISOString(),
      intake: 'IMPORT',
      motion: body.motion,
      accepted: codes.length,
      codes,
    })
  }

  // ── the shared half ──────────────────────────────────────────────────────

  /** The campaign has to be a campaign, and this is where that gets SAID.
   *
   *  `lead_campaign_fk` already makes it impossible to store a code that names
   *  no live campaign, so nothing gets through either way. What the constraint
   *  cannot do is talk: it fires inside the INSERT, and the best `db-error.ts`
   *  can make of it is one sentence keyed off a constraint name. Asking first
   *  produces a 400 on the `campaignId` field before a transaction is opened,
   *  which is the same shape every other refusal on this door has.
   *
   *  The read is not extra work either — the response is a full book row and a
   *  book row prints the campaign's NAME, so this query was already running. It
   *  only stopped throwing away the answer. */
  private async assertCampaign(handle: Db, id: string): Promise<string> {
    const name = await this.repo.campaignName(handle, id)
    if (name === null) throw invalid({ campaignId: ['Chiến dịch không có trong sổ chiến dịch.'] })
    return name
  }

  /** Load what the check needs, then run THE check.
   *
   *  Both import doors come through here, which is the whole reason "the
   *  preview said it was clean" and "the commit reported errors" cannot become
   *  two different sentences about one file. The reads are identical too: the
   *  same staff book, the same live mailboxes, the same lookup. */
  private async check(handle: Db, body: LeadImportBody): Promise<ImportCheck> {
    const mailboxes = body.rows
      .map((r) => r.values.email?.trim().toLowerCase())
      .filter((e): e is string => e !== undefined && e !== '')

    /* Every campaign code the batch could land on: the one chosen for the
       whole file, plus whatever the source column carries per row. Asked in ONE
       query rather than per row — 5.000 rows is 5.000 round trips otherwise,
       and the answer is the same small set every time. */
    const campaigns = [
      ...new Set(
        [body.source, ...body.rows.map((r) => r.values.source)].filter(
          (c): c is string => c !== undefined && c.trim() !== '',
        ),
      ),
    ]

    const [staff, book, live] = await Promise.all([
      this.repo.staff(handle),
      this.repo.liveByEmail(handle, [...new Set(mailboxes)]),
      this.repo.campaignCodes(handle, campaigns),
    ])

    return checkBatch({
      rows: body.rows,
      motion: body.motion,
      ...(body.source === undefined ? {} : { source: body.source }),
      staff,
      campaigns: live,
      /* The check speaks in dedupe keys, the table speaks in mailboxes. One
         `keyOf` on both sides is what keeps the two vocabularies from needing
         a translation nobody maintains. */
      book: new Map([...book].map(([email, code]) => [keyOf(email), code])),
    })
  }
}

/** Rows per statement. See the note at the call site — this is the bind
 *  parameter ceiling, not a durability boundary. */
const CHUNK = 500

/** The only states in which a patch may re-grade the tier (ADR 0058). */
const TIER_EDITABLE: ReadonlySet<string> = new Set(['working', 'converted'])

/** Rung index on the tier ladder; no tier sits below the first rung. */
const rungOf = (tier: LeadTier | null): number =>
  tier === null ? -1 : LeadTier.options.indexOf(tier)

/** The batch record's note.
 *
 *  JSON rather than prose because something will have to read it back: the
 *  contract promises that a batch id makes a wrong load undoable, and with no
 *  `batch_id` column on `sales.lead` this line is the only place the batch →
 *  rows link exists at all. Who and when are already columns of
 *  `platform.audit`; this carries the rest. */
function noteOf(body: LeadImportBody, codes: readonly string[]): string {
  return JSON.stringify({
    kind: 'lead-import',
    file: body.fileName,
    intake: 'IMPORT',
    motion: body.motion,
    ...(body.source === undefined ? {} : { source: body.source }),
    accepted: codes.length,
    codes,
  })
}
