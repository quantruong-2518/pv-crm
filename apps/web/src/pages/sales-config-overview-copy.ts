import { message } from '@/app/i18n'

/** One-line values of the configuration overview. Each takes the figures
 *  already counted by the caller, so the copy never touches a read. */

type Count = number | string

export const NONE_YET = message('Chưa có', 'None yet', '없음')

export const typesCount = (n: Count) => message(`${n} loại`, `${n} types`, `유형 ${n}개`)
export const reasonsCount = (n: Count) => message(`${n} lý do`, `${n} reasons`, `사유 ${n}개`)
export const labelsCount = (n: Count) => message(`${n} nhãn`, `${n} labels`, `라벨 ${n}개`)
export const questionsCount = (n: Count) => message(`${n} câu`, `${n} questions`, `질문 ${n}개`)
export const itemsCount = (n: Count) => message(`${n} mục`, `${n} items`, `항목 ${n}개`)
export const teamsThisMonth = (n: Count) =>
  message(`${n} nhóm tháng này`, `${n} teams this month`, `이번 달 팀 ${n}개`)

export const stepFrameLine = (states: Count, steps: Count) =>
  message(
    `${states} trạng thái · ${steps} bước`,
    `${states} statuses · ${steps} steps`,
    `상태 ${states}개 · 활성 단계 ${steps}개`,
  )

export const tierLimitsLine = (withLimit: Count, total: Count) =>
  message(
    `${withLimit}/${total} bậc có hạn`,
    `${withLimit}/${total} tiers with deadlines`,
    `기한 설정 등급 ${withLimit}/${total}개`,
  )

export const motionsActiveLine = (active: Count, total: Count) =>
  message(`${active}/${total} đang bật`, `${active}/${total} active`, `활성 ${active}/${total}개`)

export const motionsDeclaredLine = (declared: Count, total: Count) =>
  message(
    `${declared}/${total} đã đặt`,
    `${declared}/${total} set`,
    `설정 완료 ${declared}/${total}개`,
  )

export const industriesLine = (groups: Count, industries: Count) =>
  message(
    `${groups} nhóm · ${industries} ngành đang bật`,
    `${groups} groups · ${industries} industries active`,
    `분야 ${groups}개 · 활성 업종 ${industries}개`,
  )

export const recareLine = (c: { hotDays: Count; warmDays: Count; coldDays: Count }) =>
  message(
    `Nóng ${c.hotDays} · Ấm ${c.warmDays} · Nguội ${c.coldDays} ngày`,
    `Hot ${c.hotDays} · warm ${c.warmDays} · cold ${c.coldDays} days`,
    `높음 ${c.hotDays} · 보통 ${c.warmDays} · 낮음 ${c.coldDays}일`,
  )

export const freshnessLine = (f: { warnDays: Count; alertDays: Count }) =>
  message(
    `Vàng ${f.warnDays} · đỏ ${f.alertDays} ngày`,
    `Yellow ${f.warnDays} · red ${f.alertDays} days`,
    `주의 ${f.warnDays}일 · 위험 ${f.alertDays}일`,
  )

export const metricsOffLine = (metrics: Count, roles: Count) =>
  message(
    `${metrics} chỉ số đang tắt ở ${roles} vai trò`,
    `${metrics} metrics disabled across ${roles} roles`,
    `${roles}개 역할에서 지표 ${metrics}개 비활성`,
  )

export const kpiAlertLine = (a: {
  slipPercent: Count
  hitPercent: Count
  tolerancePercent: number
}) =>
  message(
    `Sắp trượt dưới ${a.slipPercent}% · sắp đạt từ ${a.hitPercent}%${
      a.tolerancePercent > 0 ? ` · thiếu ${a.tolerancePercent}% vẫn tính Đúng tiến độ` : ''
    }`,
    `At risk below ${a.slipPercent}% · on track from ${a.hitPercent}%${a.tolerancePercent > 0 ? ` · up to ${a.tolerancePercent}% behind still counts as on track` : ''}`,
    `${a.slipPercent}% 미만 위험 · ${a.hitPercent}%부터 정상${a.tolerancePercent > 0 ? ` · ${a.tolerancePercent}%까지 미달해도 정상으로 계산` : ''}`,
  )

export const orgUnitsLine = (departments: Count, teams: Count) =>
  message(
    `${departments} phòng · ${teams} nhóm tháng này`,
    `${departments} departments · ${teams} teams this month`,
    `이번 달 부서 ${departments}개 · 팀 ${teams}개`,
  )
