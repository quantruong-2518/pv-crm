import {
  leadKeys,
  type AdmissionBook,
  type AdmissionDecision,
  type AdmissionIncoming,
  type AdmissionKeyKind,
  type AdmissionVerdict as EngineVerdict,
  type LeadKeyPerson,
  type LeadKeys,
} from '@pv/engines'
import {
  ADMISSION_CANDIDATE_CAP,
  type AdmissionMatch,
  type AdmissionMatchKey,
  type AdmissionVerdict as ContractVerdict,
} from '@pv/contracts'
import type { BookSlice } from './lead-admission.repository'
import { keyable } from './lead-person-name'

/** WHERE THE ENGINE'S ADMISSION UNIONS MEET THE CONTRACT'S. The engine cannot
 *  import the contract (the dependency runs the other way), so both spell the
 *  verdicts and key kinds themselves; these four functions are the compiler
 *  check that they still agree — the pattern `auth.mapper.ts` uses for roles. */
export const toContractVerdict = (v: EngineVerdict): ContractVerdict => v
export const toEngineVerdict = (v: ContractVerdict): EngineVerdict => v
export const toContractKey = (k: AdmissionKeyKind): AdmissionMatchKey => k
export const toEngineKey = (k: AdmissionMatchKey): AdmissionKeyKind => k

/** A decision with what the wire answer prints beside its codes: account
 *  names by account code, lead owners by lead code (null = nobody holds it). */
export type Assessed = AdmissionDecision & {
  names: ReadonlyMap<string, string>
  owners: ReadonlyMap<string, string | null>
  /** Leads not switched off. A switched-off lead is absent, never listed. */
  live: ReadonlySet<string>
}

/** Nobody holds a company, only a lead: every account and every lead owner of
 *  the slice is shown to every caller. */
export function labelsOf(slice: BookSlice): Pick<Assessed, 'names' | 'owners' | 'live'> {
  return {
    names: new Map(slice.accounts.map((a) => [a.code, a.name])),
    owners: new Map(slice.leads.map((l) => [l.code, l.ownerName])),
    live: new Set(slice.leads.filter((l) => l.live).map((l) => l.code)),
  }
}

/** The company and people of one form, in the engine's spelling. */
export function incomingOf(
  ref: string,
  form: {
    company: string
    taxCode?: string | null
    people: readonly { contactName: string; email?: string | null; phone?: string | null }[]
  },
): AdmissionIncoming {
  return {
    ref,
    company: { name: form.company, taxCode: form.taxCode },
    people: form.people.map((p) =>
      keyable({ name: p.contactName, email: p.email, phone: p.phone }),
    ),
  }
}

/** Every key of a batch, deduplicated: what round 1 searches the book for. */
export type Needles = {
  taxRoots: string[]
  nameKeys: string[]
  emails: string[]
  phones: string[]
  domains: string[]
}

const present = (values: (string | null)[]): string[] => [
  ...new Set(values.filter((v): v is string => !!v)),
]

export function needlesOf(keys: readonly LeadKeys[]): Needles {
  const people = keys.flatMap((k) => k.people)
  return {
    taxRoots: present(keys.map((k) => k.taxRoot)),
    nameKeys: present(keys.map((k) => k.nameKey)),
    emails: present(people.map((p) => p.email)),
    phones: present(people.map((p) => p.phone)),
    domains: present(keys.flatMap((k) => k.domains)),
  }
}

/** The strong keys of a batch — tax root, name key, and every mailbox, so one
 *  person under two company spellings still serialises — SORTED: two writers
 *  that lock in one order cannot wait on each other. */
export function lockKeysOf(keys: readonly LeadKeys[]): string[] {
  return present(
    keys.flatMap((k) => [
      k.taxRoot && `tax:${k.taxRoot}`,
      k.nameKey && `name:${k.nameKey}`,
      ...k.people.map((p) => p.email && `email:${p.email}`),
    ]),
  ).sort()
}

/** Bind parameters one statement may carry: well under Postgres' 65,535. */
export const BIND_BUDGET = 30_000

