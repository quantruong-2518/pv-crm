import { message } from '@/app/i18n'

/** Words of the Marketing, BD and Presales boards of the "mine" tab (ADR 0160 §8–9).
 *  Step names come from `kpiFunnelStepText`, one word per step on every screen. */

export const FUNNEL_TITLE = {
  marketing: message(
    'Phễu tháng này: từ lead tới cơ hội',
    'This month’s funnel: from lead to opportunity',
    '이번 달 퍼널: 리드에서 기회까지',
  ),
  bd: message(
    'Phễu tháng này: từ lead tới cơ hội Sale nhận',
    'This month’s funnel: from lead to an opportunity Sale accepts',
    '이번 달 퍼널: 리드에서 영업이 수락한 기회까지',
  ),
  presales: message(
    'Phễu tháng này: từ buổi khảo sát tới hợp đồng',
    'This month’s funnel: from survey to contract',
    '이번 달 퍼널: 조사에서 계약까지',
  ),
} as const

export const FUNNEL_HINT = message(
  'Độ dài thanh đúng theo số lượng.',
  'Bar length is proportional to the count.',
  '막대 길이는 건수에 비례합니다.',
)

export const NECK = message('Điểm nghẽn', 'Bottleneck', '병목')

export const RATES_TITLE = message(
  'Tỷ lệ so với mục tiêu',
  'Rates against target',
  '목표 대비 비율',
)

export const RATES_LEGEND = {
  actual: message('Thực tế', 'Actual', '실적'),
  mark: message('Mục tiêu hoặc giới hạn', 'Target or limit', '목표 또는 한도'),
} as const

export const RATE_STATUS = {
  met: message('Đạt', 'Met', '달성'),
  within: message('Trong giới hạn', 'Within the limit', '한도 이내'),
  under: message('Dưới mục tiêu', 'Under target', '목표 미달'),
  over: message('Quá giới hạn', 'Over the limit', '한도 초과'),
  unset: message('Chưa đặt mục tiêu', 'No target set', '목표 미설정'),
  none: message('Chưa có số', 'No figure yet', '수치 없음'),
} as const

export const TREND_GAP = message(
  'Tháng chưa có số để trống.',
  'A month with no figure is left empty.',
  '수치가 없는 달은 비워 둡니다.',
)

export const TREND_TODAY = message(
  'Tháng cuối tính tới hôm nay.',
  'The last month runs up to today.',
  '마지막 달은 오늘까지의 수치입니다.',
)

export const BOARD_READ = {
  funnel: message('phễu', 'the funnel', '퍼널'),
  rates: message('tỷ lệ', 'the rates', '비율'),
  trend: message('xu hướng 6 tháng', 'the six-month trend', '6개월 추이'),
  sources: message('bảng theo kênh', 'the table by channel', '채널별 표'),
  origins: message('nguồn lead', 'the lead origins', '리드 출처'),
  opportunities: message('danh sách cơ hội', 'the opportunity list', '기회 목록'),
  collection: message('tiến độ thu tiền', 'the collection progress', '수금 현황'),
} as const
