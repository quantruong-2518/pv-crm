import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import {
  HEAD_OF_SALES,
  LEADS,
  OPEN_DEALS,
  REQUIRED_SLOTS,
  ROLE_KPI_MODEL,
  SOURCES,
  isRotting,
} from '@pv/engines/fixtures/das-vina'
import { renderRoutes, renderScreen } from '@/test-utils'
import { planTargets } from '@/data/plan'
import { DATA_WINDOW, vn } from '@/data/period'
import { costGap, rankSources } from '@/data/source-cost'
import { PlanPage } from './plan'

/** Module 4 là màn AI nặng nhất của hệ, nên test ở đây gác đúng một thứ: LUẬT 9.
 *
 *  Ba câu hỏi mắt người hay bỏ sót, và cả ba đều trả lời được bằng máy:
 *   · mọi khối AI có "Căn cứ:" chưa, và căn cứ đó có SỐ hay chỉ là lời hứa;
 *   · trước khi ai bấm gì, màn có nói "Chưa tạo gì cả" không, hay nó im lặng
 *     tỏ ra như đã làm hộ;
 *   · có nút nào rút ba bước (thêm → gửi duyệt → người gật) thành một không.
 *
 *  Số của kỳ vọng tính lại TỪ FIXTURE, không gõ tay: sửa fixture thì test đỏ vì
 *  màn sai, không đỏ vì test cũ.
 *
 *  Màn lấy số qua `useQuery` nên lần render đầu là trạng thái chờ — chỗ nào cần
 *  số thật thì `findBy…`, không `getBy…`. */
