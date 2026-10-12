import type { RoleId } from '@pv/engines'
import {
  CurrencyCode,
  isSellerRole,
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  OpportunityContactRole,
  OpportunityCreateShape,
  type OpportunityCreate,
  type OpportunityImportDup,
  type OpportunityImportError,
  type OpportunityImportField,
  type OpportunityImportHeld,
  type OpportunityImportReport,
  type OpportunityImportRow,
  type OpportunityImportRowOut,
  type OpportunityRunningDeal,
} from '@pv/contracts'
import { LEAD_GONE_WORDS } from '../lead/lead-state'
import { acknowledges, STRANGER } from './opportunity-opening.service'
import { NO_OWNER, NOT_SELLER, SALE_LANE_SELF } from './opportunity-owners'

/** The typed door's own schema, contacts and all: a row is a create body with
 *  one contact, so the file cannot write what the form would refuse. */
const ImportDraft = OpportunityCreateShape

/** Bộ kiểm của lô nạp cơ hội — THUẦN. Không DB, không promise, không clock.
 *
 *  ------------------------------------------------------------------
 *  MỘT HÀM, HAI ENDPOINT — VÀ ĐÓ LÀ TOÀN BỘ LÝ DO NÓ TỒN TẠI
 *  ------------------------------------------------------------------
 *  `preview` và `commit` gọi đúng hàm này với đúng dữ liệu này. Nếu mỗi cửa tự
 *  kiểm lấy thì "chạy thử nói sạch, nạp thật báo lỗi" là một trạng thái có thật
 *  — và một bản chạy thử nói dối thì không đáng chạy. Cùng hình với
 *  `lead-import.check.ts`, và vì cùng một câu.
 *
 *  ------------------------------------------------------------------
 *  THỨ TỰ PHÂN LOẠI LÀ MỘT PHẦN CỦA CÂU TRẢ LỜI
 *  ------------------------------------------------------------------
 *  Dòng hỏng được báo là HỎNG, không bao giờ báo là trùng. Dòng đụng sổ được
 *  báo đụng SỔ, không báo đụng file. Đảo bất kỳ cặp nào cũng cho ra một bản báo
 *  cáo đúng sự thật và vô dụng: người đọc sẽ đi sửa một dòng trùng, rồi phát
 *  hiện nó vẫn hỏng vì một lý do khác chưa từng được nói ra.
 *
 *  ------------------------------------------------------------------
 *  ZOD LÀ HÀNG RÀO CUỐI, KHÔNG PHẢI HÀNG RÀO ĐẦU
 *  ------------------------------------------------------------------
 *  Mỗi ô được soi bằng tay trước để câu lỗi gọi được tên cột tiếng Việt, rồi
 *  bản nháp hoàn chỉnh mới đi qua `ImportDraft.safeParse`. Vòng thứ hai
 *  không thừa: nó là thứ ĐẢM BẢO một dòng nạp từ tệp không tạo ra được thứ gì
 *  mà cửa `POST /sales/opportunities` sẽ từ chối. Hai đường vào một bảng phải
 *  chấp nhận đúng một tập giá trị, và cách rẻ nhất để không lệch là để cả hai
 *  đi qua cùng một schema. */

export type ActorLite = { id: string; name: string; roleIds: RoleId[] }

