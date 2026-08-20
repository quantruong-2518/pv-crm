import { cn } from '../lib/cn'
import { Money } from './money'

/** A-21 · CostBand — giá mỗi lead tốt, nói kèm cả phần chưa chắc.
 *
 *  ---- Vì sao component này tồn tại ----
 *  Màn hôm nay in đúng MỘT con số — "48,3 tr mỗi lead tốt" — và người đọc hiểu
 *  đó là sự thật đã chốt. Nó là 145 triệu chia cho **3** lead tốt. Phép kiểm χ²
 *  trên tám nguồn ra 3,75 với df = 7: chưa đủ bằng chứng nói tám nguồn khác
 *  nhau về chất lượng, và trong 15 cặp chỉ **5 cặp** được phép nói "rẻ hơn"
 *  (`docs/plans/chi-phi-nguon-lead.md §6.6`). Một con số trần trụi ở ô bảng nói
 *  ngược lại cả hai điều đó.
 *
 *  Component KHÔNG tính gì cả. Wilson, co ngót và cổng đủ mẫu nằm ở
 *  `@pv/engines/stats`; `@pv/ui` không biết engine (CLAUDE.md · "Biên giới
 *  package"). Ở đây chỉ có ba con số vào và một cách bày chúng ra.
 *
 *  ---- Ba cách bày, và vì sao phải khác nhau ----
 *  Cả ba dùng đúng hai dòng — ô của `DataTable` cao `h-11` (44px), dòng thứ ba
 *  là tràn. Thứ tự hai dòng nói ai là phần đọc chính:
 *
 *   · **A · bình thường** — điểm ở trên (đậm), dải ở dưới (nhạt). Con số điểm
 *     đứng được thì nó vẫn là thứ người ta muốn liếc.
 *   · **B · `enough = false`** — **đảo**: dải lên trên và đậm, điểm tụt xuống
 *     dòng nhạt sau nhãn "chưa đủ để so". Không giấu số — giấu số là bắt người
 *     đọc đi tìm ở chỗ khác rồi tin nó hơn — chỉ đổi thứ tự nhấn.
 *   · **C · `point = null`** — 0 lead tốt. Dòng đầu nói thẳng "chưa có lead
 *     tốt"; dải xuống dòng hai nhưng **giữ màu chữ chính**, vì lúc đó nó là con
 *     số duy nhất còn đọc được. Ca này KHÔNG in `0`: một nguồn 0 lead tốt mà
 *     hiện "0 ₫ mỗi lead tốt" là khẳng định nó rẻ nhất sổ.
 *     Đã nói "chưa có lead tốt" thì không dán thêm "chưa đủ để so" — hai nhãn
 *     nói cùng một chuyện, và ô bảng không có chỗ cho cả hai.
 *
 *  `hi = null` là dải hở đầu trên (mẫu số có thể bằng 0 nên cận đắt là vô cực,
 *  mà vô cực không phải một số tiền) — đọc thành "từ {lo} trở lên", không phải
 *  "{lo} – ∞".
 *
 *  `enough` mặc định `true`: cổng đủ mẫu là việc của engine, không truyền thì
 *  coi như engine đã gật. Chỗ nào chưa nối engine mà muốn an toàn thì truyền
 *  thẳng `enough={false}`. */
export type CostBandProps = {
  /** Điểm ước lượng, đồng. `null` = CHƯA CÓ lead tốt nào — không phải 0 đồng. */
  point: number | null
  /** Cận dưới khoảng tin cậy, đồng. Luôn có: kể cả 0 lead tốt vẫn nói được "ít nhất X". */
  lo: number
  /** Cận trên, đồng. `null` = không chặn trên được (mẫu số có thể bằng 0). */
  hi: number | null
  /** Cỡ mẫu đủ để đọc con số điểm chưa. Chưa đủ thì con số điểm phải nhạt đi
   *  và dải mới là phần đọc chính — không giấu số, nhưng đổi thứ tự nhấn. */
  enough?: boolean
  variant?: 'table' | 'card'
  className?: string
}