describe('Module 4 · Số liệu & kế hoạch', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<PlanPage />)).not.toThrow()
  })

  it('mọi khối AI đều có dòng "Căn cứ" và căn cứ nào cũng có số — luật 9', async () => {
    renderScreen(<PlanPage />)

    const bases = await screen.findAllByText(/^Căn cứ:/)
    const buttons = screen.getAllByRole('button', { name: 'Thêm vào kế hoạch' })

    // Đúng một dòng căn cứ cho mỗi nút — không khối AI nào lọt lưới.
    expect(bases.length).toBe(buttons.length)
    expect(bases.length).toBeGreaterThanOrEqual(3)

    for (const b of bases) {
      // "Căn cứ: sẽ tốt hơn" không phải căn cứ. Phải có con số đọc được.
      expect(b.textContent ?? '').toMatch(/\d/)
    }
  })

  it('chưa ai bấm thì mọi khối nói "Chưa tạo gì cả", kể cả ô kế hoạch', async () => {
    renderScreen(<PlanPage />)

    const buttons = await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    // Mỗi khối AI một dòng, cộng ô "Kế hoạch đã chốt" đang rỗng.
    expect(screen.getAllByText(/Chưa tạo gì cả/).length).toBe(buttons.length + 1)

    expect(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })).toBeDisabled()
  })

  it('không nút nào rút gọn ba bước — không có "Gửi ngay" hay "Chạy ngay"', async () => {
    renderScreen(<PlanPage />)
    await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })

    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '').not.toMatch(/\bngay\b/i)
    }

    // Nút cuối cùng của màn là gửi cho người gật, không phải tự làm.
    expect(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })).toBeInTheDocument()
  })

  it('đề xuất ngân sách nêu đúng mã nguồn có thật trong SOURCES', async () => {
    renderScreen(<PlanPage />)

    const codes = new Set(SOURCES.map((s) => s.code))
    const text = (await screen.findAllByText(/^Căn cứ:/))
      .map((n) => n.textContent ?? '')
      .join(' | ')

    const mentioned = text.match(/\b(?:CD|SK)-\d{4}\b/g) ?? []
    expect(mentioned.length).toBeGreaterThan(0)
    for (const code of mentioned) expect(codes.has(code)).toBe(true)
  })

  it('bốn ô số bám sổ, không phải số gõ tay', async () => {
    renderScreen(<PlanPage />)

    const rotting = OPEN_DEALS.filter(isRotting)
    expect(await screen.findByText(`${rotting.length}/${OPEN_DEALS.length}`)).toBeInTheDocument()

    const good = LEADS.filter((l) => l.requiredFilled >= REQUIRED_SLOTS)
    expect(screen.getByText(`${good.length}/${LEADS.length}`)).toBeInTheDocument()
  })

  it('bấm thêm mới có kế hoạch, và kế hoạch chỉ đi khi bấm gửi duyệt', async () => {
    renderScreen(<PlanPage />)

    const [first] = await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    expect(first).toBeDefined()
    fireEvent.click(first!)

    // Việc đã vào kế hoạch thì mang theo người làm và căn cứ của chính nó.
    expect(screen.getByText(/^Người làm:/)).toBeInTheDocument()

    const send = screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })
    expect(send).not.toBeDisabled()

    fireEvent.click(send)
    expect(screen.getByText(new RegExp(`Đã gửi ${HEAD_OF_SALES}`))).toBeInTheDocument()
    // Vẫn rút lại được — gửi duyệt là một trạng thái, không phải cửa một chiều.
    expect(screen.getByRole('button', { name: 'Rút lại' })).toBeInTheDocument()
  })

  it('sửa kế hoạch sau khi gửi thì kéo về nháp, không im lặng đổi bản đang chờ', async () => {
    renderScreen(<PlanPage />)

    const [first] = await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    fireEvent.click(first!)
    fireEvent.click(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` }))
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ khỏi kế hoạch' }))

    expect(screen.queryByRole('button', { name: 'Rút lại' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Gửi ${HEAD_OF_SALES} duyệt` })).toBeDisabled()
  })

  it('ContextRail có mặt ngay cả lúc chờ dữ liệu — luật 10', () => {
    renderScreen(<PlanPage />)

    // Chuỗi của OP-0288 do E1 dựng: AC-0142 → CT-0391 → OP-0288 → BG-1077.
    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  /* Ba ca dưới đây gác cùng một thứ: màn KHÔNG được nói quá về tiền.
     Bản trước in "chênh 24 lần" — tỉ số hai ĐIỂM đứng trên mẫu số 9 và 3 lead
     tốt. Thứ chứng minh được chỉ là 6,6 lần. */
  it('bảng xếp hạng hiện đúng sáu nguồn có tiêu tiền, rẻ nhất lên đầu theo điểm', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const shown = screen
      .getAllByText(/^(?:CD|SK)-\d{4}$/)
      .map((n) => n.textContent ?? '')
      .slice(0, 6)

    expect(shown).toEqual(rankSources().ranked.map((r) => r.code))
  })

  it('câu so sánh giá đi qua cổng dải — "ít nhất N lần", không phải tỉ số hai điểm', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const rows = rankSources().ranked
    const gap = costGap(rows[0]!, rows[rows.length - 1]!)
    expect(gap).not.toBeNull()

    expect(screen.getAllByText(new RegExp(`ít nhất ${gap!.timesText} lần`)).length).toBeGreaterThan(
      0,
    )
  })

  it('không chỗ nào trên màn in tỉ số hai điểm dưới dạng "chênh N lần"', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    expect(document.body.textContent ?? '').not.toMatch(/chênh \d+ lần/)
  })

  it('nguồn cỡ mẫu nhỏ vẫn có mặt trên bảng, kèm lý do chưa đủ để so', async () => {
    renderScreen(<PlanPage />)
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const thin = rankSources().ranked.filter((r) => !r.enough)
    expect(thin.length).toBeGreaterThan(0)
    for (const r of thin) expect(screen.getByText(r.code)).toBeInTheDocument()
    expect(screen.getAllByText('chưa đủ để so').length).toBe(thin.length)
  })

  /* Bảy ca dưới đây gác CON SỐ KẾ HOẠCH — thứ cả đợt 20/08 xoay quanh. Trước
     đợt này màn mang tên Kế hoạch không cầm một chỉ tiêu nào, và chỉ tiêu của kỳ
     chỉ đọc được bên trong Drawer của màn Performance. */
  it('chỉ tiêu lấy từ bảng thước của fixture, nhân đúng số người mang vai', () => {
    const t = planTargets()
    expect(t.rows.length).toBeGreaterThan(0)

    for (const row of t.rows) {
      const spec = ROLE_KPI_MODEL.find((r) => r.role === row.role)?.kpis.find(
        (k) => k.key === row.key,
      )
      // Không dòng nào được đẻ ra ở tầng app: mỗi dòng phải soi ngược về fixture.
      expect(spec).toBeDefined()
      expect(spec?.monthlyTarget).toBe(row.monthlyTarget)
      expect(spec?.formula).toBe(row.formula)
      // Kỳ là một THÁNG trọn nên hệ số nhân thời gian bằng 1.
      expect(row.target).toBeCloseTo(row.monthlyTarget * row.owners.length, 6)
    }
  })

  it('bốn con số của một dòng khớp nhau, và số 0 ở "còn thiếu" là đã đủ chứ không phải chưa đo', () => {
    const t = planTargets()

    for (const row of t.rows) {
      expect(row.missing).toBe(Math.max(0, row.target - row.done))
      expect(row.ratio).toBeCloseTo(row.done / row.target, 6)
      // `perDay` chỉ được vắng khi không còn gì phải chia cho ngày.
      expect(row.perDay === null).toBe(row.missing === 0 || t.daysLeft === 0)
      if (row.missing === 0) expect(row.pace).toBe('da-du')
    }
  })

  it('hai đầu thời gian không bị trộn: đo tới lát cắt, chỉ tiêu tính tới hết kỳ', () => {
    const t = planTargets()
    expect(t.elapsed).toBeLessThan(t.days)
    expect(t.daysLeft).toBe(t.days - t.elapsed)
    expect(t.elapsedShare).toBeCloseTo(t.elapsed / t.days, 6)
  })

  it('bảng chỉ tiêu nói đủ bốn thứ, và cột "đã đạt" khai lát cắt', async () => {
    renderScreen(<PlanPage />)
    const t = planTargets()

    expect(await screen.findByText('Điều phối bằng con số kế hoạch')).toBeInTheDocument()
    expect(screen.getByText(`Đã đạt · tới ${t.cutoff}`)).toBeInTheDocument()
    expect(screen.getByText('Còn thiếu')).toBeInTheDocument()
    expect(screen.getByText(`Còn ${t.daysLeft} ngày`)).toBeInTheDocument()
  })

  it('mỗi thước khai mẫu số của chính nó, và khai nhịp cần có', async () => {
    renderScreen(<PlanPage />)
    const t = planTargets()
    await screen.findByText('Điều phối bằng con số kế hoạch')

    for (const row of t.rows) {
      expect(screen.getByText(row.formula)).toBeInTheDocument()
      expect(screen.getAllByText(row.perDayText).length).toBeGreaterThan(0)
    }
  })

  it('vai không có dòng nào trên bảng thì màn nói ra, không im lặng bỏ đi', async () => {
    renderScreen(<PlanPage />)
    const t = planTargets()
    await screen.findByText('Điều phối bằng con số kế hoạch')

    expect(t.absentNote).not.toBe('')
    expect(document.body.textContent ?? '').toContain(t.absentNote)
  })

  it('đề xuất đầu tiên bám khoảng cách tới chỉ tiêu, không bám một triệu chứng', async () => {
    renderScreen(<PlanPage />)
    const bases = await screen.findAllByText(/^Căn cứ:/)
    const t = planTargets()

    expect(t.worst).not.toBeNull()
    const first = bases[0]?.textContent ?? ''
    expect(first).toContain('Chỉ tiêu kỳ')
    expect(first).toContain(`tính đến ${t.cutoff}`)
    expect(first).toContain(t.worst!.formula)
  })

  /* Sáu ca dưới đây là vòng soát 21/08. Chúng gác những chỗ mắt người đọc qua
     mà thấy đúng: một thước được chọn hộ bằng thứ tự mảng, một khối tự khai sai
     chân trời, một hàng ô số không nói mình đo khoảng nào. */
  it('hai thước hụt ngang nhau thì màn nói cả hai, không để thứ tự fixture chọn hộ', async () => {
    const t = planTargets()

    // Cụm hoà phải chứa chính `worst` và mọi thước có cùng tỉ lệ với nó.
    expect(t.worst).not.toBeNull()
    expect(t.worstTied.map((r) => r.key)).toContain(t.worst!.key)
    const behind = t.rows.filter((r) => r.pace === 'hut-nhip')
    const floor = Math.min(...behind.map((r) => r.ratio))
    expect(t.worstTied.map((r) => r.key).sort()).toEqual(
      behind
        .filter((r) => Math.abs(r.ratio - floor) < 1e-9)
        .map((r) => r.key)
        .sort(),
    )

    renderScreen(<PlanPage />)
    const bases = await screen.findAllByText(/^Căn cứ:/)
    const first = bases[0]?.textContent ?? ''

    // Hoà thì cả câu tóm lẫn căn cứ phải gọi tên ĐỦ cụm — bỏ sót một thước là
    // dồn việc cho một người vì dòng của họ đứng trên trong ROLE_KPI_MODEL.
    for (const row of t.worstTied) {
      expect(t.headline).toContain(row.metric)
      expect(first).toContain(row.metric)
      expect(first).toContain(row.formula)
    }
  })

  it('câu tóm không lặp lại con số của badge "Còn N ngày"', () => {
    const t = planTargets()
    expect(t.headline).not.toContain(`còn ${t.daysLeft} ngày`)
  })

  it('mỗi đề xuất khai chân trời của nó, và khối không tự nhận cả bốn là của tháng tới', async () => {
    renderScreen(<PlanPage />)
    await screen.findAllByRole('button', { name: 'Thêm vào kế hoạch' })
    const t = planTargets()

    // Việc đầu cứu chỉ tiêu của KỲ NÀY, nên nó phải nói ra là của kỳ này.
    expect(
      screen.getAllByText(`Phải xong trong: ${t.daysLeft} ngày cuối ${t.label}`).length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Đề xuất cho tháng tới')).not.toBeInTheDocument()

    // Không đề xuất nào được vắng chân trời.
    const horizons = screen.getAllByText(/^Phải xong trong:/)
    const buttons = screen.getAllByRole('button', { name: 'Thêm vào kế hoạch' })
    expect(horizons.length).toBe(buttons.length)
  })

  it('hàng bốn ô số khai kỳ của mình, để không lẫn với kỳ của bảng chỉ tiêu', async () => {
    renderScreen(<PlanPage />)
    const t = planTargets()
    await screen.findByText('Điều phối bằng con số kế hoạch')

    const page = document.body.textContent ?? ''
    // Hai khối đo hai khoảng khác nhau, và màn phải nói ra chỗ đó bằng chữ.
    expect(page).toContain(`không cắt theo ${t.label}`)
    expect(page).toContain(`${vn(DATA_WINDOW.from)} → ${vn(DATA_WINDOW.cutoff)}`)
    // Ô "Giá mỗi lead tốt" cũng phải khai mẫu số thời gian, không chỉ tập nguồn.
    expect(page).toMatch(/nguồn có tiêu tiền, cả kỳ dữ liệu/)
  })

  it('mã nguồn trên bảng giá bấm được và mở đúng hồ sơ nguồn', async () => {
    /* Vòng khép kín: đọc xong "SK-0106 đắt hơn ít nhất 6,6 lần" thì phải sang
       được hồ sơ nguồn để cắt tiền. Trước 21/08 cả màn không có một `navigate`
       nào và mọi chip là chữ, kể cả chip có màn thật đứng sau. */
    renderRoutes(
      [
        { path: '/sales/plan', element: <PlanPage /> },
        { path: '/sales/campaigns/:code', element: <p>đã sang hồ sơ nguồn</p> },
      ],
      { route: '/sales/plan' },
    )
    await screen.findByText('Giá mỗi lead tốt theo nguồn')

    const code = rankSources().ranked[0]!.code
    fireEvent.click(screen.getByRole('button', { name: code }))
    expect(await screen.findByText('đã sang hồ sơ nguồn')).toBeInTheDocument()
  })

  /* Module 5 đứng ngoài vòng nhưng định hình cái vòng — cửa phải mở cả hai
     chiều. Đây là chiều đi vào: chỗ đặt ra chỉ tiêu. */
  it('câu "chỉ tiêu lấy từ module 5" có một lối đi thật, không chỉ là chữ', async () => {
    renderRoutes(
      [
        { path: '/sales/plan', element: <PlanPage /> },
        { path: '/sales/config', element: <p>đã sang Cấu hình</p> },
      ],
      { route: '/sales/plan' },
    )
    await screen.findByRole('button', { name: 'Sửa chỉ tiêu ở Cấu hình' })

    fireEvent.click(screen.getByRole('button', { name: 'Sửa chỉ tiêu ở Cấu hình' }))
    expect(await screen.findByText('đã sang Cấu hình')).toBeInTheDocument()
  })

  it('nói thẳng thứ cố tình không làm, trước hết là dự báo doanh số', () => {
    renderScreen(<PlanPage />)

    expect(screen.getByText('Cố tình không làm')).toBeInTheDocument()
    expect(screen.getByText(/Không dự báo doanh số tháng tới/)).toBeInTheDocument()
  })
})