export type ImportCheckInput = {
  rows: readonly OpportunityImportRow[]
  /** Sổ nhân sự, để dịch TÊN trong tệp sang id trong cột. */
  staff: readonly ActorLite[]
  /** Tên công ty đã gấp → mã lead. Nhiều lead cùng tên thì mã ở đây là mã đầu
   *  và `ambiguous` bên dưới nói tên đó không dùng được. */
  leadByCompany: ReadonlyMap<string, string>
  /** Tên công ty đã gấp mà khớp NHIỀU HƠN MỘT lead. */
  ambiguousCompany: ReadonlySet<string>
  /** Codes of every live lead a deal may be opened on (not exited). */
  liveLeads: ReadonlySet<string>
  /** Codes of leads that have left the funnel, for a row naming one by code. */
  exitedLeads: ReadonlySet<string>
  /** Lead code → its running deals, oldest first. Basis of `dupWithBook`. */
  running: ReadonlyMap<string, readonly OpportunityRunningDeal[]>
  /** Lead code → the contacts a deal on it may name (`reachByLead`). */
  contactsByLead: ReadonlyMap<string, readonly { code: string; primary: boolean }[]>
  /** Ids of the PRODUCT catalogue still switched on. */
  products: ReadonlySet<string>
  /** Folded company name → code of a lead that has left the funnel — refused
   *  with its own sentence, since "no such lead" would send the reader hunting. */
  exitedCompany: ReadonlyMap<string, string>
  /** Lead codes the caller may not open a deal on (`opens`: a lead somebody
   *  else holds, exited ones included) — a row error, so preview and commit agree. */
  outOfScope: ReadonlySet<string>
  /** The importer holds `opportunity.accept`, so every deal is born accepted
   *  and has a holder even with both lanes empty (ADR 0071). */
  importerAccepts: boolean
  /** The one id the importer may put on the SALE lane (`assertOwnSaleLane`);
   *  `null` = anyone, the importer holds `opportunity.assign`. */
  onlySale: string | null
}

export type ImportCheck = {
  report: OpportunityImportReport
  /** Thân request đã dựng xong, thứ tự khớp `report.rows`. */
  writes: OpportunityCreate[]
}

/** Nhãn tiếng Việt của từng cột, cho câu lỗi.
 *
 *  Chép ra đây chứ không nhập từ `OP_SPEC` của `apps/web`: `apps/api` không
 *  nhập gì từ app web, và nhập fixture thì chỉ `seed.ts` được phép. Hai bản
 *  nhãn là một khoản nợ đã ghi trong `docs/decisions/0018-opportunity-module-decisions.md`, trả cùng lúc
 *  với bước tách fixture — không sớm hơn. */
const LABEL: Record<OpportunityImportField, string> = {
  name: 'Tên cơ hội',
  company: 'Account',
  amount: 'Giá trị đơn',
  closedDate: 'Ngày đóng dự kiến',
  saleOwner: 'Sale đứng đơn',
  bdOwner: 'BD mở cửa',
  currency: 'Đồng tiền',
  description: 'Mô tả',
  leadCode: 'Mã lead',
  contact: 'Mã người liên hệ',
  contactRole: 'Vai trò người liên hệ',
  products: 'Mã sản phẩm',
}

/** Gấp một chuỗi để so tên: thường hoá và gộp khoảng trắng.
 *
 *  KHÔNG bỏ dấu, cùng quyết định với `lead-import.check.ts`: 'Nam' và 'Năm' là
 *  hai cái tên, và 'Kỳ Anh' với 'Ky Anh' là hai công ty cho tới khi có ai đó
 *  nói ngược lại. Bỏ dấu để "dễ khớp hơn" là mở đường cho một đơn rơi vào hồ sơ
 *  của khách khác — đúng loại lỗi không ai soát ra bằng mắt. */
export const fold = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Khoá chống trùng của lô này: chính MÃ LEAD.
 *
 *  Không phải tên đơn, và không phải tên account. `apps/web/src/data/intake.ts`
 *  gấp khoá theo tên account và docblock của nó tự nhận là yếu; ở đây tên
 *  account đã được dịch sang một mã lead có thật, nên khoá vừa chặt hơn vừa nói
 *  đúng câu mình muốn hỏi: "khách này đã có đơn đang mở chưa". */
export const keyOf = (leadCode: string): string => `lead:${leadCode}`

/** The lead-code cell as both the check and its pre-reads spell it. */
export const leadCellOf = (row: OpportunityImportRow): string =>
  row.values.leadCode?.trim().toUpperCase() ?? ''

