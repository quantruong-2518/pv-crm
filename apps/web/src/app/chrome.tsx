import type { IconGlyph } from '@pv/ui'
import {
  Bell,
  FileCheck,
  Gauge,
  Handshake,
  House,
  Megaphone,
  ShieldCheck,
  SlidersHorizontal,
  SquareCheckBig,
  Target,
  Users,
} from '@pv/ui'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AppShellProps, BottomNavKey, HeaderAction, HeaderApp } from '@pv/ui'
import { Button } from '@pv/ui'
import type { Permission } from '@pv/engines'
import { access, useSession } from './auth'

/** Khung app dùng chung cho MỌI màn.
 *
 *  ------------------------------------------------------------------
 *  NAVBAR LÀ BẢN ĐỒ CÔNG VIỆC CỦA SẢN PHẨM
 *  ------------------------------------------------------------------
 *  Hàng điều hướng chính chỉ nói về các khu vực NGƯỜI DÙNG THỰC SỰ LÀM VIỆC:
 *  Chiến dịch · Sổ lead · Cơ hội · Hiệu suất · Kế hoạch · Thiết lập. Chúng đi
 *  thẳng tới sáu màn đang tồn tại, không nấp dưới một mục "Kinh doanh" và
 *  không đứng cạnh roadmap Cung ứng/Sản xuất/Tài chính/One Plus chưa mở.
 *
 *  Navbar không phải brochure hệ sinh thái. Đưa module chưa có vào đây dưới
 *  dạng một dãy ổ khoá làm sản phẩm đang dùng trông như một bản demo chưa
 *  hoàn tất, đồng thời bắt người dùng đi qua hai lần bấm để tới việc hàng ngày.
 *  Phạm vi license vẫn được guard và `access.check` giữ; nó không cần chiếm
 *  chỗ trong nội dung điều hướng chính.
 *
 *  @pv/ui vẫn không biết router: nav ở đây tự tính `active` từ `useLocation` và
 *  tự truyền `onClick` xuống. Thư viện chỉ nhận props.
 *
 *  ------------------------------------------------------------------
 *  ĐIỀU HƯỚNG SINH Ở ĐÂY, MỘT CHỖ — sửa 20/08
 *  ------------------------------------------------------------------
 *  Trước đó `useAppChrome` chỉ trả `header`, còn `onNavigate`/`onOpenAssistant`
 *  của `AppShell` thì KHÔNG màn nào truyền. Hệ quả dưới `lg`: bốn mục BottomNav,
 *  nút tròn Trợ lý và nút "Trợ lý" ở tầng 1 đều bấm không ra gì — toàn bộ điều
 *  hướng dưới màn điện thoại là chết.
 *
 *  Vá bằng cách trả nguyên gói `shell`: màn viết `<AppShell {...chrome.shell}>`
 *  và không màn nào tự nối dây nữa. Chín màn không thể nối thiếu thứ chúng không
 *  còn cầm.
 *
 *  Ba đường vào Trợ lý AI đều đã thành thật khi `onOpenAssistant` trống:
 *  `AssistantFab` không vẽ, mục 'assistant' của BottomNav nằm trong `lockedNav`,
 *  và nút tầng 1 của `AppHeader` vào trạng thái khoá. Không cửa nào hứa màn 04. */

type NavEntry = {
  icon: IconGlyph
  label: string
  /** Chưa có màn thì bỏ trống — mục TỰ KHOÁ (ổ khoá, nút tắt). Một nút trông
   *  bấm được rồi không đi đâu tệ hơn hẳn một nút nói thẳng là chưa mở. */
  path?: string
  count?: number
  /** Role permission the screen behind this entry asks for — must match the
   *  `permission` of the same `path` in `routes.tsx`, for the reason
   *  `SalesModule.permission` gives just below: the two tables cannot be merged
   *  without an import cycle, so they sit next to matching paths instead.
   *
   *  Absent means the entry is open to anyone with a live session, which is
   *  true of `/` and will be true of most Core screens. Present means a role
   *  without it sees the entry LOCKED rather than sees a button that leads
   *  straight to a refusal — the same treatment the six Sales modules get, on
   *  One Core's own terms: no branch, because Core is licensed to everybody. */
  permission?: Permission
}

/** Hai con số này mang nguyên từ màn 01 sang, CHƯA có fixture nào đỡ. Lúc dựng
 *  màn Hộp phê duyệt và màn Thông báo thì lấy từ E3/E4, đừng nhân bản thêm. */
