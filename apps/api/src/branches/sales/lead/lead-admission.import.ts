import { leadKeys, type AdmissionIncoming } from '@pv/engines'
import type { LeadImportDup, LeadImportReport } from '@pv/contracts'
import type { ContactSeed } from '../contact/contact.service'
import type { OriginIndex } from '../lead-origin/lead-origin.service'
import { incomingOf, onOthers, toContractVerdict, type Assessed } from './lead-admission.mapper'
import { originTally, type ImportCheck, type ImportLine } from './lead-import.check'

/** THE FILE DOOR'S REACTION TO THE GATE. `checkBatch` settles what each row is
 *  and which rows repeat inside the file; this settles each future lead
 *  against the book, from the verdicts the gate returned for the whole file.
 *
 *  Pure, like the check it follows: the preview and the commit run the same
 *  function, the commit a second time under the gate's lock. */

type Draft = ImportCheck['writes'][number]

export type ImportPlan = {
  report: LeadImportReport
  /** Leads still to write. `accountCode` is the gate's account (null = find or
   *  open by identity); `company` groups drafts that open ONE new company. */
  writes: (Draft & { accountCode: string | null; company: string | null })[]
  /** Existing lead → the people this file adds to it. */
  joins: Map<string, ContactSeed[]>
}

/** The lead's own person first, then its group's others — `Draft.lines` order. */
function peopleOf(draft: Draft): ContactSeed[] {
  const v = draft.values
  const main = {
    name: v.contactName,
    title: v.contactTitle ?? undefined,
    email: v.email,
    phone: v.phone ?? undefined,
    channel: v.contactChannel ?? undefined,
  }
  return [main, ...draft.extras]
}

/** One item per future lead: a group of rows is one item with several people. */
export function incomingOfImport(drafts: readonly Draft[]): AdmissionIncoming[] {
  return drafts.map((draft, i) =>
    incomingOf(String(i), {
      company: draft.values.company,
      taxCode: draft.values.taxCode,
      people: peopleOf(draft).map((p) => ({ contactName: p.name, email: p.email, phone: p.phone })),
    }),
  )
}

type Write = ImportPlan['writes'][number]

/** Who first named a person inside one company of the file, by the gate's two
 *  hard person keys — a row always carries a mailbox, so a name never decides. */
function tagsOf(scope: string, item: AdmissionIncoming, n: number): string[] {
  const { email, phone } = leadKeys({}, item.people).people[n]!
  return [email && `${scope}|e|${email}`, phone && `${scope}|p|${phone}`].filter(
    (t): t is string => !!t,
  )
}

