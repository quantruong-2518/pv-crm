import type { ZodType } from 'zod'
import {
  ContactChannel,
  LEAD_MAX,
  LEAD_NUM,
  LeadCategory,
  LeadTier,
  email as emailField,
  phoneOptional,
  taxCodeOptional,
  textNhap,
  textNhapTuyChon,
  type LeadImportDup,
  type LeadImportError,
  type LeadImportField,
  type LeadImportReport,
  type LeadImportRow,
  type LeadImportRowOut,
  type LeadMotion,
} from '@pv/contracts'
import type { LeadWrite } from './lead-write.mapper'

/** THE ONE CHECK BOTH IMPORT ENDPOINTS RUN.
 *
 *  ------------------------------------------------------------------
 *  WHY IT IS A MODULE OF ITS OWN AND NOT TWO METHODS
 *  ------------------------------------------------------------------
 *  `/import/preview` and `/import` differ in what they DO, never in what they
 *  accept — that promise is written into `LeadImportBody` itself. A second
 *  copy of the checking rules is how "the preview said it was clean, the
 *  commit reported errors" happens, and once that happens the preview stops
 *  being worth reading, which was the whole point of having two endpoints.
 *
 *  So: ONE function, called twice. The preview prints what it returns; the
 *  commit prints the same thing and writes `report.rows`.
 *
 *  ------------------------------------------------------------------
 *  PURE. NO DATABASE, NO PROMISES
 *  ------------------------------------------------------------------
 *  Everything it needs to decide arrives as an argument: the staff directory
 *  and the mailboxes already in the book. Same rule the engines follow, and
 *  for the same reason — a checker that goes and queries cannot be called
 *  inside a transaction the caller owns without the caller losing control of
 *  what else is in that unit of work.
 *
 *  ------------------------------------------------------------------
 *  WHAT MAKES A ROW FAIL, AND WHAT ONLY MAKES A CELL DISAPPEAR
 *  ------------------------------------------------------------------
 *  A row fails when a cell cannot be turned into a value the column would
 *  accept. It fails as ONE ROW naming ONE FIELD, never as a whole batch: a
 *  file of 500 rows with 3 bad mailboxes is 497 leads and 3 lines to fix, and
 *  refusing the batch turns that into a person editing a spreadsheet blind.
 *
 *  Cells simply left empty disappear — the column takes NULL. That is the
 *  table's only spelling of "empty" (`CHECK lead_no_blank`), and it is why
 *  `province` and `category` are optional here even though `LEAD_SPEC` on the
 *  screen still stars them: the DB is the authority on what a lead cannot go
 *  without, and it says `company` · `contact_name` · `email`. */

/** One row of `platform.actor`, as much of it as the check needs. */
export type ActorLite = { id: string; name: string }

export type ImportCheckInput = {
  rows: readonly LeadImportRow[]
  /** Who moved first, chosen once for the WHOLE batch.
   *
   *  A batch-level field and never a cell, because that is how the panel asks
   *  the question: one motion for one file. It is written to `lead.motion` on
   *  every row — the column exists precisely so that answer stops being thrown
   *  away, and a response that echoes the value back while the column stays
   *  NULL is the failure mode it was added to end. */
  motion: LeadMotion
  /** Source code for the WHOLE batch. Wins over the per-row `source` cell —
   *  the person pressing the button is saying something about the whole file,
   *  and a stale code in a column must not quietly overrule them. */
  source?: string
  /** Everybody in the staff book, for turning the `owner` NAME into an id. */
  staff: readonly ActorLite[]
  /** The campaign codes that actually exist and are actually campaigns —
   *  `list = 'SOURCE'` rows of `config_entry`, loaded for exactly the codes
   *  this batch mentions.
   *
   *  Checked HERE and not left to `lead_campaign_fk`, even though the key would
   *  refuse the same values: the commit writes the whole batch in ONE
   *  transaction, so a constraint firing on row 340 takes the other 499 rows
   *  with it. A row error names the row, the column and the code — which is
   *  what makes the difference between "fix one cell" and "the import is
   *  broken". */
  campaigns: ReadonlySet<string>
  /** `lower(email)` → code, over leads that have NOT exited. Exactly the rows
   *  `lead_email_live_idx` covers, so what this map says and what the unique
   *  index will say are the same answer. */
  book: ReadonlyMap<string, string>
}

export type ImportCheck = {
  report: LeadImportReport
  /** One draft per entry of `report.rows`, in the same order. The commit path
   *  mints a code for each and writes them; the preview path drops them. */
  writes: LeadWrite[]
}