/** Needles cut so no statement of `reach` binds more than `BIND_BUDGET`: its
 *  widest statement takes three sets. A 5,000-row file fits one page. */
export function pagesOf(n: Needles): Needles[] {
  const size = BIND_BUDGET / 3
  const pages = Math.max(1, ...Object.values(n).map((set) => Math.ceil(set.length / size)))
  return Array.from({ length: pages }, (_, i) => ({
    taxRoots: n.taxRoots.slice(i * size, (i + 1) * size),
    nameKeys: n.nameKeys.slice(i * size, (i + 1) * size),
    emails: n.emails.slice(i * size, (i + 1) * size),
    phones: n.phones.slice(i * size, (i + 1) * size),
    domains: n.domains.slice(i * size, (i + 1) * size),
  }))
}

/** Rows → the engine's book. Keys are folded here from the RAW columns by
 *  `leadKeys`, so a row whose stored key predates the backfill still compares
 *  the way the incoming side does; stored keys only serve round 1's lookup. */
export function bookOf(slice: BookSlice, gone: readonly string[]): AdmissionBook {
  const people = new Map<string, LeadKeyPerson[]>()
  for (const lead of slice.leads) {
    people.set(lead.code, [
      keyable({ name: lead.contactName, email: lead.email, phone: lead.phone }),
    ])
  }
  for (const contact of slice.contacts) people.get(contact.leadCode)?.push(keyable(contact))

  const domains = new Map<string, Set<string>>()
  const leads = slice.leads.map((lead) => {
    const keys = leadKeys({}, people.get(lead.code) ?? [])
    const own = domains.get(lead.accountCode) ?? new Set<string>()
    for (const domain of keys.domains) own.add(domain)
    domains.set(lead.accountCode, own)
    return {
      code: lead.code,
      accountCode: lead.accountCode,
      /* Switched off is not open: its customer returns as a new lead. */
      open: lead.live && !gone.includes(lead.state),
      inScope: lead.inScope,
      people: keys.people,
    }
  })
  const accounts = slice.accounts.map((account) => {
    const { taxRoot, nameKey } = leadKeys(account, [])
    return {
      code: account.code,
      taxRoot,
      nameKey,
      emailDomains: [...(domains.get(account.code) ?? [])],
    }
  })
  return { accounts, leads }
}

/** The wire answer. A lead outside the caller's scope is still named, with its
 *  owner, so the caller knows whom to ask; `outOfScope` only says they cannot
 *  open or join it. `candidates` carry the decision's `matchedOn`: the engine
 *  reports kinds per decision. */
export function toMatch(a: Assessed): AdmissionMatch {
  const accountOf = (code: string | null) => {
    const name = code ? a.names.get(code) : undefined
    return code && name !== undefined ? { code, name } : null
  }
  const leadOf = (code: string) => ({ code, ownerName: a.owners.get(code) ?? null })
  const matchedOn = a.matchedOn.map(toContractKey)
  const listed = a.candidateLeads.filter((l) => a.live.has(l.code))
  const withLead = new Set(listed.map((l) => l.accountCode))
  const candidates = [
    ...listed.map((l) => ({
      account: accountOf(l.accountCode),
      lead: leadOf(l.code),
      outOfScope: !l.inScope,
      matchedOn,
    })),
    ...a.candidateAccounts
      .filter((code) => !withLead.has(code))
      .map((code) => ({
        account: accountOf(code),
        lead: null,
        outOfScope: false,
        matchedOn,
      })),
  ]
  return {
    verdict: toContractVerdict(a.verdict),
    account: accountOf(a.accountCode),
    lead: a.leadCode ? leadOf(a.leadCode) : null,
    outOfScope: a.outOfScope,
    matchedOn,
    newPeople: a.newPeople.length,
    leads: a.leadChoices.slice(0, ADMISSION_CANDIDATE_CAP).map((l) => ({
      ...leadOf(l.code),
      outOfScope: !l.inScope,
      newPeople: l.newPeople.length,
    })),
    candidates: a.verdict === 'needs-review' ? candidates.slice(0, ADMISSION_CANDIDATE_CAP) : [],
  }
}
