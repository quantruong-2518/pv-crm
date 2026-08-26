import { describe, expect, it } from 'vitest'
import { LEADS, PROSPECT_BATCHES, isRunning, prospectTotals } from '@pv/engines/fixtures/das-vina'
import {
  BOM,
  DEFAULT_REJECT_SWITCHES,
  IMPORT_GATE,
  DEDUPE_KEYS,
  PROSPECT_COLUMNS,
  REJECT_REASON_LABEL,
  SAMPLE_CSV,
  SAMPLE_FILE_NAME,
  SAMPLE_ROW_COUNT,
  SKIP_TARGET,
  REJECT_RULES,
  addToIndex,
  batchRows,
  batchTotals,
  bookHit,
  checkFileSize,
  companyKey,
  findDupe,
  looksLikeData,
  matchCategory,
  newDedupeIndex,
  normCount,
  normEmail,
  normPhone,
  normTaxCode,
  normWebsite,
  normalizeRow,
  readTable,
  rejectReasonOf,
  reviewRows,
  sampleCsvFile,
  sniffDelimiter,
  stripBom,
  suggestMapping,
  type Cells,
  type ProspectField,
  type RejectSwitches,
} from './prospects'
import { fetchSalesConfig } from './sales-config'

/** Khoá bốn thứ mà mắt người không bắt được, và cả bốn đều làm hỏng dữ liệu chứ
 *  không làm màn đỏ:
 *
 *   1. **Dấu phân tách** — máy Việt đặt List separator = `;`. Đọc sai dấu vẫn ra
 *      một cái bảng, bảng một cột, trông như file hỏng chứ không như lỗi của hệ.
 *   2. **Thứ tự ba khoá khử trùng** — đổi thứ tự là đổi CÁI GÌ bị gộp với cái
 *      gì. Bỏ sót một trùng tốn một lần gửi thư; gộp nhầm thì mất một khách.
 *   3. **Bảy luật chặn** — ba luật đầu không tắt được. Một hôm nào đó ai đó tắt
 *      được một trong ba là hệ vi phạm lời hứa với người đã từ chối liên hệ.
 *   4. **Luật chống đè lead đang có chủ** — nhập không bao giờ đè ô đã có, và
 *      lead đang có chủ không bị lôi vào khán giả đợt gửi.
 *
 *  Chỗ nào suy lại được từ fixture thì suy lại; chỗ nào là LUẬT đã chốt thì ghi
 *  thẳng con số — đó chính là thứ cần khoá. */

const cells = (c: Cells): Cells => c

/** Một dòng đủ điều kiện, để mỗi ca chỉ hỏng đúng một chỗ. */
const OK: Cells = {
  ten_cong_ty: 'Công ty TNHH Cơ khí Đại Việt',
  ma_so_thue: '2300111222',
  tinh: 'Bắc Ninh',
  website: 'daiviet.vn',
}

const withBasis = { batchLegalBasis: 'cong-khai-phap-nhan' as const }

const off = (reason: keyof RejectSwitches): RejectSwitches => ({
  ...DEFAULT_REJECT_SWITCHES,
  [reason]: false,
})

// ---------------------------------------------------------------------------

