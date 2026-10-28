import {
  admissionTied,
  companyDomain,
  foldCompanyName,
  normaliseEmail,
  normalisePhone,
  taxRoot,
  websiteHost,
  type AdmissionDecision,
  type ScanPlan,
  type ScanPlanGroup,
  type ScanPlanPerson,
  type ScanReadFile,
} from '@pv/engines'
import type {
  LeadAttachment,
  ScanExtraction,
  ScanFile,
  ScanGroup,
  ScanPreview,
  WorkstreamDocumentStep,
} from '@pv/contracts'
import { normalisePhone as toE164, websiteOptional } from '@pv/contracts'
import type { AttachmentRowDb } from '@api/platform/storage/attachment.schema'
import type { DocumentStepRowDb } from '../workstream/workstream-document.schema'
import type { ScanBatchRowDb } from './lead-scan.schema'
import type { Needles } from './lead-admission.mapper'
import { UNKNOWN_NAME } from './lead-person-name'
import { sizeBandOfText } from './lead-size-band'
import type { ScanFileJoined } from './lead-scan.repository'
import { stateAtBirth, type LeadValues, type LeadWrite } from './lead-write.mapper'

/** Scan rows ↔ engine types ↔ contract shapes, and a plan group → lead columns.
 *
 *  The engine keeps `fileIds` and phones on a group; the contract does not,
 *  so the preview drops them here. A held group is rebuilt field by field
 *  rather than spread: it carries no `leadCode`, its lead being one the
 *  uploader cannot join. */

export function toReadFiles(files: readonly ScanFileJoined[]): ScanReadFile[] {
  return files
    .filter((f) => f.state === 'READ' && f.extraction)
    .map((f) => ({
      fileId: f.id,
      fileName: f.name,
      people: f.extraction!.people,
      companies: f.extraction!.companies,
      unsure: f.extraction!.unsure,
    }))
}

/** Every key the reads could put to the gate — a SUPERSET of what the plan
 *  asks (it keys one phone per person and one name per group), so the book is
 *  loaded once, before grouping, whatever grouping then decides. */
export function scanNeedlesOf(read: readonly ScanReadFile[]): Needles {
  const people = read.flatMap((f) => f.people)
  const companies = read.flatMap((f) => f.companies)
  const set = (values: readonly (string | null)[], key: (raw: string) => string | null) => [
    ...new Set(values.map((v) => (v ? key(v) : null)).filter((k): k is string => !!k)),
  ]
  const emails = set(
    [...people.map((p) => p.email), ...companies.flatMap((c) => c.emails)],
    normaliseEmail,
  )
  const hosts = [
    ...emails.map((e) => e.split('@')[1]!),
    ...set(
      companies.map((c) => c.website),
      websiteHost,
    ),
  ]
  return {
    taxRoots: set(
      companies.map((c) => c.taxCode),
      taxRoot,
    ),
    nameKeys: set(
      [...companies.flatMap((c) => [c.name, c.legalName]), ...people.map((p) => p.companyName)],
      foldCompanyName,
    ),
    emails,
    phones: set(
      [...people, ...companies].flatMap((x) => x.phones),
      normalisePhone,
    ),
    domains: set(hosts, companyDomain),
  }
}

export function isEmpty(extraction: ScanExtraction): boolean {
  return extraction.people.length === 0 && extraction.companies.length === 0
}

/** The row's result line. */
export function noteOf(extraction: ScanExtraction): string {
  if (isEmpty(extraction)) return 'Không thấy người hay công ty nào'
  return `${extraction.people.length} người · ${extraction.companies.length} công ty`
}

export function toScanFile(f: ScanFileJoined): ScanFile {
  return {
    id: f.id,
    name: f.name,
    mime: f.mime,
    bytes: f.bytes,
    kind: f.kind,
    state: f.state,
    note: f.note,
    error: f.error,
  }
}

function toGroup(g: ScanPlanGroup): ScanGroup {
  const base = {
    key: g.key,
    company: g.company,
    meta: g.meta,
    people: g.people.map((p) => ({ name: p.name ?? UNKNOWN_NAME, title: p.title, email: p.email })),
    fields: g.fields,
  }
  if (g.outcome === 'MERGE_INTO_LEAD') return { ...base, outcome: g.outcome, leadCode: g.leadCode }
  return g.outcome === 'NEW_LEAD' && g.accountCode
    ? { ...base, outcome: g.outcome, accountCode: g.accountCode }
    : { ...base, outcome: g.outcome }
}

export function toPreview(plan: ScanPlan, files: readonly ScanFileJoined[]): ScanPreview {
  return {
    totals: plan.totals,
    groups: plan.groups.map(toGroup),
    skipped: {
      noLead: files.filter((f) => f.state === 'EMPTY').length + plan.noLeadFileIds.length,
      unreadable: files.filter((f) => f.state === 'FAILED').length,
    },
  }
}

/** The `sales.document_step` join row -> the wire step. The table's CHECK keeps
 *  the target columns set, so the `undefined` arms are unreachable. */
