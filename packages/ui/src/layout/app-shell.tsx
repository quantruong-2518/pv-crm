import type { ReactNode } from 'react'
import { AuroraField } from '../layout/aurora-field'
import { AssistantFab } from '../layout/assistant-fab'
import { AppHeader, type AppHeaderProps } from '../organisms/app-header'
import { BottomNav, type BottomNavKey } from '../organisms/bottom-nav'
import { cn } from '../lib/cn'

/** AppShell — khung màn, mobile-first.
 *
 *  NHỊP CỦA KHUNG NẰM Ở ĐÂY, MỘT CHỖ. Trước 19/08 mỗi màn tự chọn cách cư xử
 *  của khung: màn nào bật `fill` thì trang không cuộn, màn còn lại cuộn thường.
 *  Một cờ như thế trông vô hại nhưng nó chẻ khung làm hai kiểu, và mọi lỗi bố
 *  cục đo được hôm đó đều rụng ra từ chỗ chẻ:
 *   · bề rộng dùng được lệch 15px giữa hai loại màn (1999 với 1984) vì loại này
 *     có thanh cuộn dọc, loại kia không — đi giữa hai màn là cả bố cục nhảy;
 *   · nav lệch 16px (48px với 32px) vì `overflow-hidden` của `fill` biến khung
 *     thành scroll container, làm `sticky` đo từ một mốc khác.
 *
 *  Nên `fill` đã bỏ. MỌI màn cuộn ở tầng trang, cùng một kiểu. Màn muốn khối
 *  bên trong tự cuộn thì tự đặt `overflow` cho khối đó — đó là việc của màn,
 *  không phải một chế độ của khung.
 *
 *  Nav là AppHeader hai tầng (xem docblock ở đó), dán đỉnh màn. Nav dọc cũ đã
 *  bỏ: bộ mục cao 1040px trong khi màn cao 801px. */

/** Nhịp của khung — sửa ở đây là sửa mọi màn. Màn KHÔNG tự đặt lại mấy giá trị
 *  này; gõ `p-8` trong một màn là màn đó tự tách khỏi hệ. */
const SHELL = {
  /** lề ngoài của cả khung */
  pad: 'p-4 lg:p-6',
  /** khoảng giữa nav và nội dung */
  gap: 'gap-4 lg:gap-6',
  /** chừa chỗ cho BottomNav (84px + safe-area) — chỉ dưới `lg` */
  bottomNavPad: 'pb-[calc(84px+env(safe-area-inset-bottom)+16px)] lg:pb-6',
  /** Nav dán SÁT đỉnh cửa sổ, không cách một quãng.
   *
   *  `top-0` chứ không `top-6`: lúc dính, nav nở ngang ra ăn hết lề (xem
   *  `AppHeader`), mà nở ngang trong khi vẫn treo cách đỉnh 24px thì hở ra một
   *  dải nền phía trên và nội dung chạy qua dải đó. Ở trạng thái thường nav
   *  vẫn nằm trong lề như mọi thẻ khác — `top-0` chỉ quyết định chỗ nó DỪNG
   *  khi cuộn, không đổi chỗ nó đứng lúc chưa cuộn. */
  stick: 'sticky top-0 z-40',
} as const

export type AppShellProps = {
  header: Omit<AppHeaderProps, 'onOpenAssistant'>
  /** mục đang active trên BottomNav (< lg) */
  activeNav: BottomNavKey
  approvalsCount?: number
  children: ReactNode
  onOpenAssistant?: () => void
  onNavigate?: (key: BottomNavKey) => void
}

export function AppShell({
  header,
  activeNav,
  approvalsCount,
  children,
  onOpenAssistant,
  onNavigate,
}: AppShellProps) {
  return (
    <AuroraField>
      <div
        className={cn(
          'relative z-[1] flex min-h-screen flex-col',
          SHELL.pad,
          SHELL.gap,
          SHELL.bottomNavPad,
        )}
      >
        <AppHeader {...header} onOpenAssistant={onOpenAssistant} className={SHELL.stick} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <AssistantFab onClick={onOpenAssistant} className="hidden lg:flex" />

      <BottomNav
        active={activeNav}
        approvalsCount={approvalsCount}
        onNavigate={(key) => (key === 'assistant' ? onOpenAssistant?.() : onNavigate?.(key))}
      />
    </AuroraField>
  )
}
