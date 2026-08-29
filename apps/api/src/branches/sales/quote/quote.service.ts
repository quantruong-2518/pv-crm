import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  QuoteBookResponse,
  QuoteDetail,
  QuoteWriteResponse,
  type MaObject,
  type OpportunityRow,
  type QuoteBookQuery,
  type QuoteCreate,
  type QuoteDecision,
  type QuoteReplace,
  type QuoteUpdate,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { EdgeWriter } from '@api/platform/graph/edge-writer'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { OpportunityService } from '../opportunity/opportunity.service'
import { editsOf, fromDraft, markDecided, markSent, refOf, toContract } from './quote.mapper'
import { QuoteRepository } from './quote.repository'

/** Module 4 · the quotation book — the only place that knows both the
 *  repository and the engines.
 *
 *  ------------------------------------------------------------------
 *  THE E1 EDGE IS A CHAIN, NEVER A FAN, AND THAT IS A CORRECTNESS RULE
 *  ------------------------------------------------------------------
 *  Every new version links behind the NEWEST existing version of its deal, and
 *  only the very first one links back to the deal itself:
 *
 *      right:  OP-5001 -> BG-5001 -> BG-5002 -> HD-5001
 *      wrong:  OP-5001 -> BG-5001
 *              OP-5001 -> BG-5002 -> HD-5001      (two edges leaving OP)
 *
 *  The reason is in `e1-object-graph.ts`: `story()` spreads every path from the
 *  root, keeps the LONGEST one containing the code being viewed, and breaks ties
 *  by code order. Fanned out, the two drafts are two leaves of equal length
 *  before signing — so the tie-break picks the SMALLER code, and the rail draws
 *  the version that has already been superseded while the live one is the new
 *  one. Chained, the path only ever grows towards the newest version: the rail
 *  is deterministic and the whole negotiation reads back intact.
 *
 *  Both write doors that mint a code go through `writeNewVersion` below, so there is
 *  no door that can produce a fan even by accident — including a second `POST`
 *  on a deal that already has quotes, which the design does not describe but
 *  nothing forbids.
 *
 *  ------------------------------------------------------------------
 *  THE CREATE DOOR CANNOT BE SCOPED, SO IT CHECKS THE PARENT DEAL HERE
 *  ------------------------------------------------------------------
 *  `POST /sales/quotes` takes `opportunityCode` in the body, so the access guard
 *  has no `ref` to read: there is no row yet. Skipping the check would let a
 *  Sale who may only see their own deals draft a quote onto somebody else's, and
 *  no other door catches it. `OpportunityService.profile` is the check —
 *  reusing the deal book's own answer rather than writing a second scope
 *  predicate here, because two predicates for one question is two answers that
 *  eventually differ.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS ROUND DOES NOT DO
 *  ------------------------------------------------------------------
 *  The send door moves the paperwork and the deal, and queues no mail. The
 *  customer-facing letter is the other half of the design's next step, and it
 *  needs things an internal notice does not — a suppression check and a
 *  `List-Unsubscribe` header — so half of it wired here would be a door that
 *  looks like it mails somebody and does not. */
@Injectable()
export class QuoteService {
  constructor(
    private readonly repo: QuoteRepository,
    private readonly deals: OpportunityService,
    private readonly mirror: ObjectMirror,
    private readonly edges: EdgeWriter,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: QuoteBookQuery): Promise<QuoteBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* Second net. SQL has already cut by scope, so normally E2 removes nothing —
       which is the right outcome: two fences reading ONE axis, the inner one
       earning its keep only on the day somebody adds an endpoint and forgets
       `scoped: true`.

       `ref.owner` carries the READER's own name when they stand on the deal.
       That is not cosmetic: E2 compares a single name, so naming anybody else
       would make the inner fence ask a narrower question than the SQL asked, and
       cut rows belonging to the very person reading them. The deal book records
       what that looked like when it happened. */
    const items = page.rows.map((r) => ({
      ...r,
      ref: refOf(r.row, {
        account: r.account,
        ownerName: r.inScope ? who.name : r.ownerName,
      }),
    }))
    const { visible, hidden } = this.access.visible(who, items)

