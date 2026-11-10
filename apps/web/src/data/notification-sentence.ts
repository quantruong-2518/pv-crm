import {
  NOTIFICATION_DETAIL_COUNT,
  NOTIFICATION_DETAIL_DEALS,
  NOTIFICATION_DETAIL_FOR,
  NOTIFICATION_DETAIL_HIT,
  NOTIFICATION_DETAIL_NO,
  NOTIFICATION_DETAIL_PROPOSED,
  NOTIFICATION_DETAIL_REASON,
  NOTIFICATION_DETAIL_RESOLVED,
  NOTIFICATION_DETAIL_SLIP,
  NOTIFICATION_DETAIL_STEPS,
  NOTIFICATION_DETAIL_TITLE,
  notificationSentence,
  type NotificationRow,
} from '@pv/contracts'
import { formatNumber, getLang, message, translate, type Lang } from '@/app/i18n'

/** The two overdue-reason kinds (ADR 0100), read off the row. `detail` carries
 *  `no` (the installment) and, once decided, `decision` (`approved` | `rejected`)
 *  and an optional `note`. Kept apart from `notifications.ts` because the popup
 *  file needs the sentence and `notifications.ts` already imports the popup. */

/** The installment number, or `null` for another kind or a row without one, so
 *  no path ends in `/undefined`. */
export function overdueReasonNo(row: NotificationRow): number | null {
  if (row.kind !== 'overdue-reason-waiting' && row.kind !== 'overdue-reason-decided') return null
  if (row.subject.kind !== 'contract') return null
  const no = Number(row.detail?.[NOTIFICATION_DETAIL_NO])
  return Number.isInteger(no) && no >= 1 ? no : null
}

function overdueReasonSentence(row: NotificationRow, lang: Lang): string | null {
  const no = overdueReasonNo(row)
  if (!no) return null
  const count = formatNumber(no, lang)
  const code = row.subject.code
  const what = translate(
    message(
      `đợt ${count} của hợp đồng ${code}`,
      `installment ${count} of contract ${code}`,
      `계약 ${code}의 납부 회차 ${count}`,
    ),
    lang,
  )
  if (row.kind === 'overdue-reason-waiting')
    return row.actor
      ? translate(
          message(
            `${row.actor.name} ghi lý do quá hạn ${what}, chờ bạn duyệt`,
            `${row.actor.name} submitted an overdue reason for ${what}. Review it.`,
            `${row.actor.name}님이 ${what} 연체 사유를 제출했습니다. 검토해 주세요.`,
          ),
          lang,
        )
      : null
  const { decision, note } = row.detail ?? {}
  if (decision === 'approved')
    return translate(
      message(
        `Lý do quá hạn ${what} đã được duyệt`,
        `The overdue reason for ${what} was approved`,
        `${what}의 연체 사유가 승인되었습니다`,
      ),
      lang,
    )
  if (decision !== 'rejected') return null
  const text = translate(
    message(
      `Lý do quá hạn ${what} bị từ chối`,
      `The overdue reason for ${what} was rejected`,
      `${what}의 연체 사유가 거절되었습니다`,
    ),
    lang,
  )
  return `${text}${note ? `: ${note}` : ''}`
}

const TEAM_MONTH = /^tháng (\d{1,2})\/(\d{4})$/

/** `kpi-team-share-assigned` (ADR 0101). The subject label is
 *  `<team> · <role> · <month text>`; a team name is free text and may hold the
 *  separator, so it is read from the right. `null` for any other shape. */
function teamShareSentence(row: NotificationRow, lang: Lang): string | null {
  if (row.kind !== 'kpi-team-share-assigned' || !row.subject.label) return null
  const parts = row.subject.label.split(' · ')
  const month = parts.at(-1)
  const role = parts.at(-2)
  const team = parts.slice(0, -2).join(' · ')
  const match = month?.match(TEAM_MONTH)
  if (!team || !role || !match) return null
  const period = translate(
    message(month!, `${match[1]}/${match[2]}`, `${match[2]}년 ${match[1]}월`),
    lang,
  )
  return translate(
    message(
      `Nhóm ${team} được giao chỉ tiêu ${role} ${period}. Chia cho thành viên.`,
      `${team} received the ${role} target for ${period}. Assign it to members.`,
      `${team} 팀에 ${period} ${role} 목표가 배정되었습니다. 팀원에게 배분하세요.`,
    ),
    lang,
  )
}

