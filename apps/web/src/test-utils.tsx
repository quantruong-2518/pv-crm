import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { dasVina } from '@pv/engines/fixtures/das-vina'
import { useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/session'

/** Dựng một màn trong test với đúng ba thứ màn thật có: router, query client,
 *  và một phiên đăng nhập.
 *
 *  Mỗi lần gọi tạo `QueryClient` MỚI — dùng chung một client giữa các ca test
 *  thì cache của ca trước rò sang ca sau và test đỏ theo thứ tự chạy. Cùng lý
 *  do, bàn làm việc (`app/desk.ts`) bị dọn: nó `persist` vào localStorage nên
 *  ghim của ca trước sẽ hiện lại ở ca sau. */
type Opts = {
  actorId?: string
  route?: string
}

function wrap(children: ReactNode, route: string) {
  const actorId = useSession.getState().actor?.id
  if (!actorId) throw new Error('renderScreen: chưa đặt phiên đăng nhập')

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function signIn(actorId = 'u-ha') {
  const actor = dasVina.actors.find((a) => a.id === actorId)
  if (!actor) throw new Error(`Không có vai ${actorId} trong kịch bản`)
  useSession.setState({ actor })
  useLeadDesk.getState().reset()
}

export function renderScreen(ui: ReactElement, opts: Opts = {}) {
  signIn(opts.actorId)
  return wrap(ui, opts.route ?? '/')
}

/** Dựng một màn CÓ đường dẫn thật — cần cho màn đọc `useParams`, và cho màn
 *  điều hướng sang màn khác (bấm một dòng sổ lead phải mở được hồ sơ lead).
 *
 *  Mỗi mục là `path → element`; `route` là đường đang đứng. */
export function renderRoutes(
  screens: { path: string; element: ReactElement }[],
  opts: Opts & { route: string },
) {
  signIn(opts.actorId)
  return wrap(
    <Routes>
      {screens.map((s) => (
        <Route key={s.path} path={s.path} element={s.element} />
      ))}
    </Routes>,
    opts.route,
  )
}
