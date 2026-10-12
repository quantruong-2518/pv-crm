import { Injectable } from '@nestjs/common'
import {
  decideLeadAdmission,
  LEAD_RE_ENTERED,
  leadKeys,
  type Actor,
  type AdmissionBook,
  type AdmissionIncoming,
} from '@pv/engines'
import {
  LeadAdmissionCheckResponse,
  type AdmissionMatch,
  type LeadAdmissionCheckBody,
  type LeadCreate,
  type LeadSourceKind,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid, type PvError } from '@api/platform/http/problem'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { ContactService, type ContactSeed } from '../contact/contact.service'
import { byOf, TouchService } from '../touch/touch.service'
import {
  BIND_BUDGET,
  bookOf,
  incomingOf,
  lockKeysOf,
  needlesOf,
  labelsOf,
  pagesOf,
  toMatch,
  type Assessed,
  type Needles,
} from './lead-admission.mapper'
import { LeadAdmissionRepository, type BookSlice } from './lead-admission.repository'
import { LEAD_GONE_STATES } from './lead-state'

type Caller = Pick<Actor, 'id' | 'name' | 'ownOnly'>

/** What the typed door does next: a lead on `accountCode` (null = find or open
 *  the company by identity), or nothing more because `reentered` took the entry. */
export type TypedAdmission = { accountCode: string | null; reentered: string | null }

const KNOWN = 'Khách này đã có trong sổ. Xem kết quả đối chiếu rồi chọn cách ghi.'
const MOVED = 'Sổ vừa thay đổi. Xem lại kết quả đối chiếu rồi chọn lại.'

/** THE ONE GATE EVERY LEAD DOOR PASSES BEFORE IT WRITES: normalise keys, load
 *  the book slice in six statements whatever the batch size, ask the engine.
 *
 *  A door calls `admit` INSIDE its write transaction and acts on that answer;
 *  an unlocked `assess` is a preview only. The gate writes no lead and no
 *  account — it tells `LeadWriteService.bear` which account it decided, and
 *  never injects that service, so the dependency runs one way. The one write
 *  it owns is `reenter`: an entry that created no lead still leaves a trace. */
@Injectable()
export class LeadAdmissionService {
  constructor(
    private readonly repo: LeadAdmissionRepository,
    private readonly contacts: ContactService,
    private readonly touch: TouchService,
    private readonly hub: NotificationHub,
  ) {}

  /** `POST /sales/leads/admission/check` — reads only. */
  async check(who: Actor, body: LeadAdmissionCheckBody): Promise<LeadAdmissionCheckResponse> {
    const [assessed] = await this.assess(this.repo.readonlyHandle, who, [incomingOf('0', body)])
    return LeadAdmissionCheckResponse.parse(this.toMatch(assessed!))
  }

  /** One decision per item, in order. `who: null` is the anonymous landing
   *  door: nothing is in its scope. */
  async assess(
    handle: Db,
    who: Pick<Actor, 'id' | 'ownOnly'> | null,
    items: readonly AdmissionIncoming[],
  ): Promise<Assessed[]> {
    const needles = needlesOf(items.map((item) => leadKeys(item.company, item.people)))
    const slice = await this.sliceFor(handle, who, needles)
    const labels = labelsOf(slice)
    return decideLeadAdmission(items, bookOf(slice, LEAD_GONE_STATES)).map((decision) => ({
      ...decision,
      ...labels,
    }))
  }

  /** The book alone, for a door whose own engine asks the gate (the scan
   *  plan). `needles` may be a superset of what that engine will ask. */
  async bookFor(
    handle: Db,
    who: Pick<Actor, 'id' | 'ownOnly'> | null,
    needles: Needles,
  ): Promise<AdmissionBook> {
    return bookOf(await this.sliceFor(handle, who, needles), LEAD_GONE_STATES)
  }

  /** THE one loading path: `reach`, then `slice`, each paged past `BIND_BUDGET`. */
  private async sliceFor(
    handle: Db,
    who: Pick<Actor, 'id' | 'ownOnly'> | null,
    needles: Needles,
  ): Promise<BookSlice> {
    const reached = new Set<string>()
    for (const page of pagesOf(needles)) {
      for (const code of await this.repo.reach(handle, page)) reached.add(code)
    }
    const codes = [...reached]
    const slice: BookSlice = { accounts: [], leads: [], contacts: [] }
    for (let i = 0; i < codes.length; i += BIND_BUDGET) {
      const part = await this.repo.slice(handle, who, codes.slice(i, i + BIND_BUDGET))
      slice.accounts.push(...part.accounts)
      slice.leads.push(...part.leads)
      slice.contacts.push(...part.contacts)
    }
    return slice
  }

