import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Calculator,
  ChartColumn,
  Factory,
  FolderOpen,
  Gauge,
  House,
  ListChecks,
  Megaphone,
  Orbit,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  SquareCheckBig,
  Target,
  Users,
  UsersRound,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AppShellProps, BottomNavKey, HeaderAction, HeaderApp } from '@pv/ui'
import { Button } from '@pv/ui'
import type { Branch } from '@pv/engines'
import { useSession } from './session'

/** Khung app dùng chung: sidebar + topbar cho MỌI màn.
 *
 *  ------------------------------------------------------------------
 *  CẤP BẬC — phần quan trọng nhất của file này
 *  ------------------------------------------------------------------
 *  Nav chia theo thứ người dùng cảm nhận được, không theo sơ đồ thương mại:
 *
 *    ONE CORE    thứ LUÔN có, không phải mua                    (nhóm 1)
 *    TÍNH NĂNG   thứ mua thêm mới có                            (nhóm 2)
 *                ├─ Kinh doanh ─┬─ Thị trường          ┐
 *                │              ├─ Lead                │ bốn MODULE của
 *                │              ├─ Performance         │ riêng nhánh này
 *                │              └─ Số liệu & kế hoạch  ┘
 *                ├─ Cung ứng · Sản xuất · Tài chính     ← ba nhánh còn lại
 *                └─ Nhân sự · Hồ sơ · Công việc · Báo cáo · Trợ lý AI  ← One Plus
 *
 *  Bốn nhánh vệ tinh và năm năng lực One Plus ĐỒNG CẤP trong nhóm này. Về mặt
 *  thương mại chúng khác nhau — nhánh là sản phẩm rời, One Plus là tầng license
 *  bên trong One (docs · "Hai tầng license") — nhưng với người ngồi trước màn
 *  thì cả hai là cùng một câu hỏi: "cái này công ty mình có chưa?". Chốt xếp
 *  theo câu hỏi đó, One Plus nằm cuối vì chưa nhánh nào của nó được dựng.
 *
 *  Cấp bậc BÊN TRONG mỗi mục vẫn phải đúng docs/kien-truc-san-pham.md —
 *  module nằm dưới nhánh của nó, không ngang hàng nhánh.
 *
 *  Hai lỗi cấp bậc đã sửa ở bản trước:
 *   · bốn module Sales từng đứng thành một NHÓM ngang hàng với nhóm chứa các
 *     nhánh — tức module trông ngang cấp nhánh. Giờ chúng thụt vào dưới đúng
 *     nhánh của mình (`depth: 1`);
 *   · "Quản trị & ghi vết" từng nằm ở footer, trong khi bốn năng lực Core anh em
 *     của nó nằm trên nav. Giờ nó về đúng nhóm One Core. Footer trả lại cho thứ
 *     KHÔNG phải điều hướng: ai đang đăng nhập.
 *
 *  One Core và One Plus giờ đều có kicker. Trước đây Core không có nhãn nên
 *  trông như gốc cây chứ không như một trong hai tầng license.
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
  icon: LucideIcon
  label: string
  /** Chưa có màn thì bỏ trống — mục TỰ KHOÁ (ổ khoá, nút tắt). Một nút trông
   *  bấm được rồi không đi đâu tệ hơn hẳn một nút nói thẳng là chưa mở. */
  path?: string
  count?: number
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
  { icon: ShieldCheck, label: 'Quản trị & ghi vết' },
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

/** One Plus — tầng thu tiền theo đầu người. Nằm CUỐI nhóm "Tính năng", sau bốn
 *  nhánh vệ tinh. Khoá cứng cho tới khi có mô hình license thật: kiểu `Branch`
 *  không mô tả được tầng, nó chỉ có năm nhánh. */
const ONE_PLUS: NavEntry[] = [
  { icon: UsersRound, label: 'Nhân sự' },
  { icon: FolderOpen, label: 'Hồ sơ & quy trình' },
  { icon: ListChecks, label: 'Công việc' },
  { icon: ChartColumn, label: 'Báo cáo' },
  /** Icon `orbit` là icon Trợ lý AI theo luật 15 — không `sparkles`, không
   *  `bot`. Nút tròn nổi của AppShell là lối tắt vào đây, không phải cấp riêng. */
  { icon: Orbit, label: 'Trợ lý AI' },
]

export type SalesModule = {
  /** Số thứ tự trong docs — giữ nguyên, đừng đánh lại. */
  no: number
  icon: LucideIcon
  label: string
  path: string
  /** Module này trả câu hỏi gì (docs/kien-truc-san-pham.md). */
  question: string
}

/** NĂM module Pebble Sales — bảng CHỐT ở docs/kien-truc-san-pham.md.
 *
 *  Bảng này là nguồn duy nhất của nav: thêm hay đổi module thì sửa đúng một
 *  chỗ, không có chuyện nav nói năm mà route có một.
 *
 *  Đổi 19/08: module 1 từ "Thị trường" (bị chặn vì cần dữ liệu thị trường
 *  ngoài, tức cần kịch bản thứ ba) → "Chiến dịch & Sự kiện", trả đúng câu hỏi
 *  cũ bằng dữ liệu của chính phòng; thêm module 5 · Cấu hình.
 *
 *  Trường `blocked` đã bỏ cùng màn `sales-pending`: cả năm module giờ đều có
 *  màn thật, không còn mục nào cần chỗ để nói "đang vướng gì". */
