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
  /** Header và main cùng một trục. 1600px giữ bảng nghiệp vụ không nở thành một
   *  dải quá dài trên màn lớn; dưới ngưỡng đó khung co theo viewport. */
  frame: 'mx-auto w-full max-w-[1600px]',
  /** lề ngoài của cả khung */
  pad: 'p-4 lg:p-6',
  /** khoảng giữa nav và nội dung */
  gap: 'gap-4 lg:gap-6',
  /** chừa chỗ cho BottomNav (84px + safe-area) — chỉ dưới `lg` */
  bottomNavPad: 'pb-[calc(84px+env(safe-area-inset-bottom)+16px)] lg:pb-6',
  /** Nav dán sát đỉnh; chiều rộng vẫn theo `frame`, không nở khỏi trục main. */
  stick: 'sticky top-0 z-40',
} as const

export type AppShellProps = {
  header: Omit<AppHeaderProps, 'onOpenAssistant'>
  /** Mục đang active trên BottomNav (< lg). Bỏ trống = không mục nào sáng —
   *  đúng cho tám màn nhánh, chỗ chúng sáng là tầng 2 của AppHeader. */
  activeNav?: BottomNavKey
  approvalsCount?: number
  /** mục BottomNav chưa có màn — nút tắt + ổ khoá thay vì bấm không ra gì */
  lockedNav?: BottomNavKey[]
  children: ReactNode
  /** Không truyền thì khung KHÔNG vẽ nút Trợ lý nổi — xem lý do ở chỗ render. */
  onOpenAssistant?: () => void
  onNavigate?: (key: BottomNavKey) => void
}

export function AppShell({
  header,
  activeNav,
  approvalsCount,
  lockedNav,
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
        <AppHeader
          {...header}
          onOpenAssistant={onOpenAssistant}
          className={cn(SHELL.frame, SHELL.stick)}
        />
        <main className={cn(SHELL.frame, 'min-w-0 flex-1')}>{children}</main>
      </div>

      {/* Nút Trợ lý nổi CHỈ khi có người nhận cú bấm.
          Màn 04 · Trợ lý AI chưa dựng, nên trên phần lớn màn `onOpenAssistant`
          còn trống. Một nút 60px sáng azure ở góc phải dưới mà bấm không ra gì
          tệ hơn hẳn việc không có nút: nó hứa một màn không tồn tại, và nó hứa
          trên MỌI màn. Có màn rồi thì màn truyền hàm vào, nút tự hiện lại. */}
      {onOpenAssistant ? (
        <AssistantFab onClick={onOpenAssistant} className="hidden lg:flex" />
      ) : null}

      <BottomNav
        active={activeNav}
        approvalsCount={approvalsCount}
        locked={lockedNav}
        onNavigate={(key) => (key === 'assistant' ? onOpenAssistant?.() : onNavigate?.(key))}
      />
    </AuroraField>
  )
}
