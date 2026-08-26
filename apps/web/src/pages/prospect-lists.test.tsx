import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { PROSPECT_BATCHES, prospectStats, prospectTotals } from '@pv/engines/fixtures/das-vina'
import { dong, percent } from '@pv/ui'
import { renderRoutes, renderScreen } from '@/test-utils'
import { SCREENS } from '@/routes'
import {
  DELIMITER_LABEL,
  IMPORT_APPROVER,
  IMPORT_DISCLAIMER,
  IMPORT_GATE,
  OVERWRITE_RULE,
  REJECT_REASON_LABEL,
  SAMPLE_CSV,
  SAMPLE_FILE_NAME,
  SAMPLE_ROW_COUNT,
  batchRows,
  batchTotals,
  readTable,
  reviewRows,
  sampleCsvFile,
  suggestMapping,
  type Cells,
  type ProspectField,
} from '@/data/prospects'
import { CampaignDetailPage } from './campaign-detail'
import { grouped } from './campaign-model'
import { ProspectListsPage } from './prospect-lists'

/** Kho danh sách + luồng nhập năm bước — module 1.
 *
 *  Ba thứ test này khoá, đều là thứ mắt người bỏ sót:
 *   1. THỨ TỰ ROUTE. `/sales/campaigns/kho-danh-sach` là một đoạn TĨNH nằm cùng
 *      cha với `:code`. Dữ liệu router xếp hạng theo độ cụ thể nên đoạn tĩnh
 *      thắng dù đứng đâu — nhưng ai đó đổi sang `<Routes>` thủ công thì thứ tự
 *      thành load-bearing và "kho-danh-sach" bị nuốt thành một mã nguồn. Ca đầu
 *      khoá cả hai mặt: vị trí trong `SCREENS` và kết quả render thật.
 *   2. NĂM BƯỚC ĐÚNG THỨ TỰ, và cửa của từng bước. Đi lùi luôn được, đi tới phải
 *      qua cửa — bước chưa tới không được là một cái nút.
 *   3. SỐ ĐỌC TỪ FIXTURE. Mọi con số kỳ vọng ở đây tính lại từ
 *      `PROSPECT_BATCHES` / `prospectStats` ngay trong test, nên đổi kịch bản mà
 *      quên đổi màn thì đỏ chứ không im lặng trôi qua.
 *
 *  Danh mục nhà cung cấp (mục 5.8) về qua `useQuery`, nên chỗ nào cần thẻ nhà
 *  thật thì phải `findBy…`, không `getBy…`. */

/** Bảng đọc từ chính file mẫu của hệ — số dòng, số cột và dấu phân tách kỳ vọng
 *  đều suy từ đây, không gõ tay. */
const SAMPLE = readTable(SAMPLE_CSV)
const SAMPLE_MAP = suggestMapping(SAMPLE.header)

const STEPS = ['Chọn nguồn', 'Tải mẫu · Upload', 'Khớp cột', 'Soát & khử trùng', 'Xác nhận nhập']

function firstBatch() {
  const [b] = PROSPECT_BATCHES
  if (!b) throw new Error('Kịch bản không có lô prospect nào')
  return b
}

/** Vào chế độ nhập và chọn nhà cung cấp của lô đầu tiên — cửa của bước 1. */
async function openImport() {
  fireEvent.click(screen.getByRole('button', { name: 'Nhập danh sách' }))
  const card = (await screen.findByText(firstBatch().supplier)).closest('button')
  if (!card) throw new Error('Thẻ nhà cung cấp không phải một nút bấm được')
  fireEvent.click(card)
}

function next() {
  fireEvent.click(screen.getByRole('button', { name: 'Tiếp' }))
}

/** Đi tới bước 4 bằng chính file mẫu của hệ. */
async function toReview() {
  renderScreen(<ProspectListsPage />)
  await openImport()
  next()
  paste(SAMPLE_CSV)
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
  next()
}

/** Kết quả soát của MỘT văn bản, tính lại ở test bằng chính hai hàm màn gọi
 *  (`readTable` + `reviewRows`) — số kỳ vọng không gõ tay, nên đổi luật đọc file
 *  thì ca đỏ chứ không im lặng trôi. */
