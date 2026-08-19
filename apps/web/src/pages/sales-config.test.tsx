import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import {
  LEAD_CATEGORIES,
  LEADS,
  PIPELINE_STAGES,
  SOURCES,
  isRunning,
} from '@pv/engines/fixtures/das-vina'
import { renderScreen } from '@/test-utils'
import { SalesConfigPage } from './sales-config'

/** Test của module 5. Những thứ khoá ở đây là những thứ mắt người hay bỏ sót, và
 *  cái nào cũng là luật chứ không phải cách trình bày:
 *
 *   · đủ BẢY mục 5.1 → 5.7 — thiếu một mục là mất một chỗ chỉnh, và hằng số đó
 *     lại chui về nằm trong code;
 *   · cổng MQL → SQL là SÁU ô bắt buộc, không phải mười;
 *   · mục 5.5 TRỐNG — chưa ai đặt ngưỡng SLA cho đầu mối/MQL, màn không được bịa;
 *   · không có ô "khác" ở bất kỳ danh sách đóng nào;
 *   · đổi gì cũng phải gom lại rồi gửi duyệt, không tự lưu — và gửi xong thì bản
 *     nháp về mốc gốc, đổi tiếp là một đợt gửi khác chứ không phải cửa đóng;
 *   · yêu cầu rỗng (gõ vào rồi xoá về như cũ) phải tự rút khỏi danh sách chờ gửi;
 *   · con số cạnh tên người phải đúng nghĩa cột — đếm cả kỳ thì nói là cả kỳ.
 *
 *  Cấu hình lấy qua `useQuery` nên lần render đầu là trạng thái chờ; chỗ nào cần
 *  dữ liệu thật thì phải `findBy…`, không `getBy…`. */
describe('Module 5 · Cấu hình', () => {
  it('dựng được toàn bộ cây, không ném lỗi', () => {
    expect(() => renderScreen(<SalesConfigPage />)).not.toThrow()
  })

  it('có đủ bảy mục 5.1 → 5.7, không thiếu chỗ chỉnh nào', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByText('5.1')

    for (const no of ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7']) {
      expect(screen.getByText(no)).toBeInTheDocument()
    }
    expect(screen.queryByText('5.8')).not.toBeInTheDocument()
  })

  it('cổng MQL → SQL là sáu ô bắt buộc, không phải mười', async () => {
    renderScreen(<SalesConfigPage />)
    const gate = await screen.findByRole('group', { name: /^5\.1/ })

    // Sáu ô đang bật, bốn ô còn lại làm dày hồ sơ chứ không chặn cổng.
    expect(within(gate).getAllByRole('button', { name: 'Bắt buộc' })).toHaveLength(6)
    expect(within(gate).getAllByRole('button', { name: 'Không bắt buộc' })).toHaveLength(4)
    expect(within(gate).getByText('6/10')).toBeInTheDocument()
  })

  it('mục 5.5 để TRỐNG — không màn nào được bịa ngưỡng SLA cho đầu mối/MQL', async () => {
    renderScreen(<SalesConfigPage />)
    const sla = await screen.findByRole('group', { name: /^5\.5/ })

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
    await screen.findByRole('group', { name: /^5\.1/ })

    // Mười ô của bộ câu và sáu lý do rơi — dòng nào cũng phải nói được có bao
    // nhiêu lead đang đứng sau nó, không dòng nào bỏ trống.
    const gate = screen.getByRole('group', { name: /^5\.1/ })
    expect(within(gate).getAllByText(/^\d+ lead đã điền$/)).toHaveLength(10)

    const exits = screen.getByRole('group', { name: /^5\.4/ })
    expect(within(exits).getAllByText(/^\d+ lead$/)).toHaveLength(6)

    for (const no of ['5.2', '5.3', '5.5', '5.6', '5.7']) {
      const section = screen.getByRole('group', { name: new RegExp(`^${no.replace('.', '\\.')}`) })
      expect(section.textContent ?? '').toMatch(/\d/)
    }
  })

  it('không có ô "khác" ở bất kỳ danh sách đóng nào', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.4/ })

    // Khớp tên ĐẦY ĐỦ: "khác" nằm sẵn trong "Khách chọn bên khác", regex lỏng
    // sẽ báo nhầm.
    expect(
      screen.queryByRole('button', { name: /^(khác|lý do khác|kênh khác|other)$/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/khác/i)).not.toBeInTheDocument()

    // Sáu lý do là toàn bộ danh sách, không có dòng thứ bảy.
    const exits = screen.getByRole('group', { name: /^5\.4/ })
    expect(within(exits).getAllByRole('row')).toHaveLength(7) // 6 dòng + header
  })

  it('bảng nằm trên glass-b — luật 8', async () => {
    renderScreen(<SalesConfigPage />)
    await screen.findByRole('group', { name: /^5\.2/ })

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

  it('chưa đổi gì thì không có nút gửi; đổi một ô là hiện nút gửi duyệt', async () => {
    renderScreen(<SalesConfigPage />)
    const gate = await screen.findByRole('group', { name: /^5\.1/ })

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
    const gate = await screen.findByRole('group', { name: /^5\.1/ })

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
    const stages = await screen.findByRole('group', { name: /^5\.2/ })

    const stage = PIPELINE_STAGES[0]!
    const box = within(stages).getByRole('textbox', { name: `Hạn cột ${stage.label}` })

    fireEvent.change(box, { target: { value: '99' } })
    expect(screen.getByText(`Hạn cột "${stage.label}"`)).toBeInTheDocument()

    // Về đúng hạn gốc là không đổi gì — người gật không được nhận một dòng rỗng.
    fireEvent.change(box, { target: { value: String(stage.limitDays) } })
    expect(screen.getByText(/Chưa đổi gì cả/)).toBeInTheDocument()

    // Ô 5.5 cũng vậy, mốc gốc của nó là chỗ trống vì chưa ai đặt ngưỡng.
    const sla = screen.getByRole('group', { name: /^5\.5/ })
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
    const cats = await screen.findByRole('group', { name: /^5\.3/ })

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
    const channels = await screen.findByRole('group', { name: /^5\.7/ })

    // Nguồn tự nhiên không có đợt nào nên không bám vào kênh nào — sổ lead phải
    // cân, và chỗ chênh phải có tên chứ không để người xem tự cộng rồi ngờ bảng.
    const natural = SOURCES.filter((s) => s.kind === 'tu-nhien')
    const naturalLeads = natural.reduce((sum, s) => sum + s.leads, 0)

    expect(within(channels).getByText(`${naturalLeads} lead`)).toBeInTheDocument()
    expect(within(channels).getByText(`${natural.length} nguồn tự nhiên`)).toBeInTheDocument()

    // Và nói thẳng là chưa có thân mẫu nội dung, thay vì lặng lẽ bỏ nửa đặc tả.
    expect(channels.textContent ?? '').toMatch(/chưa có thân mẫu nào/)
  })
})