export const SALES_MODULES: SalesModule[] = [
  {
    no: 1,
    icon: Megaphone,
    label: 'Chiến dịch & Sự kiện',
    path: '/sales/campaigns',
    question: 'Khách ở đâu ra, đợt nào ra khách',
  },
  {
    no: 2,
    icon: Users,
    label: 'Lead',
    path: '/sales/leads',
    question: 'Ai đang trong tay ai',
  },
  {
    no: 3,
    icon: Gauge,
    label: 'Performance',
    path: '/sales/performance',
    question: 'Ai đang làm được, ai đang tắc',
  },
  {
    no: 4,
    icon: Target,
    label: 'Số liệu & kế hoạch',
    path: '/sales/plan',
    question: 'Tháng tới phòng nên làm gì',
  },
  {
    /** Module 5 KHÔNG nằm trong vòng khép kín của bốn module trên — nó là thứ
     *  định hình cái vòng. Vì thế nó đứng cuối nav dù được dựng sớm. */
    no: 5,
    icon: SlidersHorizontal,
    label: 'Cấu hình',
    path: '/sales/config',
    question: 'Dữ liệu của phòng có hình dạng gì',
  },
]

type BranchEntry = {
  icon: LucideIcon
  label: string
  branch: Branch
  /** Module của nhánh. Nhánh chưa dựng module nào thì bỏ trống. */
  modules?: SalesModule[]
}

/** BỐN nhánh vệ tinh — đồng cấp với nhau, không nhánh nào là con của nhánh nào.
 *  Nội dung từng nhánh (docs · "Năm nhánh"): Cung ứng có ERP·Kho · Purchasing ·
 *  Logistics, Sản xuất có MES · Quality · Maintenance, Tài chính có Giá thành ·
 *  Công nợ · eSign · Hoá đơn điện tử. Chưa nhánh nào ngoài Sales được dựng nên
 *  chưa liệt kê module của chúng — liệt kê ra mà không bấm được thì tệ hơn. */
const BRANCHES: BranchEntry[] = [
  { icon: Users, label: 'Kinh doanh', branch: 'Sales', modules: SALES_MODULES },
  { icon: Package, label: 'Cung ứng', branch: 'Supply' },
  { icon: Factory, label: 'Sản xuất', branch: 'Factory' },
  { icon: Calculator, label: 'Tài chính', branch: 'Finance' },
]

export function useAppChrome(opts: { searchPlaceholder?: string } = {}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const actor = useSession((s) => s.actor)
  const signOut = useSession((s) => s.signOut)

  /** `groupLocked` là khoá theo TẦNG LICENSE (One Plus chưa mua). Mục không có
   *  đường dẫn cũng khoá, dù tầng của nó đã mở: "Phê duyệt", "Thông báo" và
   *  "Quản trị & ghi vết" là ba năng lực Core thật nhưng màn chưa dựng, và tới
   *  20/08 chúng vẫn hiện ra như nút bình thường rồi bấm không đi đâu. */
  const plain =
    (groupLocked: boolean) =>
    (entry: NavEntry): HeaderAction => {
      const locked = groupLocked || !entry.path
      return {
        icon: entry.icon,
        label: entry.label,
        count: entry.count,
        locked,
        active: entry.path ? pathname === entry.path : false,
        onClick: entry.path && !locked ? () => navigate(entry.path!) : undefined,
      }
    }

  /** Một nhánh + các module của nó, phẳng ra thành danh sách có cấp.
   *
   *  Nhánh khoá khi phiên hiện tại không có nó — cùng một nguồn sự thật với
   *  `canEnter` ở guard, nên ổ khoá trên nav và cửa chặn ở route không bao giờ
   *  nói ngược nhau. Nhánh khoá thì không trải module: chưa mua thì biết bên
   *  trong có gì cũng không vào được. */
  const inModule = (path: string) => pathname === path || pathname.startsWith(`${path}/`)

  const branchApp = (b: BranchEntry): HeaderApp => {
    const locked = !actor?.branches.includes(b.branch)
    const landing = b.modules?.[0]?.path

    return {
      icon: b.icon,
      label: b.label,
      locked,
      /* Nhánh sáng khi người dùng đang ở BẤT KỲ module nào của nó. Ở nav dọc
         thì không: cha và con cùng nằm trên màn nên sáng cả hai là thừa. Ở nav
         hai tầng thì con nằm trong dropdown ĐANG ĐÓNG — cha không sáng thì cả
         thanh nav không chỉ ra được người dùng đang đứng ở đâu. */
      active: Boolean(b.modules?.some((m) => inModule(m.path))),
      onClick: landing && !locked ? () => navigate(landing) : undefined,
      /* Nhánh khoá thì không trải module: chưa mua thì biết bên trong có gì
         cũng không vào được. */
      items:
        locked || !b.modules
          ? undefined
          : b.modules.map((m): HeaderAction => ({
              icon: m.icon,
              label: m.label,
              /* Màn con của module (hồ sơ một lead ở `/sales/leads/:code`) vẫn
                 phải để mục cha sáng: người dùng đứng trong module đó, chỉ là
                 sâu hơn một tầng. */
              active: inModule(m.path),
              onClick: () => navigate(m.path),
            })),
    }
  }

  const header: AppShellProps['header'] = {
    product: 'PV One',
    org: 'Pebble Vina',
    core: ONE_CORE.map(plain(false)),
    /* Nhánh vệ tinh trước, One Plus sau — cùng một nhóm "mua thêm mới có".
       One Plus xuống cuối vì chưa năng lực nào của nó được dựng. */
    apps: [...BRANCHES.map(branchApp), ...ONE_PLUS.map(plain(true))],
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
          signOut()
          navigate('/dang-nhap', { replace: true })
        }}
      >
        Đổi vai
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