    return QuoteBookResponse.parse({
      rows: visible.map((v) => toContract(v)),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** One version, plus every version of the same deal.
   *
   *  Two refusals, and they do not collapse into one: 404 sends the reader back
   *  to the book, 403 sends them to whoever holds the deal. A book answers an
   *  out-of-scope reader by dropping rows and reporting `hidden`; a profile has
   *  exactly one row, so it has nothing to drop. */
  async profile(who: Actor, code: MaObject): Promise<QuoteDetail> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('báo giá', code)
    if (!found.inScope) throw denied('out-of-scope')

    const versions = await this.repo.versionsOf(this.repo.readonlyHandle, found.row.opportunityCode)

    return QuoteDetail.parse({
      quote: toContract(found),
      versions: versions.map((v) => toContract(v)),
    })
  }

  /** `POST /sales/quotes` — draft a quote on a deal. */
  async create(who: Actor, body: QuoteCreate): Promise<QuoteWriteResponse> {
    const deal = await this.deals.profile(who, body.opportunityCode)
    this.refuseClosedDeal(deal)

    const code = await this.repo.nextCode()
    const write = fromDraft(body, {
      opportunityCode: deal.code,
      leadCode: deal.leadCode,
      createdBy: who.id,
      status: 'nhap',
    })

    return this.writeNewVersion(who, deal, code, write)
  }

  /** `PATCH /sales/quotes/:code` — save a draft that has not been sent.
   *
   *  409 rather than 400 once it has: the body is perfectly valid and would be
   *  accepted again on a fresh draft, so what is wrong is the STATE of the
   *  resource — which is the definition of 409. A 400 would make the screen
   *  redden a field, and no field is wrong.
   *
   *  Refusing is the whole one-code-per-version rule enforced at the only door
   *  that could break it. `BG-5001` has left the system — it is in the letter the
   *  customer is holding, in an E1 edge, in the mail outbox — so editing it in
   *  place makes the paper and the row disagree with nothing recording that they
   *  do. The way to change a sent quote is to replace it. */
  async update(who: Actor, code: MaObject, body: QuoteUpdate): Promise<QuoteWriteResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('báo giá', code)
    if (!found.inScope) throw denied('out-of-scope')
    if (found.row.status !== 'nhap') {
      throw conflict(
        `Báo giá ${code} đã gửi khách — soạn bản mới thay vì sửa đè lên tờ khách đang cầm.`,
      )
    }

    const write = fromDraft(body, {
      opportunityCode: found.row.opportunityCode,
      leadCode: found.row.leadCode,
      createdBy: found.row.createdBy,
      status: 'nhap',
    })

    const done = await this.repo.run(async (tx) => {
      const row = await this.repo.updateQuote(tx, code, editsOf(write.values))
      const lines = await this.repo.replaceLines(tx, code, write.lines)

      /* The mirror row is an upsert, so it follows the edit. Skip it and the
         rail keeps printing the old title and the old total after the user has
         changed both, with nothing going red to say so. */
      await this.mirror.put(tx, refOf(row, { account: found.account, ownerName: found.ownerName }))
      return { row, lines }
    })

    return QuoteWriteResponse.parse(toContract({ ...done, account: found.account }))
  }

  /** `POST /sales/quotes/:code/replace` — the next round of negotiation.
   *
   *  Mints a NEW code rather than editing this one, numbers it one past the
   *  newest version of the deal, and links it behind the version it replaces.
   *  The version being replaced is NOT retired here — that happens when the new
   *  one is actually sent. Starting a draft and abandoning it must not kill the
   *  quote the customer is holding, because then the deal has no live quote
   *  while nobody has sent the customer anything. */
  async replace(who: Actor, code: MaObject, body: QuoteReplace): Promise<QuoteWriteResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('báo giá', code)
    if (!found.inScope) throw denied('out-of-scope')

    const deal = await this.deals.profile(who, found.row.opportunityCode)
    this.refuseClosedDeal(deal)

    const next = await this.repo.nextCode()
    const write = fromDraft(body, {
      opportunityCode: found.row.opportunityCode,
      leadCode: found.row.leadCode,
      createdBy: who.id,
      status: 'nhap',
    })

