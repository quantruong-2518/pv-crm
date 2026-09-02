import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, matchPath } from 'react-router-dom'
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
    /** One Core · Quản trị — the `platform.actor` people book.
     *
     *  NO `branch`, and that absence is the load-bearing half of this entry: the
     *  people book belongs to no product line (Sales reads it, Supply will read
     *  it), so hanging it off a Sales licence would shut the open-an-account
     *  screen for a company that bought only Supply — and the person shut out is
     *  the one who opens accounts for everybody else.
     *
     *  `permission` is present, and it is NOT a `.xem` permission like the eight
     *  branch screens below. `người-dùng.quản-lý` is the widest key in the
     *  matrix: whoever reaches this screen can edit their own `roleId` and
     *  thereby grant themselves every other permission. So there is deliberately
     *  no "read the people book" gate separate from "write the people book" —
     *  splitting them would build a door whose far side is the whole matrix. */
    path: '/quan-tri/nguoi-dung',
    name: 'One Core · Quản trị · Người dùng',
    permission: 'người-dùng.quản-lý',
    load: () => import('@/pages/users'),
  },
  {
    /** BA SỔ, MỘT TIỀN TỐ — và thứ tự khai ở đây không quyết định gì.
     *
     *  React Router xếp hạng route theo độ cụ thể chứ không theo thứ tự mảng,
     *  nên `/sales/campaigns/nguon-dan` (đoạn tĩnh) luôn thắng
     *  `/sales/campaigns/:code` (đoạn động) dù đứng sau nó. Ba sổ đứng chung
     *  một tiền tố vì `useAppChrome` sáng mục nav bằng `inModule()`, tức khớp
     *  theo tiền tố: tách Nguồn dẫn ra `/sales/sources` là làm mục nav tắt
     *  ngóm đúng lúc người dùng đang đứng trên nó, hoặc phải đẻ module thứ 7
     *  cho một sổ vốn thuộc module 1. Xem `components/module1-books.tsx`. */
    path: '/sales/campaigns',
    name: 'Kinh doanh · Module 1 · Sổ chiến dịch',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/campaigns'),
  },
  {
    /** Sổ NGUỒN DẪN — `SR-nn`, nơi lead SINH RA. Đây là màn từng đứng ở
     *  `/sales/campaigns` cho tới 29/08; nó nhường chỗ cho `sales.campaign`
     *  thật (`CP-nnnn`, đơn vị GỬI) theo quyết định D2 ngày 28/08. Hai bảng,
     *  hai định nghĩa đối lập, không hợp nhất được. */
    path: '/sales/campaigns/nguon-dan',
    name: 'Kinh doanh · Module 1 · Nguồn dẫn',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/sources'),
  },
  {
    path: '/sales/campaigns/nguon-dan/:code',
    name: 'Kinh doanh · Module 1 · Hồ sơ nguồn dẫn',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/source-detail'),
  },
  {
    /** Sổ LÔ GỬI — `platform.mail_run`, mọi lô thư kể cả lô đi lẻ từ Sổ lead.
     *  `chiến-dịch.xem` để đọc, `chiến-dịch.bắn` để dừng một lô; cửa thứ hai
     *  gác ở `data/mail-runs.ts`, không gác ở đây. */
    path: '/sales/campaigns/lo-gui',
    name: 'Kinh doanh · Module 1 · Sổ lô gửi',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/mail-runs'),
  },
  {
    /** Tạo chiến dịch — đoạn tĩnh `moi`, đứng TRƯỚC `:code` trong mảng nhưng
     *  thứ tự đó không quyết định gì (React Router xếp theo độ cụ thể, đúng
     *  lý do `nguon-dan` ở trên thắng `:code`). Cùng file `campaign-form.tsx`
     *  với hai route dưới — ba cửa vào MỘT khung, xem docblock đầu file đó. */
    path: '/sales/campaigns/moi',
    name: 'Kinh doanh · Module 1 · Chiến dịch mới',
    branch: 'Sales',
    /* Write permission, not read — this route and `:code/sua` below only exist
       to WRITE. Reading was the wrong gate: a Sale opened the form, filled all
       four steps, and ate a 403 on the last click. Refuse at the door. */
    permission: 'chiến-dịch.sửa',
    load: () => import('@/pages/campaign-form').then((m) => ({ default: m.CampaignCreatePage })),
  },
  {
    /** Sửa hồ sơ một chiến dịch — cùng khung với hồ sơ, mở thẳng vào bước Hồ
     *  sơ thay vì bước Tổng quan. */
    path: '/sales/campaigns/:code/sua',
    name: 'Kinh doanh · Module 1 · Sửa chiến dịch',
    branch: 'Sales',
    permission: 'chiến-dịch.sửa',
    load: () => import('@/pages/campaign-form').then((m) => ({ default: m.CampaignEditPage })),
  },
  {
    /** Hồ sơ một chiến dịch. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì
     *  nó là một dòng của sổ, và nav vẫn sáng ở mục Chiến dịch. */
    path: '/sales/campaigns/:code',
    name: 'Kinh doanh · Module 1 · Hồ sơ chiến dịch',
    branch: 'Sales',
    permission: 'chiến-dịch.xem',
    load: () => import('@/pages/campaign-form').then((m) => ({ default: m.CampaignViewPage })),
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
    path: '/sales/opportunities',
    name: 'Kinh doanh · Module 3 · Sổ cơ hội',
    branch: 'Sales',
    permission: 'cơ-hội.xem',
    load: () => import('@/pages/opportunities'),
  },
  {
    /** Hồ sơ một cơ hội. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì nó
     *  là một dòng của sổ, và nav bên trái vẫn sáng ở mục Ops. */
    path: '/sales/opportunities/:code',
    name: 'Kinh doanh · Module 3 · Hồ sơ cơ hội',
    branch: 'Sales',
    permission: 'cơ-hội.xem',
    load: () => import('@/pages/opportunity-detail'),
  },
  {
    path: '/sales/contracts',
    name: 'Kinh doanh · Module 4 · Hợp đồng',
    branch: 'Sales',
    permission: 'hợp-đồng.xem',
    load: () => import('@/pages/contracts'),
  },
  {
    /* Same shape as the lead and opportunity books: a contract is a row of the
       book, so its path sits under it and the nav stays lit on the same entry. */
    path: '/sales/contracts/:code',
    name: 'Kinh doanh · Module 4 · Hồ sơ hợp đồng',
    branch: 'Sales',
    permission: 'hợp-đồng.xem',
    load: () => import('@/pages/contract-detail'),
  },
  {
    /* One level deeper than any other Sales screen, and it earns the depth: an
       installment carries its own checklist, paperwork, chase log and notes, and
       none of that fits beside three sibling installments on one page. */
    path: '/sales/contracts/:code/dot/:no',
    name: 'Kinh doanh · Module 4 · Đợt thanh toán',
    branch: 'Sales',
    permission: 'hợp-đồng.xem',
    load: () => import('@/pages/installment-detail'),
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

/** Head metadata per screen — SCREENS already carries a human name, index.html
 *  otherwise leaves every route stuck on the same static title/description/
 *  og/twitter tags (a link preview for a specific lead's URL shared in Slack
 *  would just read "PV One · Pebble Vina" like every other route). Lives on
 *  the router itself (not a component) because `router.subscribe` covers
 *  every navigation without adding a sync component to each screen. Site
 *  stays `noindex` (see index.html) — this is for internal link previews,
 *  not search engines. */
const setMetaContent = (selector: string, content: string) => {
  document.querySelector(selector)?.setAttribute('content', content)
}

const syncHeadMetadata = (pathname: string) => {
  const screen = SCREENS.find((s) => matchPath({ path: s.path, end: true }, pathname))
  const title = screen ? `${screen.name} · PV One` : 'PV One · Pebble Vina'
  const description = screen
    ? `${screen.name} — Hệ thống CRM của Pebble Vina.`
    : 'PV One — Hệ thống CRM của Pebble Vina.'

  document.title = title
  setMetaContent('meta[name="description"]', description)
  setMetaContent('meta[property="og:title"]', title)
  setMetaContent('meta[property="og:description"]', description)
  setMetaContent('meta[name="twitter:title"]', title)
  setMetaContent('meta[name="twitter:description"]', description)
}
syncHeadMetadata(router.state.location.pathname)
router.subscribe((state) => syncHeadMetadata(state.location.pathname))