  toMatch(assessed: Assessed): AdmissionMatch {
    return toMatch(assessed)
  }

  /** Serialises writers on the batch's strong company keys until `tx` ends. */
  async lock(tx: Db, items: readonly AdmissionIncoming[]): Promise<void> {
    await this.repo.lock(tx, lockKeysOf(items.map((item) => leadKeys(item.company, item.people))))
  }

  /** Lock, then decide: the only decisions a door may write on. Two writers
   *  can reach one account by disjoint keys (tax code, name), so the accounts
   *  the first answer resolved to are locked too and the batch asked again. */
  async admitAll(
    tx: Db,
    who: Pick<Actor, 'id' | 'ownOnly'> | null,
    items: readonly AdmissionIncoming[],
  ): Promise<Assessed[]> {
    await this.lock(tx, items)
    const first = await this.assess(tx, who, items)
    const accounts = new Set(first.flatMap((a) => (a.accountCode ? [a.accountCode] : [])))
    if (accounts.size === 0) return first
    await this.repo.lock(tx, [...accounts].map((code) => `account:${code}`).sort())
    return this.assess(tx, who, items)
  }

  async admit(
    tx: Db,
    who: Pick<Actor, 'id' | 'ownOnly'> | null,
    item: AdmissionIncoming,
  ): Promise<Assessed> {
    const [assessed] = await this.admitAll(tx, who, [item])
    return assessed!
  }

  /** The 409 of `AdmissionRefusal`: the Problem filter spreads `extra` into
   *  the body, so the match travels with the refusal. */
  refusal(assessed: Assessed, title = KNOWN): PvError {
    return Object.assign(conflict(title), { extra: { admission: this.toMatch(assessed) } })
  }

  /** An entry that opens no lead: the people the GATE named as new join the
   *  lead — no second identity test may veto it — and the trail records who
   *  came back through which door, with or without somebody new. */
  async reenter(
    tx: Db,
    leadCode: string,
    people: readonly ContactSeed[],
    who: Pick<Actor, 'id' | 'name'> | null,
    door: LeadSourceKind,
  ): Promise<void> {
    await this.contacts.attach(tx, leadCode, people, who)
    const [occurrence] = await this.touch.record(tx, [
      { subjectCode: leadCode, subjectKind: 'lead', kind: 're-entered', ...byOf(who), note: door },
    ])
    /* The holder hears their customer came back through another door (ADR 0085). */
    const held = await this.repo.holderOf(tx, leadCode)
    await this.hub.announce(tx, {
      event: {
        name: LEAD_RE_ENTERED,
        ref: { code: leadCode },
        actorId: who?.id,
        audiences: { holder: held.ownerId ? [held.ownerId] : [] },
        occurrence,
      },
      subject: { kind: 'lead', code: leadCode, label: held.company },
    })
  }

  /** The typed door's rule. Without a choice only a new company goes in; with
   *  one, the choice must have been made on the book as it stands now. A
   *  company may hold several open leads, so `create-lead` is never fenced. */
  async typed(tx: Db, who: Caller, body: LeadCreate): Promise<TypedAdmission> {
    const person = { contactName: body.contactName, email: body.email, phone: body.phone }
    const assessed = await this.admit(tx, who, incomingOf('0', { ...body, people: [person] }))
    const choice = body.admission
    if (!choice) {
      if (assessed.verdict === 'new-account') return { accountCode: null, reentered: null }
      throw this.refusal(assessed)
    }
    /* Against the MATCH: `seen` echoes what the client was shown. */
    const match = this.toMatch(assessed)
    const { seen } = choice
    if (
      seen.verdict !== match.verdict ||
      seen.leadCode !== match.lead?.code ||
      seen.accountCode !== match.account?.code
    ) {
      throw this.refusal(assessed, MOVED)
    }
    if (choice.action === 'create-lead') {
      return { accountCode: assessed.accountCode, reentered: null }
    }
    /* The pick is checked against the re-decided list, never trusted. A row the
       caller picked that is no longer joinable is a moved book: 409 re-asks. */
    const code = choice.leadCode ?? assessed.leadCode
    const target = assessed.leadChoices.find((l) => l.code === code)
    if (!target?.inScope) {
      if (choice.leadCode) throw this.refusal(assessed, MOVED)
      throw invalid({
        admission: ['Chỉ thêm được người liên hệ vào lead đang mở trong phạm vi của bạn.'],
      })
    }
    const fresh = target.newPeople.map(() => ({
      name: body.contactName,
      title: body.contactTitle,
      email: body.email,
      phone: body.phone,
      channel: body.contactChannel,
    }))
    await this.reenter(tx, target.code, fresh, who, 'MANUAL')
    return { accountCode: null, reentered: target.code }
  }
}
