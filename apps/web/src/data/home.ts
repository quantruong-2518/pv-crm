import { billions, millions, percent, type SparklineTone, type StatCardProps } from '@pv/ui'
import { SAO_DO_KPI, SAO_DO_RECEIVABLES, saoDo, type Kpi } from '@pv/engines/fixtures/sao-do'

/** Bốn ô KPI của màn 01 · Trang chủ. Kịch bản 1 · Sao Đỏ.
 *
 *  Trước bản này bốn ô gõ thẳng vào JSX của `pages/home.tsx` — cả con số lẫn
 *  câu delta — trong khi `SAO_DO_KPI` đã giữ đúng bộ số đó và `scenario.test.ts`
 *  đã khoá nó (ô "Công nợ quá hạn" phải bằng tổng `SAO_DO_RECEIVABLES`). Hai
 *  chỗ giữ cùng một con số là hai chỗ để chúng lệch nhau.
 *
 *  Cách format và câu delta viết ở đây chứ không ở màn: một câu chữ dựng trong
 *  JSX là một câu không ca test nào với tới được.
 *
 *  CÒN NỢ — dải sparkline. Kịch bản Sao Đỏ KHÔNG có chuỗi ngày cho bốn thước
 *  này; tám điểm của mỗi dải là DÁNG lấy từ bản vẽ gốc, không phải số đo được.
 *  Chúng ở đây dưới đúng cái tên đó (`SPARK`) thay vì nằm lẫn giữa các con số
 *  thật trong JSX. Muốn dải nói thật thì phải thêm chuỗi ngày vào fixture kèm
 *  test — việc của `packages/**`, đã ghi trong báo cáo bàn giao. */

type HomeKpi = {
  key: string
  value: string
  label: string
  delta: NonNullable<StatCardProps['delta']>
  /** Thiếu dáng thì thiếu hẳn: một đường thẳng vẽ thay chỗ trống là bịa ra xu
   *  hướng "đi ngang" mà không ai đo. */
  sparkline?: StatCardProps['sparkline']
}

/** Toạ độ y trong hệ viewBox 0–26 của `Sparkline`, tám mốc mỗi thước. Đây là
 *  HÌNH của bản vẽ, không phải số đo — xem docblock trên. */
const SPARK: Record<string, { points: number[]; source: string; tone: SparklineTone }> = {
  'doanh-thu': {
    points: [22, 18, 20, 13, 15, 8, 9, 3],
    source: 'tháng 8 · Sales',
    tone: 'success',
  },
  'dung-han': {
    points: [12, 11, 13, 12, 12, 13, 11, 12],
    source: '90 ngày · Supply',
    tone: 'warning',
  },
  'qua-han': {
    points: [20, 19, 16, 17, 11, 10, 6, 4],
    source: '30 ngày · Finance',
    tone: 'danger',
  },
  oee: { points: [6, 5, 8, 7, 6, 14, 19, 11], source: '24 giờ · Factory', tone: 'warning' },
}

/** Số ngày quá hạn dài nhất trong sổ công nợ. Mẫu của câu "quá hạn N ngày" —
 *  lấy từ chính bộ hoá đơn đã cộng ra con số 890 tr, nên hai vế của câu không
 *  thể nói về hai bộ khác nhau. */
const OVERDUE_DAYS = Math.max(...SAO_DO_RECEIVABLES.map((r) => r.overdueDays))

/** Câu delta của một thước. Ba trong bốn câu suy thẳng từ trường của `Kpi`;
 *  câu thứ tư đọc trạng thái của CNC-03 trong đồ thị E1 — máy đang lỗi là lý do
 *  hiệu suất xuống, và trạng thái đó đã có tên trong kịch bản. */
function deltaOf(k: Kpi): NonNullable<StatCardProps['delta']> {
  if (k.deltaPct !== undefined) {
    return {
      direction: k.deltaPct >= 0 ? 'up' : 'down',
      text: `vượt kế hoạch ${percent(k.deltaPct)}`,
      tone: 'success',
    }
  }

  if (k.target !== undefined) {
    return { direction: 'flat', text: `đi ngang · mục tiêu ${percent(k.target)}`, tone: 'warning' }
  }

  if (k.invoices !== undefined) {
    return {
      direction: 'up',
      text: `${k.invoices} hoá đơn · quá hạn ${OVERDUE_DAYS} ngày`,
      tone: 'danger',
    }
  }

  const cnc = saoDo.graph.get('CNC-03')
  return {
    direction: 'down',
    text: cnc?.state ? `CNC-03 ${cnc.state}` : 'CNC-03 chưa có trạng thái',
    tone: 'warning',
  }
}

/** Giá trị đã format. Tiền tính bằng đồng, tỉ lệ tính bằng phần thập phân —
 *  `Kpi` khai như vậy, nên chỗ duy nhất biết cái nào là cái nào là ở đây. */
function valueOf(k: Kpi): string {
  if (k.key === 'doanh-thu') return billions(k.value, 1)
  if (k.key === 'qua-han') return millions(k.value, 0)
  return percent(k.value, k.key === 'oee' ? 1 : 0)
}

export function homeKpis(): HomeKpi[] {
  return SAO_DO_KPI.map((k) => ({
    key: k.key,
    value: valueOf(k),
    label: k.label,
    delta: deltaOf(k),
    sparkline: SPARK[k.key],
  }))
}
