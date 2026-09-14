import { Injectable, Logger } from '@nestjs/common'
import { decideOn, isPendingFor, type Actor, type ChainLink, type RoleId } from '@pv/engines'
import {
  PendingApprovalsResponse,
  type ApprovalDecisionBody,
  type ApprovalKind,
  type ApprovalRequestView,
} from '@pv/contracts'
import { conflict, denied, invalid, notFound } from '@api/platform/http/problem'
import type { Db } from '../db/db.module'
import { toContract } from './approval.mapper'
import { ApprovalRepository } from './approval.repository'
import type { ApprovalRowDb } from './approval.schema'

/** What a branch does once its own kind of request has been approved.
 *
 *  It receives the transaction that settled the request, and that is the whole
 *  design: approving and applying are one unit of work. A row reading
 *  `approved` while the change it approved never happened is the failure nobody
 *  can see afterwards — the request looks decided, the configuration looks
 *  untouched, and nothing anywhere is red. */
export interface ApprovalApplier {
  apply(tx: Db, request: ApprovalRowDb): Promise<void>
}

/** Which branch applies which kind.
 *
 *  This is how `platform` stays ignorant of `branches/` while still finishing
 *  the job: the branch module registers itself on boot, and this layer only
 *  ever knows "somebody handles `config-change`". The alternative — a `switch`
 *  in this file — would make `platform` import Sales, which the import rules in
 *  `eslint.config.js` refuse outright. */
@Injectable()
export class ApprovalAppliers {
  private readonly byKind = new Map<ApprovalKind, ApprovalApplier>()

  register(kind: ApprovalKind, applier: ApprovalApplier): void {
    const already = this.byKind.get(kind)
    /* Two branches claiming one kind is a wiring mistake that would otherwise
       show up as "the second one silently never runs". */
    if (already && already !== applier) {
      throw new Error(`platform.approval: kind ${kind} already has an applier`)
    }
    this.byKind.set(kind, applier)
  }

  get(kind: ApprovalKind): ApprovalApplier | undefined {
    return this.byKind.get(kind)
  }
}

/** E3's server half: the inbox, and the one door that moves a request.
 *
 *  ------------------------------------------------------------------
 *  THE LAW IS NOT IN HERE
 *  ------------------------------------------------------------------
 *  Whose turn it is, whether a request can still be decided, and what the whole
 *  request becomes after one person answers — all of that is `decideOn` in
 *  `@pv/engines`, a pure function this service feeds with a row it loaded.
 *  Writing those rules here instead would fork E3: the browser would approve by
 *  one law and the server by another, and `engines.module.ts` spells out why
 *  this codebase refuses forks.
 *
 *  What lives here is everything the engine must not know: rows, transactions,
 *  HTTP statuses.
 *
 *  ------------------------------------------------------------------
 *  WHY THE IN-MEMORY ENGINE IS NOT REGISTERED AS `APPROVALS`
 *  ------------------------------------------------------------------
 *  `createApprovalEngine()` keeps requests in a `Map` that dies with the
 *  process — one deploy and every pending request is gone. `config.approval.ts`
 *  already said it out loud: wiring a door to that and answering 202 is lying
 *  to the person who pressed the button. So the token stays unused, the store
 *  is Postgres, and the shared law is the pure functions beside it. */
@Injectable()
export class ApprovalService {
  private readonly log = new Logger('platform.approval')

  constructor(
    private readonly repo: ApprovalRepository,
    private readonly appliers: ApprovalAppliers,
  ) {}

  /** The approval chain for a list of roles, in the order given.
   *
   *  A `ChainLink` carries a NAME, so somebody has to turn a role into the
   *  person holding it — and this is the only place that should, because branches
   *  would otherwise grow its own copy of the lookup and they would answer
   *  differently the day a role has nobody in it.
   *
   *  An empty seat is refused rather than skipped: a chain built by dropping
   *  the missing approver is a request that approves itself, which is the one
   *  outcome an approval chain exists to prevent. Fail closed, like every other
   *  gate in this codebase.
   *
   *  One seat per role is the staff book's own rule; where two people hold a
   *  role the lowest actor id wins, so the same request always waits on the
   *  same person instead of alternating between them per call. */
  async chainFor(roles: readonly RoleId[]): Promise<ChainLink[]> {
    const holders = await this.repo.holdersOf(roles)

    return roles.map((role) => {
      const person = holders.find((h) => h.roleId === role)
      if (!person) throw new Error(`platform.approval: no actor holds role ${role}`)
      return { role, person: person.name, state: 'waiting' as const }
    })
  }