/** `kpi-digest` (ADR 0145): the non-zero counts joined by a dot, like the vi sentence. */
function digestSentence(row: NotificationRow, lang: Lang): string | null {
  const count = (key: string) => {
    const value = row.detail?.[key]
    return typeof value === 'number' ? value : 0
  }
  const parts = [
    [
      count(NOTIFICATION_DETAIL_SLIP),
      message('', 'metrics that may miss target', '목표 미달 우려 지표'),
    ],
    [count(NOTIFICATION_DETAIL_HIT), message('', 'metrics close to target', '목표 달성 임박 지표')],
    [
      count(NOTIFICATION_DETAIL_PROPOSED),
      message('', 'target change requests awaiting review', '검토 대기 중인 목표 변경 요청'),
    ],
    [
      count(NOTIFICATION_DETAIL_RESOLVED),
      message('', 'target change requests decided', '처리된 목표 변경 요청'),
    ],
  ] as const
  const said = parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${formatNumber(value, lang)} ${translate(unit, lang)}`)
  return said.length > 0 ? said.join(' · ') : null
}

function otherSentence(row: NotificationRow, lang: Lang): string | null {
  if (lang === 'vi') return notificationSentence(row)
  const name = row.subject.label
  const count = (key: string) => {
    const value = row.detail?.[key]
    return typeof value === 'number' ? value : 0
  }
  const n = (value: number) => formatNumber(value, lang)
  if (row.kind === 'kpi-digest') return digestSentence(row, lang)
  const standsFor = row.detail?.[NOTIFICATION_DETAIL_FOR]
  if (row.kind === 'kpi-stand-in' && typeof standsFor === 'string') {
    const waiting = count(NOTIFICATION_DETAIL_COUNT)
    const tail =
      waiting > 0
        ? translate(
            message('', ` · ${n(waiting)} items waiting`, ` · 대기 중인 항목 ${n(waiting)}개`),
            lang,
          )
        : ''
    return translate(
      message(
        '',
        `You are covering ${standsFor}'s KPI work${tail}`,
        `${standsFor}님의 KPI 업무를 대신 맡고 있습니다${tail}`,
      ),
      lang,
    )
  }
  if (!name) return null
  if (row.kind === 'lead-received' && row.detail?.[NOTIFICATION_DETAIL_STEPS] !== undefined) {
    const parts = [
      count(NOTIFICATION_DETAIL_COUNT) > 0
        ? translate(
            message(
              '',
              `${n(count(NOTIFICATION_DETAIL_COUNT))} leads`,
              `리드 ${n(count(NOTIFICATION_DETAIL_COUNT))}건`,
            ),
            lang,
          )
        : null,
      count(NOTIFICATION_DETAIL_DEALS) > 0
        ? translate(
            message(
              '',
              `${n(count(NOTIFICATION_DETAIL_DEALS))} opportunities`,
              `기회 ${n(count(NOTIFICATION_DETAIL_DEALS))}건`,
            ),
            lang,
          )
        : null,
      count(NOTIFICATION_DETAIL_STEPS) > 0
        ? translate(
            message(
              '',
              `${n(count(NOTIFICATION_DETAIL_STEPS))} next steps`,
              `다음 작업 ${n(count(NOTIFICATION_DETAIL_STEPS))}건`,
            ),
            lang,
          )
        : null,
    ]
      .filter(Boolean)
      .join(', ')
    return translate(
      message(
        '',
        `You received work from ${name}: ${parts}`,
        `${name}님에게서 업무를 받았습니다: ${parts}`,
      ),
      lang,
    )
  }
  const reason = row.detail?.[NOTIFICATION_DETAIL_REASON]
  if (row.kind === 'meeting-cancelled' && typeof reason === 'string')
    return translate(
      message(
        '',
        `${n(count(NOTIFICATION_DETAIL_COUNT))} upcoming meetings with ${name} were cancelled: ${reason}`,
        `${name}님과 예정된 회의 ${n(count(NOTIFICATION_DETAIL_COUNT))}건이 취소되었습니다: ${reason}`,
      ),
      lang,
    )
  const title = row.detail?.[NOTIFICATION_DETAIL_TITLE]
  if (row.kind === 'meeting-calendar-failed' && typeof title === 'string')
    return translate(
      message(
        '',
        `Meeting “${title}” with ${name} could not be added to Google Calendar. Open the meeting and save it again.`,
        `${name}님과의 회의 “${title}”을 Google Calendar에 추가하지 못했습니다. 회의를 열고 다시 저장하세요.`,
      ),
      lang,
    )
  if (row.kind === 'comm-record-late')
    return translate(
      message(
        '',
        `Contact details for ${name} are overdue`,
        `${name} 연락 기록의 보완 기한이 지났습니다`,
      ),
      lang,
    )
  return null
}

/** The sentence a bell line or popup says for this row, or `null` for the
 *  kind's fixed label. The line and the popup both ask here. */
export const sentenceOf = (row: NotificationRow, lang: Lang = getLang()): string | null =>
  overdueReasonSentence(row, lang) ?? teamShareSentence(row, lang) ?? otherSentence(row, lang)
