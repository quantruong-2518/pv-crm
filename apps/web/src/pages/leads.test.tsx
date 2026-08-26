import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { BOOK_SPLIT, FUNNEL, isRunning, LEADS } from '@pv/engines/fixtures/das-vina'
import { useLeadDesk } from '@/app/desk'
import {
  funnelRows,
  leadsOfSource,
  OPEN_FILTER,
  filterBook,
  statusCounts,
  tierCounts,
  unownedCount,
} from '@/data/leads'
import { planTargetOf } from '@/data/plan'
import { renderRoutes, renderScreen } from '@/test-utils'
import { LeadsPage } from './leads'

/** Test màn Sổ lead — DANH SÁCH, không còn là bàn làm việc.
 *
 *  Khoá đúng những thứ dễ trôi mất khi ai đó dọn giao diện lần sau:
 *   · phễu vẫn là số ĐÃ CHỐT và vẫn nói ra tỉ lệ qua bậc;
 *   · bộ lọc là MỘT hàng select, không quay lại rừng nút pill;
 *   · bấm một dòng là SANG TRANG, không mở panel;
 *   · ghim theo người và tách khỏi bảng;
 *   · tab "Việc của tôi" xếp việc theo cột kanban;
 *   · con số kế hoạch của module 4 đọc được NGAY TẠI ĐÂY, và không tính lại;
 *   · lúc sổ chưa về thì không chỗ nào in số 0 với nghĩa "chưa có".
 *
 *  Sổ lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần dòng
 *  thật thì phải `findBy…`, không `getBy…`. */

/** Sổ lead + một màn giả đứng ở chỗ hồ sơ lead, để kiểm việc điều hướng. */
const bookRoutes = [
  { path: '/sales/leads', element: <LeadsPage /> },
  { path: '/sales/leads/:code', element: <div>MÀN HỒ SƠ LEAD</div> },
]