    return this.writeNewVersion(who, deal, next, write)
  }

  /** `POST /sales/quotes/:code/send` — the draft leaves the building.
   *
   *  Four writes, one commit, and every one of them is part of the same fact:
   *
   *   · this version becomes `da-gui` and gets its send timestamp — one function
   *     moves the pair, so the CHECK that binds them cannot be half-satisfied;
   *   · every OTHER live version of the deal becomes `thay-the`. NOW, not when
   *     the replacement was drafted;
   *   · the mirror row picks up the new status, so the rail says which draft is
   *     live;
   *   · the DEAL moves onto the quotation step. Without that the seller has to
   *     remember to change the status in a second place, and the kanban board
   *     starts lying the first time somebody forgets.
   *
   *  No mail is queued — see the note at the top of this file. */
  async send(who: Actor, code: MaObject): Promise<QuoteWriteResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('báo giá', code)
    if (!found.inScope) throw denied('out-of-scope')
    if (found.row.status !== 'nhap') {
      throw conflict(`Báo giá ${code} đã rời khỏi bản nháp — không gửi lại được bản này.`)
    }

    const now = new Date()

    const row = await this.repo.run(async (tx) => {
      const written = await this.repo.updateQuote(tx, code, markSent(now))
      const retired = await this.repo.supersede(tx, found.row.opportunityCode, code)

      /* Every row whose status just moved gets its snapshot refreshed — the one
         being sent AND the ones it retired. Refreshing only the first leaves the
         rail printing a superseded draft as though it were live, which is wrong
         on precisely the screen this chain of edges exists to draw. */
      const snapshot = { account: found.account, ownerName: found.ownerName }
      await this.mirror.putMany(
        tx,
        [written, ...retired].map((q) => refOf(q, snapshot)),
      )

      await this.deals.markQuotationSent(tx, found.row.opportunityCode, now)
      /* And the DEAL's snapshot, because the line above moved its stage. Sending
         a quote is the one write in this module that changes a row in another
         table, so it is the one place that has to remember the other table's
         mirror too. */
      await this.deals.ensureMirror(tx, who, found.row.opportunityCode)

      return written
    })

    return QuoteWriteResponse.parse(toContract({ row, account: found.account, lines: found.lines }))
  }

  /** `POST /sales/quotes/:code/decide` — record what the customer said.
   *
   *  Only a sent version can be answered: a draft nobody received cannot have
   *  been accepted, and a superseded one was answered by being replaced.
   *
   *  Accepting a second version of one deal dies on `quote_one_accepted_idx`
   *  rather than on a check written here, and that is deliberate — the fence has
   *  to hold for every door, including the next one somebody writes. */
  async decide(who: Actor, code: MaObject, body: QuoteDecision): Promise<QuoteWriteResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('báo giá', code)
    if (!found.inScope) throw denied('out-of-scope')
    if (found.row.status !== 'da-gui') {
      throw conflict(`Báo giá ${code} chưa gửi khách hoặc khách đã trả lời rồi.`)
    }

    const row = await this.repo.run(async (tx) => {
      const written = await this.repo.updateQuote(tx, code, markDecided(body.outcome, new Date()))
      await this.mirror.put(
        tx,
        refOf(written, { account: found.account, ownerName: found.ownerName }),
      )
      return written
    })

    return QuoteWriteResponse.parse(toContract({ row, account: found.account, lines: found.lines }))
  }

  // ── the two halves both minting doors share ──────────────────────────────

  /** Write a brand-new version: row, lines, mirror, and the one edge.
   *
   *  Shared by create and replace because the two differ only in what they read
   *  BEFORE this point. The version number and the node to link behind come from
   *  ONE read of the newest existing version, inside the transaction — asking
   *  twice would let a concurrent insert land between them and produce a version
   *  3 hanging off version 1. */
  private async writeNewVersion(
    who: Actor,
    deal: OpportunityRow,
    code: string,
    write: ReturnType<typeof fromDraft>,
  ): Promise<QuoteWriteResponse> {
    const ownerName = saleOwnerNameOf(deal)

    const done = await this.repo.run(async (tx) => {
      const previous = await this.repo.newestVersion(tx, deal.code)
      const row = await this.repo.insertQuote(tx, {
        ...write.values,
        code,
        version: (previous?.version ?? 0) + 1,
      })
      const lines = await this.repo.replaceLines(tx, code, write.lines)

      /* Mirror BEFORE edge, and here it is a fence rather than discipline:
         `platform.edge` has a foreign key at each end, so an edge into a node
         that does not exist is refused outright. The deal's own mirror row is
         guaranteed on the same line, because the sixteen deals `seed.ts` loaded
         never got one. */
      await this.mirror.put(tx, refOf(row, { account: deal.account, ownerName }))
      await this.deals.ensureMirror(tx, who, deal.code)
      await this.edges.link(tx, {
        from: previous?.code ?? deal.code,
        to: code,
        kind: 'sinh-ra',
      })

      return { row, lines }
    })

    return QuoteWriteResponse.parse(toContract({ ...done, account: deal.account }))
  }

  /** A finished deal takes no more paper.
   *
   *  409 for both endings, and the two sentences differ because the next steps
   *  do: a lost deal is reopened on the deal profile, a signed one is not
   *  reopened at all. Signing is what leaves the sales floor, and undoing it has
   *  to be an approval rather than a side effect of drafting a quote. */
  private refuseClosedDeal(deal: OpportunityRow): void {
    if (deal.state === 'close-lost') {
      throw conflict(`Cơ hội ${deal.code} đã thua — mở lại đơn trước khi báo giá.`)
    }
    if (deal.state === 'close-won') {
      throw conflict(`Cơ hội ${deal.code} đã ký — báo giá mới không sửa được hợp đồng đã ký.`)
    }
  }
}

/** Display name of a Sale on the deal, for the E1 mirror row.
 *
 *  Falls back to the first person listed when nobody holds the SALE role, and to
 *  nothing at all on a deal with no owners — the rail prints a summary line, not
 *  a commission split. */
function saleOwnerNameOf(deal: OpportunityRow): string | null {
  const owner = deal.owners.find((o) => o.role === 'SALE') ?? deal.owners[0]
  return owner?.name ?? null
}