/** Column names as the person filling in the file sees them — the headers of
 *  `LEAD_SPEC` in `apps/web/src/data/intake.ts`, word for word.
 *
 *  Error text has to name the column the user is looking at. `contactName` is
 *  the wire name; "Người liên hệ" is what is printed above the cell they have
 *  to go and fix. */
const LABEL: Record<LeadImportField, string> = {
  company: 'Account',
  province: 'Tỉnh',
  category: 'Ngành',
  source: 'Nguồn',
  owner: 'Lead PIC',
  tier: 'Bậc',
  legalName: 'Tên pháp nhân',
  taxCode: 'Mã số thuế',
  address: 'Địa chỉ',
  contactName: 'Người liên hệ',
  contactTitle: 'Chức danh',
  phone: 'Điện thoại',
  email: 'Email',
  channel: 'Kênh liên hệ',
  headcount: 'Quy mô',
  pain: 'Vấn đề đang gặp',
}

/** Text bounds, read off `LEAD_MAX` — the SAME table `LeadCreate` is built
 *  from, not a second copy of its numbers.
 *
 *  Both doors have to accept the same data: a company name refused when a
 *  person types it has to be refused when a file carries it too, otherwise the
 *  book ends up holding values the form could never have produced. This block
 *  used to promise exactly that while re-typing all nine ceilings by hand, so
 *  the promise held only until somebody moved one of them. Built once at module
 *  scope — these are schemas, and rebuilding nine of them per row across a
 *  5.000-row file is work nobody asked for.
 *
 *  `taxCode` is the contract's own shape-checked field rather than free text:
 *  a spreadsheet is exactly where a "none yet" note, or a code with its own
 *  label glued on, comes from — and the column that holds them is the one the
 *  panel's dedupe key reads. */
const TEXT = {
  company: textNhap(LEAD_MAX.company),
  contactName: textNhap(LEAD_MAX.contactName),
  province: textNhapTuyChon(LEAD_MAX.province),
  legalName: textNhapTuyChon(LEAD_MAX.legalName),
  taxCode: taxCodeOptional,
  address: textNhapTuyChon(LEAD_MAX.address),
  contactTitle: textNhapTuyChon(LEAD_MAX.contactTitle),
  pain: textNhapTuyChon(LEAD_MAX.pain),
  source: textNhapTuyChon(LEAD_MAX.campaignCode),
}

/** Headcount as a spreadsheet writes it: digits, optionally grouped.
 *
 *  '1400' · '1.400' · '1,400' · '1 400' are one number written four ways, and
 *  a column is a column. A cell carrying a word ('1.400 người') is NOT
 *  accepted: cutting the word off is guessing which part of the cell the
 *  person meant, and a row error that quotes the cell says so instead. */
const GROUPED_INT = /^\d[\d.,\s]*$/

/** Every imported lead lands at the bottom rung, and the file cannot lift it.
 *
 *  `tierOfRow` in `apps/web/src/data/intake.ts` states the rule: the Bậc
 *  column of a file can only LOWER a row, never raise it, because SQL means
 *  the init-data gate was passed AND somebody opened an opportunity — neither
 *  of which a spreadsheet can witness. It reaches `mql` only when all six
 *  required slots are filled.
 *
 *  Against the real table that ceiling is never reached, and it is worth
 *  writing down why rather than leaving it as an accident: slot 2 of
 *  `lead.required_filled` reads `main_product`, and `main_product` is not one
 *  of the sixteen columns `LEAD_IMPORT_FIELDS` carries. So an imported row
 *  tops out at 5 of 6 and `tierOfRow` returns `dau-moi` for every row of every
 *  file. Writing the constant is the same answer as running the formula, minus
 *  a second copy of a generated column's arithmetic living in TypeScript.
 *
 *  The Bậc cell is still CHECKED against the closed list above, because a
 *  value outside it means the column mapping is wrong and the person wants to
 *  know that before 500 rows land. It just has nowhere to go afterwards. */
const IMPORTED_TIER = 'dau-moi'

/** The dedupe key, and the only identity this import has.
 *
 *  `lower(email)`, because that is the one identity `sales.lead` actually
 *  enforces — `lead_email_live_idx`, unique among leads that have not exited.
 *  Prefixed the way the screen prefixes its own keys (`mst:`, `ten:`) so a key
 *  printed in the report says what kind of thing it is.
 *
 *  Note for whoever reads the panel: the screen dedupes on tax code, then on
 *  company+province. That is a PRE-CHECK inside the browser and it answers "is
 *  this the same company"; this answers "is this the same live lead". Both are
 *  useful, only one of them is backed by an index. */
