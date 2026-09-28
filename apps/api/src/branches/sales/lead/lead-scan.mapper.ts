import type { ScanPlan, ScanPlanGroup, ScanPlanPerson, ScanReadFile } from '@pv/engines'
import type {
  LeadAttachment,
  ScanExtraction,
  ScanFile,
  ScanGroup,
  ScanPreview,
} from '@pv/contracts'
import type { AttachmentRowDb } from '@api/platform/storage/attachment.schema'
import type { ScanBatchRowDb } from './lead-scan.schema'
import type { ScanFileJoined } from './lead-scan.repository'
import { stateAtBirth, type LeadValues, type LeadWrite } from './lead-write.mapper'

/** Scan rows ↔ engine types ↔ contract shapes, and a plan group → lead columns.
 *
 *  The engine keeps `fileIds` and phones on a group; the contract does not,
 *  so the preview drops them here. A held group is rebuilt field by field
 *  rather than spread, so a `leadCode` can never ride out on it. */

/** A scanned person with no readable name still has to print, and to store. */
export const UNKNOWN_NAME = 'Chưa rõ tên'

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
  return g.outcome === 'MERGE_INTO_LEAD'
    ? { ...base, outcome: g.outcome, leadCode: g.leadCode }
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

export function toAttachment(
  a: { row: AttachmentRowDb; createdByName: string; batchCode: string | null },
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
  }
}

/** First integer printed ("200+", "1.200 staff"); null when none. */
export function headcountOf(raw: string | undefined): number | null {
  const digits = raw?.match(/\d[\d.,]*/)?.[0].replace(/\D/g, '')
  const n = digits ? Number(digits) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** Company columns a group can supply. Phone and email are left out: on a lead
 *  they mirror the primary CONTACT, and a company switchboard is not that. */
export function companyValuesOf(g: ScanPlanGroup): Partial<LeadValues> {
  const value = (field: string) => g.fields.find((f) => f.field === field)?.value
  const out: Partial<LeadValues> = {
    legalName: value('legalName'),
    taxCode: value('taxCode'),
    address: value('address'),
    province: value('province'),
    headcount: headcountOf(value('headcount')) ?? undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined))
}

/** `name` stays null here: `seedExtra` must tell a missing name from a real
 *  one, and stores `UNKNOWN_NAME` itself. */
export type ScanContact = { name: string | null; title?: string; email?: string; phone?: string }

export function contactOf(p: ScanPlanPerson): ScanContact {
  return {
    name: p.name,
    ...(p.title ? { title: p.title } : {}),
    ...(p.email ? { email: p.email } : {}),
    ...(p.phones[0] ? { phone: p.phones[0] } : {}),
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
        phone: primary.phones[0] ?? null,
        ownerId: owner.id,
        state: stateAtBirth(owner.id),
        sourceKind: 'SCAN',
        motion: batch.motion,
      },
    },
  }
}
