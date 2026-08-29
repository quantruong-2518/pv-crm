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
 *  Hai màn từng khác nhau ở chỗ này: lead đo động, còn cơ hội KHÔNG DÍNH GÌ CẢ
 *  — cột phụ của nó là một fragment trần. Người đi từ hồ sơ này sang hồ sơ kia
 *  cảm thấy ngay: một bên ba thẻ tra cứu theo mắt xuống hết trang, bên kia
 *  chúng trôi mất từ nửa đường. Gộp về một component để lần chỉnh sau chỉ có
 *  một chỗ để chỉnh.
 *
 *  KHÔNG lên `@pv/ui`, và không phải vì nó "chưa đủ chín": `TOP_BAR_OFFSET` đo
 *  thanh trên của CHÍNH APP NÀY. Một layout primitive của thư viện thì phải
 *  nhận offset bằng prop và tuyệt đối không được tự biết con số đó — đem nó lên
 *  `@pv/ui` là đem một hằng số của app vào thư viện, đúng thứ biên giới package
 *  trong CLAUDE.md cấm (`no-restricted-imports`: `@pv/ui` không biết app). */

/** Cột dính neo ngay dưới thanh trên của app: `AppHeader` là hai tầng, 64 + 48
 *  = 112px, cộng 16px thở để thẻ đầu không dán vào mép nav. Ghi ra cơ sở chứ
 *  không chỉ ghi tổng — file này tồn tại để lần chỉnh sau chỉ có MỘT chỗ để
 *  chỉnh, mà một con số không nói ra nó cộng từ đâu thì lần sau sẽ chỉnh sai. */
const TOP_BAR_OFFSET = 112 + 16

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
