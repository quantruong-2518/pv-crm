import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AuroraField } from '@pv/ui'
import type { Branch, Permission } from '@pv/engines'
import { RequireAccess } from '@/app/auth'

/** Bảng route của PV One.
 *
 *  Mỗi màn lazy-load riêng: theme kit (~1.200 dòng) không được nằm trong bundle
 *  của người dùng thật. Thêm màn mới = thêm một dòng vào SCREENS, không sửa
 *  chỗ nào khác — kể cả nav, vì nav đọc đường dẫn từ `app/chrome.tsx`.
 *
 *  Đường dẫn theo cấu trúc sản phẩm — One ở gốc, nhánh vệ tinh
 *  (Sales · Supply · Factory · Finance) nằm dưới tiền tố riêng.
 *
 *  HAI cửa, không phải một — và chúng trả lời hai câu khác hẳn nhau:
 *   · `branch`     → **công ty có mua nhánh này không** (license)
 *   · `permission` → **vai này có được vào màn này không**
 *
 *  Một Marketing và một Sale cùng đứng trong nhánh Sales đã mua, nhưng màn Cấu
 *  hình và màn Sổ cơ hội không mở cho cả hai như nhau. Gộp hai cửa làm một thì
 *  hoặc phải cấp license theo đầu người (sai mô hình thương mại), hoặc phải mở
 *  hết màn cho mọi người trong nhánh (sai mô hình quyền).
 *
 *   · `public` → không cần cửa nào (ba màn auth, theme kit)
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
  /** Quyền vai màn này đòi. Bỏ trống = có license là vào được.
   *
   *  Luôn là quyền `.xem` của miền tương ứng: đây là cửa VÀO MÀN. Quyền làm
   *  (`lead.giao`, `cấu-hình.đề-nghị`) hỏi ở chính cái nút bằng `useCan`, vì
   *  chặn cả màn chỉ vì người dùng không sửa được là lấy mất phần họ đọc được. */
  permission?: Permission
  /** Không cần đăng nhập. */
  public?: boolean
}

/** Sáu module Sales đều có màn thật — không còn mục nào trỏ vào màn "chưa
 *  dựng", nên `sales-pending` đã xoá cùng trường `blocked` của nav. */
export const SCREENS: ScreenDef[] = [
  { path: '/', name: 'Trang chủ · Morning brief', load: () => import('@/pages/home') },
  {
    path: '/sales/campaigns',
    name: 'Kinh doanh · Module 1 · Chiến dịch',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/campaigns'),
  },
  {
    /** Hồ sơ một chiến dịch. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì
     *  nó là một dòng của sổ, và nav vẫn sáng ở mục Chiến dịch. */
    path: '/sales/campaigns/:code',
    name: 'Kinh doanh · Module 1 · Hồ sơ chiến dịch',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/campaign-detail'),
  },
  {
    path: '/sales/leads',
    name: 'Kinh doanh · Module 2 · Sổ lead',
    branch: 'Sales',
    permission: 'lead.xem',
    load: () => import('@/pages/leads'),
  },
  {
    /** Hồ sơ một lead. Đường dẫn nằm DƯỚI sổ vì nó là một dòng của sổ — nav
     *  bên trái vẫn sáng ở mục Lead, không đẻ thêm mục thứ sáu cho nhánh. */
    path: '/sales/leads/:code',
    name: 'Kinh doanh · Module 2 · Hồ sơ lead',
    branch: 'Sales',
    permission: 'lead.xem',
    load: () => import('@/pages/lead-detail'),
  },
  {
    path: '/sales/ops',
    name: 'Kinh doanh · Module 3 · Sổ cơ hội',
    branch: 'Sales',
    permission: 'cơ-hội.xem',
    load: () => import('@/pages/ops'),
  },
  {
    /** Hồ sơ một cơ hội. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì nó
     *  là một dòng của sổ, và nav bên trái vẫn sáng ở mục Ops. */
    path: '/sales/ops/:code',
    name: 'Kinh doanh · Module 3 · Hồ sơ cơ hội',
    branch: 'Sales',
    permission: 'cơ-hội.xem',
    load: () => import('@/pages/ops-detail'),
  },
  {
    path: '/sales/performance',
    name: 'Kinh doanh · Module 4 · Performance',
    branch: 'Sales',
    permission: 'hiệu-suất.xem',
    load: () => import('@/pages/performance'),
  },
  {
    path: '/sales/plan',
    name: 'Kinh doanh · Module 5 · Số liệu & kế hoạch',
    branch: 'Sales',
    permission: 'kế-hoạch.xem',
    load: () => import('@/pages/plan'),
  },
  {
    path: '/sales/config',
    name: 'Kinh doanh · Module 6 · Cấu hình',
    branch: 'Sales',
    permission: 'cấu-hình.xem',
    load: () => import('@/pages/sales-config'),
  },
  /** Ba màn của luồng auth. Đều `public` — bắt đăng nhập để vào được màn quên
   *  mật khẩu thì không còn ai vào được nó. Là BA đường dẫn chứ không phải ba
   *  trạng thái của một màn, vì link đặt lại trong mail phải có URL riêng và nút
   *  Back của trình duyệt phải lùi đúng một bước. */
  { path: '/dang-nhap', name: 'Đăng nhập', public: true, load: () => import('@/pages/sign-in') },
  {
    path: '/quen-mat-khau',
    name: 'Quên mật khẩu',
    public: true,
    load: () => import('@/pages/forgot-password'),
  },
  {
    path: '/dat-lai-mat-khau',
    name: 'Đặt mật khẩu mới',
    public: true,
    load: () => import('@/pages/reset-password'),
  },
  { path: '/kit', name: 'Theme kit sống', public: true, load: () => import('@/kit/theme-kit') },
]

export const router = createBrowserRouter(
  SCREENS.map(({ path, load, branch, permission, public: isPublic }) => ({
    path,
    element: isPublic ? (
      withFallback(load)
    ) : (
      <RequireAccess branch={branch ?? null} permission={permission}>
        {withFallback(load)}
      </RequireAccess>
    ),
  })),
)
