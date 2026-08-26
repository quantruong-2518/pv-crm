import {
  DAY_FROZEN,
  HEAD_OF_SALES,
  LEADS,
  LEAD_CATEGORIES,
  PROSPECT_BATCHES,
  dayISO,
  isRunning,
  leadContact,
  prospectBatchesPaid,
  prospectStats,
  prospectTotals,
  type ExitReason,
  type Lead,
  type LeadCategory,
  type ProspectBatchState,
  type ProspectLegalBasis,
  type ProspectRejectReason,
  type ProspectRowState,
  type ProspectSupplierKind,
} from '@pv/engines/fixtures/das-vina'

/** Kho danh sách prospect — module 1 · Chiến dịch & Sự kiện. Kịch bản 2 · DAS
 *  Vina, đóng băng 17/08 · 09:10.
 *
 *  Đây là chỗ DUY NHẤT màn kho và màn nhập lấy số và lấy luật. Ba tầng, đọc theo
 *  thứ tự đó:
 *
 *   1. **Số của kỳ** — `batchRows` · `batchTotals` đọc thẳng `PROSPECT_BATCHES`
 *      qua `prospectStats`/`prospectTotals` của fixture. File này KHÔNG cộng lại
 *      tám lô bằng tay: hai chỗ cộng là hai cơ hội lệch.
 *   2. **Luật đọc file** — dò dấu phân tách, tách ô, chuẩn hoá 15 cột, ba khoá
 *      khử trùng, bảy luật chặn, luật chống đè lên lead đang có chủ. Toàn hàm
 *      THUẦN, không React, không DOM — vì thế test được, và vì thế chuyển được
 *      xuống backend nguyên vẹn khi có backend.
 *   3. **File mẫu** — một hằng chuỗi có BOM, phát ra bằng `sampleCsvFile()`.
 *
 *  --------------------------------------------------------------------------
 *  MỘT DÒNG DANH SÁCH KHÔNG PHẢI MỘT LEAD
 *  --------------------------------------------------------------------------
 *  Prospect đứng NGOÀI phễu. Nhập 1.200 dòng không sinh một đầu mối nào — lead
 *  sinh khi bên kia trả lời. Vì thế ở đây không có hàm nào tạo lead, và số 0 ở
 *  cột "lead đã sinh" của một lô là kết quả THẬT chứ không phải ô còn thiếu.
 *
 *  --------------------------------------------------------------------------
 *  CỐ TÌNH KHÔNG LÀM
 *  --------------------------------------------------------------------------
 *  - **Không đọc .xlsx.** Đường thoát là tab "Dán trực tiếp" (TSV từ Excel).
 *    XLSX là một dependency ~500 KB thật, để giai đoạn hai.
 *  - **Không có bản ghi đồng ý dạng chứng cứ** (dấu thời gian · IP · nội dung)
 *    cho `dong-y-truc-tiep`, không có màn "yêu cầu của chủ thể dữ liệu", không
 *    có đường chuyển dữ liệu ra ngoài biên giới. Ba thứ này thuộc Nghị định 13
 *    và POC nói thẳng là chưa làm, thay vì làm một nửa.
 *  - **Không tự áp bộ ánh xạ cột.** `suggestMapping` chỉ ĐỀ NGHỊ; màn phải có
 *    nút và phải in `basis` (luật 9).
 *  - **Không ghi đè ô nào của một dòng sổ.** Ghi đè là hành động riêng, qua E3. */

// ---------------------------------------------------------------------------
// Ngưỡng của luồng nhập
// ---------------------------------------------------------------------------

/** Bốn ngưỡng của module 5 · mục 5.8, ĐẶT ngày 20/08 (quyết định F).
 *
 *  Chúng là LUẬT CỦA PHÒNG, không phải số đo của kỳ — vì thế chúng ở tầng app
 *  chứ không ở fixture, cùng chỗ đứng với `ENOUGH_GATE` của `source-cost.ts`.
 *  Đổi một số ở đây là đổi mức thận trọng của cả luồng nhập, không đổi dữ liệu.
 *
 *  ⚠ Kỳ này KHÔNG lô nào chạm hai ngưỡng cuối: lô đắt nhất 12 triệu (dưới 20),
 *  lô loại nhiều nhất 18,6% (dưới 30%). Hai nhánh giao diện ấy vẫn phải dựng và
 *  vẫn có test, nhưng dữ liệu đóng băng không đi qua chúng — người dựng màn phải
 *  biết trước để không tưởng mình dựng sai. Ngưỡng là luật của phòng, không phải
 *  nút vặn cho đẹp demo. */
export const IMPORT_GATE = {
  /** 5 MB. Giới hạn của POC, không phải của định dạng. */
  maxBytes: 5 * 1024 * 1024,
  /** 5.000 dòng dữ liệu, không kể hàng tiêu đề. */
  maxRows: 5_000,
  /** 60 cột. */
  maxColumns: 60,
  /** Tỉ lệ loại vượt mức này thì hiện dải cảnh báo lớn ở bước soát. */
  rejectRateWarn: 0.3,
  /** Chi phí lô từ mức này trở lên phải qua E3. */
  approvalCost: 20_000_000,
  /** Hạn lưu mặc định của một nhà cung cấp mới, tính bằng ngày. */
  retentionDays: 365,
} as const

/** Người gật mọi yêu cầu E3 của luồng nhập — TP Kinh doanh. Lấy từ fixture chứ
 *  không gõ tên: đổi người trong kịch bản thì màn đổi theo. */
export const IMPORT_APPROVER = HEAD_OF_SALES

/** Lô này có phải qua Hộp duyệt vì tiền không. */
export function costNeedsApproval(cost: number): boolean {
  return cost >= IMPORT_GATE.approvalCost
}

// ---------------------------------------------------------------------------
// Nhãn tiếng Việt của bốn danh mục đóng (luật 14 · tên khoá không lên màn)
//
// `Record<…, string>` là exhaustive: thêm một giá trị vào fixture mà quên đặt
// nhãn thì `pnpm typecheck` đỏ, không phải một ô trống trên bảng.
// ---------------------------------------------------------------------------

export const SUPPLIER_KIND_LABEL: Record<ProspectSupplierKind, string> = {
  mua: 'Mua',
  'hiep-hoi': 'Hiệp hội · danh bạ',
  'noi-bo': 'Nội bộ',
  'noi-sinh': 'Tự để lại',
  'tai-cho': 'Thu tại chỗ',
}

export const BATCH_STATE_LABEL: Record<ProspectBatchState, string> = {
  nhap: 'Đang nhập',
  'cho-duyet': 'Chờ duyệt',
  'da-nhap': 'Đã nhập',
  'tu-choi': 'Bị bác',
  'het-han-luu': 'Hết hạn lưu',
}

export const LEGAL_BASIS_LABEL: Record<ProspectLegalBasis, string> = {
  'cong-khai-phap-nhan': 'Dữ liệu pháp nhân công khai',
  'dong-y-truc-tiep': 'Người đó tự để lại',
  'quan-he-cu': 'Quan hệ cũ',
}

export const REJECT_REASON_LABEL: Record<ProspectRejectReason, string> = {
  'khong-dinh-danh-duoc': 'Không định danh được',
  'nam-trong-danh-muc-chan': 'Nằm trong danh mục chặn',
  'thieu-can-cu-lien-he': 'Thiếu căn cứ liên hệ',
  'khong-lien-he-duoc': 'Không liên hệ được',
  'email-sai-dinh-dang': 'Địa chỉ thư sai định dạng',
  'dien-thoai-khong-chuan-hoa-duoc': 'Số điện thoại không chuẩn hoá được',
  'mst-sai-do-dai': 'Mã số thuế sai độ dài',
}

export const ROW_STATE_LABEL: Record<ProspectRowState, string> = {
  'trung-trong-file': 'Trùng trong chính file',
  'trung-lo-cu': 'Trùng lô đã có',
  'da-ky': 'Đã ký hợp đồng',
  'bi-loai': 'Bị loại',
  'da-co-chu': 'Đã có trong sổ',
  'da-roi': 'Đã ra khỏi luồng',
  'hop-le': 'Hợp lệ',
}

// ---------------------------------------------------------------------------
// Kho danh sách — bảng tám lô và tổng của kỳ (§6.6)
// ---------------------------------------------------------------------------

/** Một dòng của bảng kho. Mọi con số suy từ `prospectStats`, không một số nào
 *  gõ ở đây. */
export type BatchRow = {
  code: string
  supplier: string
  supplierKind: ProspectSupplierKind
  kindLabel: string
  /** ISO, giờ VN — `importedDay` quy về ngày lịch bằng thang của fixture. */
  importedAt: string
  importedBy: string
  rowsRaw: number
  rowsValid: number
  rowsDuplicate: number
  rowsRejected: number
  /** 0–1, `null` khi lô không có dòng nào. `null` KHÁC 0: "chưa đo được" khác
   *  "không loại dòng nào". */
  rejectRate: number | null
  duplicateRate: number | null
  /** Tỉ lệ loại vượt ngưỡng cảnh báo của phòng. */
  highReject: boolean
  cost: number
  costPerValidRow: number | null
  /** Lô này có phải qua Hộp duyệt vì tiền không. */
  needsApproval: boolean
  /** Lead truy được về lô — trực tiếp cộng qua-một-bước-đăng-ký. */
  leads: number
  leadsDirect: number
  leadsIndirect: number
  costPerLead: number | null
  /** Mã các nguồn lô nuôi, kể cả nguồn gọi tay. Rỗng là chuyện bình thường của
   *  lô đường B. */
  sources: string[]
  /** Lô KHÔNG nuôi đợt nào — mã trong `sources` (nếu có) là nguồn GỌI TAY, không
   *  phải nguồn được lô nuôi. Hai chuyện khác nhau nên nhãn phải khác: gọi tay
   *  là đường B của BD, không phải một lô chưa dùng tới. */
  handCalled: boolean
  /** `Wave.sent` của đợt ĐẦU TIÊN lô nuôi — không nhất thiết là đợt mở màn của
   *  nguồn: DS-0106 nuôi đợt 4 của CD-0102, DS-0107 nuôi đợt 2 của SK-0106.
   *  `null` = lô không nuôi đợt nào. */
  openingSent: number | null
  state: ProspectBatchState
  stateLabel: string
  legalBasis: ProspectLegalBasis
  legalLabel: string
  hasPersonalData: boolean
  retentionDays: number
  /** Ngày hết hạn lưu, ISO. */
  expiresAt: string
  /** Đã quá hạn lưu tính tới ngày đóng băng chưa. */
  expired: boolean
  note: string
}