const APPROVALS_WAITING = 7
const NOTIFICATIONS_UNREAD = 12

/** One Core — nền bắt buộc, mọi nhánh đều cần (docs · "Hai tầng license").
 *  Bốn mục đầu là bốn màn One trong luat-thiet-ke.md §7.
 *
 *  "Tìm toàn cục" KHÔNG còn là một mục ở đây: nó đã thành ô tìm của tầng 1,
 *  chiếm nguyên khoảng giữa nav. Giữ thêm một nút mở cùng việc đó là hai lối
 *  vào một chỗ, và cái nút bao giờ cũng là lối tệ hơn. */
const ONE_CORE: NavEntry[] = [
  { icon: House, label: 'Trang chủ', path: '/' },
  { icon: SquareCheckBig, label: 'Phê duyệt', count: APPROVALS_WAITING },
  { icon: Bell, label: 'Thông báo', count: NOTIFICATIONS_UNREAD },
  {
    /** Renamed from "Quản trị & ghi vết" the day it got a screen: the entry now
     *  leads to the people book, and the audit log is a screen that does not
     *  exist yet. A label promising two things where one is behind it teaches
     *  people to look for a trail that is not there. "& ghi vết" comes back with
     *  the audit screen, or the entry grows a second child. */
    icon: ShieldCheck,
    label: 'Quản trị',
    path: '/quan-tri/nguoi-dung',
    permission: 'người-dùng.quản-lý',
  },
]

/** BottomNav (< lg) — bốn mục CHỐT theo docs/luat-thiet-ke.md §3, không cấu hình
 *  được danh sách. Bảng này là nguồn duy nhất của cả ba câu hỏi về chúng: mục
 *  nào đi được, mục nào khoá, mục nào đang sáng.
 *
 *  Ba mục cuối là ba màn One chưa dựng (§7 · 02 Hộp phê duyệt · 03 Tìm toàn cục ·
 *  04 Trợ lý AI). Dựng xong màn nào thì điền đường dẫn vào đúng dòng của nó ở
 *  đây — không phải sửa chín màn, và không phải nhớ gỡ nó khỏi danh sách khoá. */
const BOTTOM_NAV: { key: BottomNavKey; path?: string }[] = [
  { key: 'home', path: '/' },
  { key: 'approvals' },
  { key: 'search' },
  { key: 'assistant' },
]

const LOCKED_NAV: BottomNavKey[] = BOTTOM_NAV.filter((i) => !i.path).map((i) => i.key)

export type SalesModule = {
  /** Số thứ tự trong docs — giữ nguyên, đừng đánh lại. */
  no: number
  icon: IconGlyph
  label: string
  path: string
  /** Quyền cần để VÀO module — phải khớp `permission` của cùng `path` trong
   *  `routes.tsx`.
   *
   *  Hai chỗ khai chứ không một, vì `routes.tsx` phải import trang còn file này
   *  bị trang import: gộp lại là một vòng import. Đổi lại, hai bảng nằm cạnh
   *  cùng một `path` nên lệch nhau là nhìn thấy — và nếu có lệch thì nav rộng
   *  hơn cửa chứ không bao giờ ngược lại: cửa mới là chỗ chặn thật. */
  permission: Permission
  /** Module này trả câu hỏi gì. */
  question: string
}

/** BẢY module Pebble Sales — bảng CHỐT.
 *
 *  Bảng này là nguồn duy nhất của nav: thêm hay đổi module thì sửa đúng một
 *  chỗ, không có chuyện nav nói sáu mà route có năm.
 *
 *  Đổi 19/08: module 1 từ "Thị trường" (bị chặn vì cần dữ liệu thị trường
 *  ngoài, tức cần kịch bản thứ ba) → "Chiến dịch & Sự kiện", trả đúng câu hỏi
 *  cũ bằng dữ liệu của chính phòng; thêm module Cấu hình.
 *
 *  Đổi 23/08: thêm **module 3 · Ops** — sổ cơ hội, chỗ lead đi tiếp sau khi qua
 *  cổng init data. Ba module sau nó lùi một số (Performance 3→4, Số liệu 4→5,
 *  Cấu hình 5→6). Số ở đây là số ĐỊNH DANH màn; mọi tham chiếu chéo trong
 *  comment đã đổi sang gọi TÊN module, nên lần đánh số lại này không kéo theo
 *  hai chục chỗ phải sửa nữa.
 *
 *  Đổi 23/08 (lần hai): module 1 rút tên còn **"Chiến dịch"**. Nhãn "sự kiện" đã
 *  ra khỏi màn — một buổi hội thảo vẫn là một chiến dịch có chuỗi đợt và có mail
 *  đi ra, đo bằng đúng bộ chỉ số ấy, nên hai chữ trong nav chỉ dạy người mới một
 *  phân biệt không đổi được việc gì họ làm.
 *
 *  Trường `blocked` đã bỏ cùng màn `sales-pending`: cả sáu module giờ đều có
 *  màn thật, không còn mục nào cần chỗ để nói "đang vướng gì". */