/** Cỡ chữ của hai dòng. `lead` là dòng đọc trước, `sub` là dòng chú.
 *  Bản `table` khớp `text-[12.5px]` của dòng `DataTable`; bản `card` khớp cỡ
 *  "trong thẻ" mà `Money` tự khai (Space Grotesk 20). */
const SIZE = {
  table: { lead: 'text-[12.5px]', sub: 'text-[11px]' },
  card: { lead: 'text-[20px]', sub: 'text-[11.5px]' },
} as const

/** Hai cận luôn đọc bằng **triệu** (`Money scale="card"`), kể cả trong bảng nơi
 *  con số điểm ghi đủ hàng đồng. Hai lý do, và lý do đầu mới là lý do thật:
 *   · cận là số ƯỚC LƯỢNG — ghi nó tới hàng đồng là giả vờ chính xác, đúng cái
 *     bệnh component này sinh ra để chữa;
 *   · "23.303.830 ₫ – 135.264.000 ₫" dài 28 ký tự mono, không ô bảng nào chứa.
 *
 *  Dải không bao giờ được xuống dòng giữa chừng (`whitespace-nowrap`): một
 *  khoảng bị cắt làm đôi đọc ra thành hai con số rời. */
function Band({
  lo,
  hi,
  size,
  className,
}: {
  lo: number
  hi: number | null
  size: string
  className?: string
}) {
  const money = (value: number) => (
    <Money value={value} scale="card" className={cn(size, 'font-normal tracking-normal')} />
  )

  return (
    <span className={cn('whitespace-nowrap', size, className)}>
      {hi === null ? (
        <>từ {money(lo)} trở lên</>
      ) : (
        <>
          {money(lo)} <span className="sr-only">đến</span>
          <span aria-hidden>–</span> {money(hi)}
        </>
      )}
    </span>
  )
}

export function CostBand({
  point,
  lo,
  hi,
  enough = true,
  variant = 'table',
  className,
}: CostBandProps) {
  const size = SIZE[variant]
  const table = variant === 'table'
  /* `flex flex-col` không đặt `items-*`: hai dòng giãn hết bề ngang và chữ theo
     `text-align` thừa kế từ ô — cột căn phải của `DataTable` vì thế vẫn phải. */
  const root = cn('flex flex-col gap-1', table && 'whitespace-nowrap', className)

  /** Con số điểm — mono đủ đồng trong bảng, Space Grotesk triệu trong thẻ. */
  const pointMoney = (value: number, dim: boolean) => (
    <Money
      value={value}
      scale={table ? 'table' : 'card'}
      className={dim ? cn(size.sub, !table && 'font-normal tracking-normal') : undefined}
    />
  )

  /* C0 · KHÔNG CÓ GÌ ĐỂ ĐO trong kỳ này — nguồn chưa chạy, hoặc chạy rồi mà
     kỳ đang xem nằm trước ngày nó bắt đầu. `lo = 0` cộng `hi = null` là dải
     rỗng, và in "từ 0,0 tr trở lên" là khẳng định một sàn giá bằng 0 cho thứ
     chưa đo được — đúng loại nói ngược mà cả file này viết ra để cấm. */
  if (point === null && lo === 0 && hi === null) {
    return (
      <span className={root}>
        <span className={cn('text-muted-foreground', size.lead)}>chưa đo được trong kỳ này</span>
      </span>
    )
  }

  // C · chưa có lead tốt nào
  if (point === null) {
    return (
      <span className={root}>
        <span className={cn('text-muted-foreground', size.lead)}>chưa có lead tốt</span>
        <Band lo={lo} hi={hi} size={size.sub} />
      </span>
    )
  }

  // B · mẫu chưa đủ để đọc con số điểm
  if (!enough) {
    return (
      <span className={root}>
        <Band lo={lo} hi={hi} size={size.lead} />
        <span className={cn('text-muted-foreground', size.sub)}>
          <span className="text-warning">chưa đủ để so</span> · {pointMoney(point, true)}
        </span>
      </span>
    )
  }

  // A · bình thường
  return (
    <span className={root}>
      {pointMoney(point, false)}
      <Band lo={lo} hi={hi} size={size.sub} className="text-muted-foreground" />
    </span>
  )
}