/** Tám lô của kỳ, thứ tự như trong kho. Màn muốn xếp khác thì xếp ở màn — thứ
 *  tự mặc định ở đây là thứ tự mã, tức thứ tự hệ cấp mã. */
export function batchRows(): BatchRow[] {
  return PROSPECT_BATCHES.map((b) => {
    const s = prospectStats(b.code)
    const expiresDay = b.importedDay + b.retentionDays
    return {
      code: b.code,
      supplier: b.supplier,
      supplierKind: b.supplierKind,
      kindLabel: SUPPLIER_KIND_LABEL[b.supplierKind],
      importedAt: dayISO(b.importedDay),
      importedBy: b.importedBy,
      rowsRaw: s.rowsRaw,
      rowsValid: s.rowsValid,
      rowsDuplicate: s.rowsDuplicate,
      rowsRejected: s.rowsRejected,
      rejectRate: s.rejectRate,
      duplicateRate: s.duplicateRate,
      highReject: s.rejectRate !== null && s.rejectRate > IMPORT_GATE.rejectRateWarn,
      cost: s.cost,
      costPerValidRow: s.costPerValidRow,
      needsApproval: costNeedsApproval(s.cost),
      leads: s.leads,
      leadsDirect: s.leadsDirect,
      leadsIndirect: s.leadsIndirect,
      costPerLead: s.costPerLead,
      sources: s.sources,
      handCalled: b.usedBy.length === 0,
      openingSent: s.openingSent,
      state: b.state,
      stateLabel: BATCH_STATE_LABEL[b.state],
      legalBasis: b.legalBasis,
      legalLabel: LEGAL_BASIS_LABEL[b.legalBasis],
      hasPersonalData: b.hasPersonalData,
      retentionDays: b.retentionDays,
      expiresAt: dayISO(expiresDay),
      expired: expiresDay <= DAY_FROZEN,
      note: b.note,
    }
  })
}

/** Tổng của cả kho. Cộng ở fixture (`prospectTotals`), file này chỉ thêm một
 *  thước đọc được, hai phép đếm cảnh báo và hai PHẠM VI CÓ TÊN.
 *
 *  Hai phạm vi ở cuối không phải một phép cộng thứ hai: chúng đếm độ dài của
 *  `prospectBatchesPaid()` — hàm phạm vi của engine — để nhãn tiền trên màn khai
 *  được nó đang đứng trên mấy lô nào (quyết định G · 20/08). Đếm ở đây thay vì ở
 *  JSX vì một `filter().length` viết trong JSX là một phép đếm không ai test được. */
export function batchTotals() {
  const t = prospectTotals()
  const rows = batchRows()
  const paid = prospectBatchesPaid()
  return {
    ...t,
    /** Số lô PHẢI TRẢ TIỀN — mẫu số của mọi nhãn "tiền mua dòng". */
    paidBatches: paid.length,
    /** Số lô 0 đồng, cố tình nằm NGOÀI phép chia giá mỗi lead. Bỏ ngoài thì được,
     *  giấu thì không: màn hiện giá lead phải hiện kèm con số này. */
    freeBatches: PROSPECT_BATCHES.length - paid.length,
    /** Bao nhiêu phần dòng danh sách cuối cùng thành một dòng sổ. Mẫu số là dòng
     *  HỢP LỆ, không phải dòng thô: dòng trùng và dòng rác chưa bao giờ có cơ hội
     *  trả lời. `null` khi chưa có dòng hợp lệ nào. */
    validToLeadRate: t.rowsValid > 0 ? t.allLeads / t.rowsValid : null,
    /** Số lô vượt ngưỡng cảnh báo tỉ lệ loại. */
    highRejectBatches: rows.filter((r) => r.highReject).length,
    /** Số lô phải qua Hộp duyệt vì tiền. */
    approvalBatches: rows.filter((r) => r.needsApproval).length,
  }
}

// ---------------------------------------------------------------------------
// Đọc file — BOM, dấu phân tách, tách ô (§4.1 · bước 2)
// ---------------------------------------------------------------------------

/** Ba byte `EF BB BF` ở đầu file. Hệ PHÁT RA thì luôn có; hệ ĐỌC VÀO thì chấp
 *  nhận cả có lẫn không và tự bỏ đi. */
export const BOM = '\uFEFF'

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text
}

export type Delimiter = ',' | ';' | '\t'

/** Thứ tự thử: dấu phẩy trước (file mẫu của hệ), rồi chấm phẩy (Excel máy Việt
 *  đặt List separator = `;`), rồi tab (dán trực tiếp từ Excel). Thứ tự này cũng
 *  là thứ tự phá hoà: hai dấu ra cùng số cột thì lấy dấu đứng trước. */
export const DELIMITERS: readonly Delimiter[] = [',', ';', '\t']

export const DELIMITER_LABEL: Record<Delimiter, string> = {
  ',': 'dấu phẩy',
  ';': 'dấu chấm phẩy',
  '\t': 'dấu tab',
}

export type DelimiterSniff = {
  delimiter: Delimiter
  /** Số cột hàng tiêu đề ra được với dấu đã chọn. */
  columns: number
  /** Số cột từng dấu ra được — để màn nói ra vì sao nó chọn dấu này. */
  columnsOf: Record<Delimiter, number>
  /** `false` khi không dấu nào tách được hàng tiêu đề thành hơn một cột. */
  sure: boolean
  /** Một câu cho người đọc. Rỗng khi không có gì phải nói. */
  note: string
}

/** Dò dấu phân tách bằng cách TÁCH THỬ hàng tiêu đề với cả ba dấu và lấy dấu ra
 *  nhiều cột nhất — không đếm ký tự thô, vì một dấu phẩy nằm trong ô có nháy kép
 *  không phải một dấu phân tách.
 *
 *  Hệ PHẢI nói ra nó đã chọn dấu nào: máy Việt xuất CSV bằng dấu chấm phẩy, và
 *  một file bị đọc bằng sai dấu vẫn ra bảng — bảng một cột, trông như file hỏng. */
export function sniffDelimiter(text: string): DelimiterSniff {
  const body = stripBom(text)
  const columnsOf = { ',': 0, ';': 0, '\t': 0 } as Record<Delimiter, number>
  for (const d of DELIMITERS) columnsOf[d] = parseDelimited(body, d, 1)[0]?.length ?? 0

  let best: Delimiter = ','
  for (const d of DELIMITERS) if (columnsOf[d] > columnsOf[best]) best = d

  const columns = columnsOf[best]
  const sure = columns > 1
  let note = ''
  if (!sure) note = 'Hàng tiêu đề chỉ ra một cột với cả ba dấu — kiểm lại file.'
  else if (best === ';')
    note = 'Excel máy này xuất bằng dấu chấm phẩy — hệ đã tự nhận. Kiểm lại năm dòng bên dưới.'
  else if (best === '\t') note = 'Đọc bằng dấu tab — đúng thứ Excel bỏ vào bộ nhớ tạm khi dán.'

  return { delimiter: best, columns, columnsOf, sure, note }
}

/** Tách một văn bản phân tách thành lưới ô.
 *
 *  Hiểu nháy kép theo đúng luật CSV: ô mở bằng `"` thì dấu phân tách và xuống
 *  dòng bên trong nó là NỘI DUNG, và `""` là một dấu nháy. Bỏ qua chuyện này là
 *  cách chắc chắn nhất để một địa chỉ có dấu phẩy xé một dòng thành hai.
 *
 *  `maxRows` để dò dấu phân tách mà không phải đọc hết 5 MB. */
export function parseDelimited(
  text: string,
  delimiter: Delimiter,
  maxRows = Number.POSITIVE_INFINITY,
): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i] as string

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += c
      i += 1
      continue
    }

    if (c === '"' && field === '') {
      quoted = true
      i += 1
      continue
    }
    if (c === delimiter) {
      endField()
      i += 1
      continue
    }
    if (c === '\r' || c === '\n') {
      endRow()
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1
      if (rows.length >= maxRows) return rows
      continue
    }
    field += c
    i += 1
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}

export type ImportIssue = { code: string; text: string }

/** Kết quả đọc một file ở bước 2. */
export type Table = {
  hadBom: boolean
  sniff: DelimiterSniff
  /** Cả lưới, kể cả các hàng trên hàng tiêu đề. */
  all: string[][]
  /** Hàng tiêu đề đã chọn. */
  header: string[]
  /** Các hàng dữ liệu — mọi hàng SAU hàng tiêu đề. */
  body: string[][]
  columns: number
  /** Hàng tiêu đề nhìn giống một dòng dữ liệu → bắt người dùng chọn lại hàng nào
   *  là hàng tiêu đề. Cửa này có vì file Excel Việt hay có khối tiêu đề trang trí
   *  ở trên cùng. */
  headerLooksLikeData: boolean
  /** Chặn — còn một cái là không sang bước 3 được. */
  errors: ImportIssue[]
  /** Không chặn, chỉ nói ra. */
  warnings: ImportIssue[]
}

/** Kiểm cỡ file trước khi đọc. Tách riêng vì cỡ file biết được ngay từ `File`,
 *  không phải đọc hết mới biết. */