export const keyOf = (email: string): string => `email:${email}`

type Cells = Partial<Record<LeadImportField, string>>

type Read<T> = { ok: true; value: T } | { ok: false; reason: string }

type Outcome =
  { ok: true; write: LeadWrite; out: LeadImportRowOut } | { ok: false; error: LeadImportError }

/** Check a whole batch: every row, then the batch against the book, then the
 *  batch against itself.
 *
 *  Order matters, and it is the screen's order: a broken row is reported as
 *  broken and never as a duplicate; a row colliding with the book is reported
 *  as a book collision and not as a file one. Reversing either pair produces a
 *  report that is true and useless — "312 duplicates" when the real answer was
 *  "312 rows have no mailbox". */
export function checkBatch(input: ImportCheckInput): ImportCheck {
  const staff = indexStaff(input.staff)

  const rows: LeadImportRowOut[] = []
  const writes: LeadWrite[] = []
  const errors: LeadImportError[] = []
  const dupWithBook: LeadImportDup[] = []
  const dupWithinFile: LeadImportDup[] = []
  const seen = new Set<string>()

  for (const row of input.rows) {
    const outcome = checkRow(row, input, staff, input.campaigns)
    if (!outcome.ok) {
      errors.push(outcome.error)
      continue
    }

    const { out, write } = outcome
    const first = firstOf(row, out.values)
    const code = input.book.get(out.key)

    if (code !== undefined) {
      dupWithBook.push({ line: row.line, first, key: out.key, code })
    } else if (seen.has(out.key)) {
      dupWithinFile.push({ line: row.line, first, key: out.key })
    } else {
      seen.add(out.key)
      rows.push(out)
      writes.push(write)
    }
  }

  return {
    writes,
    report: {
      rows,
      errors,
      duplicates: dupWithBook.length,
      dupInFile: dupWithinFile.length,
      total: input.rows.length,
      dupWithBook,
      dupWithinFile,
    },
  }
}

/** Fold a name the way two spellings of one person fold together.
 *
 *  Case is folded because 'LÊ HOÀNG NAM' and 'Lê Hoàng Nam' are one person and
 *  a spreadsheet exported from anywhere will eventually hold both. Accents are
 *  NOT folded: 'Nam' and 'Năm' are two names, and stripping a mark to make a
 *  lookup succeed is exactly the guess this path exists to refuse. */
const fold = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Name → the people who answer to it. The value is a LIST, not a person: two
 *  staff can share a name, and that is the case the caller must be able to
 *  see rather than have decided for them. */
function indexStaff(staff: readonly ActorLite[]): Map<string, ActorLite[]> {
  const by = new Map<string, ActorLite[]>()
  for (const person of staff) {
    const key = fold(person.name)
    const had = by.get(key)
    if (had) had.push(person)
    else by.set(key, [person])
  }
  return by
}

