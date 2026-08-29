import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  ContractBookResponse,
  ContractBookRow,
  type ContractBookQuery,
  type ContractTermDraft,
  type ContractTermPatch,
  type MaHopDong,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { fromTermDraft, fromTermPatch, toBookRow, toRef } from './contract.mapper'
import { ContractRepository } from './contract.repository'

/** Module 4 · the contract book, and the payment plan on a contract.
 *
 *  ------------------------------------------------------------------
 *  READ ONLY ON THE CONTRACT ITSELF; WRITES ONLY ON ITS INSTALMENTS
 *  ------------------------------------------------------------------
 *  There is no door here that creates, edits or cancels a contract, and that is
 *  §11.2 of `docs/tam-nhin-bao-gia-hop-dong.md` rather than an unfinished file.
 *  Signing stays where it is — `POST /sales/opportunities/:code/contract`, an
 *  action on a DEAL — and un-signing is deliberately not offered anywhere: a
 *  signature has already reached the customer and the accountant, so undoing it
 *  has to be a proposal somebody approves through E3, not one call by whoever
 *  just mis-clicked.
 *
 *  The instalments are a different object with a different risk. They are the
 *  collection PLAN written on the contract paper; money actually arriving is
 *  Finance's table in a later module. So they get write doors, and those doors
 *  ask for the contract-edit permission rather than the deal-closing one. */
@Injectable()
export class ContractService {
  constructor(
    private readonly repo: ContractRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** `GET /sales/contracts` — the book.
   *
   *  Two nets on the scope axis, same as the Ops book: SQL has already cut by
   *  scope, so E2 normally cuts nothing more — and that is the point. The inner
   *  net only has work on the day somebody adds an endpoint and forgets
   *  `scoped: true`. Both nets read the DEAL's owners, so they ask one question
   *  and cannot disagree; the reasoning is on `ContractBookRead.scopeOwner`.
   *
   *  `hidden` adds the two nets' counts rather than taking the larger: they cut
   *  the same rows today, so the second term is zero, and the day it is not,
   *  a row that only the inner net caught is a row the caller genuinely did not
   *  receive. Under-reporting it would break the rule 7 line on screen. */
  async book(who: Actor, q: ContractBookQuery): Promise<ContractBookResponse> {
    const page = await this.repo.book(who, q, true)

    const items = page.rows.map((r) => ({ read: r, ref: toRef(r) }))
    const { visible, hidden } = this.access.visible(who, items)

    /* Validating what we ourselves emit, against the contract. A column that
       changed type, a field the mapper forgot — both pass `tsc` when the mapper
       is wrong in the same direction, and neither passes this. Bounded above by
       `size`, capped at 200 rows. */
    return ContractBookResponse.parse({
      rows: visible.map((v) => toBookRow(v.read)),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** `GET /sales/contracts/:code` — one contract, with its instalments.
   *
   *  404 and 403 are two different answers here, and the book cannot give
   *  either: a book answers an out-of-scope reader by dropping rows and
   *  reporting `hidden`, while a profile holds exactly one row and so has
   *  nothing to drop. Same split `OpportunityService.profile` makes. */
  async profile(who: Actor, code: MaHopDong): Promise<ContractBookRow> {
    return ContractBookRow.parse(toBookRow(await this.mine(who, code)))
  }

  /** `POST /sales/contracts/:code/terms` — add one instalment.
   *
   *  The number is minted inside the transaction that writes the row, so two
   *  people adding an instalment at once cannot both be told they wrote
   *  "instalment 3". Answers the WHOLE contract row rather than the instalment
   *  alone: the caller is a card that draws the plan and its total, and both
   *  change when a line is added — the convention both write doors on the Ops
   *  book already follow. */
  async addTerm(who: Actor, code: MaHopDong, body: ContractTermDraft): Promise<ContractBookRow> {
    await this.mine(who, code)

    await this.repo.run(async (tx) => {
      const termNo = await this.repo.nextTermNo(tx, code)
      await this.repo.insertTerm(tx, fromTermDraft(body, code, termNo))
    })

    return this.profile(who, code)
  }

  /** `PATCH /sales/contracts/:code/terms` — change one instalment.
   *
   *  Which one is in the body, not the path: an instalment is not addressable
   *  on its own, it is a line of one contract and its key is the pair.
   *
   *  A body that names an instalment the contract does not have is a 404 naming
   *  the number, not a silent success — the repository answers `false` rather
   *  than pretending an `UPDATE` that touched no row did something. */
  async patchTerm(who: Actor, code: MaHopDong, body: ContractTermPatch): Promise<ContractBookRow> {
    await this.mine(who, code)

    const values = fromTermPatch(body)
    if (Object.keys(values).length === 0) {
      throw conflict(`Đợt ${body.termNo} không có ô nào để sửa — thân request rỗng.`)
    }

    const written = await this.repo.run((tx) => this.repo.updateTerm(tx, code, body.termNo, values))
    if (!written) throw notFound(`đợt ${body.termNo} của hợp đồng`, code)

    return this.profile(who, code)
  }

  /** The gate every door above walks through: the contract exists AND it stands
   *  on a deal in this reader's scope.
   *
   *  One helper rather than three copies, because the pair of answers has to
   *  stay in this order everywhere — a 404 for a contract the reader may not see
   *  would leak nothing, but a 403 for one that does not exist tells the caller
   *  a code is real. */
  private async mine(who: Actor, code: MaHopDong) {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('hợp đồng', code)
    if (!found.inScope) throw denied('out-of-scope')
    return found
  }
}