export function checkFileSize(bytes: number): ImportIssue | undefined {
  if (bytes <= IMPORT_GATE.maxBytes) return undefined
  const mb = Math.round(IMPORT_GATE.maxBytes / (1024 * 1024))
  return {
    code: 'qua-lon',
    text: `File nặng hơn ${mb} MB — giới hạn của bản POC. Cắt nhỏ file rồi nhập làm nhiều lô.`,
  }
}

/** Hàng này trông giống dữ liệu chứ không giống tiêu đề: mọi ô là số, hoặc nó
 *  trùng hệt hàng ngay dưới. */
export function looksLikeData(row: string[] | undefined, next?: string[]): boolean {
  if (!row || row.length === 0) return false
  const cells = row.map((c) => c.trim()).filter((c) => c !== '')
  if (cells.length === 0) return false
  if (cells.every((c) => /^[\d\s.,+-]+$/.test(c))) return true
  return next !== undefined && next.join('\u0000') === row.join('\u0000')
}

/** Đọc một văn bản thành bảng, kèm mọi cửa của bước 2.
 *
 *  `headerRowIndex` là hàng nào trong lưới làm tiêu đề — mặc định hàng đầu; màn
 *  cho người dùng đổi khi `headerLooksLikeData`. */
export function readTable(text: string, headerRowIndex = 0): Table {
  const hadBom = text.startsWith(BOM)
  const body0 = stripBom(text)
  const sniff = sniffDelimiter(body0)
  const all = parseDelimited(body0, sniff.delimiter).filter(
    (r) => !(r.length === 1 && (r[0] ?? '').trim() === ''),
  )

  const header = (all[headerRowIndex] ?? []).map((c) => c.trim())
  const rows = all.slice(headerRowIndex + 1)
  const columns = header.length

  const errors: ImportIssue[] = []
  const warnings: ImportIssue[] = []

  if (body0.includes('\uFFFD'))
    errors.push({
      code: 'khong-phai-utf8',
      text: 'File này không phải UTF-8. Mở lại bằng Excel, Lưu thành → CSV UTF-8.',
    })
  if (rows.length === 0)
    errors.push({
      code: 'khong-co-dong-nao',
      text: 'Không đọc được dòng dữ liệu nào dưới hàng tiêu đề.',
    })
  if (rows.length > IMPORT_GATE.maxRows)
    errors.push({
      code: 'qua-nhieu-dong',
      text: `File có ${rows.length} dòng, quá ${IMPORT_GATE.maxRows} dòng của bản POC.`,
    })
  if (columns > IMPORT_GATE.maxColumns)
    errors.push({
      code: 'qua-nhieu-cot',
      text: `File có ${columns} cột, quá ${IMPORT_GATE.maxColumns} cột của bản POC.`,
    })

  if (sniff.note) warnings.push({ code: 'dau-phan-tach', text: sniff.note })

  const headerLooksLikeData = looksLikeData(all[headerRowIndex], all[headerRowIndex + 1])
  if (headerLooksLikeData)
    warnings.push({
      code: 'tieu-de-giong-du-lieu',
      text: 'Hàng đầu nhìn giống một dòng dữ liệu. Chọn hàng nào là hàng tiêu đề.',
    })

  return {
    hadBom,
    sniff,
    all,
    header,
    body: rows,
    columns,
    headerLooksLikeData,
    errors,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// 15 cột chuẩn hoá (§4.2)
// ---------------------------------------------------------------------------

export type ProspectField =
  | 'ten_cong_ty'
  | 'ma_so_thue'
  | 'tinh'
  | 'nganh'
  | 'san_pham_chinh'
  | 'so_nguoi'
  | 'so_nha_may'
  | 'nguoi_lien_he'
  | 'chuc_danh'
  | 'email'
  | 'dien_thoai'
  | 'website'
  | 'nguon_goc'
  | 'can_cu_lien_he'
  | 'ghi_chu'

/** Giá trị của ô đích "không dùng cột này". Để TRỐNG khác BỎ QUA: để trống là
 *  chưa quyết, bỏ qua là đã quyết. Bước 3 chặn tới khi mọi cột chọn một trong
 *  hai. */
export const SKIP_TARGET = 'bo-qua'

export type ProspectColumn = {
  key: ProspectField
  /** Nhãn hiện lên màn — cột file có thể mang tên khác, khớp ở bước 3. */
  label: string
  /** `'luon'` bắt buộc mọi lô · `'dinh-danh'` một trong hai cột định danh ·
   *  `'neu-co-nguoi'` bắt buộc khi lô có cột cá nhân · `false` tuỳ. */
  required: 'luon' | 'dinh-danh' | 'neu-co-nguoi' | false
  /** Dữ liệu CÁ NHÂN — bốn cột đánh dấu của Nghị định 13. */
  personal: boolean
  /** Ô nào của bộ 10 câu được điền từ cột này. `undefined` = không điền ô nào. */
  slot?: 1 | 2 | 3 | 4 | 5
  hint: string
}

/** Tên trong FILE MẪU CỦA HỆ, không phải tên bắt buộc trong file người dùng —
 *  cột nào cũng nhận tên khác ở bước khớp cột.
 *
 *  **Luật quan trọng nhất của bảng này**: cổng init data là SÁU ô bắt buộc, mà
 *  file giỏi nhất trên đời điền được NĂM (ô 1·2·3·4·5). Ô 6 "Đau ở đâu" không
 *  nhà cung cấp nào bán. Thêm nữa, ô 4 và ô 5 lấy từ file là thông tin CHƯA XÁC
 *  MINH — ô 5 nguyên văn là "Kênh liên lạc gọi lại được", mà một địa chỉ thư
 *  `guessed` chưa gọi lại được. */
export const PROSPECT_COLUMNS: ProspectColumn[] = [
  {
    key: 'ten_cong_ty',
    label: 'Tên công ty',
    required: 'dinh-danh',
    personal: false,
    slot: 1,
    hint: 'Giữ dấu để hiện; sinh thêm khoá không dấu để khử trùng.',
  },
  {
    key: 'ma_so_thue',
    label: 'Mã số thuế',
    required: 'dinh-danh',
    personal: false,
    slot: 1,
    hint: '10 hoặc 13 chữ số; 13 số viết dạng có gạch nối.',
  },
  {
    key: 'tinh',
    label: 'Tỉnh',
    required: 'luon',
    personal: false,
    hint: 'Không khớp danh mục thì cảnh báo, KHÔNG chặn.',
  },
  {
    key: 'nganh',
    label: 'Ngành',
    required: false,
    personal: false,
    slot: 2,
    hint: 'Không khớp danh mục ngành thì để trống — không ép về ngành gần nhất.',
  },
  {
    key: 'san_pham_chinh',
    label: 'Sản phẩm chính',
    required: false,
    personal: false,
    slot: 2,
    hint: '',
  },
  {
    key: 'so_nguoi',
    label: 'Số người',
    required: false,
    personal: false,
    slot: 3,
    hint: 'Nhận khoảng "501-1000": lấy cận dưới và gắn cờ ước lượng.',
  },
  { key: 'so_nha_may', label: 'Số nhà máy', required: false, personal: false, slot: 3, hint: '' },
  {
    key: 'nguoi_lien_he',
    label: 'Người liên hệ',
    required: false,
    personal: true,
    slot: 4,
    hint: 'Dữ liệu cá nhân — có cột này là lô phải khai căn cứ.',
  },
  {
    key: 'chuc_danh',
    label: 'Chức danh',
    required: false,
    personal: true,
    slot: 4,
    hint: 'Dữ liệu cá nhân.',
  },
  {
    key: 'email',
    label: 'Địa chỉ thư',
    required: false,
    personal: true,
    slot: 5,
    hint: 'Tên miền công cộng không làm khoá khử trùng.',
  },
  {
    key: 'dien_thoai',
    label: 'Điện thoại',
    required: false,
    personal: true,
    slot: 5,
    hint: 'Đưa về dạng +84; không đưa được thì loại dòng NẾU luật đang bật.',
  },
  {
    key: 'website',
    label: 'Website',
    required: false,
    personal: false,
    hint: 'Chỉ giữ tên miền — là khoá khử trùng thứ hai.',
  },
  {
    key: 'nguon_goc',
    label: 'Nguồn gốc',
    required: false,
    personal: false,
    hint: 'Ghi vào LÔ, không ghi vào lead.',
  },
  {
    key: 'can_cu_lien_he',
    label: 'Căn cứ liên hệ',
    required: 'neu-co-nguoi',
    personal: false,
    hint: 'Bắt buộc khi file có cột người liên hệ · chức danh · thư · điện thoại.',
  },
  {
    key: 'ghi_chu',
    label: 'Ghi chú',
    required: false,
    personal: false,
    hint: 'KHÔNG bao giờ tự thành ô 6 của bộ 10 câu.',
  },
]

/** Bốn cột dữ liệu cá nhân — cổng Nghị định 13 nhìn vào đúng bốn cột này. */
export const PERSONAL_FIELDS: ProspectField[] = PROSPECT_COLUMNS.filter((c) => c.personal).map(
  (c) => c.key,
)

/** Hai cột định danh — thiếu cả hai thì không sang bước soát được. */
export const IDENTITY_FIELDS: ProspectField[] = PROSPECT_COLUMNS.filter(
  (c) => c.required === 'dinh-danh',
).map((c) => c.key)

/** Ô đích cho bảng khớp cột, kèm ô "Bỏ qua cột này" ở cuối. */
export function columnTargets(): { value: string; label: string }[] {
  return [
    ...PROSPECT_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
    { value: SKIP_TARGET, label: 'Bỏ qua cột này' },
  ]
}

/** Ánh xạ tên cột trong file → ô đích (hoặc `SKIP_TARGET`). Để trống nghĩa là
 *  chưa quyết. */
export type ColumnMapping = Record<string, string>

/** Từ điển tên cột hay gặp. Chỉ để ĐỀ NGHỊ ở bước 3 — không có cái nào tự áp. */
const FIELD_ALIASES: Record<ProspectField, string[]> = {
  ten_cong_ty: [
    'ten cong ty',
    'cong ty',
    'doanh nghiep',
    'company',
    'company name',
    'account name',
  ],
  ma_so_thue: ['ma so thue', 'mst', 'tax code', 'tax id', 'vat'],
  tinh: ['tinh', 'tinh thanh', 'province', 'state', 'city', 'dia ban'],
  nganh: ['nganh', 'nganh nghe', 'industry', 'sector', 'linh vuc'],
  san_pham_chinh: ['san pham chinh', 'san pham', 'product', 'products'],
  so_nguoi: ['so nguoi', 'quy mo', 'headcount', 'employees', 'employee count', 'so lao dong'],
  so_nha_may: ['so nha may', 'nha may', 'plants', 'factories'],
  nguoi_lien_he: ['nguoi lien he', 'ho ten', 'contact', 'contact name', 'first name', 'full name'],
  chuc_danh: ['chuc danh', 'chuc vu', 'title', 'job title', 'position'],
  email: ['email', 'dia chi thu', 'hom thu', 'e mail', 'mail'],
  dien_thoai: ['dien thoai', 'so dien thoai', 'phone', 'mobile', 'telephone', 'sdt'],
  website: ['website', 'trang web', 'web', 'domain', 'url'],
  nguon_goc: ['nguon goc', 'nguon', 'source', 'list name'],
  can_cu_lien_he: ['can cu lien he', 'can cu', 'legal basis', 'basis'],
  ghi_chu: ['ghi chu', 'note', 'notes', 'comment', 'remark'],
}

/** Đề nghị một bộ ánh xạ cho CẢ FILE, kèm câu căn cứ.
 *
 *  Luật 9: hàm này KHÔNG áp gì cả. Nó trả về một bộ và một câu "vì sao"; màn
 *  phải có nút, và trước khi bấm thì bảng khớp cột để TRỐNG. */
export function suggestMapping(header: string[]): { mapping: ColumnMapping; basis: string } {
  const mapping: ColumnMapping = {}
  const taken = new Set<string>()
  const hit: string[] = []

  for (const name of header) {
    const k = deburr(name).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
    let found: ProspectField | undefined
    for (const col of PROSPECT_COLUMNS) {
      if (taken.has(col.key)) continue
      const aliases = FIELD_ALIASES[col.key]
      if (k === col.key || aliases.includes(k)) {
        found = col.key
        break
      }
    }
    if (found) {
      mapping[name] = found
      taken.add(found)
      hit.push(name)
    } else {
      mapping[name] = SKIP_TARGET
    }
  }

  const miss = header.filter((h) => !hit.includes(h))
  const basis =
    `${hit.length} trên ${header.length} cột của file khớp tên với ô đích của hệ` +
    (miss.length > 0
      ? `; ${miss.length} cột không khớp ô nào (${miss.slice(0, 3).join(' · ')}) nên để "Bỏ qua".`
      : '.')

  return { mapping, basis }
}

/** Cửa của bước 3 — trả về mọi thứ chặn không cho sang bước 4. */
export function mappingErrors(header: string[], mapping: ColumnMapping): ImportIssue[] {
  const out: ImportIssue[] = []

  const unset = header.filter((h) => !mapping[h])
  if (unset.length > 0)
    out.push({
      code: 'con-cot-chua-chon',
      text: `Còn ${unset.length} cột chưa chọn gì. Để trống khác bỏ qua — cột nào cũng phải chọn một thứ.`,
    })

  const seen = new Map<string, string>()
  for (const h of header) {
    const v = mapping[h]
    if (!v || v === SKIP_TARGET) continue
    const first = seen.get(v)
    if (first) {
      const label = PROSPECT_COLUMNS.find((c) => c.key === v)?.label ?? v
      out.push({
        code: 'hai-cot-mot-o',
        text: `Cột "${h}" và cột "${first}" cùng trỏ vào ô "${label}". Một ô đích chỉ nhận một cột.`,
      })
    } else seen.set(v, h)
  }

  const hasIdentity = IDENTITY_FIELDS.some((f) => seen.has(f))
  if (!hasIdentity)
    out.push({
      code: 'thieu-cot-dinh-danh',
      text: 'Chưa ánh xạ cột định danh. Không có tên công ty lẫn mã số thuế thì dòng không phải một dòng, và khử trùng không có gì để so.',
    })

  return out
}

/** Cảnh báo mẫu ở bước 3 — không chặn, chỉ hiện dải vàng. */
export function sampleWarning(field: ProspectField, samples: string[]): string {
  const real = samples.map((s) => s.trim()).filter((s) => s !== '')
  if (real.length === 0) return ''
  if (field === 'email' && !real.some((s) => s.includes('@')))
    return `Không mẫu nào trong ${real.length} dòng có dấu @ — cột này có chắc là địa chỉ thư không?`
  if (field === 'ma_so_thue' && !real.some((s) => /\d{10}/.test(s.replace(/\D/g, ''))))
    return `Không mẫu nào trong ${real.length} dòng đủ 10 chữ số — cột này có chắc là mã số thuế không?`
  return ''
}

// ---------------------------------------------------------------------------
// Chuẩn hoá một dòng
// ---------------------------------------------------------------------------

/** Bỏ dấu tiếng Việt. Chỉ dùng để làm KHOÁ — chữ hiện lên màn luôn giữ dấu. */
function deburr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

function squeeze(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Tiền tố loại hình bị bỏ khi làm khoá tên. Chỉ bỏ ở ĐẦU chuỗi và chỉ bỏ đúng
 *  các cụm này: bỏ ở giữa thì "Cơ khí" mất chữ "cơ" và hai công ty khác nhau
 *  gộp làm một. */
const LEGAL_PREFIXES = [
  'cong ty co phan',
  'cong ty tnhh mtv',
  'cong ty tnhh',
  'cong ty cp',
  'cong ty',
  'co phan',
  'tnhh mtv',
  'tnhh',
  'cty',
  'cp',
  'mtv',
  'jsc',
  'co ltd',
  'corp',
]

/** Khoá tên pháp nhân: bỏ dấu · hạ thường · bỏ tiền tố loại hình · bỏ dấu câu ·
 *  nén khoảng trắng. **Chỉ làm khoá, không bao giờ hiện lên màn.** */
export function companyKey(raw: string): string {
  let k = squeeze(
    deburr(raw)
      .toLowerCase()
      .replace(/[.,/\\'"()[\]&+-]/g, ' '),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const p of LEGAL_PREFIXES) {
      if (k === p) return ''
      if (k.startsWith(`${p} `)) {
        k = k.slice(p.length + 1)
        changed = true
        break
      }
    }
  }
  return k
}

/** Tên miền công cộng — KHÔNG làm khoá khử trùng được. Hai người dùng Gmail
 *  không phải một công ty. */
export const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.com.vn',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
]

/** Mã số thuế đã chuẩn hoá. `digits` để so, `text` để hiện. */
export type TaxCode = { digits: string; text: string }

export function normTaxCode(raw: string): { value?: TaxCode; bad: boolean } {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return { bad: false }
  if (digits.length === 10) return { value: { digits, text: digits }, bad: false }
  if (digits.length === 13)
    return { value: { digits, text: `${digits.slice(0, 10)}-${digits.slice(10)}` }, bad: false }
  return { bad: true }
}

export function normEmail(raw: string): { value?: string; domain?: string; bad: boolean } {
  const v = raw.trim().toLowerCase()
  if (v === '') return { bad: false }
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v)) return { bad: true }
  const host = v.slice(v.indexOf('@') + 1)
  return { value: v, domain: PUBLIC_EMAIL_DOMAINS.includes(host) ? undefined : host, bad: false }
}

/** Đưa số điện thoại về `+84…`.
 *
 *  Nhận: `+84…` · `84…` · `0…`. Phần số quốc gia (bỏ số 0 đầu) phải 9 hoặc 10
 *  chữ số — di động Việt Nam 9 số sau số 0, cố định 9 hoặc 10 số sau số 0. Ngoài
 *  dải đó thì KHÔNG chuẩn hoá được, và luật §5.3 quyết định loại dòng hay không.
 *  Không giữ bản gốc: một số không gọi được thì giữ lại chỉ để gọi nhầm. */
export function normPhone(raw: string): { value?: string; bad: boolean } {
  const s = raw.replace(/[\s.()–-]/g, '')
  if (s === '') return { bad: false }
  let national = ''
  if (s.startsWith('+84')) national = s.slice(3)
  else if (s.startsWith('84') && s.length >= 11) national = s.slice(2)
  else if (s.startsWith('0')) national = s.slice(1)
  else return { bad: true }
  if (!/^\d{9,10}$/.test(national)) return { bad: true }
  return { value: `+84${national}`, bad: false }
}

/** Chỉ giữ tên miền: bỏ giao thức · bỏ `www.` · hạ thường · bỏ đường dẫn sau tên
 *  miền. Đây là nửa thứ hai của khoá khử trùng số 2. */
export function normWebsite(raw: string): { value?: string; bad: boolean } {
  let v = raw.trim().toLowerCase()
  if (v === '') return { bad: false }
  v = v
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0] as string
  v = v.replace(/\.+$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return { bad: true }
  return { value: v, bad: false }
}

/** Số người. Bỏ dấu ngăn nghìn; nhận khoảng `501-1000` thì lấy CẬN DƯỚI và gắn
 *  cờ ước lượng — cận dưới vì một con số đã đặt phải là con số bênh được. */
export function normCount(raw: string): { value?: number; estimated: boolean } {
  const s = raw.trim()
  if (s === '') return { estimated: false }
  const range = s.match(/^(\d[\d.,\s]*)\s*[-–—]\s*(\d[\d.,\s]*)$/)
  if (range) {
    const lo = Number((range[1] ?? '').replace(/\D/g, ''))
    return Number.isFinite(lo) ? { value: lo, estimated: true } : { estimated: false }
  }
  const digits = s.replace(/[.,\s]/g, '')
  if (!/^\d+$/.test(digits)) return { estimated: false }
  return { value: Number(digits), estimated: false }
}

/** Danh mục ngành của hệ. Không khớp thì để TRỐNG — ép về ngành gần nhất là bịa
 *  một dữ kiện rồi giao việc theo nó. */
export function matchCategory(raw: string): LeadCategory | undefined {
  const k = squeeze(deburr(raw).toLowerCase())
  if (k === '') return undefined
  return LEAD_CATEGORIES.find((c) => c.key === k || squeeze(deburr(c.label).toLowerCase()) === k)
    ?.key
}

/** Danh mục tỉnh của POC — các tỉnh đang có mặt trong sổ lead.
 *
 *  Repo chưa có danh mục hành chính thật; dựng một danh sách 34 tỉnh ở tầng app
 *  là đặt một danh mục cho cả hệ bằng tay lập trình viên. Vì thế cột `tinh` chỉ
 *  CẢNH BÁO khi không khớp, đúng như §4.2 — không chặn dòng nào. */
export const PROVINCES: string[] = [...new Set(LEADS.map((l) => l.province))].sort((a, b) =>
  a.localeCompare(b, 'vi'),
)

const PROVINCE_KEYS = new Map(PROVINCES.map((p) => [squeeze(deburr(p).toLowerCase()), p]))

export function matchProvince(raw: string): { value?: string; offList: boolean } {
  const s = squeeze(raw)
  if (s === '') return { offList: false }
  const hit = PROVINCE_KEYS.get(squeeze(deburr(s).toLowerCase()))
  return hit ? { value: hit, offList: false } : { value: s, offList: true }
}

const LEGAL_BASES: ProspectLegalBasis[] = Object.keys(LEGAL_BASIS_LABEL) as ProspectLegalBasis[]

export function matchLegalBasis(raw: string): { value?: ProspectLegalBasis; bad: boolean } {
  const k = squeeze(deburr(raw).toLowerCase()).replace(/\s+/g, '-')
  if (k === '') return { bad: false }
  const hit = LEGAL_BASES.find((b) => b === k)
  return hit ? { value: hit, bad: false } : { bad: true }
}

/** Một dòng sau khi chuẩn hoá 15 cột. Mọi cờ `bad` là "ô này có chữ nhưng không
 *  đưa về chuẩn được" — khác hẳn với ô để trống. */
export type NormalRow = {
  companyRaw?: string
  companyKey?: string
  taxCode?: TaxCode
  taxCodeBad: boolean
  province?: string
  provinceOffList: boolean
  category?: LeadCategory
  industryRaw?: string
  product?: string
  headcount?: number
  headcountEstimated: boolean
  plants?: number
  contactName?: string
  contactTitle?: string
  email?: string
  emailDomain?: string
  emailBad: boolean
  phone?: string
  phoneBad: boolean
  website?: string
  websiteBad: boolean
  origin?: string
  legalBasis?: ProspectLegalBasis
  legalBasisBad: boolean
  note?: string
  /** Dòng có ít nhất một trong BỐN ô cá nhân. Cổng Nghị định 13 nhìn vào đây. */
  hasPersonalCell: boolean
  /** Dòng có một NGƯỜI (tên hoặc chức danh). Hẹp hơn `hasPersonalCell`: một hòm
   *  thư chung và một số tổng đài là dữ liệu pháp nhân. */
  hasPerson: boolean
}

/** Ô đích → giá trị thô, tức một dòng file SAU bước khớp cột. */
export type Cells = Partial<Record<ProspectField, string>>

/** Chuẩn hoá một dòng theo §4.2. Không quyết định gì về việc nhận hay loại —
 *  đó là việc của `rejectReasonOf`. */
export function normalizeRow(cells: Cells): NormalRow {
  const get = (f: ProspectField) => (cells[f] ?? '').trim()

  const companyRaw = squeeze(get('ten_cong_ty'))
  const tax = normTaxCode(get('ma_so_thue'))
  const province = matchProvince(get('tinh'))
  const email = normEmail(get('email'))
  const phone = normPhone(get('dien_thoai'))
  const website = normWebsite(get('website'))
  const headcount = normCount(get('so_nguoi'))
  const plants = normCount(get('so_nha_may'))
  const basis = matchLegalBasis(get('can_cu_lien_he'))

  const contactName = squeeze(get('nguoi_lien_he'))
  const contactTitle = squeeze(get('chuc_danh'))
  const industryRaw = squeeze(get('nganh'))

  const row: NormalRow = {
    taxCodeBad: tax.bad,
    provinceOffList: province.offList,
    headcountEstimated: headcount.estimated,
    emailBad: email.bad,
    phoneBad: phone.bad,
    websiteBad: website.bad,
    legalBasisBad: basis.bad,
    hasPersonalCell: false,
    hasPerson: false,
  }

  if (companyRaw) {
    row.companyRaw = companyRaw
    const key = companyKey(companyRaw)
    if (key) row.companyKey = key
  }
  if (tax.value) row.taxCode = tax.value
  if (province.value) row.province = province.value
  if (industryRaw) row.industryRaw = industryRaw
  const category = matchCategory(industryRaw)
  if (category) row.category = category
  const product = squeeze(get('san_pham_chinh'))
  if (product) row.product = product
  if (headcount.value !== undefined) row.headcount = headcount.value
  if (plants.value !== undefined) row.plants = plants.value
  if (contactName) row.contactName = contactName
  if (contactTitle) row.contactTitle = contactTitle
  if (email.value) row.email = email.value
  if (email.domain) row.emailDomain = email.domain
  if (phone.value) row.phone = phone.value
  if (website.value) row.website = website.value
  const origin = squeeze(get('nguon_goc'))
  if (origin) row.origin = origin
  if (basis.value) row.legalBasis = basis.value
  const note = squeeze(get('ghi_chu'))
  if (note) row.note = note

  row.hasPerson = Boolean(contactName || contactTitle)
  row.hasPersonalCell = Boolean(
    contactName || contactTitle || get('email') !== '' || get('dien_thoai') !== '',
  )

  return row
}

/** Lô này có cột dữ liệu cá nhân không — tính trên BỘ ÁNH XẠ, không trên từng
 *  dòng. Đây là thứ quyết định bước 5 có bắt khai căn cứ hay không. */
export function batchHasPersonalData(mapping: ColumnMapping): boolean {
  const targets = new Set(Object.values(mapping))
  return PERSONAL_FIELDS.some((f) => targets.has(f))
}

// ---------------------------------------------------------------------------
// Ba khoá khử trùng (§5.2) — chạy theo thứ tự, DỪNG ở khoá đầu tiên bắt được
// ---------------------------------------------------------------------------

export type MatchKey = 'mst' | 'ten-mien' | 'ten-tinh'

/** Vì sao đúng ba khoá và đúng thứ tự này: bỏ sót một trùng chỉ tốn một lần gửi
 *  thư, gộp nhầm hai công ty thì mất một khách. Nên khoá chắc chạy trước, và
 *  khoá tạm nhất (tên) phải kèm tỉnh — "Cơ khí Đại Việt" có ở nhiều tỉnh. */
export const DEDUPE_KEYS: { key: MatchKey; label: string; confidence: string; why: string }[] = [
  {
    key: 'mst',
    label: 'Mã số thuế',
    confidence: 'chắc',
    why: 'Bỏ mọi ký tự không phải số. Mã 13 số so cả 13 lẫn 10 số đầu — chi nhánh cùng một pháp nhân mẹ.',
  },
  {
    key: 'ten-mien',
    label: 'Tên miền thư · website',
    confidence: 'khá',
    why: 'Hạ thường, bỏ www, bỏ đường dẫn. Bỏ qua tên miền công cộng: hai người dùng Gmail không phải một công ty.',
  },
  {
    key: 'ten-tinh',
    label: 'Tên pháp nhân + tỉnh',
    confidence: 'tạm',
    why: 'Bỏ dấu, bỏ tiền tố loại hình, nén khoảng trắng — và tỉnh phải khớp.',
  },
]

/** Giá trị so trùng của một dòng, theo đúng thứ tự khoá. Khoá nào không có giá
 *  trị thì vắng mặt — vắng mặt khác không khớp. */
export function dedupeValues(row: NormalRow): { key: MatchKey; values: string[] }[] {
  const out: { key: MatchKey; values: string[] }[] = []

  if (row.taxCode) {
    const d = row.taxCode.digits
    out.push({ key: 'mst', values: d.length === 13 ? [d, d.slice(0, 10)] : [d] })
  }

  const domains = [row.emailDomain, row.website].filter((v): v is string => Boolean(v))
  if (domains.length > 0) out.push({ key: 'ten-mien', values: [...new Set(domains)] })

  if (row.companyKey && row.province)
    out.push({
      key: 'ten-tinh',
      values: [`${row.companyKey}|${squeeze(deburr(row.province).toLowerCase())}`],
    })

  return out
}

/** Sổ tra trùng. Một `Map` cho mỗi khoá; giá trị là mã của dòng ĐẦU TIÊN mang
 *  giá trị ấy — giữ dòng đầu, bỏ dòng sau. */
export type DedupeIndex = Record<MatchKey, Map<string, string>>

export function newDedupeIndex(): DedupeIndex {
  return { mst: new Map(), 'ten-mien': new Map(), 'ten-tinh': new Map() }
}

export function addToIndex(index: DedupeIndex, row: NormalRow, id: string): void {
  for (const { key, values } of dedupeValues(row))
    for (const v of values) if (!index[key].has(v)) index[key].set(v, id)
}

export type DupeHit = { matchedWith: string; matchedBy: MatchKey }

/** Dừng ở khoá đầu tiên bắt được. Không chạy nốt ba khoá rồi chọn khoá "tốt
 *  nhất": người soát cần biết dòng bị gộp vì CÁI GÌ, mà cái gì đó phải là thứ
 *  chắc nhất còn dùng được. */
export function findDupe(row: NormalRow, index: DedupeIndex, selfId?: string): DupeHit | undefined {
  for (const { key, values } of dedupeValues(row))
    for (const v of values) {
      const hit = index[key].get(v)
      if (hit && hit !== selfId) return { matchedWith: hit, matchedBy: key }
    }
  return undefined
}

// ---------------------------------------------------------------------------
// Bảy luật chặn dòng (§5.3)
// ---------------------------------------------------------------------------

export type RejectRule = {
  reason: ProspectRejectReason
  label: string
  /** Tắt được ở module 5 hay không. */
  canDisable: boolean
  why: string
}

/** Thứ tự chạy, và cũng là thứ tự hiện trên màn cấu hình. Ba luật đầu KHÔNG tắt
 *  được.
 *
 *  Danh mục chặn đứng đầu bảng vì nó THẮNG MỌI LUẬT KHÁC — lô mới, nhà cung cấp
 *  mới, căn cứ mới đều không gỡ được nó. Đây là chỗ duy nhất của module 5 không
 *  có nút tắt: chặn vĩnh viễn là lời hứa với người đã từ chối. */
export const REJECT_RULES: RejectRule[] = [
  {
    reason: 'nam-trong-danh-muc-chan',
    label: REJECT_REASON_LABEL['nam-trong-danh-muc-chan'],
    canDisable: false,
    why: 'Người này đã từ chối nhận liên hệ. Danh mục chặn chỉ thêm không bớt, và nó thắng mọi luật khác.',
  },
  {
    reason: 'khong-dinh-danh-duoc',
    label: REJECT_REASON_LABEL['khong-dinh-danh-duoc'],
    canDisable: false,
    why: 'Không có cả tên lẫn mã số thuế thì không phải một dòng.',
  },
  {
    reason: 'thieu-can-cu-lien-he',
    label: REJECT_REASON_LABEL['thieu-can-cu-lien-he'],
    canDisable: false,
    why: 'Có ô cá nhân mà không khai được căn cứ — cổng Nghị định 13.',
  },
  {
    reason: 'khong-lien-he-duoc',
    label: REJECT_REASON_LABEL['khong-lien-he-duoc'],
    canDisable: true,
    why: 'Không thư, không điện thoại, không website. Lô để BD gọi tay đôi khi chỉ cần tên và tỉnh — vì thế tắt được.',
  },
  {
    reason: 'email-sai-dinh-dang',
    label: REJECT_REASON_LABEL['email-sai-dinh-dang'],
    canDisable: true,
    why: 'Ô thư có chữ nhưng không phải một địa chỉ.',
  },
  {
    reason: 'dien-thoai-khong-chuan-hoa-duoc',
    label: REJECT_REASON_LABEL['dien-thoai-khong-chuan-hoa-duoc'],
    canDisable: true,
    why: 'Không đưa được về dạng +84.',
  },
  {
    reason: 'mst-sai-do-dai',
    label: REJECT_REASON_LABEL['mst-sai-do-dai'],
    canDisable: true,
    why: 'Không phải 10 hoặc 13 chữ số.',
  },
]

export type RejectSwitches = Record<ProspectRejectReason, boolean>

/** Mặc định: cả bảy luật BẬT. Ba luật đầu không tắt được nên `rejectReasonOf`
 *  bỏ qua cờ của chúng — để `true` ở đây cho bảng cấu hình đọc thẳng. */
export const DEFAULT_REJECT_SWITCHES: RejectSwitches = {
  'nam-trong-danh-muc-chan': true,
  'khong-dinh-danh-duoc': true,
  'thieu-can-cu-lien-he': true,
  'khong-lien-he-duoc': true,
  'email-sai-dinh-dang': true,
  'dien-thoai-khong-chuan-hoa-duoc': true,
  'mst-sai-do-dai': true,
}

/** Danh mục chặn (opt-out) — số điện thoại và địa chỉ thư đã từ chối. Danh sách
 *  riêng, CHỈ THÊM KHÔNG BỚT; gỡ một dòng khỏi đây phải qua E3. */
export type BlockList = { phones: string[]; emails: string[] }

export const EMPTY_BLOCK_LIST: BlockList = { phones: [], emails: [] }

/** Bối cảnh soát một dòng. */
export type RowContext = {
  switches?: RejectSwitches
  blockList?: BlockList
  /** Căn cứ khai ở mức LÔ. Dòng không tự khai thì lấy của lô. */
  batchLegalBasis?: ProspectLegalBasis
}

/** Lý do loại một dòng, hoặc `undefined` khi dòng qua được cả bảy luật.
 *
 *  Chạy đúng thứ tự `REJECT_RULES`: ba luật cứng trước, bốn luật tắt được sau.
 *  Một dòng chỉ mang MỘT lý do — lý do đầu tiên bắt được — vì bảng soát phải nói
 *  "dòng này bỏ đi vì cái gì", không phải liệt kê mọi thứ nó thiếu. */
export function rejectReasonOf(
  row: NormalRow,
  ctx: RowContext = {},
): ProspectRejectReason | undefined {
  const on = ctx.switches ?? DEFAULT_REJECT_SWITCHES
  const block = ctx.blockList ?? EMPTY_BLOCK_LIST

  const blockedPhones = new Set(block.phones.map((p) => normPhone(p).value ?? p))
  const blockedEmails = new Set(block.emails.map((e) => e.trim().toLowerCase()))
  if ((row.phone && blockedPhones.has(row.phone)) || (row.email && blockedEmails.has(row.email)))
    return 'nam-trong-danh-muc-chan'

  if (!row.companyRaw && !row.taxCode) return 'khong-dinh-danh-duoc'

  const basis = row.legalBasis ?? ctx.batchLegalBasis
  if (row.hasPersonalCell && (!basis || row.legalBasisBad)) return 'thieu-can-cu-lien-he'

  if (on['khong-lien-he-duoc'] && !row.email && !row.phone && !row.website)
    return 'khong-lien-he-duoc'
  if (on['email-sai-dinh-dang'] && row.emailBad) return 'email-sai-dinh-dang'
  if (on['dien-thoai-khong-chuan-hoa-duoc'] && row.phoneBad)
    return 'dien-thoai-khong-chuan-hoa-duoc'
  if (on['mst-sai-do-dai'] && row.taxCodeBad) return 'mst-sai-do-dai'

  return undefined
}

// ---------------------------------------------------------------------------
// Chống nhập đè lên lead đang có chủ (§5.4)
// ---------------------------------------------------------------------------

/** Ba luật của phần này, viết ra để màn in đúng chữ chứ không tự chế:
 *
 *  1. **Nhập không bao giờ đè lên ô đã có.** Ô 4 do BD moi được từ một cuộc gọi
 *     thật đắt hơn cột `nguoi_lien_he` của một nhà bán dữ liệu. Nhập chỉ điền
 *     vào ô TRỐNG.
 *  2. **Ghi đè là hành động riêng, phải qua E3.** Nó không nằm trong luồng nhập:
 *     là một nút trên bảng soát, bấm thì sinh một yêu cầu duyệt chứ không sửa gì
 *     ngay, và lô về `cho-duyet`.
 *  3. **Lead đang có chủ không bị lôi vào khán giả đợt.** Marketing thấy "N dòng
 *     đã có chủ" ở bước soát và biết vì sao khán giả nhỏ hơn số dòng hợp lệ. */
export const OVERWRITE_RULE = {
  approver: IMPORT_APPROVER,
  batchState: 'cho-duyet' as ProspectBatchState,
  label: 'Ghi đè ô của dòng sổ',
  why: 'Ghi đè không nằm trong luồng nhập. Bấm là sinh một yêu cầu duyệt, không sửa gì ngay.',
} as const

export type BookHit = {
  lead: Lead
  matchedBy: MatchKey
  state: Extract<ProspectRowState, 'da-ky' | 'da-co-chu' | 'da-roi'>
  owner?: string
  exitReason?: ExitReason
  /** Dòng có được vào kho không. `false` chỉ với `da-ky`. */
  canImport: boolean
  /** Dòng có được vào khán giả đợt gửi không. */
  canSend: boolean
  /** Nhập chạm vào dòng sổ tới đâu. */
  fill: 'khong' | 'o-trong'
  /** Muốn đè lên ô đã có thì phải qua E3. */
  needsApprovalToOverwrite: boolean
  note: string
}

/** Sổ tra sổ lead. Dựng một lần, 100 dòng.
 *
 *  ⚠ **Khoá 1 (mã số thuế) không bắt được dòng sổ nào**: `Lead` của kịch bản
 *  không có cột mã số thuế. Nói ra chỗ này vì nó là khoá CHẮC nhất trong ba khoá
 *  — với sổ lead, dòng danh sách chỉ khớp được bằng tên miền hoặc bằng tên+tỉnh,
 *  tức bằng hai khoá yếu hơn. Khoá 1 vẫn chạy đủ ở vòng khử trùng với KHO LÔ. */
const bookIndex: DedupeIndex = (() => {
  const index = newDedupeIndex()
  for (const lead of LEADS) {
    const contact = leadContact(lead)
    const email = contact?.email ? normEmail(contact.email) : undefined
    if (email?.domain && !index['ten-mien'].has(email.domain))
      index['ten-mien'].set(email.domain, lead.code)
    const key = companyKey(lead.company)
    if (key) {
      const v = `${key}|${squeeze(deburr(lead.province).toLowerCase())}`
      if (!index['ten-tinh'].has(v)) index['ten-tinh'].set(v, lead.code)
    }
  }
  return index
})()

const leadByCode = new Map(LEADS.map((l) => [l.code, l]))

/** Dòng này đã có trong sổ lead chưa — và nếu có thì được làm gì với nó.
 *
 *  Bốn ngả, đúng bảng §5.4:
 *  - đã ký hợp đồng → **chặn cứng**, khách đã mua thuộc kịch bản khác;
 *  - đang chạy CÓ chủ → nhập, không đè ô nào, **không gửi** (Sale đang chăm, thư
 *    lạnh làm hỏng việc);
 *  - đang chạy ở kho chung → nhập, bổ sung ô còn TRỐNG, có gửi;
 *  - đã ra khỏi luồng → nhập kèm lý do rơi cũ, có gửi — đây chính là chiến dịch
 *    nuôi lại. */
export function bookHit(row: NormalRow): BookHit | undefined {
  const dupe = findDupe(row, bookIndex)
  if (!dupe) return undefined
  const lead = leadByCode.get(dupe.matchedWith)
  if (!lead) return undefined

  const base = { lead, matchedBy: dupe.matchedBy }

  if (lead.contractCode)
    return {
      ...base,
      state: 'da-ky',
      canImport: false,
      canSend: false,
      fill: 'khong',
      needsApprovalToOverwrite: false,
      note: `${lead.company} đã ký hợp đồng ${lead.contractCode} — khách đã mua không quay lại kho danh sách.`,
    }

  if (!isRunning(lead)) {
    const hit: BookHit = {
      ...base,
      state: 'da-roi',
      canImport: true,
      canSend: true,
      fill: 'o-trong',
      needsApprovalToOverwrite: true,
      note: `${lead.company} đã ra khỏi luồng${lead.exitReason ? ` · ${lead.exitReason}` : ''} — nhập lại được, và đây đúng là tệp của một đợt nuôi lại.`,
    }
    if (lead.exitReason) hit.exitReason = lead.exitReason
    return hit
  }

  if (lead.owner)
    return {
      ...base,
      state: 'da-co-chu',
      owner: lead.owner,
      canImport: true,
      canSend: false,
      fill: 'khong',
      needsApprovalToOverwrite: true,
      note: `${lead.owner} đang chăm ${lead.company} — nhập vào kho được, nhưng KHÔNG vào khán giả đợt gửi.`,
    }

  return {
    ...base,
    state: 'da-co-chu',
    canImport: true,
    canSend: true,
    fill: 'o-trong',
    needsApprovalToOverwrite: true,
    note: `${lead.company} đang ở kho chung, chưa ai nhận — nhập chỉ điền vào ô còn trống, không đè ô nào đã có.`,
  }
}

// ---------------------------------------------------------------------------
// Soát cả lô — bốn số lớn và bốn bảng của bước 4
// ---------------------------------------------------------------------------

export type ReviewRow = {
  /** `DS-0101/0007` — mã lô và SỐ THỨ TỰ TRONG FILE GỐC. Số thứ tự giữ nguyên kể
   *  cả khi dòng bị loại: người dùng mở file ra đối chiếu được. */
  id: string
  no: number
  row: NormalRow
  state: ProspectRowState
  rejectReason?: ProspectRejectReason
  matchedWith?: string
  matchedBy?: MatchKey
  book?: BookHit
  /** Không chặn, chỉ nói ra — tỉnh ngoài danh mục, số người là khoảng ước lượng. */
  warnings: string[]
}

export type ReviewInput = {
  /** Dòng đã khớp cột. */
  cells: Cells[]
  /** Mã lô đang nhập — làm tiền tố mã dòng. */
  batchCode: string
  /** Dòng của các lô ĐÃ CÓ trong kho. Khử trùng chéo lô là BẮT BUỘC, không phải
   *  tuỳ chọn: bằng chứng là 188 dòng trùng của lô khách mời triển lãm, chủ yếu
   *  trùng ba lô trước. */
  store?: { id: string; row: NormalRow }[]
} & RowContext

export type Review = {
  rows: ReviewRow[]
  /** Bốn số lớn của bước 4. */
  rowsRaw: number
  rowsValid: number
  rowsDuplicate: number
  rowsRejected: number
  /** Xô THỨ NĂM: dòng vào kho được nhưng KHÔNG vào khán giả, cộng dòng bị chặn
   *  cứng vì đã ký. Xem docblock của `reviewRows` — bốn con số của `ProspectBatch`
   *  không có chỗ cho ba trạng thái này. */
  rowsHeld: number
  /** `rowsHeld` tách đôi, vì HAI NỬA CỦA NÓ TRÁI NGƯỢC NHAU và màn phải nói hai
   *  câu khác nhau: `held` là dòng VÀO KHO được nhưng không vào khán giả (Sale
   *  đang chăm — thư lạnh làm hỏng việc), còn `blocked` là dòng KHÔNG vào kho,
   *  chặn cứng vì đã ký hợp đồng. Gộp hai số rồi bảo "vào kho được" là nói sai
   *  về nửa sau. `rowsHeld = held.length + blocked.length` giữ nguyên. */
  held: ReviewRow[]
  blocked: ReviewRow[]
  /** Dòng `da-co-chu` thật sự CÓ CHỦ — nửa duy nhất mà nút ghi đè được chạm tới.
   *  Nửa kia (`da-co-chu` ở kho chung) không có ô nào để đè: nhập chỉ điền vào ô
   *  còn trống, nên đưa nó vào một yêu cầu duyệt là xin gật cho một việc không
   *  xảy ra. */
  overwritable: ReviewRow[]
  rejectRate: number | null
  duplicateRate: number | null
  /** Tỉ lệ loại vượt ngưỡng của phòng → dải cảnh báo lớn. */
  highReject: boolean
  /** Có dòng hợp lệ nào không. `false` thì không sang bước 5 được. */
  canGoOn: boolean
  /** Bảng 1 — trùng trong chính file. */
  inFile: ReviewRow[]
  /** Bảng 2 — trùng với lô đã có. */
  inStore: ReviewRow[]
  /** Bảng 3 — bị loại, mỗi dòng nói LÝ DO NÀO. */
  rejected: ReviewRow[]
  /** Bảng 4 — đã có trong sổ lead, chia ba nhóm. */
  inBook: { owned: ReviewRow[]; exited: ReviewRow[]; signed: ReviewRow[] }
  /** Đếm theo từng lý do, thứ tự `REJECT_RULES`. */
  byReason: { reason: ProspectRejectReason; label: string; count: number }[]
  /** Dòng thật sự vào khán giả đợt gửi. */
  audience: ReviewRow[]
}

/** Soát một lô: khử trùng hai vòng, chạy bảy luật chặn, đối chiếu sổ lead.
 *
 *  **Thứ tự quyết định của một dòng** — mỗi dòng mang đúng MỘT trạng thái:
 *   1. trùng một dòng trước trong CHÍNH FILE → `trung-trong-file`;
 *   2. trùng một dòng của KHO LÔ → `trung-lo-cu`;
 *   3. dính một trong bảy luật chặn → `bi-loai`;
 *   4. khớp một dòng SỔ LEAD → `da-ky` · `da-co-chu` · `da-roi`;
 *   5. còn lại → `hop-le`.
 *
 *  ⚠ **Bốn con số của `ProspectBatch` chỉ có ba xô cho bảy trạng thái.** Quy ước
 *  của hàm này, viết ra vì chưa ai gật:
 *
 *      rowsValid     = hop-le + da-roi + da-co-chu(kho chung)   ← vào khán giả được
 *      rowsDuplicate = trung-trong-file + trung-lo-cu
 *      rowsRejected  = bi-loai
 *      rowsHeld      = da-co-chu(có chủ) + da-ky                ← xô thứ tư
 *
 *  Với tám lô đóng băng thì `rowsHeld = 0`, nên đẳng thức ba xô của fixture
 *  (`raw = valid + duplicate + rejected`) vẫn đúng khít. Nhưng nó chỉ đúng vì
 *  kịch bản không có dòng nào đè lead đang có chủ — tức bảng số 4 của bước soát
 *  TRỐNG ở cả tám lô. Xem openDecisions của đợt. */
export function reviewRows(input: ReviewInput): Review {
  const store = input.store ?? []
  const storeIndex = newDedupeIndex()
  for (const s of store) addToIndex(storeIndex, s.row, s.id)

  const fileIndex = newDedupeIndex()
  const rows: ReviewRow[] = []

  input.cells.forEach((cells, i) => {
    const no = i + 1
    const id = `${input.batchCode}/${String(no).padStart(4, '0')}`
    const row = normalizeRow(cells)

    const warnings: string[] = []
    if (row.provinceOffList && row.province)
      warnings.push(`Tỉnh "${row.province}" không có trong danh mục — vẫn nhập, chỉ để ý.`)
    if (row.headcountEstimated) warnings.push('Số người là một khoảng — đã lấy cận dưới.')

    const out: ReviewRow = { id, no, row, state: 'hop-le', warnings }

    const inFile = findDupe(row, fileIndex, id)
    const inStore = inFile ? undefined : findDupe(row, storeIndex)
    const reason = inFile || inStore ? undefined : rejectReasonOf(row, input)
    const hit = inFile || inStore || reason ? undefined : bookHit(row)

    if (inFile) {
      out.state = 'trung-trong-file'
      out.matchedWith = inFile.matchedWith
      out.matchedBy = inFile.matchedBy
    } else if (inStore) {
      out.state = 'trung-lo-cu'
      out.matchedWith = inStore.matchedWith
      out.matchedBy = inStore.matchedBy
    } else if (reason) {
      out.state = 'bi-loai'
      out.rejectReason = reason
    } else if (hit) {
      out.state = hit.state
      out.matchedWith = hit.lead.code
      out.matchedBy = hit.matchedBy
      out.book = hit
    }

    /* Chỉ dòng KHÔNG trùng mới vào sổ tra — giữ dòng đầu, bỏ dòng sau. Dòng bị
       loại vẫn vào sổ: nó vẫn là một công ty đã xuất hiện, và dòng sau trùng nó
       phải đọc là "trùng", không phải "cũng rác". */
    if (!inFile) addToIndex(fileIndex, row, id)

    rows.push(out)
  })

  const of = (...states: ProspectRowState[]) => rows.filter((r) => states.includes(r.state))

  const inFile = of('trung-trong-file')
  const inStore = of('trung-lo-cu')
  const rejected = of('bi-loai')
  const signed = of('da-ky')
  const exited = of('da-roi')
  const owned = of('da-co-chu')

  /* Lọc trên `rows` chứ không ghép các bảng lại: khán giả phải giữ ĐÚNG thứ tự
     dòng trong file gốc, không phải thứ tự nhóm. */
  const canSend = (r: ReviewRow) =>
    r.state === 'hop-le' || r.state === 'da-roi' || (r.state === 'da-co-chu' && r.book?.canSend)
  const valid = rows.filter(canSend)
  const held = rows.filter((r) => (r.state === 'da-ky' || r.state === 'da-co-chu') && !canSend(r))

  const rowsRaw = rows.length
  const rowsDuplicate = inFile.length + inStore.length
  const rowsRejected = rejected.length
  const rejectRate = rowsRaw > 0 ? rowsRejected / rowsRaw : null

  return {
    rows,
    rowsRaw,
    rowsValid: valid.length,
    rowsDuplicate,
    rowsRejected,
    rowsHeld: held.length,
    held: held.filter((r) => r.state === 'da-co-chu'),
    blocked: signed,
    overwritable: owned.filter((r) => !r.book?.canSend),
    rejectRate,
    duplicateRate: rowsRaw > 0 ? rowsDuplicate / rowsRaw : null,
    highReject: rejectRate !== null && rejectRate > IMPORT_GATE.rejectRateWarn,
    canGoOn: valid.length > 0,
    inFile,
    inStore,
    rejected,
    inBook: { owned, exited, signed },
    byReason: REJECT_RULES.map((r) => ({
      reason: r.reason,
      label: r.label,
      count: rejected.filter((x) => x.rejectReason === r.reason).length,
    })),
    audience: valid,
  }
}

/** Cửa của bước 5 — không nhập được khi còn một cái.
 *
 *  `fileHash` là vân file: trùng vân với một lô đã có nghĩa là đúng file ấy đã
 *  nhập một lần rồi. Tám lô đóng băng chưa ai ký vân file nên cửa này chưa có ca
 *  demo — nhưng luật vẫn phải có, vì nhập lại đúng một file là lỗi hay gặp nhất
 *  của người dùng thật. */
export function confirmErrors(draft: {
  hasPersonalData: boolean
  legalBasis?: ProspectLegalBasis
  rowsValid: number
  fileHash?: string
  /** Đã tick "Lô này không tốn tiền" chưa. Bỏ trống vì quên và bỏ trống vì đúng
   *  là hai chuyện. */
  cost?: number
  freeChecked?: boolean
}): ImportIssue[] {
  const out: ImportIssue[] = []

  if (draft.hasPersonalData && !draft.legalBasis)
    out.push({
      code: 'thieu-can-cu',
      text: 'Lô có cột dữ liệu cá nhân — phải chọn căn cứ liên hệ trước khi nhập (Nghị định 13).',
    })

  if (draft.rowsValid <= 0)
    out.push({ code: 'khong-co-dong-hop-le', text: 'Không dòng nào hợp lệ — không có gì để nhập.' })

  if (draft.fileHash) {
    const twin = PROSPECT_BATCHES.find((b) => b.fileHash === draft.fileHash)
    if (twin)
      out.push({
        code: 'trung-van-file',
        text: `File này đã nhập ngày ${dayISO(twin.importedDay).slice(0, 10)} bởi ${twin.importedBy} thành lô ${twin.code}.`,
      })
  }

  if (!draft.cost && !draft.freeChecked)
    out.push({
      code: 'chua-xac-nhan-mien-phi',
      text: 'Chi phí để trống. Tick "Lô này không tốn tiền" nếu đúng là không tốn — bỏ trống vì quên là chuyện khác.',
    })

  return out
}

/** Câu in đậm cạnh nút Nhập. Không phải câu trang trí: nó là khác biệt giữa
 *  prospect và lead, và là lý do prospect đứng ngoài phễu. */
export const IMPORT_DISCLAIMER = 'Nhập lô không sinh lead nào. Lead sinh khi bên kia trả lời.'

// ---------------------------------------------------------------------------
// File mẫu (§4.4)
// ---------------------------------------------------------------------------

/** Bốn dòng ví dụ dạy bốn chuyện:
 *   1. dòng đầy đủ nhất VẪN chỉ điền được 5 trên 6 ô bắt buộc — ô "Đau ở đâu"
 *      không nhà cung cấp nào bán;
 *   2. dòng hai không có người liên hệ, chỉ hòm thư chung và tổng đài — đó là dữ
 *      liệu pháp nhân, không phải dữ liệu cá nhân;
 *   3. dòng ba khai căn cứ khác hai dòng trên — một lô trộn được nhiều căn cứ,
 *      và bảng soát phải tách ra;
 *   4. dòng bốn là công ty CHƯA CÓ trong sổ lead — dòng duy nhất đi hết được
 *      năm bước.
 *
 *  **VÌ SAO PHẢI CÓ DÒNG BỐN** (quyết định J · 20/08). Ba dòng đầu đều là công
 *  ty đã nằm trong sổ lead của kịch bản, nên chúng dừng ở bảng "đã có trong sổ"
 *  và lô còn 0 dòng hợp lệ. Đó là hành vi ĐÚNG và có ca riêng khoá nó — nhưng nó
 *  làm chính đường đi mà file mẫu sinh ra để phục vụ ("tải mẫu → nhập lại") chết
 *  ở bước 4. Dòng bốn mở lại đường đó mà không đụng ba dòng đặc tả §4.4.
 *
 *  ⚠ **MỌI DANH TÍNH DƯỚI ĐÂY LÀ DANH TÍNH CỦA FILE MẪU, KHÔNG PHẢI KHÁCH
 *  THẬT.** Tên, mã số thuế, địa chỉ thư và tên miền đều là chỗ trống điền sẵn để
 *  người dùng thấy hình một dòng đúng; chúng ở tầng app, `scenario.test.ts`
 *  không khoá chúng, và chúng KHÔNG được rò sang màn khác hay vào fixture. Dòng
 *  bốn cố ý mang tên miền `.example` (RFC 2606 giữ riêng cho tài liệu) để không
 *  ai đọc nhầm ra một doanh nghiệp có thật. */
export const SAMPLE_CSV =
  BOM +
  [
    'ten_cong_ty,ma_so_thue,tinh,nganh,san_pham_chinh,so_nguoi,so_nha_may,nguoi_lien_he,chuc_danh,email,dien_thoai,website,nguon_goc,can_cu_lien_he,ghi_chu',
    'Công ty TNHH DAS Vina,2300123456,Bắc Ninh,Chip,Đóng gói và kiểm thử IC,1400,1,Kim Dae-ho,Giám đốc nhà máy,daeho.kim@dasvina.vn,0912 300 391,dasvina.vn,Danh bạ KCN Quế Võ 2026,cong-khai-phap-nhan,Giám đốc bên Hàn Quốc ký cuối',
    'Công ty CP Linh kiện Trường Sơn,2300987654,Bắc Giang,Chip,Linh kiện điện tử cho ô tô,620,1,,,lienhe@truongson-jsc.vn,0204 355 1188,truongson-jsc.vn,Danh bạ KCN Quế Võ 2026,cong-khai-phap-nhan,',
    'Công ty TNHH Bán dẫn Nam Sơn,2300456789,Bắc Ninh,Chip,Wafer probe,880,2,Lê Minh Tuấn,Trưởng phòng sản xuất,tuan.le@namson-semi.vn,0912 344 507,namson-semi.vn,Hiệp hội DN điện tử,dong-y-truc-tiep,Đã ghé gian hàng triển lãm 2025',
    'Công ty TNHH Cơ khí Mẫu Việt,0101000001,Bắc Ninh,Cơ khí,Gia công khuôn ép nhựa,240,1,Trần Văn Mẫu,Phụ trách kinh doanh,lienhe@mau-viet.example,0900 000 001,mau-viet.example,Dòng ví dụ của file mẫu,cong-khai-phap-nhan,Dòng ví dụ — không phải khách thật',
  ].join('\n') +
  '\n'

export const SAMPLE_FILE_NAME = 'mau-danh-sach-prospect.csv'

/** Số dòng ví dụ của file mẫu — ĐẾM từ chính file, không gõ vào màn.
 *
 *  Màn từng ghi cứng "Ba dòng ví dụ" và câu ấy sai ngay hôm quyết định J thêm
 *  dòng thứ tư: một con số gõ tay cạnh một file sinh ra từ dữ liệu thì sớm muộn
 *  nói dối. Đọc bằng chính `readTable` mà luồng nhập dùng, nên nó không thể lệch
 *  với thứ người dùng tải về. */
export const SAMPLE_ROW_COUNT = readTable(SAMPLE_CSV).body.length

/** Phát file mẫu. Trả về mảnh dữ liệu, KHÔNG chạm DOM: màn tự gọi
 *  `URL.createObjectURL` rồi thả vào thẻ tải. Tách thế này để hàm test được và
 *  để tầng dữ liệu không biết gì về trình duyệt.
 *
 *  `type` ghi rõ `charset=utf-8` và nội dung mở đầu bằng BOM — hai thứ cùng lúc,
 *  vì Excel trên Windows đọc BOM chứ không đọc `charset`. */
export function sampleCsvFile(): { name: string; type: string; text: string; blob: Blob } {
  return {
    name: SAMPLE_FILE_NAME,
    type: 'text/csv;charset=utf-8',
    text: SAMPLE_CSV,
    blob: new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' }),
  }
}
