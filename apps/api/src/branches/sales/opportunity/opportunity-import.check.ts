import {
  CurrencyCode,
  OpportunityCreate,
  OpportunityCreateState,
  type OpportunityImportDup,
  type OpportunityImportError,
  type OpportunityImportField,
  type OpportunityImportReport,
  type OpportunityImportRow,
  type OpportunityImportRowOut,
} from '@pv/contracts'

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
 *  bản nháp hoàn chỉnh mới đi qua `OpportunityCreate.safeParse`. Vòng thứ hai
 *  không thừa: nó là thứ ĐẢM BẢO một dòng nạp từ tệp không tạo ra được thứ gì
 *  mà cửa `POST /sales/opportunities` sẽ từ chối. Hai đường vào một bảng phải
 *  chấp nhận đúng một tập giá trị, và cách rẻ nhất để không lệch là để cả hai
 *  đi qua cùng một schema. */

export type ActorLite = { id: string; name: string }

export type ImportCheckInput = {
  rows: readonly OpportunityImportRow[]
  /** Sổ nhân sự, để dịch TÊN trong tệp sang id trong cột. */
  staff: readonly ActorLite[]
  /** Tên công ty đã gấp → mã lead. Nhiều lead cùng tên thì mã ở đây là mã đầu
   *  và `ambiguous` bên dưới nói tên đó không dùng được. */
  leadByCompany: ReadonlyMap<string, string>
  /** Tên công ty đã gấp mà khớp NHIỀU HƠN MỘT lead. */
  ambiguousCompany: ReadonlySet<string>
  /** Mã lead → mã đơn ĐANG MỞ của nó. Cơ sở của `dupWithBook`. */
  liveDealByLead: ReadonlyMap<string, string>
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
 *  nhãn là một khoản nợ đã ghi trong `docs/ban-giao-co-hoi.md`, trả cùng lúc
 *  với bước tách fixture — không sớm hơn. */
const LABEL: Record<OpportunityImportField, string> = {
  name: 'Tên cơ hội',
  company: 'Account',
  amount: 'Giá trị đơn',
  closedDate: 'Ngày đóng dự kiến',
  saleOwner: 'Sale đứng đơn',
  bdOwner: 'BD mở cửa',
  state: 'Trạng thái',
  currency: 'Đồng tiền',
  description: 'Mô tả',
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
  const dupWithBook: OpportunityImportDup[] = []
  const dupWithinFile: OpportunityImportDup[] = []
  const seen = new Set<string>()

  for (const row of input.rows) {
    const checked = checkRow(row, input, staffByName)
    if ('reason' in checked) {
      errors.push({ line: row.line, first: row.first ?? '', ...checked })
      continue
    }

    const key = keyOf(checked.write.leadCode)
    const existing = input.liveDealByLead.get(checked.write.leadCode)

    if (existing !== undefined) {
      dupWithBook.push({ line: row.line, first: row.first ?? '', key, code: existing })
      continue
    }
    if (seen.has(key)) {
      dupWithinFile.push({ line: row.line, first: row.first ?? '', key })
      continue
    }

    seen.add(key)
    rows.push({
      line: row.line,
      values: checked.values,
      leadCode: checked.write.leadCode,
      key,
    })
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

  // ── ô bắt buộc ───────────────────────────────────────────────────────────
  for (const f of ['name', 'company', 'amount', 'closedDate', 'saleOwner'] as const) {
    if (cell(f) === '') return { field: f, reason: `Thiếu ${LABEL[f]}` }
  }

  const name = cell('name')
  keep('name', name)

  // ── account → lead ───────────────────────────────────────────────────────
  const company = cell('company')
  keep('company', company)
  const folded = fold(company)

  if (input.ambiguousCompany.has(folded)) {
    return {
      field: 'company',
      reason: `Có nhiều lead cùng tên "${company}" — mở đơn tay để chọn đúng hồ sơ`,
    }
  }
  const leadCode = input.leadByCompany.get(folded)
  if (leadCode === undefined) {
    return {
      field: 'company',
      reason: `Không có lead nào tên "${company}" — nạp lead trước, rồi nạp cơ hội`,
    }
  }

  // ── tiền ─────────────────────────────────────────────────────────────────
  const rawAmount = cell('amount')
  keep('amount', rawAmount)
  const amount = digitsOf(rawAmount)
  if (amount === null) {
    return { field: 'amount', reason: `${LABEL.amount} "${rawAmount}" không phải một con số` }
  }

  const rawCurrency = cell('currency')
  keep('currency', rawCurrency)
  const currency = rawCurrency === '' ? 'VND' : rawCurrency.toUpperCase()
  if (!CurrencyCode.safeParse(currency).success) {
    return {
      field: 'currency',
      reason: `${LABEL.currency} "${rawCurrency}" không nằm trong danh sách`,
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
  const rawSale = cell('saleOwner')
  keep('saleOwner', rawSale)
  const sale = personOf(rawSale, staffByName)
  if (typeof sale !== 'string') return { field: 'saleOwner', reason: sale.reason }

  const rawBd = cell('bdOwner')
  keep('bdOwner', rawBd)
  let bdOwners: string[] = []
  if (rawBd !== '') {
    const bd = personOf(rawBd, staffByName)
    if (typeof bd !== 'string') return { field: 'bdOwner', reason: bd.reason }
    bdOwners = [bd]
  }

  // ── trạng thái ───────────────────────────────────────────────────────────
  const rawState = cell('state')
  keep('state', rawState)
  const state = rawState === '' ? 'pending' : rawState
  if (!OpportunityCreateState.safeParse(state).success) {
    return {
      field: 'state',
      /* 'close-won' được gọi tên riêng vì nó là thứ người ta sẽ thử. Một cột
         "Trạng thái" trong Excel gần như chắc chắn có dòng "đã thắng", và câu
         "không nằm trong danh sách" không nói được vì sao. */
      reason:
        state === 'close-won'
          ? 'Đơn thắng không nạp được từ tệp — thắng là có hợp đồng, ký ở hồ sơ cơ hội'
          : `${LABEL.state} "${rawState}" không nằm trong danh sách`,
    }
  }

  const description = cell('description')
  keep('description', description)

  // ── hàng rào cuối: chính schema của cửa gõ tay ───────────────────────────
  const parsed = OpportunityCreate.safeParse({
    leadCode,
    name,
    expectedClose,
    state,
    amount,
    currency,
    saleOwners: [sale],
    bdOwners,
    ...(description === '' ? {} : { description }),
  })

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { reason: issue?.message ?? 'Dòng không hợp lệ' }
  }

  return { write: parsed.data, values }
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

/** Một TÊN trong tệp → một id trong cột.
 *
 *  Không tìm thấy là hỏng, và tìm thấy HAI cũng hỏng — không bao giờ đoán.
 *  Một dòng không ai xếp được là một dòng rẻ; một dòng xếp nhầm người thì
 *  không, vì nó đi thẳng vào bảng chia hoa hồng. */
function personOf(
  raw: string,
  staffByName: ReadonlyMap<string, ActorLite[]>,
): string | { reason: string } {
  const found = staffByName.get(fold(raw)) ?? []
  const first = found[0]
  if (!first) return { reason: `Không có ai tên "${raw}" trong sổ nhân sự` }
  if (found.length > 1) return { reason: `Có nhiều người tên "${raw}" — sửa tệp cho rõ` }
  return first.id
}