/** `mayAssign` = the importer may put a lead on somebody else's customer. */
export function planImport(
  check: ImportCheck,
  assessed: readonly Assessed[],
  origins: OriginIndex,
  mayAssign: boolean,
): ImportPlan {
  const items = incomingOfImport(check.writes)
  const rows: LeadImportReport['rows'] = []
  const writes: Write[] = []
  const dupWithBook: LeadImportDup[] = []
  const dupWithinFile = [...check.report.dupWithinFile]
  const joins: ImportPlan['joins'] = new Map()
  const joined: NonNullable<LeadImportReport['joined']> = []
  const attached: LeadImportReport['attached'] = []
  /** Lines that leave the lead `checkBatch` put them on. */
  const dropped = new Set<number>()
  const drop = (into: LeadImportDup[], lines: readonly ImportLine[], code?: string) => {
    for (const line of lines) {
      into.push({ ...line, ...(code ? { code } : {}) })
      dropped.add(line.line)
    }
  }
  /** Person tag → the lead of this file that holds them; group ref → its lead. */
  const holder = new Map<string, Write>()
  const opener = new Map<string, Write>()

  check.writes.forEach((draft, i) => {
    const a = assessed[i]!
    const repeated = new Set(a.repeatedPeople)
    if (a.verdict === 'same-lead' || a.verdict === 'new-contact') {
      /* Already on a lead: never a second lead, and its code only in scope. */
      const code = a.outOfScope || !a.leadCode ? undefined : a.leadCode
      /* `lines[n]` is the row of person `n`. Someone the lead lacked joins it
         ONCE: a later row naming them again is a repeat inside the file. */
      const fresh = new Set(code ? a.newPeople : [])
      const added = a.newPeople.filter((n) => fresh.has(n) && !repeated.has(n))
      drop(
        dupWithinFile,
        draft.lines.filter((_, n) => fresh.has(n) && repeated.has(n)),
      )
      drop(
        dupWithBook,
        draft.lines.filter((_, n) => !fresh.has(n)),
        code,
      )
      if (code && added.length > 0) {
        const people = peopleOf(draft)
        joins.set(code, [...(joins.get(code) ?? []), ...added.map((n) => people[n]!)])
        for (const n of added) {
          const { line, first } = draft.lines[n]!
          joined.push({ line, first, code })
          dropped.add(line)
        }
      }
      return
    }
    /* Unsure, and part of the doubt is a customer somebody else holds: only
       someone who may assign writes that. Reported like any hidden duplicate. */
    if (a.verdict === 'needs-review' && onOthers(a) && !mayAssign) {
      return drop(dupWithBook, draft.lines)
    }
    const scope = a.verdict === 'new-account' ? `new:${a.batchGroup}` : `account:${a.accountCode}`
    /* One lead per returning company per file, and a lead whose main contact
       an earlier lead already named is not a second lead: either way its
       not-yet-named people become extra contacts of that earlier lead. */
    const returned = a.verdict === 'returning-account' ? opener.get(`${a.batchGroup}`) : undefined
    const earlier =
      returned ??
      (repeated.has(0) ? tagsOf(scope, items[i]!, 0) : [])
        .map((tag) => holder.get(tag))
        .find((w) => !!w)
    /* A repeated main contact with no earlier lead to move to: all of it repeats. */
    if (repeated.has(0) && !earlier) return drop(dupWithinFile, draft.lines)
    drop(
      dupWithinFile,
      draft.lines.filter((_, n) => repeated.has(n)),
    )
    const people = peopleOf(draft)
    const keep = people.flatMap((_, n) => (repeated.has(n) ? [] : [n]))
    if (earlier) {
      for (const n of keep) {
        const { line, first } = draft.lines[n]!
        earlier.extras.push(people[n]!)
        earlier.lines.push(draft.lines[n]!)
        attached.push({ line, first, into: earlier.lines[0]!.line })
        dropped.add(line)
        for (const tag of tagsOf(scope, items[i]!, n)) holder.set(tag, earlier)
      }
      return
    }
    const write: Write = {
      ...draft,
      extras: draft.extras.filter((_, n) => !repeated.has(n + 1)),
      lines: draft.lines.filter((_, n) => !repeated.has(n)),
      accountCode: a.accountCode,
      company: a.verdict === 'new-account' ? a.batchGroup : null,
    }
    rows.push({
      ...check.report.rows[i]!,
      admission: toContractVerdict(a.verdict),
      /* Only an account the importer may be shown — see `shownAccounts`. */
      ...(a.accountCode && a.names.has(a.accountCode) ? { accountCode: a.accountCode } : {}),
    })
    writes.push(write)
    if (a.verdict === 'returning-account') opener.set(`${a.batchGroup}`, write)
    for (const n of keep) for (const tag of tagsOf(scope, items[i]!, n)) holder.set(tag, write)
  })

  const byLine = (x: { line: number }, y: { line: number }) => x.line - y.line
  return {
    writes,
    joins,
    report: {
      ...check.report,
      rows,
      duplicates: dupWithBook.length,
      dupInFile: dupWithinFile.length,
      dupWithBook: dupWithBook.sort(byLine),
      dupWithinFile: dupWithinFile.sort(byLine),
      attached: [
        ...check.report.attached.filter((entry) => !dropped.has(entry.line)),
        ...attached,
      ].sort(byLine),
      joined: joined.sort(byLine),
      origins: originTally(writes, origins),
    },
  }
}