describe('Module 2 · Sổ lead', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<LeadsPage />)).not.toThrow()
  })

  it('phễu hiện đúng sáu bậc đã chốt và tỉ lệ qua từng bậc', () => {
    renderScreen(<LeadsPage />)

    for (const step of FUNNEL) {
      expect(screen.getAllByText(String(step.count)).length).toBeGreaterThan(0)
    }

    // 44/100 · 30/44 · 19/30 · 11/19 · 6/11 — năm tỉ lệ, một cho mỗi bước rớt.
    expect(screen.getByText('44%')).toBeInTheDocument()
    expect(screen.getByText('68%')).toBeInTheDocument()
    expect(screen.getByText(/Phễu đếm LUỸ KẾ cả kỳ/)).toBeInTheDocument()
  })

  /* Ba con số cho cùng một câu: phễu ghi 44 (luỹ kế cả kỳ), ô lọc Bậc ghi số
     MQL, bảng ra số dòng. Hai số sau phải BẰNG NHAU — một ô lọc hứa 14 mà ra 12
     là chỗ mất tin cậy. Vì thế `tierCounts` đếm trong đúng phạm vi bảng. */
  it('bấm một bậc trên phễu là lọc theo bậc đó, và số trên ô lọc bằng số dòng ra', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // Phạm vi bảng lúc mở màn là "Đang chạy", nên số của ô lọc cũng đếm ở đó.
    const mql = filterBook(LEADS, { ...OPEN_FILTER, tier: 'mql' }).length
    const mqlCaKy = LEADS.filter((l) => l.tier === 'mql').length
    expect(mql).toBeLessThan(mqlCaKy)

    fireEvent.click(screen.getByRole('button', { name: /Công ty thật/ }))

    expect((screen.getByLabelText('Bậc') as HTMLSelectElement).value).toBe('mql')
    expect(screen.getByText(`MQL · ${mql}`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `${mql} dòng khớp bộ lọc` })).toBeInTheDocument()
  })

  it('bộ lọc là MỘT hàng select, không phải rừng nút pill', () => {
    renderScreen(<LeadsPage />)

    for (const label of ['Trạng thái', 'Bậc', 'Ngành', 'Nguồn']) {
      expect(screen.getByLabelText(label).tagName).toBe('SELECT')
    }

    // Bốn ô lọc + ô tìm là toàn bộ thanh lọc. Nút lọc dạng pill chỉ còn đúng
    // một cái ("Quá hạn cột") vì nó là công tắc hai trạng thái, không phải danh sách.
    expect(screen.getAllByRole('combobox')).toHaveLength(4)
    expect(screen.getByPlaceholderText(/Tìm theo tên công ty/)).toBeInTheDocument()
  })

  it('bấm một dòng thì SANG TRANG hồ sơ, không mở panel bên phải', async () => {
    renderRoutes(bookRoutes, { route: '/sales/leads' })

    fireEvent.click(await screen.findByRole('cell', { name: 'DAS Vina' }))
    expect(screen.getByText('MÀN HỒ SƠ LEAD')).toBeInTheDocument()
  })

  it('ghim tách hẳn ra khỏi bảng và ghim theo NGƯỜI đang đăng nhập', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.queryByText(/^Ghim của tôi/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ghim DAS Vina' }))
    expect(screen.getByText('Ghim của tôi · 1')).toBeInTheDocument()

    // Bỏ ghim ở khối ghim thì bảng cũng phải hết sáng — một nguồn sự thật.
    fireEvent.click(screen.getAllByRole('button', { name: 'Bỏ ghim DAS Vina' })[0] as HTMLElement)
    expect(screen.queryByText(/^Ghim của tôi/)).not.toBeInTheDocument()
  })

  it('mỗi dòng nói rõ mình từ nguồn nào — dây nối sang module 1', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // DAS Vina về từ hội thảo SK-0103.
    expect(screen.getAllByText('SK-0103').length).toBeGreaterThan(0)
  })

  it('sổ phân trang 10 dòng, không đổ cả 100 dòng ra một lượt', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    // 42 lead đang chạy / 10 dòng mỗi trang = 5 trang. Bộ nút phân trang in
    // ĐÚNG MỘT lần — bản trước in cả trên lẫn dưới bảng.
    expect(screen.getAllByText('1/5')).toHaveLength(1)
    expect(screen.getAllByRole('row').length).toBeLessThanOrEqual(11) // 10 dòng + header
  })

  /* Hồ sơ nguồn (module 1) gửi sang `?source=`. Trước bản này query bị nuốt: nút
     "Mở Sổ lead" đổ người dùng vào sổ 100 dòng để tự dò lại — một nút hứa nhiều
     hơn nó làm. */
  it('vào bằng ?source= thì ô lọc Nguồn chọn sẵn, và bảng nói ra chỗ chênh với sổ nguồn', async () => {
    // CD-0101 là ca vênh đã đo: 22 lead cả kỳ, 10 lead đang chạy.
    const all = leadsOfSource(LEADS, 'CD-0101')
    const running = LEADS.filter((l) => l.source === 'CD-0101' && isRunning(l)).length
    expect([all, running]).toEqual([22, 10])

    renderScreen(<LeadsPage />, { route: '/sales/leads?source=CD-0101' })

    expect(
      await screen.findByText(new RegExp(`CD-0101 ghi ${all} lead.+còn ${running} dòng`)),
    ).toBeInTheDocument()
    expect((screen.getByLabelText('Nguồn') as HTMLSelectElement).value).toBe('CD-0101')
  })

  it('mã nguồn lạ trong ?source= thì bỏ qua, không dựng bộ lọc trỏ vào nguồn không có', async () => {
    renderScreen(<LeadsPage />, { route: '/sales/leads?source=CD-9999' })
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect((screen.getByLabelText('Nguồn') as HTMLSelectElement).value).toBe('all')
  })

  it('lọc rỗng thì ra EmptyState có nút gỡ lọc, không phải màn trắng', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.change(screen.getByPlaceholderText(/Tìm theo tên công ty/), {
      target: { value: 'không có công ty nào tên thế này' },
    })

    expect(screen.getByText(/Không có lead nào khớp bộ lọc/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Bỏ hết bộ lọc' }).length).toBeGreaterThan(0)
  })

  it('bật "Quá hạn cột" thì nói rõ hai bậc đầu chưa ai đặt ngưỡng', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.queryByText(/chưa có ngưỡng — chưa đo được/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quá hạn cột' }))
    expect(screen.getByText(/đầu mối và MQL chưa có ngưỡng — chưa đo được/)).toBeInTheDocument()
  })

  /* Chỗ chênh với sổ nguồn quy cho ô lọc Trạng thái, nên câu đó chỉ đúng khi
     Trạng thái là thứ duy nhất đang cắt. Gõ thêm một chữ vào ô tìm mà vẫn in
     câu cũ là in ra một lời giải thích sai. */
  it('có bộ lọc khác đang bật thì KHÔNG in câu chênh — câu đó chỉ nói về Trạng thái', async () => {
    renderScreen(<LeadsPage />, { route: '/sales/leads?source=CD-0101' })
    await screen.findByText(/CD-0101 ghi 22 lead/)

    fireEvent.change(screen.getByPlaceholderText(/Tìm theo tên công ty/), {
      target: { value: 'a' },
    })

    expect(screen.queryByText(/CD-0101 ghi 22 lead/)).not.toBeInTheDocument()
  })

  it('ContextRail có mặt và dựng từ đồ thị E1 — luật 10', async () => {
    renderScreen(<LeadsPage />)

    // Chuỗi của OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(await screen.findByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  /* Bốn chip mang bốn mã khác nhau; chỉ chip của chính đơn mồi có màn để tới.
     Ba chip kia là `<span>`, không mời bấm — bấm mã báo giá mà ra hồ sơ lead là
     một nút hứa sai chỗ nó tới. */
  it('chỉ chip của đơn mồi bấm được, ba chip còn lại không giả vờ bấm được', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByText('AC-0142')

    expect(screen.getByRole('button', { name: 'OP-0288' })).toBeInTheDocument()
    for (const code of ['AC-0142', 'CT-0391', 'BG-1077']) {
      expect(screen.queryByRole('button', { name: code })).not.toBeInTheDocument()
    }
  })

  /* Mục tiêu của đợt: con số kế hoạch phải đọc được ở chỗ người ta HÀNH ĐỘNG.
     Màn KHÔNG dựng lại phép tính — nó hỏi đúng dòng của module 4.

     Tên ca KHÔNG được gọi đây là "chỉ tiêu của mình": module 4 nhân chỉ tiêu
     tháng cho số người mang vai, nên số in ra là số của CẢ VAI. Vai Sale có ba
     người, tức dòng này in 3 trong khi drawer Performance của một người in 1 —
     phạm vi vì thế là một phần bắt buộc của câu, và ca này khoá nó. */
  it('vai Sale đọc được chỉ tiêu kỳ của CẢ VAI ngay trên sổ, có khai phạm vi', () => {
    const row = planTargetOf('don-chot')
    expect(row).not.toBeNull()

    renderScreen(<LeadsPage />, { actorId: 'u-huy' })
    const line = screen.getByLabelText('Chỉ tiêu kỳ')

    expect(line.textContent).toContain(row?.metric)
    expect(line.textContent).toContain(String(row?.target))
    expect(line.textContent).toContain(String(row?.missing))
    // Câu "còn bao nhiêu mỗi ngày" viết ở tầng dữ liệu — hai màn một cách nói.
    expect(line.textContent).toContain(row?.perDayText)
    // Mẫu số đi kèm con số, và đếm đúng số người của hàng module 4.
    expect(line.textContent).toContain(`cả vai ${row?.role} (${row?.owners.length} người)`)
  })

  /* Bước "đo" của vòng bốn module. Trước ca này, module 1–2 chỉ chỉ sang
     Performance bằng chữ — người trình diễn phải tự tìm dropdown nav. */
  it('câu "bảng của cả phòng ở module 3" có một lối đi thật, không chỉ là chữ', () => {
    renderRoutes(
      [
        { path: '/sales/leads', element: <LeadsPage /> },
        { path: '/sales/performance', element: <h2>Performance</h2> },
      ],
      { route: '/sales/leads' },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mở Performance của phòng' }))
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
  })

  it('vai không có thước riêng thì đọc câu tóm của cả phòng, không bị gán bừa thước người khác', () => {
    // Vai mặc định là TP Kinh doanh — không giữ khách, không có thước cá nhân.
    renderScreen(<LeadsPage />)
    const line = screen.getByLabelText('Chỉ tiêu kỳ')

    expect(line.textContent).toContain('cả phòng')
    expect(line.textContent).not.toContain('Đơn chốt:')
  })

  /* Ràng buộc 12 · số 0 không bao giờ là "chưa có". Lượt vẽ đầu tiên là lúc sổ
     chưa về: mọi con số ĐẾM TỪ SỔ phải im, không được in 0. */
  it('lúc sổ chưa về thì không chỗ nào in số 0 thay cho "chưa đếm xong"', () => {
    renderScreen(<LeadsPage />)

    expect(screen.getByText('Đang cân sổ…')).toBeInTheDocument()
    expect(screen.getByText(/đang đếm sổ/)).toBeInTheDocument()
    // Tab không đeo "· 0", ô lọc Bậc không hứa "MQL · 0".
    expect(screen.getByRole('button', { name: 'Việc của tôi' })).toBeInTheDocument()
    for (const label of ['Đầu mối · 0', 'MQL · 0', 'SQL · 0']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('còn ở kho chung, chưa ai giữ')).not.toBeInTheDocument()
  })

  /* docs/kien-truc-san-pham.md · module 2 trả câu "ai đang trong tay ai". Trước
     bản này câu đó chỉ nằm ở cột cuối của bảng. */
  it('hàng cân sổ nói ra bao nhiêu dòng còn ở kho chung', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    const chip = screen.getByText('còn ở kho chung, chưa ai giữ')
    expect(chip.textContent).toContain(String(unownedCount(LEADS)))
    // Không phải nút: sổ chưa có bộ lọc theo người giữ, dựng nút là hứa suông.
    expect(chip.tagName).not.toBe('BUTTON')
  })

  it('nói ra thứ màn cố tình không làm — E3 chưa nối', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    expect(screen.getByText('Cố tình không làm')).toBeInTheDocument()
    expect(screen.getByText(/E3 chưa nối/)).toBeInTheDocument()
  })

  it('tab "Việc của tôi" xếp việc theo cột kanban và nói rõ vì sao là việc của mình', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    // Sáu cột: chưa vào sổ cơ hội + năm cột của PIPELINE_STAGES.
    for (const label of [
      'Chưa vào sổ cơ hội',
      'Mới',
      'Đang tìm hiểu',
      'Đã demo',
      'Đã báo giá',
      'Chờ ký',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }

    // TP Kinh doanh không giữ khách: việc của vai này là thứ chờ mình gật.
    expect(screen.getAllByText(/chờ bạn gật cho vào sổ cơ hội/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Không có nút "hoàn thành" ở đây/)).toBeInTheDocument()
  })

  it('bấm hành động trên thẻ việc là ĐỀ NGHỊ, không phải làm luôn', async () => {
    renderScreen(<LeadsPage />)
    await screen.findByRole('cell', { name: 'DAS Vina' })
    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    /* Đúng cái NÚT, không phải cả thẻ: thẻ có tên trợ năng riêng
       ("Mở hồ sơ …") nên hai thứ không lẫn vào nhau. */
    const first = screen.getAllByRole('button', { name: 'Đề nghị nhận vào sổ cơ hội' })[0]
    expect(first).toBeDefined()
    fireEvent.click(first as HTMLElement)

    expect(screen.getAllByText('Đã đề nghị').length).toBeGreaterThan(0)
  })

  it('việc vừa được giao rơi vào ĐÚNG cột của nó và đeo nhãn "mới"', async () => {
    // Huy là Sale ngành chip; lead dưới đây do Linh giữ, đang ở cột "Đã demo".
    const other = LEADS.find((l) => l.stage === 'da-demo' && l.owner !== 'Đỗ Quang Huy')
    expect(other).toBeDefined()

    renderScreen(<LeadsPage />, { actorId: 'u-huy' })
    await screen.findByRole('cell', { name: 'DAS Vina' })

    act(() => {
      useLeadDesk.getState().assign(other?.code ?? '', ['u-huy'], 'Báo tắc')
    })
    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    const card = screen.getByRole('button', { name: `Mở hồ sơ ${other?.company}` })
    expect(within(card).getByText('mới')).toBeInTheDocument()
    expect(within(card).getByText(/Vừa được giao · Báo tắc/)).toBeInTheDocument()

    // Thẻ nằm trong cột "Đã demo", không nằm trong một hộp "việc mới" riêng.
    const column = card.parentElement?.parentElement as HTMLElement
    expect(within(column).getByText('Đã demo')).toBeInTheDocument()
  })

  it('vai Sale thấy việc của chính mình, không thấy việc của vai khác', async () => {
    renderScreen(<LeadsPage />, { actorId: 'u-huy' })
    await screen.findByRole('cell', { name: 'DAS Vina' })

    fireEvent.click(screen.getByRole('button', { name: /Việc của tôi · \d+/ }))

    const board = screen.getByText(/Bấm hành động trên thẻ là ĐỀ NGHỊ/).parentElement as HTMLElement
    expect(within(board).getAllByText(/Bạn đang giữ/).length).toBeGreaterThan(0)
    expect(within(board).queryByText(/chờ bạn gật cho vào sổ cơ hội/)).not.toBeInTheDocument()
  })
})

