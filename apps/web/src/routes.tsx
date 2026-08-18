import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AuroraField } from '@pv/ui'
import type { Branch } from '@pv/engines'
import { RequireAccess } from '@/app/guard'

/** Bảng route của PV One.
 *
 *  Mỗi màn lazy-load riêng: theme kit (~1.200 dòng) không được nằm trong bundle
 *  của người dùng thật. Thêm màn mới = thêm một dòng vào SCREENS, không sửa
 *  chỗ nào khác — kể cả nav, vì nav đọc đường dẫn từ `app/chrome.tsx`.
 *
 *  Đường dẫn theo cấu trúc sản phẩm ở docs/kien-truc-san-pham.md — One ở gốc, nhánh vệ tinh
 *  (Sales · Supply · Factory · Finance) nằm dưới tiền tố riêng.
 *
 *  `branch` là cửa license của màn:
 *   · `null`      → One Core, chỉ cần đăng nhập
 *   · một `Branch`→ phải có nhánh đó mới vào được
 *   · `public`    → không cần gì (màn chọn vai, theme kit)
 *
 *  Guard bọc NGOÀI `Suspense`: chưa có quyền thì không tải chunk của màn về
 *  máy làm gì. */
const withFallback = (load: () => Promise<{ default: ComponentType }>) => {
  const Screen = lazy(load)
  return (
    <Suspense fallback={<AuroraField>{null}</AuroraField>}>
      <Screen />
    </Suspense>
  )
}

type ScreenDef = {
  path: string
  name: string
  load: () => Promise<{ default: ComponentType }>
  /** Nhánh cần license; bỏ trống = One Core. */
  branch?: Branch
  /** Không cần đăng nhập. */
  public?: boolean
}

/** Bốn module Sales đều có route từ đầu — nav phải trỏ đi đâu đó thật, không
 *  được có nút chết. Ba module chưa dựng dùng chung `sales-pending`, màn đó đọc
 *  `SALES_MODULES` để nói đúng thứ đang vướng. Dựng xong module nào thì đổi
 *  `load` của nó sang màn thật, nav không phải sửa. */
export const SCREENS: ScreenDef[] = [
  { path: '/', name: 'Trang chủ · Morning brief', load: () => import('@/pages/home') },
  {
    path: '/sales/market',
    name: 'Kinh doanh · Module 1 · Thị trường',
    branch: 'Sales',
    load: () => import('@/pages/sales-pending'),
  },
  {
    path: '/sales/leads',
    name: 'Kinh doanh · Module 2 · Sổ lead',
    branch: 'Sales',
    load: () => import('@/pages/leads'),
  },
  {
    path: '/sales/performance',
    name: 'Kinh doanh · Module 3 · Performance',
    branch: 'Sales',
    load: () => import('@/pages/sales-pending'),
  },
  {
    path: '/sales/plan',
    name: 'Kinh doanh · Module 4 · Số liệu & kế hoạch',
    branch: 'Sales',
    load: () => import('@/pages/sales-pending'),
  },
  { path: '/dang-nhap', name: 'Chọn vai', public: true, load: () => import('@/pages/sign-in') },
  { path: '/kit', name: 'Theme kit sống', public: true, load: () => import('@/kit/theme-kit') },
]

export const router = createBrowserRouter(
  SCREENS.map(({ path, load, branch, public: isPublic }) => ({
    path,
    element: isPublic ? (
      withFallback(load)
    ) : (
      <RequireAccess branch={branch ?? null}>{withFallback(load)}</RequireAccess>
    ),
  })),
)
