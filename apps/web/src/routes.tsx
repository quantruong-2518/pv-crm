import { lazy, Suspense, type ComponentType } from 'react'
import {
  createBrowserRouter,
  generatePath,
  matchPath,
  Navigate,
  useLocation,
  useParams,
} from 'react-router-dom'
import { AuroraField } from '@pv/ui'
import type { Branch, Permission } from '@pv/engines'
import { CHANGE_PASSWORD_PATH, RequireAccess } from '@/app/auth'
import { isParked } from '@/app/parked'

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
   *  (`lead.assign`, `config.propose`) hỏi ở chính cái nút bằng `useCan`, vì
   *  chặn cả màn chỉ vì người dùng không sửa được là lấy mất phần họ đọc được. */
  permission?: Permission
  /** Không cần đăng nhập. */
  public?: boolean
}

/** Sáu module Sales đều có màn thật — không còn mục nào trỏ vào màn "chưa
 *  dựng", nên `sales-pending` đã xoá cùng trường `blocked` của nav. */
export const SCREENS: ScreenDef[] = [
  { path: '/', name: 'Trang chủ · Tổng quan', load: () => import('@/pages/home') },
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
     *  branch screens below. `user.manage` is the widest key in the
     *  matrix: whoever reaches this screen can edit their own `roleId` and
     *  thereby grant themselves every other permission. So there is deliberately
     *  no "read the people book" gate separate from "write the people book" —
     *  splitting them would build a door whose far side is the whole matrix. */
    path: '/admin/users',
    name: 'One Core · Quản trị · Người dùng',
    permission: 'user.manage',
    load: () => import('@/pages/users'),
  },
  {
    /** One Core · the approval inbox — E3's queue, pipeline #10.
     *
     *  NO `branch`, like the two admin screens below it and for the same
     *  reason: nine of the eleven pipelines end at somebody saying yes, so an
     *  inbox hung off a Sales licence would hide a purchase approval from a
     *  company that bought only Supply.
     *
     *  NO `permission` either, and that is the deliberate half. The list is cut
     *  by the approval chain itself — it names the person waited on — so a
     *  reader who approves nothing opens an empty screen rather than a refusal.
     *  `approval.decide` gates the two BUTTONS, at the door that actually
     *  changes something, exactly where the server puts it. */
    path: '/approvals',
    name: 'One Core · Hộp duyệt',
    load: () => import('@/pages/approvals'),
  },
  {
    /** One Core · Admin · Roles — the `platform.role_permission` matrix.
     *
     *  NO `branch`, for the reason the entry above gives: the matrix belongs to
     *  no product line, and a licence axis here would shut the screen that says
     *  who may do what for a company that bought only Supply.
     *
     *  `role.manage` rather than `user.manage`, and the two are deliberately
     *  not one key: that one answers "who gets into the system", this one
     *  answers "and what may they do once in". Both are as wide as the matrix
     *  itself — whoever reaches this screen can grant themselves every other
     *  permission — so, again, there is no separate read gate. */
    path: '/admin/roles',
    name: 'One Core · Quản trị · Vai trò',
    permission: 'role.manage',
    load: () => import('@/pages/roles'),
  },
  {
    /** BA SỔ, MỘT TIỀN TỐ — và thứ tự khai ở đây không quyết định gì.
     *
     *  React Router xếp hạng route theo độ cụ thể chứ không theo thứ tự mảng,
     *  nên `/sales/campaigns/sources` (đoạn tĩnh) luôn thắng
     *  `/sales/campaigns/:code` (đoạn động) dù đứng sau nó. Ba sổ đứng chung
     *  một tiền tố vì `useAppChrome` sáng mục nav bằng `inModule()`, tức khớp
     *  theo tiền tố: tách Nguồn dẫn ra `/sales/sources` là làm mục nav tắt
     *  ngóm đúng lúc người dùng đang đứng trên nó, hoặc phải đẻ module thứ 7
     *  cho một sổ vốn thuộc module 1. Xem `components/module1-books.tsx`. */
    path: '/sales/campaigns',
    name: 'Kinh doanh · Module 1 · Sổ chiến dịch',
    branch: 'Sales',
    permission: 'campaign.view',
    load: () => import('@/pages/campaigns'),
  },
  {
    /** Sổ NGUỒN DẪN — `SR-nn`, nơi lead SINH RA. Đây là màn từng đứng ở
     *  `/sales/campaigns` cho tới 29/08; nó nhường chỗ cho `sales.campaign`
     *  thật (`CP-nnnn`, đơn vị GỬI) theo quyết định D2 ngày 28/08. Hai bảng,
     *  hai định nghĩa đối lập, không hợp nhất được. */
    path: '/sales/campaigns/sources',
    name: 'Kinh doanh · Module 1 · Nguồn dẫn',
    branch: 'Sales',
    permission: 'campaign.view',
    load: () => import('@/pages/sources'),
  },
  {
    path: '/sales/campaigns/sources/:code',
    name: 'Kinh doanh · Module 1 · Hồ sơ nguồn dẫn',
    branch: 'Sales',
    permission: 'campaign.view',
    load: () => import('@/pages/source-detail'),
  },
  {
    /** Sổ LÔ GỬI — `platform.mail_run`, mọi lô thư kể cả lô đi lẻ từ Sổ lead.
     *  `campaign.view` để đọc, `campaign.broadcast` để dừng một lô; cửa thứ hai
     *  gác ở `data/mail-runs.ts`, không gác ở đây. */
    path: '/sales/campaigns/mail-runs',
    name: 'Kinh doanh · Module 1 · Sổ lô gửi',
    branch: 'Sales',
    permission: 'campaign.view',
    load: () => import('@/pages/mail-runs'),
  },
  {
    /** The MAIL-TEMPLATE book — `sales.mail_template`, the copy library that
     *  marketing edits itself. Read with the view permission, write with the
     *  edit one; the second gate lives in `data/mas.ts` and on the buttons, not
     *  here — reading this screen is useful to a view-only role too, because it
     *  answers what our letters currently say. */
    path: '/sales/campaigns/mail-templates',
    name: 'Kinh doanh · Module 1 · Sổ mẫu thư',
    branch: 'Sales',
    permission: 'campaign.view',
    load: () => import('@/pages/mail-templates'),
  },
  {
    /** Tạo chiến dịch — đoạn tĩnh `moi`, đứng TRƯỚC `:code` trong mảng nhưng
     *  thứ tự đó không quyết định gì (React Router xếp theo độ cụ thể, đúng
     *  lý do `sources` ở trên thắng `:code`). Cùng file `campaign-form.tsx`
     *  với hai route dưới — ba cửa vào MỘT khung, xem docblock đầu file đó. */
    path: '/sales/campaigns/new',
    name: 'Kinh doanh · Module 1 · Chiến dịch mới',
    branch: 'Sales',
    /* Write permission, not read — this route and `:code/edit` below only exist
       to WRITE. Reading was the wrong gate: a Sale opened the form, filled all
       four steps, and ate a 403 on the last click. Refuse at the door. */
    permission: 'campaign.edit',
    load: () => import('@/pages/campaign-form').then((m) => ({ default: m.CampaignCreatePage })),
  },
  {
    /** Sửa hồ sơ một chiến dịch — cùng khung với hồ sơ, mở thẳng vào bước Hồ
     *  sơ thay vì bước Tổng quan. */
    path: '/sales/campaigns/:code/edit',
    name: 'Kinh doanh · Module 1 · Sửa chiến dịch',
    branch: 'Sales',
    permission: 'campaign.edit',
    load: () => import('@/pages/campaign-form').then((m) => ({ default: m.CampaignEditPage })),
  },
  {
    /** Hồ sơ một chiến dịch. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì
     *  nó là một dòng của sổ, và nav vẫn sáng ở mục Chiến dịch. */
    path: '/sales/campaigns/:code',
    name: 'Kinh doanh · Module 1 · Hồ sơ chiến dịch',
    branch: 'Sales',
    permission: 'campaign.view',
    load: () => import('@/pages/campaign-form').then((m) => ({ default: m.CampaignViewPage })),
  },
  {
    path: '/sales/leads',
    name: 'Kinh doanh · Module 2 · Sổ lead',
    branch: 'Sales',
    permission: 'lead.view',
    load: () => import('@/pages/leads'),
  },
  {
    /** Typing a lead by hand — static segment `new`, placed BEFORE `:code` in
     *  the array, but that order decides nothing (React Router ranks by
     *  specificity, the same reason `/sales/campaigns/new` above wins over
     *  `:code`). */
    path: '/sales/leads/new',
    name: 'Kinh doanh · Module 2 · Lead mới',
    branch: 'Sales',
    /* Write permission, not read — same reason as campaign.edit above: this
       route only exists to write, so refuse at the door, not after 30 fields. */
    permission: 'lead.edit',
    load: () => import('@/pages/lead-new'),
  },
  {
    /** Hồ sơ một lead. Đường dẫn nằm DƯỚI sổ vì nó là một dòng của sổ — nav
     *  bên trái vẫn sáng ở mục Lead, không đẻ thêm mục thứ sáu cho nhánh. */
    path: '/sales/leads/:code',
    name: 'Kinh doanh · Module 2 · Hồ sơ lead',
    branch: 'Sales',
    permission: 'lead.view',
    load: () => import('@/pages/lead-detail'),
  },
  {
    /** THE CUSTOMER COMPANY BOOK — a permission domain of its own, not borrowed
     *  from the lead book.
     *
     *  The company-book read permission rather than the lead one, and that
     *  difference is the whole reason the domain exists: a company stands ABOVE
     *  the lead book and outlives every enquiry, so editing it changes what
     *  every lead, deal and contract underneath is about. Full reasoning sits
     *  where the permission is declared in `packages/engines/src/e2-access.ts`.
     *
     *  The CONTACT book is the opposite, deliberately: it runs on the lead
     *  read/write pair, because a contact is part of ONE lead's profile. */
    path: '/sales/accounts',
    name: 'Kinh doanh · Khách hàng · Sổ công ty',
    branch: 'Sales',
    permission: 'account.view',
    load: () => import('@/pages/accounts'),
  },
  {
    path: '/sales/accounts/:code',
    name: 'Kinh doanh · Khách hàng · Hồ sơ công ty',
    branch: 'Sales',
    permission: 'account.view',
    load: () => import('@/pages/account-detail'),
  },
  {
    /** THE CONTACT BOOK — the lead read permission, NOT the company one.
     *
     *  Two screens side by side, two different permissions, and the difference
     *  is deliberate: a company is a fact about the market, so the company book
     *  is open to the whole department; a person with a name and a phone number
     *  is a fact about ONE PERSON'S customer, so this book runs on the lead's
     *  permission and is cut by the lead's scope axis. */
    path: '/sales/contacts',
    name: 'Kinh doanh · Khách hàng · Sổ người liên hệ',
    branch: 'Sales',
    permission: 'lead.view',
    load: () => import('@/pages/contacts'),
  },
  {
    path: '/sales/contacts/:code',
    name: 'Kinh doanh · Khách hàng · Hồ sơ người liên hệ',
    branch: 'Sales',
    permission: 'lead.view',
    load: () => import('@/pages/contact-detail'),
  },
  {
    path: '/sales/opportunities',
    name: 'Kinh doanh · Module 3 · Sổ cơ hội',
    branch: 'Sales',
    permission: 'opportunity.view',
    load: () => import('@/pages/opportunities'),
  },
  {
    /** Typing a deal by hand — the same door `/sales/leads/new` opens, and it
     *  reaches the same form card `:code` draws.
     *
     *  Write permission, not read: this route exists only to write, so refuse
     *  at the door rather than after fourteen fields. The lead the deal grows
     *  out of arrives as `?lead=`; without one the screen asks for it first,
     *  because `POST /sales/opportunities` carries a foreign key. */
    path: '/sales/opportunities/new',
    name: 'Kinh doanh · Module 3 · Cơ hội mới',
    branch: 'Sales',
    permission: 'opportunity.edit',
    load: () => import('@/pages/opportunity-new'),
  },
  {
    /** Hồ sơ một cơ hội. Cùng hình với hồ sơ lead: đường dẫn nằm DƯỚI sổ vì nó
     *  là một dòng của sổ, và nav bên trái vẫn sáng ở mục Ops. */
    path: '/sales/opportunities/:code',
    name: 'Kinh doanh · Module 3 · Hồ sơ cơ hội',
    branch: 'Sales',
    permission: 'opportunity.view',
    load: () => import('@/pages/opportunity-detail'),
  },
  {
    path: '/sales/workstreams',
    name: 'Kinh doanh · Hành trình khách hàng · Sổ hành trình',
    branch: 'Sales',
    permission: 'workstream.view',
    load: () => import('@/pages/workstreams'),
  },
  {
    path: '/sales/workstreams/:code',
    name: 'Kinh doanh · Hành trình khách hàng · Hồ sơ hành trình',
    branch: 'Sales',
    permission: 'workstream.view',
    load: () => import('@/pages/workstream-detail'),
  },
  {
    path: '/sales/contracts',
    name: 'Kinh doanh · Module 4 · Hợp đồng',
    branch: 'Sales',
    permission: 'contract.view',
    load: () => import('@/pages/contracts'),
  },
  {
    /* Same shape as the lead and opportunity books: a contract is a row of the
       book, so its path sits under it and the nav stays lit on the same entry. */
    path: '/sales/contracts/:code',
    name: 'Kinh doanh · Module 4 · Hồ sơ hợp đồng',
    branch: 'Sales',
    permission: 'contract.view',
    load: () => import('@/pages/contract-detail'),
  },
  {
    /* One level deeper than any other Sales screen, and it earns the depth: an
       installment carries its own checklist, paperwork, chase log and notes, and
       none of that fits beside three sibling installments on one page. */
    path: '/sales/contracts/:code/installments/:no',
    name: 'Kinh doanh · Module 4 · Đợt thanh toán',
    branch: 'Sales',
    permission: 'contract.view',
    load: () => import('@/pages/installment-detail'),
  },
  {
    path: '/sales/performance',
    name: 'Kinh doanh · Module 4 · Performance',
    branch: 'Sales',
    permission: 'performance.view',
    load: () => import('@/pages/performance'),
  },
  {
    path: '/sales/plan',
    name: 'Kinh doanh · Module 5 · Số liệu & kế hoạch',
    branch: 'Sales',
    permission: 'plan.view',
    load: () => import('@/pages/plan'),
  },
  {
    path: '/sales/config',
    name: 'Kinh doanh · Module 6 · Cấu hình',
    branch: 'Sales',
    permission: 'config.view',
    load: () => import('@/pages/sales-config'),
  },
  /** Ba màn của luồng auth. Đều `public` — bắt đăng nhập để vào được màn quên
   *  mật khẩu thì không còn ai vào được nó. Là BA đường dẫn chứ không phải ba
   *  trạng thái của một màn, vì link đặt lại trong mail phải có URL riêng và nút
   *  Back của trình duyệt phải lùi đúng một bước. */
  { path: '/sign-in', name: 'Đăng nhập', public: true, load: () => import('@/pages/sign-in') },
  {
    path: '/forgot-password',
    name: 'Quên mật khẩu',
    public: true,
    load: () => import('@/pages/forgot-password'),
  },
  {
    path: '/reset-password',
    name: 'Đặt mật khẩu mới',
    public: true,
    load: () => import('@/pages/reset-password'),
  },
  /** The fourth screen of the auth flow, and the ONLY one in the group that is
   *  not `public`: changing a password needs a live session, while the other
   *  three exist precisely because there is none. No `permission` either - a
   *  person owing a forced change gets past no `AccessGuard` on the server, so
   *  a screen that demanded one would be a screen they cannot open through the
   *  very door built to release them.
   *
   *  The path comes from `CHANGE_PASSWORD_PATH` rather than being retyped: the
   *  guard redirects here and compares the path to know it has arrived. Two
   *  spellings would be an infinite redirect, and the screen would never
   *  paint. */
  {
    path: CHANGE_PASSWORD_PATH,
    name: 'Đổi mật khẩu',
    load: () => import('@/pages/change-password'),
  },
  { path: '/kit', name: 'Theme kit sống', public: true, load: () => import('@/kit/theme-kit') },
]