function checkRow(
  row: LeadImportRow,
  batch: Pick<ImportCheckInput, 'motion' | 'source'>,
  staff: Map<string, ActorLite[]>,
  campaigns: ReadonlySet<string>,
): Outcome {
  const cells = row.values
  const out: Cells = {}

  const fail = (field: LeadImportField, reason: string): Outcome => ({
    ok: false,
    error: { line: row.line, first: firstOf(row, out), field, reason },
  })

  // ── the three columns the table cannot do without ────────────────────────
  const company = required(cells, 'company', TEXT.company)
  if (!company.ok) return fail('company', company.reason)
  out.company = company.value

  const contactName = required(cells, 'contactName', TEXT.contactName)
  if (!contactName.ok) return fail('contactName', contactName.reason)
  out.contactName = contactName.value

  const email = required(cells, 'email', emailField)
  if (!email.ok) return fail('email', email.reason)
  out.email = email.value

  // ── free text · absent stays absent and the column takes NULL ────────────
  const province = optional(cells, 'province', TEXT.province)
  if (!province.ok) return fail('province', province.reason)
  if (province.value !== undefined) out.province = province.value

  const legalName = optional(cells, 'legalName', TEXT.legalName)
  if (!legalName.ok) return fail('legalName', legalName.reason)
  if (legalName.value !== undefined) out.legalName = legalName.value

  const taxCode = optional(cells, 'taxCode', TEXT.taxCode)
  if (!taxCode.ok) return fail('taxCode', taxCode.reason)
  if (taxCode.value !== undefined) out.taxCode = taxCode.value

  const address = optional(cells, 'address', TEXT.address)
  if (!address.ok) return fail('address', address.reason)
  if (address.value !== undefined) out.address = address.value

  const contactTitle = optional(cells, 'contactTitle', TEXT.contactTitle)
  if (!contactTitle.ok) return fail('contactTitle', contactTitle.reason)
  if (contactTitle.value !== undefined) out.contactTitle = contactTitle.value

  const pain = optional(cells, 'pain', TEXT.pain)
  if (!pain.ok) return fail('pain', pain.reason)
  if (pain.value !== undefined) out.pain = pain.value

  // ── closed lists · a value outside the list is a mapping mistake ─────────
  const category = closedList(cells, 'category', LeadCategory)
  if (!category.ok) return fail('category', category.reason)
  if (category.value !== undefined) out.category = category.value

  const channel = closedList(cells, 'channel', ContactChannel)
  if (!channel.ok) return fail('channel', channel.reason)
  if (channel.value !== undefined) out.channel = channel.value

  /* Checked, echoed back, and then dropped — see `IMPORTED_TIER`. */
  const tier = closedList(cells, 'tier', LeadTier)
  if (!tier.ok) return fail('tier', tier.reason)
  if (tier.value !== undefined) out.tier = tier.value

  // ── phone · the contract's own normaliser decides, not a second rule ─────
  const phone = optional(cells, 'phone', phoneOptional)
  if (!phone.ok) return fail('phone', phone.reason)
  /* `undefined` out of `phoneOptional` means the cell held no digits at all.
     The manual door drops such a value silently — that is how the primitive is
     written — so this door drops it too. One rule, both doors. */
  if (phone.value !== undefined) out.phone = phone.value

  // ── headcount ───────────────────────────────────────────────────────────
  const headcount = readHeadcount(cells.headcount)
  if (!headcount.ok) return fail('headcount', headcount.reason)
  if (headcount.value !== undefined) out.headcount = String(headcount.value)

  // ── owner · a NAME in the file, an id in the column ──────────────────────
  const owner = readOwner(cells.owner, staff)
  if (!owner.ok) return fail('owner', owner.reason)
  if (owner.value !== undefined) out.owner = owner.value.name

  // ── source · the batch wins over the cell ───────────────────────────────
  const rowSource = optional(cells, 'source', TEXT.source)
  if (!rowSource.ok) return fail('source', rowSource.reason)
  const source = batch.source ?? rowSource.value
  /* A code that names no live campaign fails the ROW. The batch-level code is
     checked too and fails every row alike, which is the honest report: the
     person picked one campaign for the whole file and that campaign is not in
     the book, so no row of the file has a home. */
  if (source !== undefined && !campaigns.has(source)) {
    return fail('source', `${LABEL.source} "${source}" không có trong sổ chiến dịch`)
  }
  if (source !== undefined) out.source = source

  return {
    ok: true,
    out: { line: row.line, values: out, key: keyOf(email.value) },
    write: {
      ownerName: owner.value?.name ?? null,
      values: {
        company: company.value,
        contactName: contactName.value,
        email: email.value,

        legalName: legalName.value ?? null,
        taxCode: taxCode.value ?? null,
        address: address.value ?? null,
        province: province.value ?? null,
        category: category.value ?? null,
        headcount: headcount.value ?? null,

        contactTitle: contactTitle.value ?? null,
        phone: phone.value ?? null,
        contactChannel: channel.value ?? null,

        pain: pain.value ?? null,

        ownerId: owner.value?.id ?? null,

        tier: IMPORTED_TIER,
        /* The door, stated by the server. `CHANNEL_TRUST` reads `IMPORT` as
           `THO` — nobody has confirmed anything about these rows yet — and a
           trust level the client asserted about itself would be worth nothing,
           which is why the client never gets to send this field.

           `motion` is the other axis and it comes FROM the caller: the door is
           a fact about the request, who moved first is a fact about the deal,
           and only the person loading the file knows the second one. */
        sourceKind: 'IMPORT',
        motion: batch.motion,
        /* The spreadsheet calls this column "Nguồn" and the panel calls the
           batch-level override `source`, because that is the word the person
           loading the file uses. The COLUMN it lands in is `campaign_id`: what
           the cell actually holds is which campaign to attribute the rows to,
           and the other half of the origin is stamped above. Translating here
           keeps the file's vocabulary out of the table's. */
        campaignId: source ?? null,
      },
    },
  }
}

