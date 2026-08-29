import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Cột phụ DÍNH của màn chi tiết — hồ sơ lead và hồ sơ cơ hội dùng chung một cái.
 *
 *  `xl:sticky xl:top-[128px]` tĩnh chỉ đúng khi cột phụ thấp hơn viewport. Cao
 *  hơn thì trình duyệt ghim phần ĐẦU cột lại: người cuộn xuống hết trang vẫn
 *  không bao giờ nhìn thấy thẻ cuối cùng, vì phần thò ra dưới đáy không có chỗ
 *  nào để trôi lên. Nên `top` phải co lại theo chiều cao thật của cột — âm cũng
 *  được, đó chính là cách kéo phần đuôi vào tầm mắt — và chiều cao thật chỉ
 *  biết được sau khi vẽ, tức phải đo bằng `ResizeObserver` chứ không tính được
 *  ở tầng class.
 *
 *  Hai màn từng khác nhau ở chỗ này: lead đo động, cơ hội ghim tĩnh — giống
 *  nhau về số đo mà khác nhau về hành vi, thứ người dùng cảm thấy ngay khi đi
 *  từ hồ sơ này sang hồ sơ kia. Gộp về một component để lần chỉnh sau chỉ có
 *  một chỗ để chỉnh.
 *
 *  KHÔNG lên `@pv/ui`, và không phải vì nó "chưa đủ chín": `128` là chiều cao
 *  thanh trên của CHÍNH APP NÀY. Một layout primitive của thư viện thì phải
 *  nhận offset bằng prop và tuyệt đối không được tự biết con số đó — đem nó lên
 *  `@pv/ui` là đem một hằng số của app vào thư viện, đúng thứ biên giới package
 *  trong CLAUDE.md cấm (`no-restricted-imports`: `@pv/ui` không biết app). */

/** Thanh trên của app cao 128px ở dải xl — cột dính neo ngay dưới nó. */
const TOP_BAR_OFFSET = 128

/** Chừa lại một mẩu dưới đáy khi phải kéo cột lên, để thẻ cuối không dán mép. */
const BOTTOM_GAP = 16

export function DetailSidePanel({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [stickyTop, setStickyTop] = useState(TOP_BAR_OFFSET)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const syncStickyTop = () => {
      const top = Math.min(TOP_BAR_OFFSET, window.innerHeight - panel.offsetHeight - BOTTOM_GAP)
      setStickyTop(top)
    }
    const observer = new ResizeObserver(syncStickyTop)
    observer.observe(panel)
    window.addEventListener('resize', syncStickyTop)
    syncStickyTop()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncStickyTop)
    }
  }, [])

  return (
    <div
      ref={panelRef}
      className="flex w-full min-w-0 flex-col gap-6 xl:sticky xl:self-start"
      style={{ top: stickyTop }}
    >
      {children}
    </div>
  )
}