  /** Raise a request. The branch has already checked what it is asking for.
   *
   *  Nothing is validated twice here: an empty chain and an AI proposal with no
   *  grounds are both refused by CHECK constraints on the table, which hold for
   *  every door at once rather than only the ones that remembered to look. */
  async open(
    who: Actor,
    draft: {
      kind: ApprovalKind
      consequence: string
      payload: unknown
      chain: ChainLink[]
      links?: readonly { objectCode: string; objectLabel: string }[]
      ai?: { basis: string }
    },
  ): Promise<ApprovalRowDb> {
    /* Refused BEFORE the row exists, not after somebody approves it: a request
       nobody can apply is a promise the system cannot keep, and the cheapest
       moment to say so is now. */
    if (!this.appliers.get(draft.kind)) {
      throw new Error(`platform.approval: no applier registered for kind ${draft.kind}`)
    }

    return this.repo.open(
      {
        kind: draft.kind,
        raisedById: who.id,
        raisedBy: who.name,
        fromAi: draft.ai !== undefined,
        basis: draft.ai?.basis ?? null,
        consequence: draft.consequence,
        payload: draft.payload,
        chain: draft.chain,
      },
      draft.links ?? [],
    )
  }

  /** The inbox: what is still waiting on this person. */
  async pendingFor(who: Actor): Promise<PendingApprovalsResponse> {
    /* Two steps on purpose: the query narrows by index, the ENGINE decides. A
       row mentioning this person further down a chain comes back from SQL and
       is dropped here, because a chain is walked in order — see `isPendingFor`,
       the same function the browser calls. */
    const rows = (await this.repo.waitingFor(who.name)).filter((r) => isPendingFor(r, who))
    const links = await this.repo.linksOf(rows.map((r) => r.id))

    return PendingApprovalsResponse.parse({
      rows: rows.map((row) =>
        toContract(
          row,
          links.filter((l) => l.requestId === row.id),
        ),
      ),
    })
  }

  /** What is still waiting on one object — the `approvals` input every caller of
   *  `pipelinePosition` has to supply.
   *
   *  Rows rather than views: the engine reads `state` and `chain` and nothing
   *  else, and a branch asking "who is this waiting on" has no business being
   *  handed the payload of a request it did not raise. */
  pendingOn(objectCode: string): Promise<ApprovalRowDb[]> {
    return this.repo.waitingOnObject(objectCode)
  }

  /** One person's yes or no — and, on the last yes, the change itself.
   *
   *  The order matters and is not arrangeable any other way: load, ask the
   *  engine, then settle and apply INSIDE one transaction. The guarded UPDATE
   *  is what makes two approvers pressing at once safe — the second one finds
   *  the row no longer `waiting` and is told so, instead of overwriting the
   *  first decision. */
  async decide(who: Actor, id: string, body: ApprovalDecisionBody): Promise<ApprovalRequestView> {
    const row = await this.repo.byId(id)
    if (!row) throw notFound('approval', id)

    const verdict = decideOn(row, who, body.decision, new Date().toISOString())

    if (!verdict.ok) {
      if (verdict.reason === 'already-decided') {
        throw conflict('Yêu cầu này đã được quyết rồi.')
      }
      if (verdict.reason === 'not-your-turn') {
        throw denied('out-of-scope', `Yêu cầu này đang chờ ${verdict.waitingFor ?? 'người khác'}.`)
      }
      /* `unknown` cannot happen — the row was just loaded — and `nobody-waiting`
         means a `waiting` row with no waiting link, which the chain CHECK is
         supposed to prevent. Both are bugs here, not user mistakes. */
      throw invalid({ decision: ['Yêu cầu này không còn quyết được nữa.'] })
    }

    const settled = verdict.request
    const applier = this.appliers.get(row.kind)
    if (settled.state === 'approved' && !applier) {
      throw new Error(`platform.approval: no applier registered for kind ${row.kind}`)
    }

    /* The row as it will be stored. Built ONCE, so what the applier sees, what
       the table holds and what the caller is answered with cannot drift — and
       `decidedAt` is a `Date` here rather than the engine's ISO string, because
       every consumer of `ApprovalRowDb` is entitled to the column's own type. */
    const after: ApprovalRowDb = {
      ...row,
      state: settled.state,
      chain: settled.chain,
      decidedAt: settled.decidedAt ? new Date(settled.decidedAt) : null,
      decidedBy: settled.decidedBy ?? null,
      decidedReason: body.decision === 'rejected' ? body.reason : null,
    }

    const moved = await this.repo.run(async (tx) => {
      const won = await this.repo.settle(tx, id, {
        state: after.state,
        chain: after.chain,
        decidedAt: after.decidedAt,
        decidedBy: after.decidedBy,
        decidedReason: after.decidedReason,
      })
      if (!won) return false

      /* Applied in the same transaction that settled it, so a failure here
         takes the decision back with it rather than leaving an approval whose
         change never happened. A change that can no longer be applied — because
         somebody else's approval landed first and took the name — therefore
         leaves the request WAITING rather than approved-but-not-done. */
      if (after.state === 'approved' && applier) await applier.apply(tx, after)

      return true
    })

    if (!moved) throw conflict('Yêu cầu này vừa được người khác quyết.')

    this.log.log(`${id} · ${row.kind} · ${after.state} · by ${who.id}`)

    const links = await this.repo.linksOf([id])
    return toContract(after, links)
  }
}