function toStep(s: DocumentStepRowDb): WorkstreamDocumentStep | undefined {
  if (s.stepKind === 'quotation') {
    return s.quotationId ? { kind: 'quotation', quotationId: s.quotationId } : undefined
  }
  if (!s.contractCode) return undefined
  if (s.stepKind === 'contract') return { kind: 'contract', contractCode: s.contractCode }
  return s.installmentNo
    ? { kind: 'installment', contractCode: s.contractCode, installmentNo: s.installmentNo }
    : undefined
}

export function toAttachment(
  a: {
    row: AttachmentRowDb
    createdByName: string
    batchCode: string | null
    step?: DocumentStepRowDb | null
  },
  url: string,
  thumbUrl: string | null,
): LeadAttachment {
  return {
    id: a.row.id,
    name: a.row.name,
    mime: a.row.mime,
    bytes: a.row.bytes,
    ...(a.row.width ? { width: a.row.width } : {}),
    ...(a.row.height ? { height: a.row.height } : {}),
    ...(a.row.pages ? { pages: a.row.pages } : {}),
    url,
    thumbUrl,
    createdAt: a.row.createdAt.toISOString(),
    createdBy: { id: a.row.createdBy, name: a.createdByName },
    batchCode: a.batchCode,
    ...(a.step ? { step: toStep(a.step) } : {}),
  }
}

/** Company columns a group can supply. Phone and email are left out: on a lead
 *  they mirror the primary CONTACT, and a company switchboard is not that. */
export function companyValuesOf(g: ScanPlanGroup): Partial<LeadValues> {
  const value = (field: string) => g.fields.find((f) => f.field === field)?.value
  /* The plan shows the site as printed; the column holds the contract's host,
     and a reading the contract refuses is left out. */
  const site = websiteOptional.safeParse(value('website'))
  const out: Partial<LeadValues> = {
    legalName: value('legalName'),
    taxCode: value('taxCode'),
    address: value('address'),
    province: value('province'),
    website: site.success ? site.data : undefined,
    sizeBand: sizeBandOfText(value('headcount')) ?? undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
}

/** `name` stays null here: `seedExtra` must tell a missing name from a real
 *  one, and stores `UNKNOWN_NAME` itself. */
export type ScanContact = { name: string | null; title?: string; email?: string; phone?: string }

/** Every typed door stores E.164 (`phoneOptional`); a scan reads the number as
 *  printed ('+84 395 928 069'), and a stored spelling with spaces is what the
 *  comm log then refused as a malformed phone. */
const storedPhone = (p: ScanPlanPerson): string | undefined =>
  (p.phones[0] && toE164(p.phones[0])) || undefined

export function contactOf(p: ScanPlanPerson): ScanContact {
  const phone = storedPhone(p)
  return {
    name: p.name,
    ...(p.title ? { title: p.title } : {}),
    ...(p.email ? { email: p.email } : {}),
    ...(phone ? { phone } : {}),
  }
}

/** A NEW_LEAD group → the draft `LeadWriteService.bear` writes. `primary` is
 *  the first person with an email — the engine only says NEW_LEAD when one
 *  exists. With no company name printed anywhere, the mailbox stands in: a
 *  shared placeholder would fold unrelated people into one account. */
export function leadWriteOf(
  g: ScanPlanGroup,
  batch: Pick<ScanBatchRowDb, 'motion'>,
  owner: { id: string; name: string },
): { write: LeadWrite; primary: ScanPlanPerson } {
  const primary = g.people.find((p) => p.email)!
  return {
    primary,
    write: {
      ownerName: owner.name,
      values: {
        ...companyValuesOf(g),
        company: g.company || primary.email!,
        contactName: primary.name ?? UNKNOWN_NAME,
        contactTitle: primary.title,
        email: primary.email!,
        phone: storedPhone(primary) ?? null,
        ownerId: owner.id,
        state: stateAtBirth(owner.id),
        sourceKind: 'SCAN',
        motion: batch.motion,
      },
    },
  }
}

/** What the commit may still do with a group once the gate has re-decided
 *  under its lock. `join` = a lead THIS batch opened on the group's company. */
export type ScanAction =
  | { kind: 'create'; accountCode: string | null }
  | { kind: 'merge' | 'join'; leadCode: string }
  | null

/** Null = the book moved since the plan and no longer supports its outcome. */
export function scanActionOf(
  g: ScanPlanGroup,
  fresh: AdmissionDecision,
  opened: readonly string[],
): ScanAction {
  /* Two open leads fit equally: the commit holds where a fresh plan would. */
  if (admissionTied(fresh)) return null
  const onLead = fresh.leadCode && !fresh.outOfScope ? fresh.leadCode : null
  if (g.outcome === 'MERGE_INTO_LEAD') {
    return onLead === g.leadCode ? { kind: 'merge', leadCode: onLead } : null
  }
  if (g.outcome !== 'NEW_LEAD') return null
  /* An earlier group of this batch already opened the lead on the SAME
     returning company: one lead per company per batch, these become contacts. */
  const accountCode = g.accountCode ?? null
  if (onLead && accountCode && fresh.accountCode === accountCode && opened.includes(onLead)) {
    return { kind: 'join', leadCode: onLead }
  }
  const planned = accountCode ? 'returning-account' : 'new-account'
  return fresh.verdict === planned && fresh.accountCode === accountCode
    ? { kind: 'create', accountCode }
    : null
}
