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

/** Năm module Sales đều có màn thật từ 19/08 — không còn mục nào trỏ vào màn
 *  "chưa dựng", nên `sales-pending` đã xoá cùng trường `blocked` của nav. */
export const SCREENS: ScreenDef[] = [
  { path: '/', name: 'Trang chủ · Morning brief', load: () => import('@/pages/home') },
  {
    path: '/sales/campaigns',
    name: 'Kinh doanh · Module 1 · Chiến dịch & Sự kiện',
    branch: 'Sales',
    load: () => import('@/pages/campaigns'),
  },
  {
    /** Kho danh sách prospect + luồng nhập năm bước. Đoạn TĨNH nên phải đứng
     *  TRƯỚC `:code` — dữ liệu router xếp hạng theo độ cụ thể nên nó thắng dù
     *  đứng đâu, nhưng ai đó đổi sang `Routes` thủ công thì thứ tự thành
     *  load-bearing và "kho-danh-sach" sẽ bị nuốt thành một mã nguồn. */
    path: '/sales/campaigns/kho-danh-sach',
    name: 'Kinh doanh · Module 1 · Kho danh sách',
    branch: 'Sales',
    load: () => import('@/pages/prospect-lists'),
  },
  {
    /** Hồ sơ một nguồn. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì nó
     *  là một dòng của sổ, và nav vẫn sáng ở mục Chiến dịch & Sự kiện. */
    path: '/sales/campaigns/:code',
    name: 'Kinh doanh · Module 1 · Hồ sơ nguồn',
    branch: 'Sales',
    load: () => import('@/pages/campaign-detail'),
  },
  {
    path: '/sales/leads',
    name: 'Kinh doanh · Module 2 · Sổ lead',
    branch: 'Sales',
    load: () => import('@/pages/leads'),
  },
  {
    /** Hồ sơ một lead. Đường dẫn nằm DƯỚI sổ vì nó là một dòng của sổ — nav
     *  bên trái vẫn sáng ở mục Lead, không đẻ thêm mục thứ sáu cho nhánh. */
    path: '/sales/leads/:code',
    name: 'Kinh doanh · Module 2 · Hồ sơ lead',
    branch: 'Sales',
    load: () => import('@/pages/lead-detail'),
  },
  {
    path: '/sales/performance',
    name: 'Kinh doanh · Module 3 · Performance',
    branch: 'Sales',
    load: () => import('@/pages/performance'),
  },
  {
    path: '/sales/plan',
    name: 'Kinh doanh · Module 4 · Số liệu & kế hoạch',
    branch: 'Sales',
    load: () => import('@/pages/plan'),
  },
  {
    path: '/sales/config',
    name: 'Kinh doanh · Module 5 · Cấu hình',
    branch: 'Sales',
    load: () => import('@/pages/sales-config'),
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