export const SALES_MODULES: SalesModule[] = [
  {
    no: 1,
    icon: Megaphone,
    label: 'Chiến dịch',
    path: '/sales/campaigns',
    permission: 'chiến-dịch.xem',
    question: 'Tạo và đo lường các chiến dịch thu hút khách hàng',
  },
  {
    no: 2,
    icon: Users,
    label: 'Sổ lead',
    path: '/sales/leads',
    permission: 'lead.xem',
    question: 'Thu nhận, phân loại và phân công khách tiềm năng',
  },
  {
    /** Đứng ngay sau Lead vì đó là bước kế tiếp của cùng một khách: qua cổng
     *  init data thì lead thành cơ hội. Hai sổ dùng chung bố cục và chung ba
     *  mảnh bảng (`components/table-bits.tsx`). */
    no: 3,
    icon: Handshake,
    label: 'Cơ hội',
    path: '/sales/opportunities',
    permission: 'cơ-hội.xem',
    question: 'Theo dõi cơ hội từ tiếp cận đến ký kết',
  },
  {
    /* Sits right after Ops because it is the next step for the same customer:
       an opportunity that closes won becomes a contract. Renumbering the three
       modules below it is cheap — cross references in comments name modules, not
       numbers. */
    no: 4,
    icon: FileCheck,
    label: 'Hợp đồng',
    path: '/sales/contracts',
    permission: 'hợp-đồng.xem',
    question: 'Theo dõi tiền về và nghĩa vụ hai bên sau khi ký',
  },
  {
    no: 5,
    icon: Gauge,
    label: 'Hiệu suất',
    path: '/sales/performance',
    permission: 'hiệu-suất.xem',
    question: 'Đo hiệu suất đội ngũ và phát hiện điểm nghẽn',
  },
  {
    no: 6,
    icon: Target,
    label: 'Kế hoạch',
    path: '/sales/plan',
    permission: 'kế-hoạch.xem',
    question: 'Lập mục tiêu và kế hoạch cho kỳ tiếp theo',
  },
  {
    /** Cấu hình KHÔNG nằm trong vòng khép kín của năm module trên — nó là thứ
     *  định hình cái vòng. Vì thế nó đứng cuối nav dù được dựng sớm. */
    no: 7,
    icon: SlidersHorizontal,
    label: 'Thiết lập',
    path: '/sales/config',
    permission: 'cấu-hình.xem',
    question: 'Quản lý danh mục và quy tắc bán hàng',
  },
]