export function checkBatch(input: ImportCheckInput): ImportCheck {
  const staffByName = new Map<string, ActorLite[]>()
  for (const person of input.staff) {
    const k = fold(person.name)
    const list = staffByName.get(k)
    if (list) list.push(person)
    else staffByName.set(k, [person])
  }

  const rows: OpportunityImportRowOut[] = []
  const writes: OpportunityCreate[] = []
  const errors: OpportunityImportError[] = []
  const dupWithBook: OpportunityImportHeld[] = []
  const dupWithinFile: OpportunityImportDup[] = []
  const seen = new Set<string>()

  for (const row of input.rows) {
    const checked = checkRow(row, input, staffByName)
    if ('reason' in checked) {
      errors.push({ line: row.line, first: row.first ?? '', ...checked })
      continue
    }

    const { leadCode } = checked.write
    const key = keyOf(leadCode)
    /* The typed door's rule (ADR 0088 §9): held until the row names exactly the
       lead's running deals. Known gap: a stale list on a lead with none left
       still loads, because `OpportunityImportHeld.deals` is `.min(1)`. */
    const deals = input.running.get(leadCode) ?? []
    if (deals.length > 0 && !acknowledges(deals, checked.write.acknowledgedDeals)) {
      dupWithBook.push({ line: row.line, first: row.first ?? '', key, leadCode, deals: [...deals] })
      continue
    }
    if (seen.has(key)) {
      dupWithinFile.push({ line: row.line, first: row.first ?? '', key })
      continue
    }

    seen.add(key)
    rows.push({ line: row.line, values: checked.values, leadCode, key })
    writes.push(checked.write)
  }

  return {
    report: { rows, errors, total: input.rows.length, dupWithBook, dupWithinFile },
    writes,
  }
}

// ---------------------------------------------------------------------------
// MỘT DÒNG
// ---------------------------------------------------------------------------

type RowFail = { field?: OpportunityImportField; reason: string }
type RowPass = {
  write: OpportunityCreate
  values: Partial<Record<OpportunityImportField, string>>
}

/** Lỗi ĐẦU TIÊN thắng và trả về ngay.
 *
 *  Không gom hết lỗi của một dòng: bảng báo cáo cho mỗi dòng một chỗ để in một
 *  câu, và một dòng thiếu tên công ty thì mọi câu sau đó đều là hệ quả của
 *  cùng một chỗ chưa điền. */
