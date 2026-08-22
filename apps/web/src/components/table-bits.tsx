import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Icon } from '@pv/ui'
import { staffEmail } from '@pv/engines/fixtures/das-vina'

/** Ba mảnh dùng chung của MỌI SỔ — sổ lead (module Lead) và sổ cơ hội (module Ops).
 *
 *  Cả ba từng nằm private trong `pages/leads.tsx`. Chúng chuyển ra đây khi sổ
 *  cơ hội cần đúng ba thứ đó, và lý do tách quan trọng hơn chuyện đỡ gõ lại:
 *  hai cái sổ của cùng một phòng phải phân trang giống nhau, in hòm thư giống
 *  nhau, và vẽ ô trống giống nhau. Chép sang màn thứ hai là mở đường cho hai
 *  cái sổ trôi khỏi nhau — bên này "Trước/Sau", bên kia "◀ ▶", cùng một app.
 *
 *  Chúng KHÔNG lên `@pv/ui`: `PicCell` biết quy ước hòm thư của công ty, đó là
 *  kiến thức của app chứ không của thư viện component (biên giới package ·
 *  CLAUDE.md). Cần một Pager thật sự tổng quát thì đó là một atom mới, có mặt
 *  trên trang kit — việc riêng, không gộp vào đây. */

/** Phân trang. Sổ trăm dòng không cuộn vô tận — người dùng phải biết mình đang
 *  ở đâu trong sổ. */
export function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <Icon icon={ChevronLeft} size={16} />
        Trước
      </Button>
      <span className="text-muted-foreground tnum font-num text-[11.5px]">
        {page + 1}/{pageCount}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
      >
        Sau
        <Icon icon={ChevronRight} size={16} />
      </Button>
    </div>
  )
}

/** Cột người bên MÌNH — hòm thư công ty, không phải tên hiển thị.
 *
 *  Tên đọc đẹp nhưng TRÙNG ĐƯỢC; `huydq@pebblevina.com` thì không. Sổ là chỗ
 *  người ta đối chiếu với hệ khác (thư, lịch, bảng hoa hồng), và mọi hệ đó khoá
 *  theo hòm thư. Tên đầy đủ vẫn còn, ở `title`.
 *
 *  Cách dựng mã nằm ở fixture (`staffEmail`), không ở đây: đó là quy ước của
 *  công ty, không phải cách trình bày của một cái bảng. */
export function PicCell({ owner, empty }: { owner?: string; empty: string }) {
  if (!owner) {
    return (
      <span className="text-muted-foreground" title={empty}>
        —
      </span>
    )
  }
  return (
    <span className="block truncate font-mono text-[11px]" title={owner}>
      {staffEmail(owner)}
    </span>
  )
}

/** Một ô người bên KHÁCH: tên, hoặc "—" kèm lý do ở `title`.
 *
 *  "—" ở đây là DỮ LIỆU, không phải lỗi hiển thị. Điền đại một cái tên cho đủ ô
 *  là phá đúng thứ cổng init data sinh ra để đo — `leadContact` trong fixture
 *  đã ghi thẳng điều đó. */
export function PersonCell({ value, missing }: { value?: string; missing: string }) {
  if (!value) {
    return (
      <span className="text-muted-foreground" title={missing}>
        —
      </span>
    )
  }
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
  )
}
