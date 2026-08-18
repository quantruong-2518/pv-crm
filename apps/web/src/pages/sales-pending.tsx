import { Lock } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { AppShell, Chip, GlassCard, Icon } from '@pv/ui'
import { SALES_MODULES, useAppChrome } from '@/app/chrome'

/** Màn của module Sales CHƯA DỰNG.
 *
 *  Ba module 1 · 3 · 4 đã có mặt trên nav vì chúng là bộ đã chốt, nhưng chưa
 *  dựng được — mỗi cái vướng một thứ thật, ghi ở docs/kien-truc-san-pham.md ·
 *  "Nợ đang treo". Màn này nói đúng thứ đang vướng thay vì để nút chết trên nav
 *  hoặc gắn ổ khoá — ổ khoá nghĩa là "chưa mua", ở đây thì đã mua rồi.
 *
 *  Một màn dùng chung cho cả ba, nội dung đọc từ `SALES_MODULES`. Dựng xong
 *  module nào thì bỏ `blocked` của nó và trỏ route sang màn thật. */
export function SalesPendingPage() {
  const chrome = useAppChrome()
  const { pathname } = useLocation()
  const mod = SALES_MODULES.find((m) => m.path === pathname)

  return (
    <AppShell
      activeNav="home"
      approvalsCount={chrome.approvalsCount}
      sidebar={chrome.sidebar}
      topbar={chrome.topbar}
    >
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <h2 className="font-display text-[20px] font-semibold lg:text-[22px]">
            {mod ? `Module ${mod.no} · ${mod.label}` : 'Module chưa có'}
          </h2>
          <p className="text-muted-foreground mt-1 text-[12px]">
            {mod?.question ?? 'Đường dẫn này không thuộc bộ bốn module đã chốt.'}
          </p>
        </div>

        <GlassCard className="flex max-w-2xl flex-col gap-4 p-6 lg:p-8">
          <div className="flex items-center gap-2">
            <Icon icon={Lock} size={20} className="text-warning" />
            <h3 className="text-[13px] font-semibold">Chưa dựng được — vướng cái này</h3>
          </div>

          <p className="text-pretty text-[13px] leading-[1.7]">
            {mod?.blocked ?? 'Không tìm thấy module ứng với đường dẫn này.'}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-[11.5px]">Ghi ở</span>
            <Chip>docs/kien-truc-san-pham.md</Chip>
            <span className="text-muted-foreground text-[11.5px]">
              mục &quot;Nợ đang treo&quot;
            </span>
          </div>

          <p className="text-muted-foreground text-pretty text-[11.5px] leading-[1.6]">
            Đây là nợ cần người quyết, không phải việc còn dở. Quyết xong thì dựng, đừng dựng trước
            rồi chữa số sau.
          </p>
        </GlassCard>
      </div>
    </AppShell>
  )
}

export default SalesPendingPage