function reviewOf(csv: string) {
  const table = readTable(csv)
  const map = suggestMapping(table.header).mapping
  const cells: Cells[] = table.body.map((line) => {
    const c: Cells = {}
    table.header.forEach((name, i) => {
      const target = map[name]
      if (!target || target === 'bo-qua') return
      c[target as ProspectField] = line[i] ?? ''
    })
    return c
  })
  return reviewRows({ cells, batchCode: 'DS-9999', batchLegalBasis: 'cong-khai-phap-nhan' })
}

/** Kết quả soát của chính file mẫu của hệ. */
function sampleReview() {
  return reviewOf(SAMPLE_CSV)
}

/** Dán một văn bản vào ô "Dán trực tiếp" — đường thoát cho .xlsx, và là đường
 *  duy nhất chạy được trong jsdom (Dropzone trả về một `File` thật). */
function paste(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Dán trực tiếp' }))
  fireEvent.change(screen.getByLabelText('Dán từ Excel'), { target: { value: text } })
}

/** Một lô chỉ có ĐÚNG MỘT dòng sạch, ghép trên đúng hàng tiêu đề của file mẫu.
 *
 *  Khác với file mẫu ở chỗ nào, và vì sao cần cả hai: file mẫu có ba dòng đặc tả
 *  §4.4 đã nằm trong sổ lead cộng một dòng sạch (quyết định J), nên nó đi hết năm
 *  bước NHƯNG mang theo bảng "đã có trong sổ" và cột xin ghi đè. Lô dưới đây
 *  không có dòng nào như thế — nó là ca sạch trơn, dùng để soát riêng cửa cuối
 *  ("tiền để trống thì phải tick không tốn tiền") mà không lẫn với chuyện ghi đè. */
const FRESH_ROW = [
  'Công ty TNHH Thử Nhập Lô',
  '2300111222',
  'Bắc Ninh',
  'Chip',
  'Kiểm thử bo mạch',
  '120',
  '1',
  'Nguyễn Văn Thử',
  'Quản đốc',
  'thu@thu-nhap-lo.vn',
  '0912 000 111',
  'thu-nhap-lo.vn',
  'Dán tay',
  'cong-khai-phap-nhan',
  '',
]

const FRESH_CSV = [SAMPLE.header.join(','), FRESH_ROW.join(',')].join('\n')

/** Một lô BẨN: một dòng sạch và ba dòng chỉ có mỗi tên công ty — không thư,
 *  không điện thoại, không website, nên chúng rơi vào "không liên hệ được".
 *  Tỉ lệ loại 3/4 vượt xa ngưỡng cảnh báo của phòng, nên dải cảnh báo lớn bật.
 *  Ba tên khác nhau để chúng không bị đếm thành dòng trùng. */
const DIRTY_CSV = [
  SAMPLE.header.join(','),
  FRESH_ROW.join(','),
  ...['Một', 'Hai', 'Ba'].map(
    (n) => `Công ty TNHH Thiếu Liên Hệ ${n}${','.repeat(SAMPLE.header.length - 1)}`,
  ),
].join('\n')

