import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { useSession } from '@/app/session'

/** Dựng một màn trong test với đúng ba thứ màn thật có: router, query client,
 *  và một phiên đăng nhập.
 *
 *  Mỗi lần gọi tạo `QueryClient` MỚI — dùng chung một client giữa các ca test
 *  thì cache của ca trước rò sang ca sau và test đỏ theo thứ tự chạy. */
export function renderScreen(ui: ReactElement, opts: { actorId?: string; route?: string } = {}) {
  const actor = dasVina.actors.find((a) => a.id === (opts.actorId ?? 'u-ha'))
  if (!actor) throw new Error(`Không có vai ${opts.actorId} trong kịch bản`)

  useSession.setState({ actor })

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[opts.route ?? '/']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
