/** Lead admission gate — the one decision every door (form, file, scan,
 *  landing, and doors not built yet) asks before it writes a lead.
 *
 *  Pure and synchronous: the API loads the book slice for a batch's keys and
 *  this file only decides, so two doors can never disagree on what a duplicate
 *  is. The machine decides only on strong evidence; weak or contradicting
 *  evidence goes to a person as `needs-review`.
 *
 *  Types are local because @pv/contracts depends on @pv/engines; the contract
 *  declares the same verdict and key-kind spellings. */

import { groupByLinks, leadKeys } from './lead-keys'
import type { LeadKeyCompany, LeadKeyPerson, LeadKeys, LeadPersonKeys } from './lead-keys'

export const ADMISSION_VERDICTS = [
  'new-account',
  'same-lead',
  'new-contact',
  'returning-account',
  'needs-review',
] as const
export type AdmissionVerdict = (typeof ADMISSION_VERDICTS)[number]

export const ADMISSION_KEY_KINDS = [
  'tax-code',
  'email',
  'phone',
  'company-name',
  'email-domain',
  'person-name',
] as const
export type AdmissionKeyKind = (typeof ADMISSION_KEY_KINDS)[number]

/** Enough on their own to say "this is that account". `company-name` only
 *  counts while the two sides do not carry two different tax roots. */
export const STRONG_ACCOUNT_KEYS: readonly AdmissionKeyKind[] = [
  'tax-code',
  'company-name',
  'email',
]

/** Shared by unrelated companies often enough (a switchboard number, a group
 *  domain) that a match must be confirmed by a person. */
export const WEAK_ACCOUNT_KEYS: readonly AdmissionKeyKind[] = ['email-domain', 'phone']

/** Who a person is inside a matched account, tried in this order. */
export const PERSON_IDENTITY_KEYS = ['email', 'phone', 'person-name'] as const

const PERSON_FIELD = { email: 'email', phone: 'phone', 'person-name': 'name' } as const

export type AdmissionIncoming = {
  /** Caller's own row id, echoed back on the decision. */
  ref: string
  company: LeadKeyCompany
  people: readonly LeadKeyPerson[]
}

/** Keys here must come from `lead-keys` (`taxRoot`, `foldCompanyName`,
 *  `companyDomain`), or equal companies will not meet. */
export type AdmissionBookAccount = {
  code: string
  taxRoot: string | null
  nameKey: string | null
  emailDomains: readonly string[]
}

export type AdmissionBookLead = {
  code: string
  accountCode: string
  /** False = disqualified or closed: it never receives a contact. */
  open: boolean
  /** Whether the caller may see this lead. Reported, never acted on. */
  inScope: boolean
  /** The primary person plus every extra contact, keyed by `leadKeys`. */
  people: readonly LeadPersonKeys[]
}

/** The slice must hold EVERY lead of every account it reaches, not only the
 *  leads a key hit: three verdicts turn on how many open leads an account has. */
export type AdmissionBook = {
  accounts: readonly AdmissionBookAccount[]
  leads: readonly AdmissionBookLead[]
}

export type AdmissionCandidateLead = { code: string; accountCode: string; inScope: boolean }

export type AdmissionDecision = {
  ref: string
  verdict: AdmissionVerdict
  /** Set whenever exactly one account matched, `needs-review` included. */
  accountCode: string | null
  leadCode: string | null
  /** The matched lead is one the caller may not see. */
  outOfScope: boolean
  matchedOn: AdmissionKeyKind[]
  /** Indexes into the item's people that the door still has to write. */
  newPeople: number[]
  /** Filled for `needs-review` only. */
  candidateAccounts: string[]
  candidateLeads: AdmissionCandidateLead[]
  /** `ref` of the first item that creates the same thing: the same new company
   *  (`new-account`) or a new lead on the same account (`returning-account`). */
  batchGroup: string | null
  /** An earlier item of the batch already named one of these people. */
  duplicateInBatch: boolean
  repeatedPeople: number[]
}

type BookIndex = {
  accounts: Map<string, AdmissionBookAccount>
  byTax: Map<string, AdmissionBookAccount[]>
  byName: Map<string, AdmissionBookAccount[]>
  byDomain: Map<string, AdmissionBookAccount[]>
  byEmail: Map<string, AdmissionBookLead[]>
  byPhone: Map<string, AdmissionBookLead[]>
  leadsByAccount: Map<string, AdmissionBookLead[]>
  /** Open leads only, keyed by `personTag` under the lead's account. */
  openByPerson: Map<string, AdmissionBookLead[]>
}

