import { Inject, Injectable } from '@nestjs/common'
import { LEAD_HANDED_OVER, type AccessControl, type Actor } from '@pv/engines'
import {
  NOTIFICATION_DETAIL_DEALS,
  LeadCreateResponse,
  LeadOwnerResponse,
  LeadTier,
  type LeadMotion,
  type LeadPatchResponse,
  type MotionAsks,
  type LeadCreate,
  type LeadOwnerWrite,
  type LeadPatch,
  type ObjectCode,
  type RoleId,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { AccountService } from '../account/account.service'
import type { Db } from '@api/platform/db/db.module'
import { byOf, TouchService } from '../touch/touch.service'
import { ContactService } from '../contact/contact.service'
import type { LeadContactMirror } from '../contact/contact.repository'
import {
  fromCreate,
  fromPatch,
  LEAD_NOTE,
  marketingCredit,
  refOf,
  type LeadValues,
  type LeadWrite,
} from './lead-write.mapper'
import type { LeadRowDb } from './lead.schema'
import { toContract } from './lead.mapper'
import { LeadService } from './lead.service'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadAdmissionService } from './lead-admission.service'
import { LeadStateWriter } from './lead-state'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LeadOriginService } from '../lead-origin/lead-origin.service'
import { CampaignService } from '../campaign/campaign.service'
import { PartnerService } from '../partner/partner.service'
import { referrerOf, refuseByAsks } from './lead-motion-asks'
import { handStepOver } from '../next-step/next-step.handover'
import { handDealsOver } from '../opportunity/opportunity-handover'
import { vnDay } from '../opportunity/opportunity-lifecycle'

/** `sales.touch.to_role` holds one role: the first of the receiver's, with the
 *  column left empty when they hold none. */
const headRole = (who: { roleIds: readonly RoleId[] }): { role?: RoleId } =>
  who.roleIds[0] ? { role: who.roleIds[0] } : {}

/** The five columns every lead write already carries, in the shape
 *  `ContactService.seedPrimary` asks for — see its docblock for why this call
 *  exists at all. Pulled out once because both `create()` and the file import
 *  (`LeadImportService`) build it off the row they are about to insert. */
export function mirrorOf(values: {
  contactName: string
  contactTitle?: string | null
  email: string
  phone?: string | null
  contactChannel?: LeadContactMirror['contactChannel']
}): LeadContactMirror {
  return {
    contactName: values.contactName,
    contactTitle: values.contactTitle ?? null,
    email: values.email,
    phone: values.phone ?? null,
    contactChannel: values.contactChannel ?? null,
  }
}

