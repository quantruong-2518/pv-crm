import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { RequireAccess } from './guard'
import { access, useSession } from './session'

/** Guard là chỗ dễ sai theo kiểu không ai thấy: sai một chiều thì lọt người
 *  không có quyền, sai chiều kia thì đá người có quyền ra ngoài. Ba ca dưới
 *  khoá cả ba nhánh của nó. */

function renderAt(path: string, branch: 'Sales' | 'Supply') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dang-nhap" element={<p>màn chọn vai</p>} />
        <Route
          path={path}
          element={
            <RequireAccess branch={branch}>
              <p>nội dung màn</p>
            </RequireAccess>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const ha = dasVina.actors.find((a) => a.id === 'u-ha')!

describe('RequireAccess', () => {
  it('chưa đăng nhập thì đá về màn chọn vai', () => {
    useSession.setState({ actor: null })

    renderAt('/sales/leads', 'Sales')

    expect(screen.getByText('màn chọn vai')).toBeInTheDocument()
    expect(screen.queryByText('nội dung màn')).not.toBeInTheDocument()
  })

  it('đăng nhập rồi nhưng thiếu nhánh thì KHÔNG đá đi đâu, hiện lý do thật', () => {
    useSession.setState({ actor: ha })

    renderAt('/supply/kho', 'Supply')

    expect(screen.getByText('Bị ẩn theo quyền của bạn')).toBeInTheDocument()
    // Đá về màn login lúc này là nói dối nguyên nhân — người dùng sẽ đăng nhập vòng vo.
    expect(screen.queryByText('màn chọn vai')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xin quyền' })).toBeInTheDocument()
  })

  it('ghi vết mọi lần chặn — không có vết thì sau này không ai giải thích được', () => {
    useSession.setState({ actor: ha })

    renderAt('/supply/kho', 'Supply')

    const blocked = access.trail().filter((e) => e.note?.startsWith('chặn vào /supply/kho'))
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked[0]?.actorId).toBe('u-ha')
  })

  it('đủ nhánh thì cho vào', () => {
    useSession.setState({ actor: ha })

    renderAt('/sales/leads', 'Sales')

    expect(screen.getByText('nội dung màn')).toBeInTheDocument()
  })
})