export function useAppChrome(opts: { searchPlaceholder?: string } = {}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const actor = useSession((s) => s.actor)
  const signOut = useSession((s) => s.signOut)

  /** A Core entry locks on either of TWO axes, and they say different things.
   *
   *   · **No `path`** — the screen does not exist yet. "Phê duyệt" and "Thông
   *     báo" are real capabilities with nothing built behind them, and a locked
   *     entry says so honestly instead of offering a button that goes nowhere.
   *     Filling in the path is the whole ritual for unlocking one.
   *   · **No `permission`** — the screen exists and this role may not open it.
   *     Asked through the same `access.check` the route guard uses, so nav and
   *     door never disagree; asked with `branch: null` because One Core is
   *     licensed to everybody, and passing a branch here would deny a Sales-only
   *     account a screen that has nothing to do with Sales.
   *
   *  Without the second axis a `sale` would see "Quản trị" sitting in the top
   *  bar, click it, and be bounced by `RequireAccess` — a nav item whose only
   *  destination is a refusal. */
  const plain = (entry: NavEntry): HeaderAction => {
    const granted =
      !entry.permission || access.check(actor, { branch: null, permission: entry.permission }).ok
    const locked = !entry.path || !granted
    return {
      icon: entry.icon,
      label: entry.label,
      count: entry.count,
      locked,
      active: entry.path ? pathname === entry.path : false,
      onClick: entry.path && !locked ? () => navigate(entry.path!) : undefined,
    }
  }

  /** Module thật đi thẳng lên hàng điều hướng. Quyền vẫn hỏi cùng `access.check`
   *  với route guard: người thiếu quyền thấy bản đồ sản phẩm nhưng mục tương ứng
   *  khoá; người có quyền tới màn chỉ bằng một lần bấm. */
  const inModule = (path: string) => pathname === path || pathname.startsWith(`${path}/`)
  const moduleApp = (module: SalesModule): HeaderApp => {
    const open = access.check(actor, { branch: 'Sales', permission: module.permission }).ok
    return {
      icon: module.icon,
      label: module.label,
      description: module.question,
      locked: !open,
      active: inModule(module.path),
      onClick: open ? () => navigate(module.path) : undefined,
    }
  }

  const header: AppShellProps['header'] = {
    product: 'PV One',
    org: 'Pebble Vina',
    core: ONE_CORE.map(plain),
    apps: SALES_MODULES.map(moduleApp),
    user: { name: actor?.name ?? 'Khách', role: actor?.role },
    unread: NOTIFICATIONS_UNREAD > 0,
    assistantLabel: 'Trợ lý',
    search: {
      placeholder: opts.searchPlaceholder ?? 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…',
    },
    userAction: (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          /* Nhãn là "Đăng xuất" chứ không phải "Đổi vai": từ 23/08 màn đăng nhập
             không còn bảng chọn vai, nên nút này chỉ làm được đúng một việc —
             ra khỏi phiên. Muốn sang vai khác thì đăng nhập bằng email vai đó. */
          signOut()
          navigate('/dang-nhap', { replace: true })
        }}
      >
        Đăng xuất
      </Button>
    ),
  }

  /** Mục BottomNav đang đứng — hoặc KHÔNG mục nào.
   *
   *  BottomNav chỉ có bốn mục One Core, và hôm nay đúng MỘT mục có màn (`/`).
   *  Màn nhánh (`/sales/*`) không thuộc bốn mục đó: chỗ nó sáng là tầng 2 của
   *  AppHeader, chứ không phải thanh dưới. Trả `undefined` cho tám màn nhánh —
   *  ép chúng sáng ở 'home' là gắn `aria-current="page"` lên một mục không phải
   *  trang hiện tại, tức nói dối trình đọc màn hình. */
  const activeNav: BottomNavKey | undefined = BOTTOM_NAV.find((i) => i.path === pathname)?.key

  /** Điều hướng của BottomNav. Mục khoá không tới được đây (`lockedNav` tắt nút
   *  ở tầng kiểu), nhưng vẫn kiểm `path` chứ không tin vào điều đó — một handler
   *  chỉ đúng khi ai đó nhớ khoá nút là một handler chờ hỏng. */
  const onNavigate = (key: BottomNavKey) => {
    const to = BOTTOM_NAV.find((i) => i.key === key)?.path
    if (to) navigate(to)
  }

  /** Gói props của `AppShell`. Màn spread nguyên gói, không cầm mảnh nào.
   *
   *  `onOpenAssistant` CỐ TÌNH vắng mặt: màn 04 · Trợ lý AI chưa dựng. Thiếu nó
   *  thì `AssistantFab` không render và mục 'assistant' của BottomNav nằm trong
   *  `lockedNav` — không có nút nào hứa một màn không tồn tại. Dựng xong màn 04
   *  thì thêm `onOpenAssistant` vào đây và điền `path` cho dòng 'assistant'
   *  của `BOTTOM_NAV`.
   *
   *  KIỂU KHAI TƯỜNG MINH, có lý do: JSX bỏ qua kiểm dư thừa trên spread, nên
   *  `<AppShell {...shell}>` nuốt im lặng mọi prop mà `AppShell` không biết.
   *  Gõ sai một tên ở đây là mất nguyên một dây điều hướng mà `tsc` vẫn xanh —
   *  đúng loại lỗi đã làm nav dưới `lg` chết suốt từ 19/08. */
  const shell: Omit<AppShellProps, 'children'> = {
    header,
    activeNav,
    lockedNav: LOCKED_NAV,
    approvalsCount: APPROVALS_WAITING,
    onNavigate,
  }

  return { shell }
}
