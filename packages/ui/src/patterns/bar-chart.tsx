import { cn } from '../lib/cn'

/** M-12 · BarChart — cột dọc theo thời gian, hoặc thanh ngang theo bậc.
 *
 *  Sparkline (A-11) vẽ HÌNH DÁNG của một chuỗi trong 86px; nó không đọc được
 *  từng mốc. Khi mỗi mốc là một con số người ta phải so với nhau — bốn tháng
 *  của kỳ, sáu bậc của phễu — thì cần cột, và cột phải mang theo số của nó.
 *
 *  Hai hướng vì hai loại nhãn: nhãn thời gian ngắn ("T7") nên xếp dưới cột dọc,
 *  còn nhãn bậc dài ("Công ty thật") thì cột dọc không chứa nổi, phải nằm ngang.
 *
 *  `onSelect` biến cột thành nút: thanh thời gian vừa là biểu đồ vừa là bộ chọn
 *  kỳ. Một khối trả lời được cả "tháng nào cao" lẫn "cho tôi xem tháng đó".
 *
 *  `source` bắt buộc, cùng luật với Sparkline: số đứng cạnh nhau nhưng sinh ở
 *  các nhánh khác nhau, nên mỗi đồ thị phải tự khai nó lấy số ở đâu. */
export type BarTone = 'primary' | 'success' | 'warning' | 'danger' | 'muted'

const fillClass: Record<BarTone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  muted: 'bg-white/28',
}

export type BarDatum = {
  key: string
  label: string
  value: number
  /** chữ hiện thay cho số thô — "18,5 tỷ", "44%" */
  display?: string
  /** dòng phụ: tỷ lệ rớt so với bậc trước, ghi chú của cột */
  note?: string
  tone?: BarTone
  /** cột đang được chọn — sáng lên, đứng trước mọi tone */
  active?: boolean
  onSelect?: () => void
}

export type BarChartProps = {
  data: BarDatum[]
  /** 'column' = dọc, nhãn dưới chân · 'bar' = ngang, nhãn bên trái */
  orientation?: 'column' | 'bar'
  /** nhãn nguồn dữ liệu — BẮT BUỘC */
  source: string
  /** mốc 100% của thang. Mặc định là giá trị lớn nhất. */
  max?: number
  /** chiều cao vùng cột, chỉ dùng cho `column` */
  height?: number
  className?: string
}

/** Chỗ hàng số trên đầu và hàng nhãn dưới chân cột, cộng hai khe 8px. */
const LABEL_ROWS = 44

export function BarChart({
  data,
  orientation = 'column',
  source,
  max,
  height = 96,
  className,
}: BarChartProps) {
  /* Thang phải kể cả cột 0: `max` bằng 0 thì mọi cột cao 0 và đồ thị thành một
     vạch — chia cho 1 để giữ trục đứng yên thay vì biến mất. */
  const top = Math.max(max ?? Math.max(...data.map((d) => d.value), 0), 1)

  if (orientation === 'bar') {
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        <div className="flex flex-col gap-2">
          {data.map((d) => (
            <BarRow key={d.key} d={d} top={top} />
          ))}
        </div>
        <Source source={source} />
      </div>
    )
  }

  /* Chiều cao cột tính bằng PIXEL, không bằng phần trăm.
     Phần trăm phải quy chiếu vào một chiều cao xác định; ở đây khung cột là một
     flex item nên chiều cao của nó do flex chia ra, và trình duyệt trả về 0 cho
     `height: 40%` bên trong. Kết quả là đồ thị mất sạch cột mà không có lỗi nào.
     Trừ sẵn chỗ cho hàng số trên đầu và hàng nhãn dưới chân. */
  const barArea = Math.max(height - LABEL_ROWS, 16)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end gap-2">
        {data.map((d) => (
          <Column key={d.key} d={d} top={top} barArea={barArea} />
        ))}
      </div>
      <Source source={source} />
    </div>
  )
}

function Source({ source }: { source: string }) {
  return <span className="text-muted-foreground font-mono text-[9.5px]">{source}</span>
}

function Column({ d, top, barArea }: { d: BarDatum; top: number; barArea: number }) {
  const pick = d.active ? 'primary' : (d.tone ?? 'muted')
  /* Sàn 3px: cột giá trị 0 vẫn phải nhìn thấy được, nếu không người xem không
     phân biệt "bằng 0" với "không có cột nào ở đây". */
  const barHeight = Math.max(Math.round((d.value / top) * barArea), 3)

  const body = (
    <>
      <span
        className={cn(
          'tnum font-num text-[11.5px] font-semibold leading-none',
          d.active ? 'text-accent-foreground' : 'text-muted-foreground',
        )}
      >
        {d.display ?? d.value}
      </span>
      {/* Rãnh nền chạy hết chiều cao: thiếu nó thì một cột cao gần trọn khung
          đọc ra như một cái hộp đặc chứ không như một cột đã gần chạm đỉnh. */}
      <span
        className="bg-white/6 flex w-full items-end justify-center overflow-hidden rounded-sm"
        style={{ height: barArea }}
      >
        <span
          className={cn('motion-std w-full rounded-sm', fillClass[pick])}
          style={{ height: barHeight }}
        />
      </span>
      <span
        className={cn(
          'text-[10.5px] leading-none',
          d.active ? 'text-foreground font-semibold' : 'text-muted-foreground',
        )}
      >
        {d.label}
      </span>
      {d.note && <span className="text-muted-foreground text-[9.5px] leading-none">{d.note}</span>}
    </>
  )

  /* Cột rộng cố định. Cho `flex-1` thì chuỗi bốn mốc kéo mỗi cột ra 300px và
     nó không còn đọc ra là cột nữa, mà ra như bốn cái hộp. */
  const shell = 'flex w-[56px] shrink-0 flex-col items-center gap-2'

  if (!d.onSelect) return <span className={shell}>{body}</span>

  return (
    <button
      type="button"
      aria-pressed={d.active}
      onClick={d.onSelect}
      className={cn(
        shell,
        'motion-std hover:bg-white/8 rounded-md py-1 outline-none',
        'focus-visible:shadow-[0_0_0_2px_color-mix(in_srgb,var(--ring)_55%,transparent)]',
      )}
    >
      {body}
    </button>
  )
}

function BarRow({ d, top }: { d: BarDatum; top: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
      <span className="truncate text-[12px]">{d.label}</span>
      <span className="tnum font-num text-right text-[13px] font-semibold">
        {d.display ?? d.value}
      </span>
      <span className="col-span-2 flex items-center gap-3">
        <span className="h-2 flex-1 overflow-hidden rounded-sm bg-white/10">
          <span
            className={cn('block h-full rounded-sm', fillClass[d.tone ?? 'primary'])}
            style={{ width: `${Math.max((d.value / top) * 100, 1)}%` }}
          />
        </span>
        {d.note && (
          <span className="text-muted-foreground tnum w-[116px] shrink-0 whitespace-nowrap text-right text-[10.5px]">
            {d.note}
          </span>
        )}
      </span>
    </div>
  )
}