/** THE LEAD WRITE DOORS HELD HERE: `create()`, the shared `bear()`, the owner
 *  change and the patch. The scan commit and landing intake call `bear()`; file
 *  import (`LeadImportService`) lives apart and obeys the same invariants below.
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
    /* Seeds the newborn lead's primary contact — see `seedPrimary`'s docblock. */
    private readonly contacts: ContactService,
    /* The first engine this service holds. `setOwner` asks it one question —
       "does this role hold `lead.assign`" — and that question is trục 1 alone,
       which is why it calls `allows()` and not `check()`: the route guard has
       already settled licence and session, and there is no `ref` yet whose
       owner could be compared. */
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly origins: LeadOriginService,
    private readonly campaigns: CampaignService,
    private readonly partners: PartnerService,
    /* One read per hand-over: can the receiver open deals (`opportunity.view`)? */
    private readonly actors: ActorRepository,
    private readonly hub: NotificationHub,
    /* Every door asks the gate before it writes; the gate never asks back. */
    private readonly gate: LeadAdmissionService,
  ) {}

  /** One lead changed hands, or was born in someone's name (ADR 0085). An
   *  absent end is the common pool; `occurrence` is the touch that dated it;
   *  `deals` = how many of its deals followed, told on this one line. */
  private handedOver(
    tx: Db,
    move: {
      code: string
      label: string
      actorId: string | undefined
      to?: string | null
      from?: string | null
      occurrence: string | undefined
      deals?: number
    },
  ): Promise<void> {
    return this.hub.announce(tx, {
      event: {
        name: LEAD_HANDED_OVER,
        ref: { code: move.code },
        actorId: move.actorId,
        audiences: {
          'new-holder': move.to ? [move.to] : [],
          'previous-holder': move.from ? [move.from] : [],
        },
        occurrence: move.occurrence,
      },
      subject: { kind: 'lead', code: move.code, label: move.label },
      detail: move.deals ? { [NOTIFICATION_DETAIL_DEALS]: move.deals } : null,
    })
  }

  // ── door 1 · one lead, typed by a person ─────────────────────────────────

  /** `POST /sales/leads`. Answers with the row as the book would show it.
   *
   *  The owner is looked up before the write because the mirror row carries a
   *  display NAME while the column carries an id — and because the response is
   *  a full book row, which prints the owner's mailbox. A missing actor is not
   *  refused here: the insert dies on `lead_owner_id_actor_id_fk` a moment
   *  later, and that fence holds for every door at once rather than only for
   *  the ones that remembered to check. */
  async create(who: Actor, input: LeadCreate): Promise<LeadCreateResponse> {
    const mayAssign = this.access.allows(who, 'lead.assign')
    /* An ownOnly caller cannot open a lead nobody holds, so theirs is born held. */
    const body = !mayAssign && who.ownOnly && !input.ownerId ? { ...input, ownerId: who.id } : input
    /* `setOwner`'s fence: born in somebody else's name is a hand-over. */
    if (body.ownerId && body.ownerId !== who.id && !mayAssign) {
      throw denied(
        'out-of-scope',
        'Bạn chỉ tạo được lead do bạn phụ trách. Liên hệ trưởng phòng để giao cho người khác.',
      )
    }
    /* BD/marketing credit is commission too (`COMMISSION_SPLIT`) — same fence. */
    if (!mayAssign && [body.bdOwnerId, body.marketingOwnerId].some((id) => id && id !== who.id)) {
      throw denied(
        'out-of-scope',
        'Bạn chỉ ghi được công BD, Marketing cho chính bạn. Liên hệ trưởng phòng để ghi cho người khác.',
      )
    }
    const handle = this.repo.readonlyHandle
    const owner = body.ownerId ? await this.repo.actorById(handle, body.ownerId) : null

    const write = fromCreate(
      { ...body, marketingOwnerId: marketingCredit(who, body.marketingOwnerId) ?? undefined },
      owner?.name ?? null,
    )
    const picked = await this.campaignOf(handle, body)
    const referrer = body.refCode ? await referrerOf(this.partners, handle, body.refCode) : null
    const campaignId = picked ? picked.sourceId : (body.campaignId ?? null)
    /* Read before the write, beside the owner lookup and for the same reason:
       the response is a full book row, and a book row prints names, not ids. */
    const campaignName = campaignId ? await this.assertCampaign(handle, campaignId) : null
    const code = await this.leads.nextCode()
    const run = await this.runs.nextCode()

    const row = await this.repo.run(async (tx) => {
      const admitted = await this.gate.typed(tx, who, body)
      if (admitted.reentered) return admitted.reentered
      /* No pick = the motion derives it: the partner's origin, else the campaign's. */
      const origin = body.origin
        ? await this.origins.resolveOrigin(tx, body.origin, body.motion, who.id)
        : await this.derivedOrigin(tx, referrer?.originId ?? picked?.originId ?? null)
      const written = await this.bear(tx, {
        code,
        run,
        write,
        extra: {
          campaignId,
          originId: origin.id,
          originRaw: origin.raw,
          partnerCode: referrer?.code ?? null,
        },
        who,
        owner,
        note: LEAD_NOTE.typed,
        accountCode: admitted.accountCode,
      })
      if (body.campaignCode) await this.campaigns.enrol(tx, body.campaignCode, [code])
      return { written, originName: origin.name }
    })
    /* The entry joined a lead already in the book: answer with that lead's
       row, read after the commit because the pool is one connection on PGlite. */
    if (typeof row === 'string') {
      const found = await this.leads.byCode(who, row)
      if (!found) throw notFound('lead', row)
      return LeadCreateResponse.parse(toContract(found, vnDay(new Date())))
    }

    /* `daysHere` is 0 and `signed` is false by construction, not by guesswork:
       `state_since` defaulted to now a millisecond ago, and a lead that has
       existed for a millisecond has no contract. Both are computed at read
       time by `lead.repository.ts`; here the answer is known without asking. */
    return LeadCreateResponse.parse(
      toContract(
        {
          row: row.written,
          daysHere: 0,
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
          createdByName: who.name,
          campaignName,
          originName: row.originName,
          partnerName: referrer?.name ?? null,
          signed: false,
          labels: [],
          hold: null,
        },
        vnDay(new Date()),
      ),
    )
  }

  /** Every write one lead's birth makes, in foreign-key order, on the caller's
   *  transaction — shared by `create()`, the scan commit and the landing intake
   *  so they cannot drift. `who: null` is the anonymous intake (`SYSTEM_ACTOR`).
   *  Campaign enrolment stays with the caller: the scan door skips it. */
  async bear(
    tx: Db,
    b: {
      code: string
      run: string
      write: LeadWrite
      extra: Pick<LeadValues, 'campaignId' | 'originId' | 'originRaw' | 'partnerCode'>
      who: { id: string; name: string } | null
      owner: { id: string; name: string; roleIds: RoleId[] } | null
      note: string
      /** The admission gate's account; absent = find or open one by identity. */
      accountCode?: string | null
    },
  ): Promise<LeadRowDb> {
    const { code, run, write, who, owner } = b
    await this.mirror.put(tx, refOf(code, write))
    /* The company is resolved BEFORE the lead row, in the same transaction:
       `lead.account_code` is a foreign key into `sales.account`, so the other
       order kills the lead insert because its target does not exist yet. */
    const accountCode =
      b.accountCode ?? (await this.accounts.resolveForLead(tx, write.values, who?.id ?? null))
    /* The lead BELONGS TO the company, so the arrow runs lead → company and
       the rail climbs from the lead to the customer it is part of. Written
       after `resolveForLead` and not before: that call is what puts the
       company's mirror row there when the company is new, and
       `edge.to_code` is a foreign key into it. */
    await this.mirror.link(tx, { from: code, to: accountCode, kind: 'belongs-to' })
    await this.runs.insertOpened(tx, [{ code: run, accountCode, openedAt: new Date() }])
    const [written] = await this.repo.insertLeads(
      tx,
      [{ ...write.values, ...b.extra, accountCode, code, workstreamCode: run }],
      who?.id ?? null,
    )
    if (!written) throw new Error(`sales.lead: INSERT ${code} không trả về dòng nào`)

    /* Same transaction as the lead row — see `ContactService.seedPrimary`. */
    await this.contacts.seedPrimary(tx, code, mirrorOf(write.values), who)

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
    const [occurrence] = await this.touch.record(tx, [
      {
        subjectCode: code,
        subjectKind: 'lead',
        kind: 'created',
        ...byOf(who),
        ...(owner ? { to: { actorId: owner.id, name: owner.name, ...headRole(owner) } } : {}),
        note: b.note,
      },
    ])
    /* Born in the pool, or born in a name: either way somebody must hear. */
    const told = { code, label: write.values.company, actorId: who?.id, occurrence }
    if (owner) await this.handedOver(tx, { ...told, to: owner.id })
    else {
      const subject = { kind: 'lead' as const, code, label: told.label }
      await this.states.pooled(tx, { subject, actorId: told.actorId, occurrence })
    }
    return written
  }

  /** The scan door's motion + campaign rules: `create()`'s asks and pickable
   *  check, with no origin to pick — the file door's `originRequired: false`. */
  async scanCampaign(motion: LeadMotion, campaignCode: string | undefined): Promise<void> {
    const asks = await this.asksOf(this.repo.readonlyHandle, motion)
    refuseByAsks(asks, {
      origin: false,
      campaign: campaignCode !== undefined,
      refCode: false,
      originRequired: false,
    })
    if (campaignCode) await this.pickable(campaignCode)
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
    const nextSeesDeals = next ? await this.seesDeals(next.id) : false

    await this.repo.run(async (tx) => {
      const found = await this.repo.lockForOwnerChange(tx, code)
      if (!found) throw notFound('lead', code)
      /* The pool has no holder to change; the claim door is its only way out (ADR 0109). */
      if (found.state === 'nurturing') {
        throw conflict('Lead đang ở Nhóm chờ chăm sóc. Bấm Nhận lead để chăm lại.')
      }

      if (!mayAssign) {
        if (found.ownerId !== null) {
          throw denied(
            'out-of-scope',
            found.ownerId === who.id
              ? `Lead ${code} đang do bạn phụ trách. Liên hệ trưởng phòng để trả về kho chung.`
              : `Lead ${code} đã có người nhận. Liên hệ trưởng phòng để đổi người phụ trách.`,
          )
        }
        if (body.ownerId !== who.id) {
          throw denied(
            'out-of-scope',
            'Bạn chỉ nhận được lead từ kho chung về cho bạn. Liên hệ trưởng phòng để giao cho người khác.',
          )
        }
      }

      /* Nothing to do is not an error: two clicks on "Nhận lead" is one lead
         held once. Returning early skips a touch row that would read as a
         second hand-over on the timeline. */
      if (found.ownerId === (body.ownerId ?? null)) return
      if (body.ownerId === null && found.held) {
        throw conflict('Lead đang tạm hoãn nên chỉ đổi được người giữ, không bỏ trống được.')
      }

      /* The holder being replaced, looked up for their NAME — the timeline row
         copies names rather than joining `actor` later. Read here rather than
         beside `next`: it is only needed once the hand-over is really
         happening, and everything above this line can still refuse. A miss is
         not possible while `lead_owner_id_actor_id_fk` holds, and if it ever
         were, the row says "claimed out of the common pool" rather than
         inventing a giver. */
      const prev = found.ownerId ? await this.repo.actorById(tx, found.ownerId) : null

      /* The one owner write, shared with the deal doors' claim (ADR 0088 §17). */
      const ownerId = body.ownerId ?? null
      const state = await this.states.ownerSet(tx, found, ownerId)
      /* The outgoing holder's step goes with the lead (flow G1): to the new
         holder, or away on a release. A claim from the pool has none to carry.
         No bell: the lead's one line below tells the whole act (ADR 0093). */
      if (found.ownerId !== null) await handStepOver(tx, code, found.ownerId, ownerId)
      /* The old holder's open deals follow A→B (ADR 0069 §10), narrowed by
         `dealCodes`; a release to the pool leaves them. A receiver who cannot
         hold a deal refuses the hand-over (400 on `ownerId`). */
      let deals = 0
      if (prev && next) {
        const handed = await handDealsOver(
          tx,
          { mirror: this.mirror, touch: this.touch },
          {
            leadCode: code,
            from: { actorId: prev.id, name: prev.name },
            to: { actorId: next.id, name: next.name, ...headRole(next) },
            toSeesDeals: nextSeesDeals,
            by: byOf(who),
            note: `${LEAD_NOTE.handedTo} ${next.name}`,
            ...(body.dealCodes ? { dealCodes: body.dealCodes } : {}),
          },
        )
        deals = handed.moved.length
      }

      const [occurrence] = await this.touch.record(tx, [
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
          /* `role` is their FIRST role as of TODAY (the column holds one), so
             freezing it here keeps it true when the vector redraws this step. */
          ...(next ? { to: { actorId: next.id, name: next.name, ...headRole(next) } } : {}),
          note: next ? `${LEAD_NOTE.handedTo} ${next.name}` : LEAD_NOTE.released,
        },
      ])
      const told = { code, label: found.company, actorId: who.id, occurrence }
      await this.handedOver(tx, { ...told, to: ownerId, from: found.ownerId, deals })
      if (state === 'new') {
        const subject = { kind: 'lead' as const, code, label: found.company }
        await this.states.pooled(tx, { subject, actorId: who.id, occurrence })
      }
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

    return LeadOwnerResponse.parse(toContract(after, vnDay(new Date())))
  }

  /** Whether this person may open deals, through E2 off the `Actor` the
   *  session builds — the next-step doer's check. Asked before the hand-over's
   *  tx: `ActorRepository` reads on the pool (PGlite has one connection). */
  private async seesDeals(id: string): Promise<boolean> {
    const doer = (await this.actors.byId(id))?.actor
    return doer
      ? this.access.check(doer, { branch: 'Sales', permission: 'opportunity.view' }).ok
      : false
  }

  // ── door 1c · correct what is already in the book ────────────────────────

  /** `PATCH /sales/leads/:code` — the profile card's save button.
   *
   *  ------------------------------------------------------------------
   *  THE SAME TWO REFUSALS AS `GET :code`, IN THE SAME ORDER AND WORDS
   *  ------------------------------------------------------------------
   *  Editing is HOLDING, and reading is wider (ADR 0071 §8): someone standing
   *  on a live deal of the lead reads it (`inScope`) but only the holder edits
   *  (`holds`). Both come from the one `byCode` read, with the profile's two
   *  refusals and words — 404 for a code in no book, 403 `out-of-scope` for a
   *  lead held by somebody else. Neither pool (`new`, `nurturing`) counts as
   *  held, so an `ownOnly` Sale claims a lead before editing it (ADR 0109).
   *
   *  `setOwner` deliberately ignores `inScope` at the END of its work, and that
   *  is not a contradiction: a Sale who just handed a lead away is out of scope
   *  a millisecond later, and answering their successful write with a 403 would
   *  read as failure. Nothing here changes who holds the lead, so the check
   *  holds for the whole call.
   *
   *  ------------------------------------------------------------------
   *  A SAVE MOVES NO STATE; TIER IS A FIELD LIKE ANY OTHER
   *  ------------------------------------------------------------------
   *  Editing a profile is not care being scheduled and not an exchange, so it
   *  moves nothing (ADR 0063 §2) — the label would lie. `tier` is accepted in
   *  every state (§3), still never cleared. A raise
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

    if (!before.holds) {
      throw denied('out-of-scope', `Lead ${code} không do bạn phụ trách.`)
    }

    /* The five person columns belong to the primary contact's writer; the
       wire shape is unchanged, only who writes them. */
    const { contactName, contactTitle, email, phone, contactChannel, ...own } = body
    const person = fromPatch({ contactName, contactTitle, email, phone, contactChannel })
    const values = fromPatch(own)
    const raised = body.tier !== undefined && rungOf(body.tier) > rungOf(before.row.tier)

    await this.repo.run(async (tx) => {
      /* Contact first: it locks contact then lead, the order every contact
         write takes. Both calls re-find the lead the pre-read saw (404 if gone). */
      if (Object.keys(person).length > 0) await this.contacts.editPrimary(tx, code, person, who)
      if (Object.keys(values).length > 0 && !(await this.repo.patchLead(tx, code, values))) {
        throw notFound('lead', code)
      }

      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: 'field-filled',
          ...byOf(who),
          note: LEAD_NOTE.corrected(Object.keys(values).length + Object.keys(person).length),
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

  // ── the shared half ──────────────────────────────────────────────────────

  /** The motion's own create rules (0057, `asks` 0059), then the campaign
   *  pick: `null` = no campaign code sent. The code must be pickable. */
  private async campaignOf(
    handle: Db,
    body: LeadCreate,
  ): Promise<{ sourceId: string | null; originId: string | null } | null> {
    const asks = await this.asksOf(handle, body.motion)
    refuseByAsks(asks, {
      origin: body.origin !== undefined,
      campaign: body.campaignCode !== undefined,
      refCode: body.refCode !== undefined,
      originRequired: true,
    })
    return body.campaignCode ? this.pickable(body.campaignCode) : null
  }

  /** Same rule at both doors: DRAFT/RUNNING and not past `ends_on`. */
  async pickable(code: string): Promise<{ sourceId: string | null; originId: string | null }> {
    const picked = await this.campaigns.pickableOne(code)
    if (!picked) {
      throw invalid({
        campaignCode: ['Chiến dịch không nhận lead mới: đã dừng, đã xong hoặc quá ngày kết thúc.'],
      })
    }
    return picked
  }

  /** Refuses a switched-off motion. A missing policy row is a broken install
   *  (0036 plants all six), so it fails loudly instead of guessing an answer. */
  async asksOf(handle: Db, motion: LeadMotion): Promise<MotionAsks> {
    const rule = await this.repo.motionRule(handle, motion)
    if (!rule) throw new Error(`sales.motion_policy has no row for ${motion}`)
    if (!rule.active) throw invalid({ motion: ['Phương án tiếp cận này đang tắt.'] })
    return rule.asks
  }

  /** A derived origin in `resolveOrigin`'s shape; `raw` is null — nobody typed
   *  it. A hidden survivor yields no origin rather than filing under a hidden one. */
  async derivedOrigin(
    tx: Db,
    id: string | null,
  ): Promise<{ id: string | null; name: string | null; raw: null }> {
    const found = id ? await this.origins.survivorOf(id, tx) : null
    const live = found?.active ? found : null
    return { id: live?.id ?? null, name: live?.name ?? null, raw: null }
  }

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
    if (name === null) throw invalid({ campaignId: ['Không tìm thấy chiến dịch.'] })
    return name
  }
}

/** Rung index on the tier ladder; no tier sits below the first rung. */
const rungOf = (tier: LeadTier | null): number =>
  tier === null ? -1 : LeadTier.options.indexOf(tier)