function push<V>(map: Map<string, V[]>, key: string | null, value: V): void {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const personTag = (scope: string, kind: (typeof PERSON_IDENTITY_KEYS)[number], key: string) =>
  `${scope}|${kind}|${key}`

function indexBook(book: AdmissionBook): BookIndex {
  const idx: BookIndex = {
    accounts: new Map(),
    byTax: new Map(),
    byName: new Map(),
    byDomain: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    leadsByAccount: new Map(),
    openByPerson: new Map(),
  }
  for (const account of book.accounts) {
    idx.accounts.set(account.code, account)
    push(idx.byTax, account.taxRoot, account)
    push(idx.byName, account.nameKey, account)
    for (const domain of account.emailDomains) push(idx.byDomain, domain, account)
  }
  for (const lead of book.leads) {
    push(idx.leadsByAccount, lead.accountCode, lead)
    for (const person of lead.people) {
      push(idx.byEmail, person.email, lead)
      push(idx.byPhone, person.phone, lead)
      if (!lead.open) continue
      for (const kind of PERSON_IDENTITY_KEYS) {
        const key = person[PERSON_FIELD[kind]]
        if (key) push(idx.openByPerson, personTag(lead.accountCode, kind, key), lead)
      }
    }
  }
  return idx
}

type Evidence = {
  /** Account code -> every key kind that points at it. */
  kinds: Map<string, Set<AdmissionKeyKind>>
  /** Leads an incoming email or phone sits on, open or not. */
  leads: Set<AdmissionBookLead>
}

function accountEvidence(keys: LeadKeys, idx: BookIndex): Evidence {
  const kinds = new Map<string, Set<AdmissionKeyKind>>()
  const leads = new Set<AdmissionBookLead>()
  const add = (code: string, kind: AdmissionKeyKind) => {
    const own = kinds.get(code)
    if (own) own.add(kind)
    else kinds.set(code, new Set([kind]))
  }
  for (const a of (keys.taxRoot && idx.byTax.get(keys.taxRoot)) || []) add(a.code, 'tax-code')
  for (const a of (keys.nameKey && idx.byName.get(keys.nameKey)) || []) {
    /* Two tax roots under one name are two legal entities, not one account. */
    if (!keys.taxRoot || !a.taxRoot || a.taxRoot === keys.taxRoot) add(a.code, 'company-name')
  }
  for (const domain of keys.domains) {
    for (const a of idx.byDomain.get(domain) ?? []) add(a.code, 'email-domain')
  }
  for (const person of keys.people) {
    for (const kind of ['email', 'phone'] as const) {
      const hit = person[kind]
        ? (kind === 'email' ? idx.byEmail : idx.byPhone).get(person[kind])
        : []
      for (const lead of hit ?? []) {
        add(lead.accountCode, kind)
        leads.add(lead)
      }
    }
  }
  return { kinds, leads }
}

type PersonHit = { kind: AdmissionKeyKind; leads: AdmissionBookLead[] }

/** A name alone identifies somebody only when it is all they came with: names
 *  repeat, and a namesake carrying another mailbox is a second person. */
const identityKinds = (person: LeadPersonKeys) =>
  PERSON_IDENTITY_KEYS.filter((k) => k !== 'person-name' || (!person.email && !person.phone))

function findPerson(person: LeadPersonKeys, accountCode: string, idx: BookIndex): PersonHit | null {
  for (const kind of identityKinds(person)) {
    const key = person[PERSON_FIELD[kind]]
    const leads = key ? idx.openByPerson.get(personTag(accountCode, kind, key)) : undefined
    if (leads) return { kind, leads }
  }
  return null
}

/** One stable order for `matchedOn`, whatever order the evidence arrived in. */
const inKindOrder = (kinds: Iterable<AdmissionKeyKind>): AdmissionKeyKind[] => {
  const set = new Set(kinds)
  return ADMISSION_KEY_KINDS.filter((k) => set.has(k))
}

function decide(ref: string, keys: LeadKeys, idx: BookIndex): AdmissionDecision {
  const base = {
    ref,
    accountCode: null,
    leadCode: null,
    outOfScope: false,
    matchedOn: [],
    newPeople: [],
    candidateAccounts: [],
    candidateLeads: [],
    batchGroup: null,
    duplicateInBatch: false,
    repeatedPeople: [],
  }
  /* A person with no key at all is a blank cell, not someone to write. */
  const everyone = keys.people.flatMap((p, i) => (p.email || p.phone || p.name ? [i] : []))
  const evidence = accountEvidence(keys, idx)
  const kindsOf = (code: string) => [...(evidence.kinds.get(code) ?? [])]
  const review = (
    accounts: string[],
    leads: Iterable<AdmissionBookLead>,
    personKinds: AdmissionKeyKind[] = [],
  ): AdmissionDecision => ({
    ...base,
    verdict: 'needs-review',
    matchedOn: inKindOrder([...accounts.flatMap(kindsOf), ...personKinds]),
    candidateAccounts: accounts,
    candidateLeads: [...leads]
      .filter((l) => accounts.includes(l.accountCode))
      .map(({ code, accountCode, inScope }) => ({ code, accountCode, inScope })),
  })

  const reached = [...evidence.kinds.keys()]
  const strong = reached.filter((code) =>
    STRONG_ACCOUNT_KEYS.some((k) => kindsOf(code).includes(k)),
  )
  if (strong.length === 0) {
    if (reached.length === 0) return { ...base, verdict: 'new-account', newPeople: everyone }
    return review(reached, evidence.leads)
  }
  const accountCode = strong[0]!
  const bookTax = idx.accounts.get(accountCode)?.taxRoot
  /* An email can sit on a lead of an account whose tax root is not ours. */
  const taxClash = !!keys.taxRoot && !!bookTax && bookTax !== keys.taxRoot
  if (strong.length > 1 || taxClash) return review(strong, evidence.leads)

  const open = (idx.leadsByAccount.get(accountCode) ?? []).filter((l) => l.open)
  if (open.length === 0) {
    const matchedOn = inKindOrder(kindsOf(accountCode))
    return { ...base, verdict: 'returning-account', accountCode, matchedOn, newPeople: everyone }
  }
  const hits = keys.people.map((p) => findPerson(p, accountCode, idx))
  const onLeads = new Set(hits.flatMap((h) => h?.leads ?? []))
  const personKinds = hits.flatMap((h) => (h ? [h.kind] : []))
  if (onLeads.size > 1 || (onLeads.size === 0 && open.length > 1)) {
    return { ...review([accountCode], onLeads.size ? onLeads : open, personKinds), accountCode }
  }
  const lead = onLeads.size ? [...onLeads][0]! : open[0]!
  const newPeople = everyone.filter((i) => !hits[i])
  return {
    ...base,
    verdict: newPeople.length ? 'new-contact' : 'same-lead',
    accountCode,
    leadCode: lead.code,
    outOfScope: !lead.inScope,
    matchedOn: inKindOrder([...kindsOf(accountCode), ...personKinds]),
    newPeople,
  }
}

/** Groups the new companies of a batch on strong keys only, then flags people
 *  an earlier item already named — within one new company or one matched
 *  account, since the same name under two companies is two people. */
function markBatch(decisions: AdmissionDecision[], keys: readonly LeadKeys[]): void {
  const fresh = decisions.flatMap((d, i) => (d.verdict === 'new-account' ? [i] : []))
  let links = fresh.map((i) => {
    const { nameKey, taxRoot, people } = keys[i]!
    return [
      taxRoot && `tax:${taxRoot}`,
      nameKey && `name:${nameKey}`,
      ...people.map((p) => p.email && `email:${p.email}`),
    ].filter((l): l is string => !!l)
  })
  /* Union-find is transitive: a shared name or email can chain two tax roots
     into one group. Such a group loses its name links, then its email links,
     because two legal entities must never be created as one account. */
  for (const drop of ['name:', 'email:']) {
    const roots = groupByLinks(links)
    const taxRoots = new Map<number, Set<string>>()
    roots.forEach((root, n) => {
      const tax = keys[fresh[n]!]!.taxRoot
      if (tax) taxRoots.set(root, (taxRoots.get(root) ?? new Set()).add(tax))
    })
    links = links.map((own, n) =>
      (taxRoots.get(roots[n]!)?.size ?? 0) > 1 ? own.filter((l) => !l.startsWith(drop)) : own,
    )
  }
  groupByLinks(links).forEach((root, n) => {
    decisions[fresh[n]!]!.batchGroup = decisions[fresh[root]!]!.ref
  })
  /* Two rows returning to one account must open ONE new lead, not two. */
  const firstReturn = new Map<string, string>()
  for (const d of decisions) {
    if (d.verdict !== 'returning-account' || !d.accountCode) continue
    if (!firstReturn.has(d.accountCode)) firstReturn.set(d.accountCode, d.ref)
    d.batchGroup = firstReturn.get(d.accountCode)!
  }

  const seen = new Set<string>()
  decisions.forEach((d, i) => {
    const scope = d.verdict === 'new-account' ? `new:${d.batchGroup}` : `account:${d.accountCode}`
    if (d.verdict === 'needs-review') return
    const tags = keys[i]!.people.map((p) =>
      identityKinds(p).flatMap((kind) => {
        const key = p[PERSON_FIELD[kind]]
        return key ? [personTag(scope, kind, key)] : []
      }),
    )
    d.repeatedPeople = tags.flatMap((own, n) => (own.some((t) => seen.has(t)) ? [n] : []))
    d.duplicateInBatch = d.repeatedPeople.length > 0
    for (const tag of tags.flat()) seen.add(tag)
  })
}

/** One decision per incoming item, in the order given. */
export function decideLeadAdmission(
  incoming: readonly AdmissionIncoming[],
  book: AdmissionBook,
): AdmissionDecision[] {
  const idx = indexBook(book)
  const keys = incoming.map((item) => leadKeys(item.company, item.people))
  const decisions = incoming.map((item, i) => decide(item.ref, keys[i]!, idx))
  markBatch(decisions, keys)
  return decisions
}