/** The Vietnamese paths, kept alive until 23/09/2026.
 *
 *  Thirteen routes dropped Vietnamese at `83480fa`. Bookmarks, and the links
 *  inside mail already sent, still point at the old spelling — deleting them
 *  outright serves a 404 to someone who did nothing wrong. The password-invite
 *  ticket lives 7 days, the latest expiry in the system, so it sets the date
 *  this table goes away.
 *
 *  `search` and `hash` MUST travel with the redirect: the reset link is
 *  `/dat-lai-mat-khau?token=…`, and dropping the query would land the person on
 *  the right screen holding no ticket — a failure harder to read than the 404
 *  it replaced. */
const LEGACY_PATHS: Record<string, string> = {
  '/quan-tri/nguoi-dung': '/admin/users',
  '/quan-tri/vai-tro': '/admin/roles',
  '/duyet': '/approvals',
  '/sales/campaigns/nguon-dan': '/sales/campaigns/sources',
  '/sales/campaigns/nguon-dan/:code': '/sales/campaigns/sources/:code',
  '/sales/campaigns/lo-gui': '/sales/campaigns/mail-runs',
  '/sales/campaigns/mau-thu': '/sales/campaigns/mail-templates',
  '/sales/campaigns/moi': '/sales/campaigns/new',
  '/sales/campaigns/:code/sua': '/sales/campaigns/:code/edit',
  '/sales/contracts/:code/dot/:no': '/sales/contracts/:code/installments/:no',
  '/dang-nhap': '/sign-in',
  '/quen-mat-khau': '/forgot-password',
  '/dat-lai-mat-khau': '/reset-password',
  '/doi-mat-khau': CHANGE_PASSWORD_PATH,
}

/** `replace` so the Back button cannot fall onto the old path and bounce. */
function LegacyRedirect({ to }: { to: string }) {
  const params = useParams()
  const { hash, search } = useLocation()
  return <Navigate to={`${generatePath(to, params)}${search}${hash}`} replace />
}

export const router = createBrowserRouter([
  ...SCREENS.map(({ path, load, branch, permission, public: isPublic }) => ({
    path,
    /* A parked module (`app/parked.ts`) sends the path home rather than losing
       its route: a bookmark or a link inside old mail still has to land
       somewhere, and a dropped route paints nothing at all. */
    element: isParked(permission) ? (
      <Navigate to="/" replace />
    ) : isPublic ? (
      withFallback(load)
    ) : (
      <RequireAccess branch={branch ?? null} permission={permission}>
        {withFallback(load)}
      </RequireAccess>
    ),
  })),
  ...Object.entries(LEGACY_PATHS).map(([from, to]) => ({
    path: from,
    element: <LegacyRedirect to={to} />,
  })),
])

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
