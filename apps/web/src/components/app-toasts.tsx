import { ToastHost } from '@pv/ui'
import { useToasts } from '@/app/toast'
import { consumeGoogleReturn } from '@/components/google-return'
import { message, useI18n } from '@/app/i18n'

consumeGoogleReturn()

/** Hàng thông báo, gắn MỘT lần cho cả app.
 *
 *  Đứng cạnh `RouterProvider` chứ không trong `AppShell`, và đó là chỗ duy nhất
 *  đúng: một toast phải sống qua lúc chuyển màn ("412 lead đã vào sổ" bắn ở sổ
 *  lead, người dùng bấm "Xem" và sang màn khác — tấm đó không được biến mất
 *  giữa chừng). Gắn trong `AppShell` thì mỗi màn có một hàng riêng, và mỗi lần
 *  điều hướng là một lần hàng bị gỡ sạch.
 *
 *  Cũng vì thế nó KHÔNG nằm trong `@pv/ui`: `AppShell` không được biết tới
 *  zustand, còn mảnh nối kho với host thì phải biết (biên giới package). */
export function AppToasts() {
  const { t } = useI18n()
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  /* Stacks above the AI task tray (`--ai-tray-h`, its height plus a gap), which sits above a form's bar. */
  return (
    <ToastHost
      items={items}
      onDismiss={dismiss}
      closeLabel={t(message('Đóng thông báo', 'Dismiss notification', '알림 닫기'))}
      className="bottom-[calc(max(118px,var(--sticky-bar-clear,0px))+var(--ai-tray-h,0px))] lg:bottom-[calc(max(24px,var(--sticky-bar-clear,0px))+var(--ai-tray-h,0px))]"
    />
  )
}