describe('Module 1 · Kho danh sách', () => {
  it('đường tĩnh "kho-danh-sach" đứng TRƯỚC ":code" và mở kho, không mở hồ sơ nguồn', async () => {
    const paths = SCREENS.map((s) => s.path)
    const kho = paths.indexOf('/sales/campaigns/kho-danh-sach')
    const detail = paths.indexOf('/sales/campaigns/:code')

    expect(kho).toBeGreaterThan(-1)
    expect(detail).toBeGreaterThan(-1)
    expect(kho).toBeLessThan(detail)
    expect(SCREENS[kho]?.branch).toBe('Sales')

    renderRoutes(
      [
        { path: '/sales/campaigns/kho-danh-sach', element: <ProspectListsPage /> },
        { path: '/sales/campaigns/:code', element: <CampaignDetailPage /> },
      ],
      { route: '/sales/campaigns/kho-danh-sach' },
    )

    expect(screen.getByRole('heading', { name: 'Kho danh sách' })).toBeInTheDocument()
    /* Dấu phân biệt KHÔNG được là một affordance: cả hai màn con của sổ nguồn
       đều có lối về mang tên "Sổ nguồn", nên lấy nó làm dấu là khoá luôn cả quy
       ước "màn con luôn có lối về". Phân biệt bằng thứ chỉ hồ sơ nguồn mới có. */
    expect(
      screen.queryByRole('heading', { name: /Hồ sơ nguồn|Không có nguồn nào/ }),
    ).not.toBeInTheDocument()
  })

  it('"?lo=DS-xxxx" mở thẳng thẻ của lô đó — chip mã lô ở hồ sơ lead giữ đúng lời hứa', () => {
    /* Không có tham số này thì chip mang mã lô chỉ đổ người dùng vào bảng tám
       dòng để tự dò lại — nút hứa nhiều hơn nó làm. Đây cũng là đường DUY NHẤT
       để trỏ một lô cho người khác xem. */
    const target = PROSPECT_BATCHES[2]
    if (!target) throw new Error('Kịch bản không đủ lô để thử')

    renderRoutes([{ path: '/sales/campaigns/kho-danh-sach', element: <ProspectListsPage /> }], {
      route: `/sales/campaigns/kho-danh-sach?lo=${target.code}`,
    })

    // Ngăn kéo mở sẵn ở đúng lô: bộ lọc của chính lô đó có mặt.
    for (const f of target.filters) {
      expect(screen.getByText(`${f.label}: ${f.value}`)).toBeInTheDocument()
    }
    expect(screen.getAllByText(target.note).length).toBeGreaterThan(0)
  })

  it('bảng kho đọc đủ tám lô và mọi con số về từ fixture, không gõ vào màn', () => {
    renderScreen(<ProspectListsPage />)

    const rows = batchRows()
    const totals = prospectTotals()

    expect(rows).toHaveLength(PROSPECT_BATCHES.length)
    for (const b of PROSPECT_BATCHES) {
      expect(screen.getAllByText(b.code).length).toBeGreaterThan(0)
      expect(screen.getAllByText(b.supplier).length).toBeGreaterThan(0)
    }

    // Ô tổng: dòng thô và cặp trùng · loại đều cộng ở fixture.
    expect(screen.getAllByText(grouped(totals.rowsRaw)).length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        `trùng ${grouped(totals.rowsDuplicate)} · loại ${grouped(totals.rowsRejected)}`,
      ),
    ).toBeInTheDocument()

    // Dòng của một lô: số hợp lệ nằm đúng trong dòng mang mã lô đó.
    const first = firstBatch()
    const row = screen.getAllByText(first.code)[0]?.closest('[role="row"]')
    if (!(row instanceof HTMLElement)) throw new Error('Mã lô không nằm trong một dòng bảng')
    expect(within(row).getByText(grouped(prospectStats(first.code).rowsValid))).toBeInTheDocument()

    // Lô KHÔNG nuôi đợt nào vẫn có mặt: rỗng là câu trả lời, không phải dữ liệu thiếu.
    const lonely = PROSPECT_BATCHES.find((b) => b.usedBy.length === 0)
    expect(lonely).toBeDefined()
    if (lonely) expect(screen.getAllByText(lonely.code).length).toBeGreaterThan(0)
  })

  it('mọi nhãn tiền khai phạm vi — cột là "Tiền mua dòng", không ô nào ghi "Chi phí" trống không', () => {
    renderScreen(<ProspectListsPage />)

    expect(screen.getByRole('columnheader', { name: /Tiền mua dòng/ })).toBeInTheDocument()
    expect(screen.queryByText('Chi phí')).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Chi phí' })).not.toBeInTheDocument()

    /* Thước kia — "chi dữ liệu của nguồn" — trả lời câu hỏi khác và có mẫu số
       khác, nên màn phải NÓI RA nó là thứ khác chứ không bày cạnh như cách đọc
       thứ hai của cùng một số. Và phải chỉ ĐÚNG địa chỉ: số đó nằm ở hồ sơ
       nguồn, khối "Tiền đi đâu" — màn Kế hoạch không vẽ nó. */
    const scope = screen.getByText(/không phải chi dữ liệu của NGUỒN/i)
    expect(scope).toBeInTheDocument()
    expect(scope.textContent).toMatch(/hồ sơ nguồn/i)
    expect(scope.textContent).not.toMatch(/màn Kế hoạch/i)
  })

  it('bốn lô miễn phí đọc ra 0 đồng THẬT, không đọc ra một dấu gạch "chưa ai điền"', () => {
    renderScreen(<ProspectListsPage />)

    /* Cùng một bảng đang dùng "—" cho `rejectRate === null` (chưa đo được), nên
       cột tiền KHÔNG được mượn lại dấu ấy cho số 0: bốn lô miễn phí (sổ cũ,
       trang đích, quét mã, ghế thuê tháng) là 0 đồng có thật. */
    const free = batchRows().filter((r) => r.cost === 0)
    expect(free.length).toBeGreaterThan(0)

    for (const r of free) {
      const cell = screen.getAllByText(r.code)[0]?.closest('[role="row"]')
      if (!(cell instanceof HTMLElement)) throw new Error('Mã lô không nằm trong một dòng bảng')
      expect(within(cell).getByText(dong(0))).toBeInTheDocument()
    }
  })

  it('câu "cả sổ nằm ở Sổ lead" có một lối đi thật, không chỉ là chữ', () => {
    /* Kho hiện năm con số về lead rồi chỉ sang Sổ lead bằng chữ. Vòng khép kín
       đứt đúng ở đó nếu người trình diễn phải tự bấm thanh điều hướng. */
    renderRoutes(
      [
        { path: '/sales/campaigns/kho-danh-sach', element: <ProspectListsPage /> },
        { path: '/sales/leads', element: <h2>Sổ lead</h2> },
      ],
      { route: '/sales/campaigns/kho-danh-sach' },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mở Sổ lead' }))
    expect(screen.getByRole('heading', { name: 'Sổ lead' })).toBeInTheDocument()
  })

  it('bấm một dòng mở thẻ lô: bộ lọc đã dùng và chuỗi nguồn đọc từ kịch bản', () => {
    renderScreen(<ProspectListsPage />)

    const first = firstBatch()
    const row = screen.getAllByText(first.code)[0]?.closest('[role="row"]')
    if (!(row instanceof HTMLElement)) throw new Error('Mã lô không nằm trong một dòng bảng')
    fireEvent.click(row)

    /* Cặp nhãn–giá trị cố ý KHÔNG phải một câu truy vấn: mỗi nhà cung cấp một
       ngôn ngữ lọc riêng, nên lô chép đúng chữ của nhà. */
    for (const f of first.filters) {
      expect(screen.getByText(`${f.label}: ${f.value}`)).toBeInTheDocument()
    }
    for (const u of first.usedBy) {
      expect(screen.getAllByText(u.source).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText(first.note).length).toBeGreaterThan(0)
  })

  it('ContextRail và khối "Cố tình không làm" có mặt ở CẢ hai chế độ — luật 10', async () => {
    renderScreen(<ProspectListsPage />)

    const rail = screen.getByLabelText('Chuỗi object liên quan')
    expect(within(rail).getAllByText(/^[A-Z]{2}-\d+$/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cố tình không làm').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Nhập danh sách' }))
    expect(screen.getByLabelText('Chuỗi object liên quan')).toBeInTheDocument()
  })

  it('dải năm bước đúng thứ tự; bước chưa tới KHÔNG phải một cái nút, và cửa bước 1 là nhà cung cấp', async () => {
    renderScreen(<ProspectListsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nhập danh sách' }))

    const nodes = STEPS.map((label) => screen.getByText(label))
    for (let i = 1; i < nodes.length; i += 1) {
      const before = nodes[i - 1]
      const after = nodes[i]
      if (!before || !after) throw new Error('Dải bước thiếu một bước')
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }

    /* Bước chưa tới render bằng `<span>`: một cái nút tắt vẫn hứa "sắp bấm
       được", mà đi tới thì phải qua cửa của bước đang đứng. */
    for (const label of STEPS.slice(1)) {
      expect(screen.queryByRole('button', { name: new RegExp(label) })).not.toBeInTheDocument()
    }

    // Chưa chọn nhà cung cấp thì cửa đóng.
    expect(screen.getByRole('button', { name: 'Tiếp' })).toBeDisabled()
    const card = (await screen.findByText(firstBatch().supplier)).closest('button')
    if (!card) throw new Error('Thẻ nhà cung cấp không phải một nút bấm được')
    fireEvent.click(card)
    expect(screen.getByRole('button', { name: 'Tiếp' })).not.toBeDisabled()
  })

  it('bước 2 tự nhận dấu phân tách và nói ra nó đã chọn dấu nào', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()

    paste(SAMPLE_CSV)

    expect(
      screen.getByText(
        `Đọc được ${grouped(SAMPLE.body.length)} dòng · ${SAMPLE.columns} cột · dấu phân tách hệ tự nhận: ${DELIMITER_LABEL[SAMPLE.sniff.delimiter]}`,
        { exact: false },
      ),
    ).toBeInTheDocument()
    expect(SAMPLE.errors).toHaveLength(0)
  })

  it('bước 2 nói ĐÚNG số dòng ví dụ của file mẫu — không gõ "ba dòng" vào màn', async () => {
    /* Câu này từng ghi cứng "Ba dòng ví dụ" và sai ngay hôm file mẫu có dòng thứ
       tư. Đếm từ chính file thì nó không lệch được lần nữa. */
    expect(SAMPLE_ROW_COUNT).toBe(SAMPLE.body.length)

    renderScreen(<ProspectListsPage />)
    await openImport()
    next()

    expect(
      screen.getByText(`${SAMPLE_ROW_COUNT} dòng ví dụ, một hàng tiêu đề.`),
    ).toBeInTheDocument()
  })

  it('dải cảnh báo tỉ lệ loại in ĐÚNG con số đo được, không một câu ước chừng', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()
    paste(DIRTY_CSV)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    next()

    /* Dải này bật với MỌI tỉ lệ trên ngưỡng, kể cả 75%. Một câu ghi cứng "cứ ba
       dòng thì một dòng bỏ đi" đọc ra 33% trong khi thẻ số ngay trên nó in con
       số thật — hai số cho một câu hỏi, cách nhau bốn chục dòng. */
    const review = reviewOf(DIRTY_CSV)
    expect(review.highReject).toBe(true)
    expect(review.rejectRate).not.toBeNull()

    /* `getAllBy…`: thẻ bọc dải cũng có cùng đoạn mở đầu trong `textContent`, nên
       khớp một phần tử là khớp cả cha lẫn con. Lấy phần tử trong cùng. */
    const band = screen.getAllByText(
      new RegExp(`^${percent(review.rejectRate ?? 0, 1)} số dòng thô`),
    )
    const inner = band[band.length - 1]
    expect(inner?.textContent).toContain(percent(IMPORT_GATE.rejectRateWarn))
    expect(screen.queryByText(/Cứ ba dòng thì một dòng/)).not.toBeInTheDocument()
  })

  it('khối AI khớp cột có "Căn cứ:", có nút, và KHÔNG tự điền ô nào — luật 9', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()
    paste(SAMPLE_CSV)
    next()

    expect(screen.getAllByText(/^Căn cứ:/).length).toBeGreaterThan(0)
    expect(screen.getByText('Chưa áp bộ nào — bảng bên dưới còn trống.')).toBeInTheDocument()

    // Bảng mở ra ở trạng thái CHƯA ánh xạ gì.
    const first = SAMPLE.header[0]
    if (!first) throw new Error('File mẫu không có cột nào')
    const cell = screen.getByLabelText(`Ô đích cho cột ${first}`)
    expect(cell).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    expect(cell).toHaveValue(SAMPLE_MAP.mapping[first])
    expect(screen.queryByText('Chưa áp bộ nào — bảng bên dưới còn trống.')).not.toBeInTheDocument()
  })

  it('ba dòng đặc tả của file mẫu dừng ở sổ lead, dòng thứ tư đi tiếp được', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()
    paste(SAMPLE_CSV)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    next()

    // Bốn số lớn của bước soát: dòng thô là số dòng của chính file vừa đọc.
    expect(screen.getByText('Dòng thô')).toBeInTheDocument()
    expect(screen.getAllByText(grouped(SAMPLE.body.length)).length).toBeGreaterThan(0)

    /* Ba dòng đặc tả §4.4 đều là công ty đã nằm trong sổ nên chúng dừng ở bảng
       "đã có trong sổ lead". Dòng thứ tư (quyết định J) là công ty CHƯA có, và
       nó là thứ giữ cho đường "tải mẫu → nhập lại" không chết ở đúng bước này. */
    const review = sampleReview()
    expect(review.rowsHeld).toBe(3)
    expect(
      screen.getByRole('button', { name: `Đã có trong sổ lead ${review.rowsHeld}` }),
    ).toBeInTheDocument()

    expect(review.rowsValid).toBeGreaterThan(0)
    expect(
      screen.queryByText('Không dòng nào hợp lệ — không có gì để nhập.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tiếp' })).not.toBeDisabled()
  })

  it('tải mẫu rồi nhập lại chính file đó thì đi HẾT năm bước, ra >0 dòng hợp lệ', async () => {
    renderScreen(<ProspectListsPage />)

    /* Thẻ tải là một `<a download>` thật, nội dung nhúng thẳng vào href — kiểm
       cả tên file lẫn việc nội dung tải về đúng là file mẫu của hệ. */
    await openImport()
    next()
    const link = screen.getByRole('link', { name: /Tải file mẫu/ })
    expect(link).toHaveAttribute('download', SAMPLE_FILE_NAME)
    const href = link.getAttribute('href') ?? ''
    expect(decodeURIComponent(href.slice(href.indexOf(',') + 1))).toBe(sampleCsvFile().text)

    // …rồi nạp lại đúng nội dung ấy, như người dùng mở file mẫu ra và dán vào.
    paste(sampleCsvFile().text)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    next()
    next()

    const confirm = screen.getByRole('button', { name: 'Nhập lô vào kho' })
    fireEvent.click(screen.getByRole('checkbox', { name: /Lô này không tốn tiền/ }))
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)

    expect(screen.getByText('Xong')).toBeInTheDocument()
    expect(
      screen.getByText(new RegExp(`^${grouped(sampleReview().rowsValid)} dòng đã vào kho`)),
    ).toBeInTheDocument()
  })

  it('xin ghi đè chọn TỪNG DÒNG — dòng kho chung và dòng đã ký không có ô tick', async () => {
    await toReview()

    const review = sampleReview()
    expect(review.overwritable.length).toBeGreaterThan(0)

    /* Ô tick chỉ mọc ở dòng CÓ CHỦ. Dòng ở kho chung không có ô nào để đè, dòng
       đã ký thì không vào kho — vẽ ô tick ở đó là mời bấm vào việc không xảy ra. */
    const boxes = screen.getAllByRole('checkbox', { name: /^Xin đè ô của/ })
    expect(boxes).toHaveLength(review.overwritable.length)

    // Chưa tick gì thì màn nói ghi đè KHÔNG nằm trong luồng nhập.
    expect(screen.getByText(new RegExp(OVERWRITE_RULE.why))).toBeInTheDocument()

    const [first] = boxes
    if (!first) throw new Error('Không có ô tick xin đè nào')
    fireEvent.click(first)
    expect(first).toBeChecked()
    expect(
      screen.getByText(new RegExp(`Đã chọn 1/${grouped(review.overwritable.length)} dòng CÓ CHỦ`)),
    ).toBeInTheDocument()

    /* Tick vào rồi bỏ ra đều được cho tới nút cuối — yêu cầu duyệt sinh ở bước
       5, không sinh lúc bấm ô tick. */
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ chọn hết' }))
    expect(first).not.toBeChecked()
    expect(screen.getByText(new RegExp(OVERWRITE_RULE.why))).toBeInTheDocument()
  })

  it('kho trả lời được "tiền mua dòng ra bao nhiêu lead", và nói ra phần để ngoài', () => {
    renderScreen(<ProspectListsPage />)
    const t = batchTotals()

    /* Phép chia sống ở engine (`costOfPaidBatchLead`), màn chỉ đọc. Cả tử lẫn
       mẫu chỉ đứng trên lô MẤT TIỀN, nên nhãn phải khai phạm vi ngay tại ô. */
    expect(t.costPerPaidBatchLead).not.toBeNull()
    expect(screen.getByText('Tiền mua dòng mỗi lead')).toBeInTheDocument()
    expect(screen.getByText(dong(t.costPerPaidBatchLead ?? 0))).toBeInTheDocument()
    expect(
      screen.getByText(
        `${t.paidBatches} lô mất tiền · ${grouped(t.paidBatchLeads)} lead truy về chính chúng`,
      ),
    ).toBeInTheDocument()

    /* Bỏ ngoài phép chia thì được, GIẤU thì không: lô 0 đồng có lead thật, và
       màn phải nói ra cả số lô lẫn số lead bị để ngoài. */
    const left = screen.getByText(/nằm NGOÀI phép chia/)
    expect(left.textContent).toContain(String(t.freeBatches))
    expect(left.textContent).toContain(grouped(t.freeBatchLeads))
    expect(t.paidBatchLeads + t.freeBatchLeads).toBe(t.leadsWithBatch)
  })

  it('dòng "đã ký" nói là CHẶN CỨNG, không nói là vào kho được — hai xô, hai câu', async () => {
    await toReview()

    /* `rowsHeld` gộp hai thứ trái ngược: dòng có chủ VÀO KHO được (chỉ không vào
       khán giả), dòng đã ký thì KHÔNG vào kho. Một câu cho cả hai là nói sai về
       nửa sau — và với file mẫu, nửa sau chiếm hai trên ba dòng. */
    const review = sampleReview()
    expect(review.held.length).toBeGreaterThan(0)
    expect(review.blocked.length).toBeGreaterThan(0)
    expect(review.rowsHeld).toBe(review.held.length + review.blocked.length)

    const held = screen.getByText(/dòng vào kho được nhưng KHÔNG vào khán giả/)
    expect(held.textContent).toMatch(new RegExp(`^${grouped(review.held.length)}\\b`))

    const blocked = screen.getByText(/bị chặn cứng vì đã ký hợp đồng/)
    expect(blocked.textContent).toMatch(new RegExp(`^${grouped(review.blocked.length)}\\b`))

    /* Nút ghi đè chỉ chạm dòng CÓ CHỦ. Dòng ở kho chung không có ô nào để đè, và
       dòng đã ký thì không nhập được — gom chúng vào một yêu cầu duyệt là xin
       gật cho một việc không xảy ra. */
    expect(review.overwritable).toHaveLength(review.held.length)
    for (const r of review.overwritable) expect(r.book?.owner).toBeTruthy()
  })

  it('bảng "Trùng với lô đã có" hiện dấu gạch, không hiện số 0 — vòng đó chưa chạy', async () => {
    await toReview()

    /* Kịch bản đóng băng không chép dòng của tám lô trước, nên khử trùng chéo lô
       KHÔNG chạy. In "0" ở đây là bịa ra một kết quả đã đo (ràng buộc 12). */
    const panel = screen.getByRole('button', { name: /^Trùng với lô đã có/ })
    expect(panel.textContent).toContain('—')
    expect(panel.textContent).not.toMatch(/\b0\b/)

    // Câu thú nhận phải đọc được mà không phải bấm: panel mở sẵn.
    expect(panel).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Chưa đối chiếu được với kho lô cũ/)).toBeInTheDocument()
  })

  it('"Dùng nhà đã có" mang theo căn cứ mặc định — không đẩy người dùng vào ngõ cụt', async () => {
    renderScreen(<ProspectListsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Nhập danh sách' }))

    const existing = firstBatch()
    fireEvent.click(await screen.findByRole('button', { name: /Nhà cung cấp mới/ }))
    fireEvent.change(screen.getByLabelText(/Tên nhà cung cấp/), {
      target: { value: existing.supplier },
    })

    /* Trùng tên chặn tại chỗ, và lối thoát là "Dùng nhà đã có". Nút đó phải đặt
       LUÔN căn cứ mặc định của nhà: bỏ căn cứ thì mọi dòng có cột người/thư/điện
       thoại bị loại vì "thiếu căn cứ liên hệ" ở bước 4, mà ô khai căn cứ lại nằm
       ở bước 5 — người dùng kẹt không lối ra. */
    fireEvent.click(screen.getByRole('button', { name: 'Dùng nhà đã có' }))
    expect(screen.getByRole('button', { name: 'Tiếp' })).not.toBeDisabled()

    next()
    paste(SAMPLE_CSV)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    next()

    // Không dòng nào bị loại vì thiếu căn cứ — cửa Nghị định 13 đã có câu trả lời.
    expect(screen.queryByText(REJECT_REASON_LABEL['thieu-can-cu-lien-he'])).not.toBeInTheDocument()
  })

  it('rời luồng nhập giữa chừng phải hỏi một câu — bản nháp không sống ở đâu khác', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()
    paste(SAMPLE_CSV)

    fireEvent.click(screen.getByRole('button', { name: /Về kho danh sách/ }))

    // Chưa mất gì: vẫn còn ở luồng nhập, và màn nói ra cái sắp mất.
    expect(screen.getByText(/Rời màn là mất bản nháp/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ở lại' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ở lại' }))
    expect(screen.queryByText(/Rời màn là mất bản nháp/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nhập danh sách' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Về kho danh sách/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ bản nháp, về kho' }))
    expect(screen.getByRole('heading', { name: 'Kho danh sách' })).toBeInTheDocument()
  })

  it('một dòng chưa có trong sổ đi hết năm bước, và cửa cuối bắt tick "không tốn tiền"', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()
    paste(FRESH_CSV)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    next()
    next()

    /* Cửa cuối: tiền để trống mà chưa tick "không tốn tiền" thì không nhập được
       — bỏ trống vì quên và bỏ trống vì đúng là hai chuyện. */
    const confirm = screen.getByRole('button', { name: 'Nhập lô vào kho' })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Lô này không tốn tiền/ }))
    expect(confirm).not.toBeDisabled()

    expect(screen.getAllByText(IMPORT_DISCLAIMER).length).toBeGreaterThan(0)

    /* Nhập xong: lô vào kho, và câu chốt vẫn đứng đó — không đợt nào tự chạy,
       không dòng lead nào sinh ra. */
    fireEvent.click(confirm)
    expect(screen.getByText('Xong')).toBeInTheDocument()
    expect(screen.getAllByText(/đã vào kho/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Về kho danh sách' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText(IMPORT_DISCLAIMER).length).toBeGreaterThan(0)

    /* Nhập xong một lô thì việc kế tiếp THẬT là tạo đợt gửi cho nó. Trước bản
       này màn "Xong" chỉ có đúng một nút trả người về chỗ cũ — chuỗi đứt ngay
       chỗ nó vừa xong việc. */
    expect(screen.getByRole('button', { name: /Tạo đợt gửi cho lô này/ })).toBeInTheDocument()
  })

  it('lô còn CHỜ GẬT thì không mời đi tạo đợt — dòng của nó chưa vào khán giả được', async () => {
    renderScreen(<ProspectListsPage />)
    await openImport()
    next()
    paste(SAMPLE_CSV)
    next()
    fireEvent.click(screen.getByRole('button', { name: 'Áp bộ ánh xạ này' }))
    next()

    // Tick một dòng xin đè → lô sinh yêu cầu duyệt.
    const [box] = screen.getAllByRole('checkbox', { name: /^Xin đè ô của/ })
    if (!box) throw new Error('Không có ô tick xin đè nào')
    fireEvent.click(box)
    next()

    fireEvent.click(screen.getByRole('checkbox', { name: /Lô này không tốn tiền/ }))
    fireEvent.click(screen.getByRole('button', { name: `Gửi ${IMPORT_APPROVER} duyệt` }))

    expect(screen.getByText(new RegExp(`đang chờ ${IMPORT_APPROVER} gật`))).toBeInTheDocument()
    /* Không dòng nào vào khán giả trước khi có người gật, nên mời đi tạo đợt
       lúc này là mời làm một việc chưa tới lượt. */
    expect(screen.queryByRole('button', { name: /Tạo đợt gửi cho lô này/ })).not.toBeInTheDocument()
  })
})
