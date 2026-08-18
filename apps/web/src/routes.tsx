import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AuroraField } from '@pv/ui'

/** Bảng route của PV One.
 *
 *  Mỗi màn lazy-load riêng: theme kit (~1.200 dòng) không được nằm trong bundle
 *  của người dùng thật. Thêm màn mới = thêm một dòng vào SCREENS, không sửa
 *  chỗ nào khác.
 *
 *  Đường dẫn theo cấu trúc sản phẩm ở CLAUDE.md — One ở gốc, nhánh vệ tinh
 *  (Sales · Supply · Factory · Finance) nằm dưới tiền tố riêng. */

const withFallback = (load: () => Promise<{ default: ComponentType }>) => {
  const Screen = lazy(load)
  return (
    <Suspense fallback={<AuroraField>{null}</AuroraField>}>
      <Screen />
    </Suspense>
  )
}

export const SCREENS = [
  { path: '/', name: 'Trang chủ · Morning brief', load: () => import('@/pages/home') },
  { path: '/kit', name: 'Theme kit sống', load: () => import('@/kit/theme-kit') },
] as const

export const router = createBrowserRouter(
  SCREENS.map(({ path, load }) => ({ path, element: withFallback(load) })),
)
