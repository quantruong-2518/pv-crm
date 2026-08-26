import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './page-header'
import { InsetPanel } from './inset-panel'

/** Ba điều PageHeader hứa mà mắt người review khó bắt: tiêu đề là h1 (không
 *  phải h2 như chín bản chép tay), rail đứng thành HÀNG RIÊNG chứ không lẫn vào
 *  cụm nút, và lối về sổ gọi đúng `onBack`. */
describe('PageHeader', () => {
  it('tiêu đề màn là h1 — mỗi màn đúng một tiêu đề cấp một', () => {
    render(<PageHeader title="Sổ lead" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sổ lead')
  })

  it('rail nằm ngoài cụm nút, không phải anh em cùng hàng với actions', () => {
    render(
      <PageHeader
        title="Chiến dịch & Sự kiện"
        rail={<div data-testid="rail">CD-0101</div>}
        actions={<button data-testid="nut">Chiến dịch mới</button>}
      />,
    )
    const rail = screen.getByTestId('rail')
    const nut = screen.getByTestId('nut')
    expect(rail.parentElement).not.toBe(nut.parentElement)
  })

  it('lối về sổ gọi onBack', async () => {
    const onBack = vi.fn()
    render(<PageHeader title="Hồ sơ nguồn" back={{ label: 'Sổ nguồn', onBack }} />)
    screen.getByRole('button', { name: 'Sổ nguồn' }).click()
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('InsetPanel', () => {
  it('không vẽ mặt kính — không class glass nào (luật 12)', () => {
    const { container } = render(<InsetPanel>ô lồng</InsetPanel>)
    const panel = container.firstElementChild as HTMLElement
    expect(panel.className).not.toMatch(/glass/)
    expect(panel.className).toContain('p-4')
  })

  it('pad sm là p-3 — bậc đệm của ô lồng cấp hai', () => {
    const { container } = render(<InsetPanel pad="sm">ô lồng</InsetPanel>)
    expect((container.firstElementChild as HTMLElement).className).toContain('p-3')
  })
})