describe('Đọc file — BOM, dấu phân tách, tách ô', () => {
  it('bỏ BOM khi đọc, và đọc được cả file không có BOM', () => {
    expect(stripBom(`${BOM}a,b`)).toBe('a,b')
    expect(stripBom('a,b')).toBe('a,b')
    expect(readTable(`${BOM}a,b\n1,2`).hadBom).toBe(true)
    expect(readTable('a,b\n1,2').hadBom).toBe(false)
    expect(readTable(`${BOM}a,b\n1,2`).header).toEqual(['a', 'b'])
  })

  it('dò dấu bằng cách TÁCH THỬ, không đếm ký tự — lấy dấu ra nhiều cột nhất', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3').delimiter).toBe(',')
    expect(sniffDelimiter('a;b;c\n1;2;3').delimiter).toBe(';')
    expect(sniffDelimiter('a\tb\tc\n1\t2\t3').delimiter).toBe('\t')
  })

  it('file Excel máy Việt dùng chấm phẩy — hệ tự nhận VÀ nói ra đã chọn dấu nào', () => {
    const s = sniffDelimiter('ten_cong_ty;tinh;email\nA;Bắc Ninh;a@a.vn')
    expect(s.delimiter).toBe(';')
    expect(s.columns).toBe(3)
    expect(s.note).not.toBe('')
    /* Cùng một file đọc bằng dấu phẩy chỉ ra MỘT cột — đó là cái bẫy. */
    expect(s.columnsOf[',']).toBe(1)
  })

  it('dấu phẩy nằm trong ô có nháy kép KHÔNG xé cột', () => {
    const t = readTable('ten,dia_chi\n"Công ty A","Số 1, Quế Võ, Bắc Ninh"')
    expect(t.columns).toBe(2)
    expect(t.body[0]).toEqual(['Công ty A', 'Số 1, Quế Võ, Bắc Ninh'])
  })

  it('hai dấu nháy liền là một dấu nháy, và xuống dòng trong ô là nội dung', () => {
    const t = readTable('a,b\n"nói ""thẳng""","hai\ndòng"')
    expect(t.body[0]).toEqual(['nói "thẳng"', 'hai\ndòng'])
  })

  it('CRLF và LF cho cùng một lưới — file Windows không được ra thừa ô', () => {
    expect(readTable('a,b\r\n1,2\r\n').body).toEqual(readTable('a,b\n1,2\n').body)
  })

  it('bốn cửa chặn của bước 2, mỗi cửa một mã đọc được', () => {
    const code = (t: ReturnType<typeof readTable>) => t.errors.map((e) => e.code)

    expect(code(readTable('a,b'))).toContain('khong-co-dong-nao')
    expect(code(readTable(`a,b\n1,2\n�`))).toContain('khong-phai-utf8')

    const wide = Array.from({ length: IMPORT_GATE.maxColumns + 1 }, (_, i) => `c${i}`).join(',')
    expect(code(readTable(`${wide}\n${wide}`))).toContain('qua-nhieu-cot')

    const many = ['a', ...Array.from({ length: IMPORT_GATE.maxRows + 1 }, () => 'x')].join('\n')
    expect(code(readTable(many))).toContain('qua-nhieu-dong')
  })

  it('cỡ file kiểm trước khi đọc — 5 MB là giới hạn của POC', () => {
    expect(checkFileSize(IMPORT_GATE.maxBytes)).toBeUndefined()
    expect(checkFileSize(IMPORT_GATE.maxBytes + 1)?.code).toBe('qua-lon')
  })

  it('hàng đầu toàn số, hoặc trùng hệt hàng dưới, thì bắt chọn lại hàng tiêu đề', () => {
    expect(looksLikeData(['1', '2', '3'])).toBe(true)
    expect(looksLikeData(['ten', 'tinh'], ['ten', 'tinh'])).toBe(true)
    expect(looksLikeData(['ten', 'tinh'], ['A', 'Bắc Ninh'])).toBe(false)
    expect(readTable('1,2\n3,4').headerLooksLikeData).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('Chuẩn hoá 15 cột', () => {
  it('mã số thuế: 10 số giữ nguyên · 13 số viết có gạch · độ dài khác là SAI', () => {
    expect(normTaxCode('2300 111 222').value?.text).toBe('2300111222')
    expect(normTaxCode('2300111222001').value?.text).toBe('2300111222-001')
    expect(normTaxCode('123').bad).toBe(true)
    /* Ô để trống KHÔNG phải ô sai — hai chuyện khác nhau. */
    expect(normTaxCode('').bad).toBe(false)
  })

  it('điện thoại về dạng +84; không về được thì không giữ bản gốc', () => {
    expect(normPhone('0912 300 391').value).toBe('+84912300391')
    expect(normPhone('0204 355 1188').value).toBe('+842043551188')
    expect(normPhone('+84 912 300 391').value).toBe('+84912300391')
    expect(normPhone('gọi qua tổng đài').bad).toBe(true)
    expect(normPhone('091234').bad).toBe(true)
  })

  it('tên miền công cộng KHÔNG làm khoá — hai người dùng Gmail không phải một công ty', () => {
    expect(normEmail('  Daeho.Kim@DasVina.VN ').value).toBe('daeho.kim@dasvina.vn')
    expect(normEmail('a@dasvina.vn').domain).toBe('dasvina.vn')
    expect(normEmail('a@gmail.com').domain).toBeUndefined()
    expect(normEmail('a@gmail.com').bad).toBe(false)
    expect(normEmail('không phải thư').bad).toBe(true)
  })

  it('website chỉ còn tên miền', () => {
    expect(normWebsite('https://WWW.DasVina.vn/lien-he?x=1').value).toBe('dasvina.vn')
    expect(normWebsite('dasvina').bad).toBe(true)
  })

  it('số người: bỏ dấu ngăn nghìn; khoảng thì lấy CẬN DƯỚI và gắn cờ ước lượng', () => {
    expect(normCount('1.400')).toEqual({ value: 1400, estimated: false })
    expect(normCount('501-1000')).toEqual({ value: 501, estimated: true })
    expect(normCount('chưa rõ').value).toBeUndefined()
  })

  it('ngành không khớp danh mục thì để TRỐNG — không ép về ngành gần nhất', () => {
    expect(matchCategory('Chip')).toBe('chip')
    expect(matchCategory('chip')).toBe('chip')
    expect(matchCategory('Bao bì giấy')).toBeUndefined()
  })

  it('tỉnh ngoài danh mục chỉ CẢNH BÁO, không chặn — vẫn giữ nguyên chữ người ta viết', () => {
    const row = normalizeRow({ ...OK, tinh: 'Tỉnh Không Có Thật' })
    expect(row.province).toBe('Tỉnh Không Có Thật')
    expect(row.provinceOffList).toBe(true)
    expect(rejectReasonOf(row)).toBeUndefined()
  })

  it('khoá tên bỏ tiền tố loại hình nhưng KHÔNG bỏ chữ giữa tên', () => {
    expect(companyKey('Công ty TNHH DAS Vina')).toBe('das vina')
    expect(companyKey('Công ty CP Linh kiện Trường Sơn')).toBe('linh kien truong son')
    /* "Cơ khí" bỏ dấu thành "co khi" — bỏ token "co" ở giữa là gộp nhầm hai công
       ty khác nhau. Chỉ bỏ ở ĐẦU, và chỉ bỏ đúng cụm đã liệt kê. */
    expect(companyKey('Cơ khí Đại Việt')).toBe('co khi dai viet')
  })
})

// ---------------------------------------------------------------------------

describe('Ba khoá khử trùng — chạy theo thứ tự, dừng ở khoá đầu tiên bắt được', () => {
  const put = (c: Cells, id: string) => {
    const index = newDedupeIndex()
    addToIndex(index, normalizeRow(c), id)
    return index
  }

  it('mã số thuế bắt TRƯỚC tên miền — dòng khớp cả hai vẫn báo khoá chắc nhất', () => {
    const index = put(OK, 'A/0001')
    const hit = findDupe(normalizeRow({ ...OK, ten_cong_ty: 'Tên khác hẳn' }), index)
    expect(hit).toEqual({ matchedWith: 'A/0001', matchedBy: 'mst' })
  })

  it('mã 13 số khớp cả 10 số đầu — chi nhánh cùng một pháp nhân mẹ', () => {
    const index = put({ ...OK, ma_so_thue: '2300111222' }, 'A/0001')
    const chiNhanh = normalizeRow({
      ten_cong_ty: 'Chi nhánh Đại Việt',
      ma_so_thue: '2300111222-001',
      tinh: 'Hà Nội',
      website: 'chinhanh.vn',
    })
    expect(findDupe(chiNhanh, index)?.matchedBy).toBe('mst')
  })

  it('tên miền bắt khi không có mã số thuế', () => {
    const index = put({ ten_cong_ty: 'A', tinh: 'Bắc Ninh', website: 'daiviet.vn' }, 'A/0001')
    const other = normalizeRow({ ten_cong_ty: 'B', tinh: 'Hà Nội', website: 'www.daiviet.vn/x' })
    expect(findDupe(other, index)).toEqual({ matchedWith: 'A/0001', matchedBy: 'ten-mien' })
  })

  it('tên miền CÔNG CỘNG không gộp hai công ty', () => {
    const index = put({ ten_cong_ty: 'A', tinh: 'Bắc Ninh', email: 'a@gmail.com' }, 'A/0001')
    const other = normalizeRow({ ten_cong_ty: 'B', tinh: 'Hà Nội', email: 'b@gmail.com' })
    expect(findDupe(other, index)).toBeUndefined()
  })

  it('khoá tên PHẢI kèm tỉnh — cùng tên khác tỉnh là hai công ty', () => {
    const index = put({ ten_cong_ty: 'Cơ khí Đại Việt', tinh: 'Bắc Ninh' }, 'A/0001')
    const sameProvince = normalizeRow({
      ten_cong_ty: 'Công ty TNHH Cơ khí Đại Việt',
      tinh: 'Bắc Ninh',
    })
    const otherProvince = normalizeRow({ ten_cong_ty: 'Cơ khí Đại Việt', tinh: 'Hải Dương' })

    expect(findDupe(sameProvince, index)).toEqual({ matchedWith: 'A/0001', matchedBy: 'ten-tinh' })
    expect(findDupe(otherProvince, index)).toBeUndefined()
  })

  it('giữ dòng ĐẦU, bỏ dòng sau — và số thứ tự dòng giữ nguyên kể cả khi bị bỏ', () => {
    const r = reviewRows({ batchCode: 'DS-0199', cells: [OK, OK, OK], ...withBasis })
    expect(r.rows.map((x) => x.state)).toEqual(['hop-le', 'trung-trong-file', 'trung-trong-file'])
    expect(r.rows.map((x) => x.id)).toEqual(['DS-0199/0001', 'DS-0199/0002', 'DS-0199/0003'])
    expect(r.inFile.every((x) => x.matchedWith === 'DS-0199/0001')).toBe(true)
  })

  it('khử trùng chéo LÔ là bắt buộc, không phải tuỳ chọn', () => {
    const store = [{ id: 'DS-0101/0007', row: normalizeRow(OK) }]
    const r = reviewRows({ batchCode: 'DS-0199', cells: [OK], store, ...withBasis })
    expect(r.rows[0]?.state).toBe('trung-lo-cu')
    expect(r.rows[0]?.matchedWith).toBe('DS-0101/0007')
    expect(r.inStore).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------

describe('Bảy luật chặn dòng', () => {
  const reason = (c: Cells, extra = {}) =>
    rejectReasonOf(normalizeRow(c), { ...withBasis, ...extra })

  it('bảng luật đúng bảy dòng, và đúng BA dòng không tắt được', () => {
    expect(REJECT_RULES).toHaveLength(7)
    expect(REJECT_RULES.filter((r) => !r.canDisable).map((r) => r.reason)).toEqual([
      'nam-trong-danh-muc-chan',
      'khong-dinh-danh-duoc',
      'thieu-can-cu-lien-he',
    ])
  })

  it('dòng sạch không dính luật nào', () => {
    expect(reason(OK)).toBeUndefined()
  })

  it('không tên lẫn mã số thuế thì không phải một dòng', () => {
    expect(reason({ tinh: 'Bắc Ninh', website: 'x.vn' })).toBe('khong-dinh-danh-duoc')
  })

  it('có ô cá nhân mà lô không khai căn cứ → cổng Nghị định 13 đóng', () => {
    const c = { ...OK, nguoi_lien_he: 'Kim Dae-ho' }
    expect(rejectReasonOf(normalizeRow(c))).toBe('thieu-can-cu-lien-he')
    expect(rejectReasonOf(normalizeRow(c), withBasis)).toBeUndefined()
  })

  it('căn cứ ghi trong file mà không khớp danh mục thì cũng là thiếu căn cứ', () => {
    const c = { ...OK, email: 'a@daiviet.vn', can_cu_lien_he: 'tự nghĩ ra' }
    expect(rejectReasonOf(normalizeRow(c))).toBe('thieu-can-cu-lien-he')
  })

  it('bốn luật tắt được: bật thì loại, tắt thì dòng đi tiếp', () => {
    const table: [keyof RejectSwitches, Cells][] = [
      ['khong-lien-he-duoc', { ten_cong_ty: 'Cơ khí Đại Việt', tinh: 'Bắc Ninh' }],
      ['email-sai-dinh-dang', { ...OK, email: 'không phải thư' }],
      ['dien-thoai-khong-chuan-hoa-duoc', { ...OK, dien_thoai: 'gọi tổng đài' }],
      ['mst-sai-do-dai', { ...OK, ma_so_thue: '123' }],
    ]

    for (const [rule, c] of table) {
      expect(reason(c), `${rule} · đang bật`).toBe(rule)
      expect(reason(c, { switches: off(rule) }), `${rule} · đã tắt`).toBeUndefined()
    }
  })

  it('ba luật cứng KHÔNG tắt được — cờ tắt cũng vô hiệu', () => {
    expect(
      reason({ tinh: 'Bắc Ninh', website: 'x.vn' }, { switches: off('khong-dinh-danh-duoc') }),
    ).toBe('khong-dinh-danh-duoc')

    expect(
      rejectReasonOf(normalizeRow({ ...OK, nguoi_lien_he: 'A' }), {
        switches: off('thieu-can-cu-lien-he'),
      }),
    ).toBe('thieu-can-cu-lien-he')
  })

  it('danh mục chặn THẮNG mọi luật khác, kể cả khi dòng sạch mọi mặt', () => {
    const blockList = { phones: ['0912 300 391'], emails: ['a@daiviet.vn'] }
    expect(reason({ ...OK, dien_thoai: '+84912300391' }, { blockList })).toBe(
      'nam-trong-danh-muc-chan',
    )
    expect(reason({ ...OK, email: 'A@DaiViet.vn' }, { blockList })).toBe('nam-trong-danh-muc-chan')
    /* Số trong danh mục chặn ghi kiểu nào cũng bắt được — so sau khi chuẩn hoá. */
    expect(reason({ ...OK, dien_thoai: '0912300391' }, { blockList })).toBe(
      'nam-trong-danh-muc-chan',
    )
  })
})

// ---------------------------------------------------------------------------

describe('Chống nhập đè lên lead đang có chủ', () => {
  const rowOf = (lead: (typeof LEADS)[number]) =>
    normalizeRow({ ten_cong_ty: lead.company, tinh: lead.province })

  const signed = LEADS.find((l) => l.contractCode)
  const owned = LEADS.find((l) => isRunning(l) && l.owner)
  const pool = LEADS.find((l) => isRunning(l) && !l.owner)
  const exited = LEADS.find((l) => l.exitReason)

  it('bốn ngả của bảng §5.4, không có ngả thứ năm', () => {
    expect([signed, owned, pool, exited].every(Boolean)).toBe(true)

    const s = bookHit(rowOf(signed!))
    expect(s?.state).toBe('da-ky')
    expect(s?.canImport).toBe(false)
    expect(s?.canSend).toBe(false)

    const o = bookHit(rowOf(owned!))
    expect(o?.state).toBe('da-co-chu')
    expect(o?.canImport).toBe(true)
    /* Sale đang chăm — thư lạnh làm hỏng việc. */
    expect(o?.canSend).toBe(false)
    expect(o?.fill).toBe('khong')
    expect(o?.owner).toBe(owned!.owner)

    const p = bookHit(rowOf(pool!))
    expect(p?.state).toBe('da-co-chu')
    expect(p?.canSend).toBe(true)
    /* Kho chung: bổ sung ô còn TRỐNG, không đè ô đã có. */
    expect(p?.fill).toBe('o-trong')

    const e = bookHit(rowOf(exited!))
    expect(e?.state).toBe('da-roi')
    expect(e?.canSend).toBe(true)
    expect(e?.exitReason).toBe(exited!.exitReason)
    /* Lý do rơi cũ phải hiện thẳng trên bảng soát. */
    expect(e?.note).toContain(exited!.exitReason as string)
  })

  it('ghi đè không nằm trong luồng nhập — mọi ngả nhập được đều phải qua duyệt mới đè', () => {
    for (const lead of [owned, pool, exited]) {
      expect(bookHit(rowOf(lead!))?.needsApprovalToOverwrite).toBe(true)
    }
  })

  it('công ty chưa có trong sổ thì không khớp gì cả', () => {
    expect(bookHit(normalizeRow(OK))).toBeUndefined()
  })

  it('lead đang có chủ KHÔNG bị lôi vào khán giả, và nằm ở xô thứ tư', () => {
    const r = reviewRows({
      batchCode: 'DS-0199',
      cells: [
        cells({ ten_cong_ty: owned!.company, tinh: owned!.province }),
        cells({ ten_cong_ty: signed!.company, tinh: signed!.province }),
        cells({ ten_cong_ty: exited!.company, tinh: exited!.province }),
        OK,
      ],
      ...withBasis,
      switches: off('khong-lien-he-duoc'),
    })

    expect(r.inBook.owned).toHaveLength(1)
    expect(r.inBook.signed).toHaveLength(1)
    expect(r.inBook.exited).toHaveLength(1)
    /* Khán giả = dòng sạch + dòng đã rơi. Dòng có chủ và dòng đã ký đứng ngoài. */
    expect(r.audience.map((x) => x.no)).toEqual([3, 4])
    expect(r.rowsHeld).toBe(2)
  })
})

// ---------------------------------------------------------------------------

describe('Soát cả lô — bốn số lớn', () => {
  it('cân dòng: thô = hợp lệ + trùng + loại + giữ lại', () => {
    const r = reviewRows({
      batchCode: 'DS-0199',
      cells: [OK, OK, cells({ tinh: 'Bắc Ninh' }), cells({ ten_cong_ty: 'B', tinh: 'Hà Nội' })],
      ...withBasis,
    })
    expect(r.rowsRaw).toBe(r.rowsValid + r.rowsDuplicate + r.rowsRejected + r.rowsHeld)
    expect(r.rowsRaw).toBe(4)
    expect(r.rowsDuplicate).toBe(1)
    expect(r.rowsRejected).toBe(2)
    expect(r.rowsValid).toBe(1)
  })

  it('mỗi dòng bị loại nói LÝ DO NÀO, không nói "không hợp lệ"', () => {
    const r = reviewRows({
      batchCode: 'DS-0199',
      cells: [cells({ tinh: 'Bắc Ninh' }), cells({ ...OK, ma_so_thue: '123' })],
      ...withBasis,
    })
    expect(r.rejected.map((x) => x.rejectReason)).toEqual([
      'khong-dinh-danh-duoc',
      'mst-sai-do-dai',
    ])
    expect(r.byReason.filter((b) => b.count > 0).map((b) => b.reason)).toEqual([
      'khong-dinh-danh-duoc',
      'mst-sai-do-dai',
    ])
  })

  it('tỉ lệ loại vượt ngưỡng của phòng thì bật dải cảnh báo lớn', () => {
    const bad = cells({ tinh: 'Bắc Ninh' })
    const two = reviewRows({ batchCode: 'DS-0199', cells: [OK, bad], ...withBasis })
    expect(two.rejectRate).toBe(0.5)
    expect(two.highReject).toBe(true)

    const clean = reviewRows({ batchCode: 'DS-0199', cells: [OK], ...withBasis })
    expect(clean.rejectRate).toBe(0)
    expect(clean.highReject).toBe(false)
  })

  it('không dòng hợp lệ nào thì không sang bước xác nhận được', () => {
    const r = reviewRows({ batchCode: 'DS-0199', cells: [cells({ tinh: 'Bắc Ninh' })] })
    expect(r.canGoOn).toBe(false)
  })

  it('lô rỗng: tỉ lệ là null, KHÔNG phải 0 — "chưa đo được" khác "không loại dòng nào"', () => {
    const r = reviewRows({ batchCode: 'DS-0199', cells: [] })
    expect(r.rejectRate).toBeNull()
    expect(r.duplicateRate).toBeNull()
    expect(r.highReject).toBe(false)
  })
})

// ---------------------------------------------------------------------------

describe('File mẫu', () => {
  it('phát ra thì LUÔN có BOM — Excel Windows đọc BOM chứ không đọc charset', () => {
    const f = sampleCsvFile()
    expect(f.name).toBe(SAMPLE_FILE_NAME)
    expect(f.text.startsWith(BOM)).toBe(true)
    expect(f.type).toContain('utf-8')
    expect(new Uint8Array([...new TextEncoder().encode(f.text).slice(0, 3)])).toEqual(
      new Uint8Array([0xef, 0xbb, 0xbf]),
    )
  })

  it('hàng tiêu đề đúng 15 cột, đúng thứ tự và đúng tên khoá của bảng cột', () => {
    const t = readTable(SAMPLE_CSV)
    expect(t.errors).toEqual([])
    expect(t.sniff.delimiter).toBe(',')
    expect(t.header).toEqual(PROSPECT_COLUMNS.map((c) => c.key))
    expect(t.header).toHaveLength(15)
    expect(t.body).toHaveLength(4)
  })

  it('số dòng ví dụ ĐẾM từ file, để màn không gõ tay một con số sẽ lệch', () => {
    /* Màn từng ghi cứng "Ba dòng ví dụ" và câu ấy sai ngay hôm quyết định J thêm
       dòng thứ tư. Bước 2 giờ đọc con số này. */
    expect(SAMPLE_ROW_COUNT).toBe(readTable(SAMPLE_CSV).body.length)
    expect(SAMPLE_ROW_COUNT).toBeGreaterThan(0)
  })

  it('bốn dòng dạy bốn chuyện — và chuyện thứ hai là dòng KHÔNG có dữ liệu cá nhân', () => {
    const t = readTable(SAMPLE_CSV)
    const rows = t.body.map((r) =>
      normalizeRow(Object.fromEntries(t.header.map((h, i) => [h, r[i] ?? ''])) as Cells),
    )

    /* 1 · dòng đầy đủ nhất vẫn chỉ điền được 5 trên 6 ô bắt buộc — không dòng
       nào của bất kỳ nhà cung cấp nào trả lời được "đau ở đâu". */
    expect(rows[0]?.contactName).toBe('Kim Dae-ho')
    expect(rows[0]?.headcount).toBe(1400)

    /* 2 · không người liên hệ, chỉ hòm thư chung và tổng đài. */
    expect(rows[1]?.hasPerson).toBe(false)
    expect(rows[1]?.contactName).toBeUndefined()

    /* 3 · một lô trộn được nhiều căn cứ — bảng soát phải tách ra. */
    expect(new Set(rows.map((r) => r.legalBasis)).size).toBe(2)

    /* 4 · dòng CHƯA CÓ trong sổ lead (quyết định J · 20/08). Ba dòng đầu đều là
       công ty đã nằm trong sổ, nên nếu file mẫu chỉ có chúng thì chính đường đi
       nó sinh ra để phục vụ — "tải mẫu → nhập lại" — chết ở bước 4 với 0 dòng
       hợp lệ. Ca này khoá dòng thứ tư ở lại. */
    const fresh = rows[3]
    expect(fresh?.companyRaw).toBeTruthy()
    expect(bookHit(fresh!)).toBeUndefined()
    expect(rejectReasonOf(fresh!)).toBeUndefined()
  })

  it('tải mẫu rồi nhập lại chính nó thì ĐI HẾT được năm bước — ra >0 dòng hợp lệ', () => {
    /* Đường đi thật của người dùng: bấm "Tải file mẫu", mở ra, rồi dán/nạp lại.
       Vì thế soát trên đúng chuỗi mà `sampleCsvFile()` phát ra, không soát trên
       một hằng chuỗi khác. */
    const t = readTable(sampleCsvFile().text)
    const map = suggestMapping(t.header).mapping
    const rows: Cells[] = t.body.map((line) => {
      const c: Cells = {}
      t.header.forEach((name, i) => {
        const target = map[name]
        if (!target || target === SKIP_TARGET) return
        c[target as ProspectField] = line[i] ?? ''
      })
      return c
    })

    const review = reviewRows({ cells: rows, batchCode: 'DS-9999' })

    expect(review.rowsRaw).toBe(4)
    expect(review.rowsValid).toBeGreaterThan(0)
    expect(review.canGoOn).toBe(true)

    /* Ba dòng đặc tả §4.4 vẫn dừng ở bảng "đã có trong sổ" — dòng bốn KHÔNG
       được cứu chúng, nó chỉ mở lại đường cho chính nó. */
    expect(review.rowsHeld).toBe(3)
    expect(review.rejected).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------

describe('Kho danh sách — số đọc thẳng từ kịch bản', () => {
  it('bảng kho có đúng số lô của fixture, không thêm không bớt', () => {
    expect(batchRows()).toHaveLength(PROSPECT_BATCHES.length)
    expect(batchRows().map((r) => r.code)).toEqual(PROSPECT_BATCHES.map((b) => b.code))
  })

  it('cân dòng từng lô và cân cả kho — không một số nào gõ ở tầng màn', () => {
    for (const r of batchRows()) {
      expect(r.rowsRaw, `${r.code} · cân dòng`).toBe(r.rowsValid + r.rowsDuplicate + r.rowsRejected)
    }
    const t = batchTotals()
    expect(t.rowsRaw).toBe(t.rowsValid + t.rowsDuplicate + t.rowsRejected)
    expect(t.cost).toBe(prospectTotals().cost)
    expect(t.batches).toBe(PROSPECT_BATCHES.length)
  })

  it('hai ngưỡng đã chốt KHÔNG lô nào chạm tới — nói ra để người dựng màn biết trước', () => {
    const t = batchTotals()
    expect(t.approvalBatches).toBe(0)
    expect(t.highRejectBatches).toBe(0)
    /* Ngưỡng là luật của phòng, không phải nút vặn cho đẹp demo. Nếu ca này đỏ:
       ai đó vừa đổi một ngưỡng hoặc đổi một con số của tám lô — hỏi, đừng sửa. */
    expect(IMPORT_GATE.approvalCost).toBe(20_000_000)
    expect(IMPORT_GATE.rejectRateWarn).toBe(0.3)
  })

  it('hạn lưu của cả tám lô khớp mặc định của phòng', () => {
    for (const r of batchRows()) expect(r.retentionDays).toBe(IMPORT_GATE.retentionDays)
    /* Kỳ đóng băng chưa lô nào hết hạn — 365 ngày dài hơn cả kỳ. */
    expect(batchRows().some((r) => r.expired)).toBe(false)
  })
})

/** Mục 5.8 của màn Cấu hình chỉ được ĐỌC bốn ngưỡng và ba bảng nhãn, không được
 *  khai lại. Khai lại thì hai bản trôi khỏi nhau mà không gì đỏ — đúng kiểu hỏng
 *  âm thầm mà `IMPORT_GATE` sinh ra để chấm dứt. */
describe('Mục 5.8 đọc ngưỡng và nhãn từ một chỗ, không khai lại', () => {
  it('bốn ngưỡng của quyết định F về đúng từ IMPORT_GATE', async () => {
    const cfg = await fetchSalesConfig()

    expect(cfg.prospect.e3CostThreshold).toBe(IMPORT_GATE.approvalCost)
    expect(cfg.prospect.rejectRateWarnAt).toBe(IMPORT_GATE.rejectRateWarn)
    expect(cfg.prospect.retentionDaysDefault).toBe(IMPORT_GATE.retentionDays)
    expect(cfg.prospect.fileLimits.maxRows).toBe(IMPORT_GATE.maxRows)
    expect(cfg.prospect.fileLimits.maxCols).toBe(IMPORT_GATE.maxColumns)
    expect(cfg.prospect.fileLimits.maxSizeMb).toBe(IMPORT_GATE.maxBytes / 1024 / 1024)
  })

  it('một lý do loại dòng chỉ có MỘT câu chữ trên cả hai màn', async () => {
    const cfg = await fetchSalesConfig()

    /* Màn Cấu hình bày `blockRules`, màn Soát bày `REJECT_REASON_LABEL` — nếu
       hai bên chép tay thì cùng một lý do đọc ra hai câu khác nhau. */
    expect(cfg.prospect.blockRules.map((r) => r.label)).toEqual(REJECT_RULES.map((r) => r.label))
    for (const r of cfg.prospect.blockRules) {
      expect(r.label, r.reason).toBe(REJECT_REASON_LABEL[r.reason])
    }
    expect(cfg.prospect.dedupKeys.map((k) => k.label)).toEqual(DEDUPE_KEYS.map((k) => k.label))
  })

  it('tổng của kho cộng ở prospectTotals, không reduce lần thứ hai ở màn', async () => {
    const cfg = await fetchSalesConfig()

    expect(cfg.prospect.batchesTotal).toBe(prospectTotals().batches)
    expect(cfg.prospect.validRowsTotal).toBe(prospectTotals().rowsValid)
  })
})
