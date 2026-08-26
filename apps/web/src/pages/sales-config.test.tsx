import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import {
  LEAD_CATEGORIES,
  LEADS,
  PIPELINE_STAGES,
  ROLE_KPI_MODEL,
  SOURCES,
  isRunning,
  prospectTotals,
} from '@pv/engines/fixtures/das-vina'
import { renderRoutes, renderScreen } from '@/test-utils'
import { planMeasureText } from '@/data/plan'
import { DEDUPE_KEYS, IMPORT_GATE, REJECT_REASON_LABEL, REJECT_RULES } from '@/data/prospects'
import { fetchSalesConfig, requiredCount } from '@/data/sales-config'
import { SalesConfigPage } from './sales-config'

/** Test của module 5. Những thứ khoá ở đây là những thứ mắt người hay bỏ sót, và
 *  cái nào cũng là luật chứ không phải cách trình bày:
 *
 *   · đủ TÁM mục 5.1 → 5.8 — thiếu một mục là mất một chỗ chỉnh, và hằng số đó
 *     lại chui về nằm trong code. Tám mục nay nằm trong năm thẻ, nhưng mỗi mục
 *     vẫn là một `role="group"` riêng: gom thẻ là chuyện của mắt, không được
 *     làm mất một chặng nhảy của bàn phím;
 *   · cổng MQL → SQL là SÁU ô bắt buộc, không phải mười;
 *   · mục 5.5 TRỐNG — chưa ai đặt ngưỡng SLA cho đầu mối/MQL, màn không được bịa;
 *   · không có ô "khác" ở bất kỳ danh sách đóng nào;
 *   · đổi gì cũng phải gom lại rồi gửi duyệt, không tự lưu — và gửi xong thì bản
 *     nháp về mốc gốc, đổi tiếp là một đợt gửi khác chứ không phải cửa đóng;
 *   · yêu cầu rỗng (gõ vào rồi xoá về như cũ) phải tự rút khỏi danh sách chờ gửi;
 *   · con số cạnh tên người phải đúng nghĩa cột — đếm cả kỳ thì nói là cả kỳ;
 *   · MỘT con số MỘT chỗ: bốn ngưỡng của quyết định F đọc từ `IMPORT_GATE`, hai
 *     tổng của kho đọc từ `prospectTotals()`, chỉ tiêu đọc từ `ROLE_KPI_MODEL`,
 *     bảy lý do loại dòng và ba khoá khử trùng đọc đúng bộ chữ mà luồng nhập
 *     đang chạy;
 *   · TÊN ENGINE không lên giao diện (luật 14) — màn nói "hệ", không nói "E4";
 *   · không câu nào hứa màn Hộp duyệt, vì màn đó chưa dựng và mục nav trỏ tới
 *     nó đang khoá;
 *   · cột lead của tám lô cộng lại KHÔNG ra cả sổ, và màn phải nói ra chỗ chênh.
 *
 *  Cấu hình lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần
 *  dữ liệu thật thì phải `findBy…`, không `getBy…`. */