/** A cell that has to be there and has to parse. */
function required<T>(cells: Cells, field: LeadImportField, schema: ZodType<T>): Read<T> {
  const cell = cells[field]
  if (cell === undefined || cell === '') return { ok: false, reason: `Thiếu ${LABEL[field]}` }
  const parsed = schema.safeParse(cell)
  if (!parsed.success)
    return { ok: false, reason: say(field, cell, parsed.error.issues[0]?.message) }
  return { ok: true, value: parsed.data }
}

/** A cell that may be absent. Absent and empty are the same answer here — the
 *  column has one spelling for "nothing", and it is NULL. */
function optional<T>(
  cells: Cells,
  field: LeadImportField,
  schema: ZodType<T | undefined>,
): Read<T | undefined> {
  const cell = cells[field]
  if (cell === undefined || cell === '') return { ok: true, value: undefined }
  const parsed = schema.safeParse(cell)
  if (!parsed.success)
    return { ok: false, reason: say(field, cell, parsed.error.issues[0]?.message) }
  return { ok: true, value: parsed.data }
}

/** A cell whose value must belong to a closed list.
 *
 *  Its own wording rather than zod's, because zod's enum message lists every
 *  allowed value — which for `ContactChannel` is a seven-item English sentence
 *  in the middle of a Vietnamese error table. The screen already shows the
 *  list; the error only has to say the cell is not in it. */
function closedList<T extends string>(
  cells: Cells,
  field: LeadImportField,
  schema: ZodType<T>,
): Read<T | undefined> {
  const cell = cells[field]
  if (cell === undefined || cell === '') return { ok: true, value: undefined }
  const parsed = schema.safeParse(cell)
  if (!parsed.success) {
    return { ok: false, reason: `${LABEL[field]} "${cell}" không có trong danh sách` }
  }
  return { ok: true, value: parsed.data }
}

function readHeadcount(cell: string | undefined): Read<number | undefined> {
  if (cell === undefined || cell === '') return { ok: true, value: undefined }
  if (!GROUPED_INT.test(cell)) {
    return { ok: false, reason: `${LABEL.headcount} "${cell}" không phải một số` }
  }
  const n = Number(cell.replace(/\D/g, ''))
  /* Same bounds as `LeadCreate.headcount` — read from the same table, so the
     two doors cannot drift apart. A ceiling keeps a mistyped cell out of a
     column people read as a company size. */
  if (!Number.isSafeInteger(n) || n <= 0 || n > LEAD_NUM.headcountMax) {
    return {
      ok: false,
      reason: `${LABEL.headcount} "${cell}" nằm ngoài khoảng 1…${LEAD_NUM.headcountMax.toLocaleString('vi-VN')}`,
    }
  }
  return { ok: true, value: n }
}

/** The file carries a person's NAME; `lead.owner_id` references `actor.id`.
 *
 *  Neither branch below guesses, and that is the whole rule: the owner of a
 *  lead is who gets paid for it, so a wrong id is a wrong commission six
 *  months later, on a row nobody will think to re-check. One row nobody can
 *  place is cheap. One row placed on the wrong person is not. */
function readOwner(
  cell: string | undefined,
  staff: Map<string, ActorLite[]>,
): Read<ActorLite | undefined> {
  if (cell === undefined || cell === '') return { ok: true, value: undefined }

  const hits = staff.get(fold(cell)) ?? []
  if (hits.length === 0) {
    return { ok: false, reason: `Không có ai tên "${cell}" trong sổ nhân sự` }
  }
  if (hits.length > 1) {
    return {
      ok: false,
      reason: `Có ${hits.length} người tên "${cell}" trong sổ nhân sự — không đoán được ai giữ lead này`,
    }
  }
  return { ok: true, value: hits[0] }
}

/** The first cell of the row, for the downloadable error file.
 *
 *  Sent by the client because the server cannot rebuild it — once the columns
 *  are mapped, the raw row order is gone. Falls back to the company name, then
 *  to nothing: a report row with an empty `first` still carries a line number,
 *  and the line number is what actually finds the row in a spreadsheet. */
function firstOf(row: LeadImportRow, out: Cells): string {
  return row.first ?? out.company ?? ''
}

/** A refusal that names the column, quotes the cell, and repeats the reason
 *  the contract's own normaliser gave — instead of inventing a second wording
 *  for a rule that is already written down once. */
function say(field: LeadImportField, cell: string, why: string | undefined): string {
  return why ? `${LABEL[field]} "${cell}": ${why}` : `${LABEL[field]} "${cell}" không hợp lệ`
}