/** Phép đếm của sổ nằm ở `data/leads.ts`, không trong JSX — nên nó test được mà
 *  không phải dựng cả màn. Ba ca dưới khoá đúng những con số đã chốt. */
describe('Module 2 · phép đếm của sổ', () => {
  it('ba phần của sổ cân đúng 6 · 42 · 52 = 100', () => {
    expect(statusCounts(LEADS)).toEqual(BOOK_SPLIT)
    expect(BOOK_SPLIT.signed + BOOK_SPLIT.running + BOOK_SPLIT.exited).toBe(LEADS.length)
  })

  it('bộ lọc lúc mở màn ra đúng phần "đang chạy" của sổ', () => {
    expect(filterBook(LEADS, OPEN_FILTER)).toHaveLength(BOOK_SPLIT.running)
  })

  /* Số trên ô lọc Bậc phải BẰNG số dòng bấm vào sẽ ra — cùng một `filterBook`,
     chỉ thay mỗi trường `tier`. Đếm trên cả sổ thì ô lọc hứa 14 mà bảng ra 12. */
  it('tierCounts đếm trong đúng phạm vi bảng đang lọc, không trên cả sổ', () => {
    const scoped = tierCounts(LEADS, OPEN_FILTER)
    for (const [tier, n] of scoped) {
      expect(n).toBe(filterBook(LEADS, { ...OPEN_FILTER, tier }).length)
    }

    const whole = tierCounts(LEADS, { ...OPEN_FILTER, status: 'all' })
    expect(whole.get('mql')).toBe(LEADS.filter((l) => l.tier === 'mql').length)
    expect(scoped.get('mql')).toBeLessThan(whole.get('mql') ?? 0)
  })

  it('kho chung đếm riêng, KHÔNG phá phép cân 6 · 42 · 52 của sổ', () => {
    expect(unownedCount(LEADS)).toBe(LEADS.filter((l) => !l.owner).length)
    expect(unownedCount(LEADS)).toBeGreaterThan(0)
    expect(statusCounts(LEADS)).toEqual(BOOK_SPLIT)
  })

  it('phễu giữ sáu bậc đã chốt, và bậc đầu KHÔNG có tỉ lệ qua bậc', () => {
    const rows = funnelRows()
    expect(rows.map((r) => r.count)).toEqual(FUNNEL.map((s) => s.count))
    // Bậc đầu không có bậc nào đứng trước để chia — 100% ở đó là con số bịa.
    expect(rows[0]?.pass).toBeNull()
    expect(rows[1]?.pass).toBe(44)
    // Ba bậc cuối là trạng thái của ĐƠN, không phải bậc của lead → không lọc được.
    expect(rows.filter((r) => r.tier)).toHaveLength(3)
  })
})