function checkRow(
  row: OpportunityImportRow,
  input: ImportCheckInput,
  staffByName: ReadonlyMap<string, ActorLite[]>,
): RowPass | RowFail {
  const cell = (f: OpportunityImportField): string => row.values[f]?.trim() ?? ''
  const values: Partial<Record<OpportunityImportField, string>> = {}
  const keep = (f: OpportunityImportField, v: string) => {
    if (v !== '') values[f] = v
  }

  for (const f of ['name', 'amount', 'closedDate'] as const) {
    if (cell(f) === '') return { field: f, reason: `Thiếu ${LABEL[f]}` }
  }

  const name = cell('name')
  keep('name', name)

  keep('leadCode', leadCellOf(row))
  keep('company', cell('company'))
  const found = leadOf(leadCellOf(row), cell('company'), input)
  if (typeof found !== 'string') return found
  const leadCode = found

  // ── tiền ─────────────────────────────────────────────────────────────────
  const rawAmount = cell('amount')
  keep('amount', rawAmount)
  const amount = digitsOf(rawAmount)
  if (amount === null) {
    return { field: 'amount', reason: `${LABEL.amount} "${rawAmount}" phải là số` }
  }

  const rawCurrency = cell('currency')
  keep('currency', rawCurrency)
  const currency = rawCurrency === '' ? 'VND' : rawCurrency.toUpperCase()
  if (!CurrencyCode.safeParse(currency).success) {
    return {
      field: 'currency',
      reason: `${LABEL.currency} "${rawCurrency}" không có trong danh sách`,
    }
  }

  // ── ngày đóng ────────────────────────────────────────────────────────────
  const rawClose = cell('closedDate')
  keep('closedDate', rawClose)
  const expectedClose = dateOf(rawClose)
  if (expectedClose === null) {
    return {
      field: 'closedDate',
      reason: `${LABEL.closedDate} "${rawClose}" phải dạng YYYY-MM-DD hoặc DD/MM/YYYY`,
    }
  }

  // ── người ────────────────────────────────────────────────────────────────
  /* An empty SALE cell is a legal row: the lane may stay empty until signing
     (ADR 0071 §4). A name that is there must still resolve to one person. */
  const rawSale = cell('saleOwner')
  keep('saleOwner', rawSale)
  let saleOwners: string[] = []
  if (rawSale !== '') {
    const sale = personOf(rawSale, staffByName)
    if ('reason' in sale) return { field: 'saleOwner', reason: sale.reason }
    if (!isSellerRole(sale.roleIds)) return { field: 'saleOwner', reason: NOT_SELLER }
    if (input.onlySale !== null && sale.id !== input.onlySale) {
      return { field: 'saleOwner', reason: SALE_LANE_SELF }
    }
    saleOwners = [sale.id]
  }

  const rawBd = cell('bdOwner')
  keep('bdOwner', rawBd)
  let bdOwners: string[] = []
  if (rawBd !== '') {
    const bd = personOf(rawBd, staffByName)
    if ('reason' in bd) return { field: 'bdOwner', reason: bd.reason }
    bdOwners = [bd.id]
  }
  /* The typed door's holder rule (`assertHeld`), per row: a seller, the
     importer as acceptor, or a BD — else nobody answers for the deal. */
  if (saleOwners.length === 0 && bdOwners.length === 0 && !input.importerAccepts) {
    return { field: 'bdOwner', reason: NO_OWNER }
  }

  /* No state cell (ADR 0064): the server sets the column — `new`, or `assigned`
     when the importer may accept (ADR 0071) — never a spreadsheet cell. */
  const description = cell('description')
  keep('description', description)

  for (const f of ['contact', 'contactRole', 'products'] as const) keep(f, cell(f))
  const contact = contactOf(leadCode, cell('contact'), cell('contactRole'), input)
  if ('reason' in contact) return contact
  const products = productsOf(cell('products'), input)
  if ('reason' in products) return products

  const parsed = ImportDraft.safeParse({
    leadCode,
    name,
    expectedClose,
    amount,
    currency,
    saleOwners,
    bdOwners,
    contacts: [contact],
    products: products.ids,
    acknowledgedDeals: row.acknowledgedDeals ?? [],
    ...(description === '' ? {} : { description }),
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { reason: issue?.message ?? 'Dòng không hợp lệ' }
  }

  return { write: parsed.data, values }
}

/** The row's lead: by the lead-code cell when it is filled, else by company
 *  name. Either way a LOOKUP — the lead must be live and open to the caller. */
function leadOf(code: string, company: string, input: ImportCheckInput): string | RowFail {
  if (code !== '') {
    const field = 'leadCode' as const
    /* Scope first: somebody else's lead answers one sentence, exited or not. */
    if (input.outOfScope.has(code)) return { field, reason: foreignReason(code) }
    if (input.exitedLeads.has(code)) return { field, reason: goneReason(code) }
    if (!input.liveLeads.has(code)) return { field, reason: `Không có lead mã "${code}".` }
    return code
  }
  const field = 'company' as const
  if (company === '') return { field, reason: `Thiếu ${LABEL.leadCode} hoặc ${LABEL.company}` }
  const folded = fold(company)
  if (input.ambiguousCompany.has(folded)) {
    return { field, reason: `Có nhiều lead tên "${company}". Điền cột ${LABEL.leadCode}.` }
  }
  const leadCode = input.leadByCompany.get(folded)
  const named = leadCode ?? input.exitedCompany.get(folded)
  if (named === undefined) {
    return { field, reason: `Không có lead tên "${company}". Nạp lead trước.` }
  }
  if (input.outOfScope.has(named)) return { field, reason: foreignReason(company) }
  if (leadCode === undefined) return { field, reason: goneReason(company) }
  return leadCode
}

const goneReason = (lead: string) =>
  `Lead "${lead}" đang ở trạng thái ${LEAD_GONE_WORDS}, không tạo được cơ hội.`
const foreignReason = (lead: string) => `Lead "${lead}" không do bạn phụ trách.`

/** The row's one contact, so its primary. A blank cell takes the lead's own
 *  primary contact, which keeps a file in the older format loading. The role
 *  cell reads the key or the label a screen prints; blank = nobody has said. */
function contactOf(
  leadCode: string,
  rawCode: string,
  rawRole: string,
  input: ImportCheckInput,
): { contactCode: string; role: OpportunityContactRole | null; primary: true } | RowFail {
  const reach = input.contactsByLead.get(leadCode) ?? []
  const code = rawCode.toUpperCase()
  const picked = code === '' ? reach.find((c) => c.primary) : reach.find((c) => c.code === code)
  if (!picked) {
    const reason =
      code === ''
        ? `Lead ${leadCode} chưa có người liên hệ chính. Điền cột ${LABEL.contact}.`
        : STRANGER
    return { field: 'contact', reason }
  }
  const role = OpportunityContactRole.options.find(
    (r) => r === rawRole.toLowerCase() || fold(OPPORTUNITY_CONTACT_ROLE_LABEL[r]) === fold(rawRole),
  )
  if (rawRole !== '' && !role) {
    return {
      field: 'contactRole',
      reason: `${LABEL.contactRole} "${rawRole}" không có trong danh sách`,
    }
  }
  return { contactCode: picked.code, role: role ?? null, primary: true }
}

/** `PD-…` ids joined by commas, each one still switched on in the catalogue. */
function productsOf(raw: string, input: ImportCheckInput): { ids: string[] } | RowFail {
  const ids = raw
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter((id) => id !== '')
  const unknown = ids.find((id) => !input.products.has(id))
  if (unknown !== undefined) {
    return { field: 'products', reason: `${LABEL.products} "${unknown}" không có trong danh sách` }
  }
  return { ids }
}

// ---------------------------------------------------------------------------
// BA PHÉP ĐỌC Ô
// ---------------------------------------------------------------------------

/** Một con số tiền từ một ô Excel.
 *
 *  Nhận `1800000000 · 1.800.000.000 · 1,800,000,000 · 1 800 000 000`; TỪ CHỐI
 *  `1,8 tỷ` và `1800000000 VND`. Cùng luật với ô `headcount` của lô nạp lead,
 *  và cùng lý do: cắt phần chữ đi là đoán xem người ta muốn giữ phần nào của ô,
 *  và đoán sai trên một cột tiền thì sai bằng cả một đơn hàng. */
function digitsOf(raw: string): number | null {
  if (!/^\d[\d.,\s]*$/.test(raw)) return null
  const n = Number(raw.replace(/[.,\s]/g, ''))
  if (!Number.isSafeInteger(n) || n < 0) return null
  return n
}

/** `YYYY-MM-DD` hoặc `DD/MM/YYYY` → `YYYY-MM-DD`.
 *
 *  Hai dạng chứ không một: dạng đầu là thứ hợp đồng nói, dạng sau là thứ Excel
 *  Việt Nam thật sự xuất ra. `MM/DD/YYYY` KHÔNG được nhận và không thể được
 *  nhận — `03/04/2026` hợp lệ ở cả hai cách đọc và cho ra hai ngày cách nhau
 *  một tháng, nên đoán ở đây là ghi một hạn sai vào sổ mà không ai thấy.
 *
 *  Kiểm cả tính có thật của ngày: `31/02` khớp mẫu nhưng không phải một ngày. */
function dateOf(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)

  let y = ''
  let m = ''
  let d = ''

  if (iso) {
    y = iso[1] ?? ''
    m = iso[2] ?? ''
    d = iso[3] ?? ''
  } else if (vn) {
    d = (vn[1] ?? '').padStart(2, '0')
    m = (vn[2] ?? '').padStart(2, '0')
    y = vn[3] ?? ''
  } else return null

  const at = new Date(`${y}-${m}-${d}T00:00:00Z`)
  if (Number.isNaN(at.getTime())) return null
  /* `new Date('2026-02-31')` cuộn sang 03-03 chứ không hỏng, nên so lại chuỗi
     là cách duy nhất bắt được một ngày không tồn tại. */
  if (at.toISOString().slice(0, 10) !== `${y}-${m}-${d}`) return null
  return `${y}-${m}-${d}`
}

/** A NAME in the file → one person of the staff book, role included.
 *
 *  None found fails, and TWO found fails too — never a guess. A row nobody
 *  can place is cheap; a row placed on the wrong person is not, because it
 *  goes straight into the commission split. */
function personOf(
  raw: string,
  staffByName: ReadonlyMap<string, ActorLite[]>,
): ActorLite | { reason: string } {
  const found = staffByName.get(fold(raw)) ?? []
  const first = found[0]
  if (!first) return { reason: `Không tìm thấy người tên "${raw}"` }
  if (found.length > 1) return { reason: `Có nhiều người tên "${raw}". Sửa tệp cho rõ.` }
  return first
}
