import { message } from '@/app/i18n'

/** Copy of the personal board of ADR 0160 §9. Metric names and "how it is counted"
 *  lines come from `data/kpi-i18n.ts`; only what the board adds is here. */

export const HOW = message('Tính thế nào:', 'How it is counted:', '계산 방법:')

export const heroKicker = (metric: string) =>
  message(`Chỉ số chính · ${metric}`, `Primary metric · ${metric}`, `핵심 지표 · ${metric}`)
export const reached = (share: string) =>
  message(`Đã đạt ${share} chỉ tiêu`, `${share} of target reached`, `목표의 ${share} 달성`)
export const paceToday = (share: string) =>
  message(`Nhịp hôm nay: ${share}`, `Today’s pace: ${share}`, `오늘 페이스: ${share}`)
export const neededToday = (value: string) =>
  message(`Tới hôm nay cần ${value}.`, `${value} needed by today.`, `오늘까지 ${value} 필요.`)

export const scoreMax = (cap: number) =>
  message(`điểm · tối đa ${cap}`, `points · up to ${cap}`, `점 · 최대 ${cap}`)
export const weightTag = (weight: string) =>
  message(`nặng ${weight}`, `weight ${weight}`, `비중 ${weight}`)
export const scoreScale = (cap: number) =>
  message(
    `Vạch đứng là mức 100%. Mỗi chỉ số tối đa ${cap}%.`,
    `The vertical mark is 100%. Each line is capped at ${cap}%.`,
    `세로선이 100%입니다. 지표당 최대 ${cap}%입니다.`,
  )

export const CHART_TITLE = message(
  'Tiến độ giá trị ký trong tháng',
  'Signed value through the month',
  '월 체결 금액 추이',
)
export const CHART_HINT = message(
  'Cộng dồn theo ngày. Đường nét đứt đổi theo cơ hội bạn chọn ở phần Dự báo tuần.',
  'Running total by day. The dashed line follows the opportunities you pick in the weekly forecast.',
  '일별 누적입니다. 점선은 주간 예측에서 고른 기회를 따릅니다.',
)
export const LEGEND_SIGNED = message('Đã ký', 'Signed', '체결')
export const LEGEND_FORECAST = message('Dự báo đã chọn', 'Picked forecast', '선택한 예측')
export const LEGEND_PACE = message('Nhịp cần để đạt', 'Pace needed', '필요 페이스')
export const targetOf = (value: string) =>
  message(`Chỉ tiêu ${value}`, `Target ${value}`, `목표 ${value}`)
export const todayMark = (day: string) => message(`Hôm nay ${day}`, `Today ${day}`, `오늘 ${day}`)
export const chartLabel = (signed: string, target: string) =>
  message(
    `Đã ký ${signed} trên chỉ tiêu ${target}.`,
    `Signed ${signed} against a target of ${target}.`,
    `체결 ${signed}, 목표 ${target}.`,
  )
export const ifAllSigned = (end: string) =>
  message(
    `Nếu ký đủ các cơ hội đã chọn, tháng này đạt ${end}`,
    `If every picked opportunity signs, the month reaches ${end}`,
    `선택한 기회를 모두 체결하면 이번 달 ${end}에 도달합니다`,
  )
export const andShare = (share: string) =>
  message(` · ${share} chỉ tiêu.`, ` · ${share} of target.`, ` · 목표의 ${share}.`)
export const gap = (value: string) =>
  message(` Còn thiếu ${value}.`, ` ${value} short.`, ` ${value} 부족.`)
export const over = (value: string) =>
  message(` Vượt chỉ tiêu ${value}.`, ` ${value} over target.`, ` 목표를 ${value} 초과.`)
export const signedOnly = (signed: string) =>
  message(`Đã ký ${signed}`, `Signed ${signed}`, `체결 ${signed}`)
export const signedShare = (share: string) =>
  message(`, đạt ${share} chỉ tiêu.`, `, ${share} of target.`, `, 목표의 ${share}.`)
export const NO_PICK = message(
  ' Chưa chọn cơ hội nào trong dự báo tuần.',
  ' No opportunity picked in the weekly forecast.',
  ' 주간 예측에서 고른 기회가 없습니다.',
)

export const limit = (value: string) =>
  message(`Giới hạn ${value}`, `Limit ${value}`, `한도 ${value}`)

export const planSigned = (value: string) =>
  message(`Đã ký ${value}`, `Signed ${value}`, `체결 ${value}`)
export const planMissing = (value: string) =>
  message(`Còn thiếu ${value}`, `${value} to go`, `${value} 남음`)

export const needTimes = (value: number) =>
  message(`cần ${value} lần`, `needs ${value}x`, `필요 ${value}배`)
export const gaugeScale = (top: number) =>
  message(`Thang 0–${top} lần.`, `Scale 0–${top}x.`, `범위 0–${top}배.`)
export const stagesTitle = (months: number) =>
  message(
    `Tỷ lệ đi tiếp qua từng giai đoạn · ${months} tháng`,
    `Moved on, by stage · ${months} months`,
    `단계별 다음 단계 이동률 · ${months}개월`,
  )
export const LEGEND_YOU = message('Bạn', 'You', '나')
export const LEGEND_UNIT = message('Trung bình đơn vị', 'Unit average', '조직 평균')
export const LEGEND_STEP_TARGET = message('Mục tiêu bước', 'Step target', '단계 목표')
export const unitRateTag = (rate: string) =>
  message(`Trung bình đơn vị ${rate}`, `Unit average ${rate}`, `조직 평균 ${rate}`)
export const targetTag = (rate: string) =>
  message(`Mục tiêu ${rate}`, `Target ${rate}`, `목표 ${rate}`)
export const bottleneck = (stage: string, rate: string, target: string | null) =>
  target === null
    ? message(
        `Điểm nghẽn: ${stage}, chỉ ${rate} đi tiếp.`,
        `Bottleneck: ${stage}, only ${rate} moved on.`,
        `병목: ${stage}, ${rate}만 다음 단계로.`,
      )
    : message(
        `Điểm nghẽn: ${stage}, ${rate} so với mục tiêu ${target}.`,
        `Bottleneck: ${stage}, ${rate} against a target of ${target}.`,
        `병목: ${stage}, ${rate} (목표 ${target}).`,
      )