describe('Module 5 · Cấu hình', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<SalesConfigPage />)).not.toThrow()
  })

  it('có đủ tám mục 5.1 → 5.8, không thiếu chỗ chỉnh nào', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByText('5.1')

    for (const no of ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8']) {
      expect(screen.getByText(no)).toBeInTheDocument()
    }
    expect(screen.queryByText('5.9')).not.toBeInTheDocument()
  })

  it('gom năm thẻ vẫn giữ đủ tám nhóm cho bàn phím và trình đọc màn hình', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByText('5.1')

    for (const no of ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7']) {
      const rx = new RegExp(`^${no.replace('.', '\\.')} `)
      expect(screen.getByRole('group', { name: rx })).toBeInTheDocument()
    }
    // 5.8 là thẻ chứa năm nhóm con 5.8.1 → 5.8.5, nên khớp nhiều hơn một.
    expect(screen.getByRole('group', { name: /^5\.8 / })).toBeInTheDocument()
    expect(screen.getAllByRole('group', { name: /^5\.8\./ }).length).toBeGreaterThanOrEqual(3)
  })

  it('cổng MQL → SQL là sáu ô bắt buộc, không phải mười', async () => {
    renderScreen(<SalesConfigPage />)
    const gate = await screen.findByRole('group', { name: /^5\.1 / })

    // Sáu ô đang bật, bốn ô còn lại làm dày hồ sơ chứ không chặn cổng.
    expect(within(gate).getAllByRole('button', { name: 'Bắt buộc' })).toHaveLength(6)
    expect(within(gate).getAllByRole('button', { name: 'Không bắt buộc' })).toHaveLength(4)
    expect(within(gate).getByText('6/10')).toBeInTheDocument()

    // Cùng một phép đếm ở tầng data, không phải một `filter` chép tay trong JSX.
    expect(requiredCount(await fetchSalesConfig().then((c) => c.questions), [])).toBe(6)
  })

  it('mục 5.5 để TRỐNG — không màn nào được bịa ngưỡng SLA cho đầu mối/MQL', async () => {
    renderScreen(<SalesConfigPage />)
    const sla = await screen.findByRole('group', { name: /^5\.5 / })

    const box = within(sla).getByRole('textbox', { name: /Ngưỡng SLA/ })
    // Không giá trị, không mặc định — chỉ chỗ trống và lời giải thích.
    expect(box).toHaveValue('')
    expect(box).not.toHaveAttribute('value')
    expect(within(sla).getByText('Chưa có giá trị mặc định')).toBeInTheDocument()

    // Và không có con số nào đóng vai một ngưỡng: ngưỡng luôn viết là "N ngày".
    expect(sla.textContent ?? '').not.toMatch(/\d+\s*ngày/)
  })

  it('mỗi mục nói rõ đang có bao nhiêu dữ liệu bám vào — đó là thứ gọi E3 vào cuộc', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.1 / })

    // Mười ô của bộ câu và sáu lý do rơi — dòng nào cũng phải nói được có bao
    // nhiêu lead đang đứng sau nó, không dòng nào bỏ trống.
    const gate = screen.getByRole('group', { name: /^5\.1 / })
    // "cả kỳ" là vế phạm vi, không phải chữ trang trí: phép đếm chạy trên cả sổ,
    // kể cả lead đã rơi và đã ký — đúng mẫu số mà mục 5.3 gọi là "Lead cả kỳ".
    expect(
      within(gate).getByRole('columnheader', { name: 'Lead cả kỳ đã điền' }),
    ).toBeInTheDocument()
    for (const q of await fetchSalesConfig().then((c) => c.questions)) {
      expect(within(gate).getAllByText(String(q.usage)).length).toBeGreaterThan(0)
    }

    const exits = screen.getByRole('group', { name: /^5\.4 / })
    expect(within(exits).getAllByText(/^\d+ lead$/)).toHaveLength(6)

    for (const no of ['5.2', '5.3', '5.5', '5.6', '5.7']) {
      const rx = new RegExp(`^${no.replace('.', '\\.')} `)
      expect(screen.getByRole('group', { name: rx }).textContent ?? '').toMatch(/\d/)
    }
  })

  it('không có ô "khác" ở bất kỳ danh sách đóng nào', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.4 / })

    // Khớp tên ĐẦY ĐỦ: "khác" nằm sẵn trong "Khách chọn bên khác", regex lỏng
    // sẽ báo nhầm.
    expect(
      screen.queryByRole('button', { name: /^(khác|lý do khác|kênh khác|other)$/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/khác/i)).not.toBeInTheDocument()

    // Sáu lý do là toàn bộ danh sách, không có dòng thứ bảy.
    const exits = screen.getByRole('group', { name: /^5\.4 / })
    expect(within(exits).getAllByRole('row')).toHaveLength(7) // 6 dòng + header
  })

  it('bảng nằm trên glass-b — luật 8', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.2 / })

    for (const table of screen.getAllByRole('table')) {
      expect(table.closest('.glass-b')).not.toBeNull()
    }
  })

  it('ContextRail có mặt và dựng từ đồ thị E1 — luật 10', () => {
    renderScreen(<SalesConfigPage />)

    // Chuỗi của OP-0288: AC-0142 → CT-0391 → OP-0288 → BG-1077. Rail nằm ngoài
    // nhánh chờ dữ liệu nên có mặt ngay từ lần render đầu.
    expect(screen.getByText('AC-0142')).toBeInTheDocument()
    expect(screen.getByText('BG-1077')).toBeInTheDocument()
  })

  it('màn mở bằng PageHeader — đúng một tiêu đề cấp một', () => {
    renderScreen(<SalesConfigPage />)

    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent('Cấu hình phòng kinh doanh')
  })

  it('nói ra cả ba luật của module và cả khối "Cố tình không làm"', async () => {
    renderScreen(<SalesConfigPage />)

    // "Ba luật" có mặt ngay từ lần render đầu; "Cố tình không làm" nằm ở CHÂN
    // màn, cạnh thẻ gửi duyệt — cùng chỗ ba màn anh em đặt khối này — nên nó
    // mọc lên cùng nội dung thật.
    expect(screen.getByText('Ba luật của màn này')).toBeInTheDocument()
    expect(await screen.findByText('Cố tình không làm')).toBeInTheDocument()
    // Bốn điều bị bỏ có chủ ý — nói trên màn, không giấu vào comment.
    expect(screen.getByText('Mục 5.5 để trống')).toBeInTheDocument()
    expect(screen.getByText('Không lưu thật')).toBeInTheDocument()
  })

  it('chưa đổi gì thì không có nút gửi; đổi một ô là hiện nút gửi duyệt', async () => {
    renderScreen(<SalesConfigPage />)
    const gate = await screen.findByRole('group', { name: /^5\.1 / })

    expect(screen.getByText(/Chưa đổi gì cả/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gửi .* duyệt/ })).not.toBeInTheDocument()

    // Bỏ bắt buộc ô số 6 — cổng phải tụt xuống 5/10 NGAY trên màn, vì người gật
    // cần thấy hậu quả trước khi gật.
    fireEvent.click(within(gate).getAllByRole('button', { name: 'Bắt buộc' })[5]!)

    expect(within(gate).getByText('5/10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gửi Trần Thu Hà duyệt/ })).toHaveTextContent(
      '1 thay đổi',
    )

    // Bấm lại chính ô đó là trả về như cũ — yêu cầu rỗng phải tự rút khỏi danh
    // sách, không để người gật đọc một dòng chẳng đổi gì.
    fireEvent.click(within(gate).getAllByRole('button', { name: 'Không bắt buộc' })[0]!)
    expect(within(gate).getByText('6/10')).toBeInTheDocument()
    expect(screen.getByText(/Chưa đổi gì cả/)).toBeInTheDocument()

    // Gửi một lần, rồi chờ người gật — màn không tự lưu.
    fireEvent.click(within(gate).getAllByRole('button', { name: 'Bắt buộc' })[5]!)
    const send = screen.getByRole('button', { name: /Gửi Trần Thu Hà duyệt/ })
    fireEvent.click(send)
    expect(screen.getByText(/Đã gửi · chờ Trần Thu Hà gật/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gửi .* duyệt/ })).not.toBeInTheDocument()
  })

  it('gửi xong thì bản nháp về mốc gốc, và đổi tiếp vẫn gửi được', async () => {
    renderScreen(<SalesConfigPage />)
    const gate = await screen.findByRole('group', { name: /^5\.1 / })

    fireEvent.click(within(gate).getAllByRole('button', { name: 'Bắt buộc' })[5]!)
    fireEvent.click(screen.getByRole('button', { name: /Gửi Trần Thu Hà duyệt/ }))

    // Yêu cầu nằm bên người gật, hình dữ liệu ở đây CHƯA đổi: cổng phải về 6/10
    // và màn không được còn hứa "sẽ thành 5/10" khi chẳng còn yêu cầu nào chờ.
    expect(within(gate).getByText('6/10')).toBeInTheDocument()
    expect(gate.textContent ?? '').not.toMatch(/Gửi duyệt xong sẽ thành/)

    // `sent` KHÔNG phải chốt một chiều: lật thêm một ô là mở đợt gửi mới.
    fireEvent.click(within(gate).getAllByRole('button', { name: 'Bắt buộc' })[0]!)
    expect(screen.getByRole('button', { name: /Gửi Trần Thu Hà duyệt/ })).toHaveTextContent(
      '1 thay đổi',
    )
  })

  it('gõ vào ô nhập rồi trả về giá trị cũ thì không để lại yêu cầu rỗng', async () => {
    renderScreen(<SalesConfigPage />)
    const stages = await screen.findByRole('group', { name: /^5\.2 / })

    const stage = PIPELINE_STAGES[0]!
    const box = within(stages).getByRole('textbox', { name: `Hạn cột ${stage.label}` })

    fireEvent.change(box, { target: { value: '99' } })
    expect(screen.getByText(`Hạn cột "${stage.label}"`)).toBeInTheDocument()

    // Về đúng hạn gốc là không đổi gì — người gật không được nhận một dòng rỗng.
    fireEvent.change(box, { target: { value: String(stage.limitDays) } })
    expect(screen.getByText(/Chưa đổi gì cả/)).toBeInTheDocument()

    // Ô 5.5 cũng vậy, mốc gốc của nó là chỗ trống vì chưa ai đặt ngưỡng.
    const sla = screen.getByRole('group', { name: /^5\.5 / })
    const slaBox = within(sla).getByRole('textbox', { name: /Ngưỡng SLA/ })
    fireEvent.change(slaBox, { target: { value: '7' } })
    expect(screen.getByRole('button', { name: /Gửi Trần Thu Hà duyệt/ })).toHaveTextContent(
      '1 thay đổi',
    )
    fireEvent.change(slaBox, { target: { value: '' } })
    expect(screen.getByText(/Chưa đổi gì cả/)).toBeInTheDocument()
  })

  it('cột lead của 5.3 đếm cả kỳ và nói đúng thế, không nói là đang giữ', async () => {
    renderScreen(<SalesConfigPage />)
    const cats = await screen.findByRole('group', { name: /^5\.3 / })

    // Cạnh tên một người thì "đang giữ" là câu về khối lượng việc của người đó.
    // Con số này đếm cả lead đã rơi và đã ký nên không phải câu đó.
    expect(within(cats).getByRole('columnheader', { name: 'Lead cả kỳ' })).toBeInTheDocument()
    expect(within(cats).queryByRole('columnheader', { name: 'Đang giữ' })).not.toBeInTheDocument()

    const cat = LEAD_CATEGORIES[0]!
    const wholePeriod = LEADS.filter((l) => l.category === cat.key).length
    const running = LEADS.filter((l) => l.category === cat.key && isRunning(l)).length

    // Hai số phải khác nhau thật, nếu không thì test này chẳng khoá được gì.
    expect(wholePeriod).toBeGreaterThan(running)
    expect(within(cats).getByText(`${wholePeriod} lead`)).toBeInTheDocument()
  })

  it('5.7 nói ra chỗ chênh: cột "Lead đã về" cộng lại không ra 100', async () => {
    renderScreen(<SalesConfigPage />)
    const channels = await screen.findByRole('group', { name: /^5\.7 / })

    // Nguồn tự nhiên không có đợt nào nên không bám vào kênh nào — sổ lead phải
    // cân, và chỗ chênh phải có tên chứ không để người xem tự cộng rồi ngờ bảng.
    const natural = SOURCES.filter((s) => s.kind === 'tu-nhien')
    const naturalLeads = natural.reduce((sum, s) => sum + s.leads, 0)

    expect(within(channels).getByText(`${naturalLeads} lead`)).toBeInTheDocument()
    expect(within(channels).getByText(`${natural.length} nguồn tự nhiên`)).toBeInTheDocument()

    // Và nói thẳng là chưa có thân mẫu nội dung, thay vì lặng lẽ bỏ nửa đặc tả.
    expect(channels.textContent ?? '').toMatch(/chưa có thân mẫu nào/)
  })

  it('5.6 khai phạm vi của tỉ lệ chia: phần trăm của hoa hồng một đơn đã ký', async () => {
    const cfg = await fetchSalesConfig()
    renderScreen(<SalesConfigPage />)
    // Quét trong ĐÚNG mục 5.6.1: bảng chỉ tiêu ở 5.6.2 cũng in "60%" (tỷ lệ
    // MQL → SQL), nên tìm trên cả thẻ là tìm nhầm chỗ.
    const pay = await screen.findByRole('group', { name: /^5\.6\.1 / })

    // Ba phần cộng lại bằng 100 — phép cộng làm ở tầng data, không trong JSX.
    expect(cfg.commissionTotal).toBe(100)

    // Không ô nào để số trần: mỗi ô là phần trăm, và câu dưới nói mẫu số.
    for (const part of cfg.commissionParts) {
      expect(within(pay).getByText(`${part.value}%`)).toBeInTheDocument()
    }
    expect(pay.textContent ?? '').toMatch(/hoa hồng MỘT ĐƠN ĐÃ KÝ/)
  })

  it('5.6.2 hiện chỉ tiêu một người một tháng, đọc thẳng từ ROLE_KPI_MODEL', async () => {
    const cfg = await fetchSalesConfig()
    renderScreen(<SalesConfigPage />)
    const targets = await screen.findByRole('group', { name: /^5\.6\.2 / })

    // Đủ mọi thước của mọi vai — thiếu một dòng là một chỉ tiêu lại chui về nằm
    // trong code, đúng thứ module 5 sinh ra để chấm dứt.
    const specs = ROLE_KPI_MODEL.flatMap((r) => r.kpis)
    expect(cfg.roleTargets).toHaveLength(specs.length)
    expect(specs.length).toBeGreaterThan(0)

    for (const spec of specs) {
      expect(within(targets).getByText(spec.label)).toBeInTheDocument()
    }

    // Con số phải BẰNG fixture, không phải "gần đúng": gõ lại ở tầng màn là hai
    // bản của cùng một chỉ tiêu.
    const mkt = cfg.roleTargets.find((t) => t.metric === 'Lead kéo về')
    expect(mkt?.targetText).toBe(planMeasureText('so', 24))
    expect(within(targets).getAllByText(planMeasureText('so', 24)).length).toBeGreaterThan(0)

    // Thước quan sát KHÔNG in 0 và KHÔNG in "—" — hai dấu đó đang mang nghĩa
    // khác trong cùng màn này (ràng buộc 12).
    const watched = cfg.roleTargets.filter((t) => t.targetText === null)
    expect(watched.length).toBeGreaterThan(0)
    expect(within(targets).getAllByText('thước quan sát — không chấm đạt/trượt')).toHaveLength(
      watched.length,
    )

    // Vế PHẠM VI: một người, một tháng. Bỏ vế này là ba màn có ba con số mà
    // không màn nào nói chúng khác nhau ở chỗ nào.
    expect(targets.textContent ?? '').toMatch(/MỘT NGƯỜI trong MỘT THÁNG/)

    // Vai không có thước nào phải được gọi tên, không để vắng mặt im lặng.
    expect(cfg.rolesWithoutTarget.length).toBeGreaterThan(0)
    for (const role of cfg.rolesWithoutTarget) {
      expect(targets.textContent ?? '').toContain(role)
    }
  })

  /* Trước 21/08 màn Cấu hình không có một `navigate` nào: chỉ tiêu đặt ở đây
     mà không có lối sang chỗ nó được đem dùng. Module 5 ngoài vòng, nhưng cửa
     của nó phải mở cả hai chiều. */
  it('5.6.2 có lối sang màn đọc chỉ tiêu, không để con số nằm trong ngõ cụt', async () => {
    renderRoutes(
      [
        { path: '/sales/config', element: <SalesConfigPage /> },
        { path: '/sales/plan', element: <p>đã sang Kế hoạch</p> },
      ],
      { route: '/sales/config' },
    )

    const go = await screen.findByRole('button', { name: 'Xem chỉ tiêu của kỳ ở Kế hoạch' })
    fireEvent.click(go)
    expect(await screen.findByText('đã sang Kế hoạch')).toBeInTheDocument()
  })

  it('5.8 đọc bốn ngưỡng của quyết định F từ IMPORT_GATE — một con số một chỗ', async () => {
    const cfg = await fetchSalesConfig()

    // Khai lại bằng literal ở tầng màn là hai bản của cùng một luật, và không ca
    // nào buộc chúng bằng nhau. Ca này là ca đó.
    expect(cfg.prospect.retentionDaysDefault).toBe(IMPORT_GATE.retentionDays)
    expect(cfg.prospect.rejectRateWarnAt).toBe(IMPORT_GATE.rejectRateWarn)
    expect(cfg.prospect.e3CostThreshold).toBe(IMPORT_GATE.approvalCost)
    expect(cfg.prospect.fileLimits.maxRows).toBe(IMPORT_GATE.maxRows)
    expect(cfg.prospect.fileLimits.maxCols).toBe(IMPORT_GATE.maxColumns)
    expect(cfg.prospect.fileLimits.maxSizeMb).toBe(IMPORT_GATE.maxBytes / 1024 / 1024)

    // Giá trị đã chốt 20/08 — đổi số ở IMPORT_GATE thì ca này đỏ, đúng như mong.
    expect(cfg.prospect.retentionDaysDefault).toBe(365)
    expect(cfg.prospect.rejectRateWarnAt).toBe(0.3)
    expect(cfg.prospect.e3CostThreshold).toBe(20_000_000)
    expect(cfg.prospect.fileLimits.maxSizeMb).toBe(5)
  })

  it('5.8 lấy tổng của kho từ prospectTotals(), không tự cộng tám lô', async () => {
    const cfg = await fetchSalesConfig()
    const t = prospectTotals()

    expect(cfg.prospect.batchesTotal).toBe(t.batches)
    expect(cfg.prospect.validRowsTotal).toBe(t.rowsValid)
    expect(cfg.prospect.dedupRowsTotal).toBe(t.rowsDuplicate)
    expect(cfg.prospect.blockRowsTotal).toBe(t.rowsRejected)
  })

  it('5.8.1 cân sổ lead: cột lead của tám lô cộng lại KHÔNG ra cả sổ', async () => {
    const cfg = await fetchSalesConfig()
    const t = prospectTotals()
    renderScreen(<SalesConfigPage />)
    const suppliers = await screen.findByRole('group', { name: /^5\.8\.1 / })

    // Đây là con số lead THỨ BA của màn (sau 5.1 và 5.7). Hai số kia đã khai
    // mẫu số; số này từng đứng trần dưới nhãn "Đang có".
    expect(cfg.prospect.leadsWithBatch).toBe(t.leadsWithBatch)
    expect(cfg.prospect.leadsNoBatch).toBe(t.leadsNoBatch)
    expect(cfg.prospect.leadsWithBatch + cfg.prospect.leadsNoBatch).toBe(cfg.leadsTotal)

    // Cột lead của tám nhà cung cấp cộng đúng bằng phần CÓ lô đứng sau.
    expect(cfg.prospect.suppliers.reduce((s, x) => s + x.usage.leads, 0)).toBe(t.leadsWithBatch)

    expect(within(suppliers).getByText(`${cfg.prospect.leadsWithBatch} lead`)).toBeInTheDocument()
    expect(within(suppliers).getByText(`${cfg.prospect.leadsNoBatch} lead`)).toBeInTheDocument()

    // "Đang có" là nhãn mơ hồ đã bị chốt bỏ, và một cell không nhồi ba đơn vị.
    expect(
      within(suppliers).queryByRole('columnheader', { name: 'Đang có' }),
    ).not.toBeInTheDocument()
    expect(within(suppliers).getByRole('columnheader', { name: 'Lead cả kỳ' })).toBeInTheDocument()
  })

  it('hàng số đầu màn nói ra hình dữ liệu của phòng, và nói ra chỗ chênh', async () => {
    const cfg = await fetchSalesConfig()
    renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.1 / })

    // Sáu ô đọc thẳng từ cfg — không ô nào là con số mới.
    expect(screen.getAllByText(`${cfg.channelsWithRoad}/${cfg.channels.length}`).length).toBe(1)
    expect(cfg.channelsWithRoad).toBeLessThan(cfg.channels.length)

    // Hai ô phân số là hai chỗ chênh, và màn phải nói ra chứ không để người xem
    // đọc "6" thành "bộ câu có sáu ô".
    expect(document.body.textContent ?? '').toMatch(/Hai ô phân số là hai chỗ chênh/)
  })

  it('bảy lý do loại dòng và ba khoá khử trùng dùng ĐÚNG bộ chữ của luồng nhập', async () => {
    const cfg = await fetchSalesConfig()

    // Một khái niệm một tên (luật 14): màn Cấu hình và bảng soát của luồng nhập
    // gọi cùng một luật bằng cùng một câu chữ, vì cùng đọc một bảng.
    expect(cfg.prospect.blockRules.map((r) => r.label)).toEqual(
      REJECT_RULES.map((r) => REJECT_REASON_LABEL[r.reason]),
    )
    expect(cfg.prospect.dedupKeys.map((k) => k.label)).toEqual(DEDUPE_KEYS.map((k) => k.label))

    // Hai TRƯỜNG trong một bảng: nhãn ngắn cho bảng soát, điều kiện đầy đủ cho
    // màn Cấu hình. Thiếu trường thứ hai là màn lại phải kể lại bằng văn xuôi.
    expect(cfg.prospect.blockRules.every((r) => r.why.length > 0)).toBe(true)
    expect(cfg.prospect.dedupKeys.every((k) => k.why.length > 0)).toBe(true)
  })

  it('5.8 hiện điều kiện của từng luật ngay trong bảng, không kể lại bằng văn xuôi', async () => {
    renderScreen(<SalesConfigPage />)
    const rules = await screen.findByRole('group', { name: /^5\.8\.3 / })

    expect(within(rules).getByRole('columnheader', { name: 'Vì sao' })).toBeInTheDocument()
    for (const r of REJECT_RULES) {
      expect(within(rules).getByText(r.why)).toBeInTheDocument()
    }

    const dedupe = screen.getByRole('group', { name: /^5\.8\.2 / })
    expect(within(dedupe).getByRole('columnheader', { name: 'Điều kiện khớp' })).toBeInTheDocument()
    for (const k of DEDUPE_KEYS) {
      expect(within(dedupe).getByText(k.why)).toBeInTheDocument()
    }
  })

  it('danh mục chặn rỗng là số 0 ĐO ĐƯỢC, và đứng RIÊNG khỏi hàng ngưỡng', async () => {
    renderScreen(<SalesConfigPage />)
    const blocklist = await screen.findByRole('group', { name: /^5\.8\.5 / })

    // Số đếm viết kèm đơn vị nên nó không đọc ra một ngưỡng thứ năm.
    expect(within(blocklist).getByText('0 dòng')).toBeInTheDocument()
    expect(blocklist.textContent ?? '').toMatch(/rỗng thật ở kỳ này/)
    // "chưa đo được" là mức khác hẳn — không được lẫn vào ô này.
    expect(blocklist.textContent ?? '').not.toMatch(/chưa đo được/)

    // Hàng ngưỡng chỉ còn NGƯỠNG và HẠN: một phép đếm đứng chung hàng với chúng
    // là một số 0 nằm đúng chỗ của một ngưỡng.
    const gates = screen.getByRole('group', { name: /^5\.8\.4/ })
    expect(gates.textContent ?? '').not.toMatch(/rỗng thật ở kỳ này/)
  })

  it('không tên engine nào lọt lên màn — màn nói "hệ", không nói "E4"', async () => {
    const { container } = renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.7 / })

    // Luật 14. Module 1 đã khoá đúng luật này (campaigns.test.tsx); hai màn phải
    // gọi cùng một thứ bằng cùng một chữ, và "E4" không phải chữ của người dùng.
    expect(container.textContent ?? '').not.toMatch(/\bE\d\b/)

    const channels = screen.getByRole('group', { name: /^5\.7 / })
    expect(within(channels).getAllByText('Hệ gửi được').length).toBeGreaterThan(0)
  })

  it('không câu nào hứa màn Hộp duyệt — màn đó chưa dựng', async () => {
    renderScreen(<SalesConfigPage />)
    const gate = await screen.findByRole('group', { name: /^5\.1 / })

    fireEvent.click(within(gate).getAllByRole('button', { name: 'Bắt buộc' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /Gửi Trần Thu Hà duyệt/ }))

    // Mục nav "Phê duyệt" đang khoá và hai màn của module 1 nói thẳng là chưa
    // có hộp. Màn này từng nói ngược lại như một sự thật.
    expect(screen.getByText(/Chưa có màn Hộp duyệt/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/nằm trong Hộp duyệt/)
  })
})
