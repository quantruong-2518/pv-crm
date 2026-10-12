import { leadKeys, type AdmissionIncoming } from '@pv/engines'
import type { LeadImportDup, LeadImportReport } from '@pv/contracts'
import type { ContactSeed } from '../contact/contact.service'
import type { OriginIndex } from '../lead-origin/lead-origin.service'
import { incomingOf, toContractVerdict, type Assessed } from './lead-admission.mapper'
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

/** A group whose main contact is already in the book still opens its lead:
 *  the first person left leads it, on the main row's company cells. A file
 *  row always carries a mailbox. */
function promoted(values: Draft['values'], person: ContactSeed): Draft['values'] {
  return {
    ...values,
    contactName: person.name,
    contactTitle: person.title ?? null,
    email: person.email!,
    phone: person.phone ?? null,
    contactChannel: person.channel ?? null,
  }
}

/** Who first named a person inside one company of the file, by the gate's two
 *  hard person keys — a row always carries a mailbox, so a name never decides. */
function tagsOf(scope: string, item: AdmissionIncoming, n: number): string[] {
  const { email, phone } = leadKeys({}, item.people).people[n]!
  return [email && `${scope}|e|${email}`, phone && `${scope}|p|${phone}`].filter(
    (t): t is string => !!t,
  )
}

export function planImport(
  check: ImportCheck,
  assessed: readonly Assessed[],
  origins: OriginIndex,
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
  /** Person tag → the lead of this file that holds them; account → its lead. */
  const holder = new Map<string, Write>()
  const opener = new Map<string, Write>()

  check.writes.forEach((draft, i) => {
    const a = assessed[i]!
    const repeated = new Set(a.repeatedPeople)
    const people = peopleOf(draft)
    /** People some open lead of the company already holds; `lines[n]` is person `n`. */
    const known = new Set<number>()
    let reopens = a.verdict === 'returning-account'
    if (a.verdict === 'same-lead' || a.verdict === 'new-contact') {
      /* Per PERSON, not per draft: the first-ranked lead may be a colleague's
         while the importer holds another open lead of the same company. */
      draft.lines.forEach((line, n) => {
        const on = a.leadChoices.find((l) => !l.newPeople.includes(n))
        if (!on) return
        drop(dupWithBook, [line], on.code)
        known.add(n)
      })
      const mine = a.leadChoices.find((l) => l.inScope)
      if (mine) {
        /* Someone no lead holds joins the importer's lead ONCE: a later row
           naming them again is a repeat inside the file. */
        const fresh = people.flatMap((_, n) => (known.has(n) ? [] : [n]))
        const added = fresh.filter((n) => !repeated.has(n))
        drop(
          dupWithinFile,
          fresh.filter((n) => repeated.has(n)).map((n) => draft.lines[n]!),
        )
        if (added.length > 0) {
          joins.set(mine.code, [...(joins.get(mine.code) ?? []), ...added.map((n) => people[n]!)])
        }
        for (const n of added) {
          const { line, first } = draft.lines[n]!
          joined.push({ line, first, code: mine.code })
          dropped.add(line)
        }
        return
      }
      /* No open lead here is the importer's to write on: the new people open
         another lead on the company, as a returning company's would. */
      reopens = true
    }
    const scope = a.verdict === 'new-account' ? `new:${a.batchGroup}` : `account:${a.accountCode}`
    /* One lead per known company per file, and a lead whose main contact an
       earlier lead already named is not a second lead: either way its
       not-yet-named people become extra contacts of that earlier lead. */
    const returned = reopens && a.accountCode ? opener.get(a.accountCode) : undefined
    const earlier =
      returned ??
      (repeated.has(0) ? tagsOf(scope, items[i]!, 0) : [])
        .map((tag) => holder.get(tag))
        .find((w) => !!w)
    const unplaced = draft.lines.filter((_, n) => !known.has(n))
    /* A repeated main contact with no earlier lead to move to: all of it repeats. */
    if (repeated.has(0) && !known.has(0) && !earlier) return drop(dupWithinFile, unplaced)
    drop(
      dupWithinFile,
      draft.lines.filter((_, n) => repeated.has(n) && !known.has(n)),
    )
    const keep = people.flatMap((_, n) => (repeated.has(n) || known.has(n) ? [] : [n]))
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
    const [head, ...rest] = keep
    if (head === undefined) return
    const write: Write = {
      ...draft,
      values: head === 0 ? draft.values : promoted(draft.values, people[head]!),
      extras: rest.map((n) => people[n]!),
      lines: keep.map((n) => draft.lines[n]!),
      accountCode: a.accountCode,
      company: a.verdict === 'new-account' ? a.batchGroup : null,
    }
    const main = write.lines[0]!
    /* A promoted row leads: the report names it, and the group's `attached`
       entries, which pointed at the old main row, are re-pointed at it. */
    for (const { line, first } of head === 0 ? [] : write.lines) {
      dropped.add(line)
      if (line !== main.line) attached.push({ line, first, into: main.line })
    }
    const row = check.report.rows[i]!
    const { contactName, email } = write.values
    rows.push({
      ...row,
      ...(head === 0
        ? {}
        : { line: main.line, key: main.key, values: { ...row.values, contactName, email } }),
      admission: toContractVerdict(a.verdict),
      ...(a.accountCode ? { accountCode: a.accountCode } : {}),
    })
    writes.push(write)
    if (reopens && a.accountCode) opener.set(a.accountCode, write)
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
