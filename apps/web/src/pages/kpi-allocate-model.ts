import type { BadgeProps } from '@pv/ui'
import {
  KPI_CATALOG,
  type KpiAckState,
  type KpiAllocation,
  type KpiAllocationLine,
  type KpiAllocationStatus,
  type KpiCounter,
  type KpiCounterStatus,
  type KpiMetricDef,
  type KpiTeam,
  type KpiTeamRef,
  type KpiUnit,
  type RoleId,
} from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { dm, dmhm } from '@/lib/date'
import { getLang, message, translate, type Message } from '@/app/i18n'
import { kpiAckText, kpiMetricText, kpiPackageText } from '@/data/kpi-i18n'
import { MONTH_PARAM, printValue } from './kpi-model'

/** What the targets, team and receipt screens share and is not a component:
 *  the status words, the targets path, a month carried in the address, a
 *  counter told in words, and how a refused write is told. No render, no fetch.
 *
 *  The label maps live here rather than in `@pv/contracts` only because no
 *  other screen prints them yet. */

type Tone = NonNullable<BadgeProps['tone']>

/** A label whose `text` is read at render, so it follows the language without callers changing. */
export const labelled = <T extends string>(text: () => string, tone: T) => ({
  get text() {
    return text()
  },
  tone,
})

export const PACKAGE_LABEL: Record<KpiAllocationStatus, { text: string; tone: Tone }> = {
  draft: labelled(() => kpiPackageText('draft'), 'draft'),
  submitted: labelled(() => kpiPackageText('submitted'), 'warning'),
  returned: labelled(() => kpiPackageText('returned'), 'danger'),
  agreed: labelled(() => kpiPackageText('agreed'), 'success'),
  superseded: labelled(() => kpiPackageText('superseded'), 'success'),
}

/** A holder's answer to a line, one wording for the holder and the manager alike.
 *  `lapsed`: the deadline passed unanswered, so the head's level applies. */
export const ACK_LABEL: Record<KpiAckState, { text: string; tone: Tone }> = {
  pending: labelled(() => kpiAckText('pending'), 'warning'),
  countered: labelled(() => kpiAckText('countered'), 'running'),
  acknowledged: labelled(() => kpiAckText('acknowledged'), 'success'),
  lapsed: labelled(() => kpiAckText('lapsed'), 'draft'),
}

/** What still waits on someone first, so the holder reads their own move first. */
const ACK_ORDER: readonly KpiAckState[] = ['pending', 'countered', 'acknowledged', 'lapsed']

/** Lines per answer, non-zero only: a holder with mixed answers is never read as one (ADR 0114). */
export const ackCounts = (lines: readonly Pick<KpiAllocationLine, 'ackState'>[]) =>
  ACK_ORDER.map((state) => ({
    state,
    count: lines.filter((l) => l.ackState === state).length,
  })).filter((c) => c.count > 0)

/** The deadline a `lapsed` line missed, as `dd/mm`. The server names the day:
 *  a line carried into a reissue missed an older deadline than the package's. */
export const missedDueOf = (line: Pick<KpiAllocationLine, 'lapsedOn'>): string | null =>
  line.lapsedOn ? dm(line.lapsedOn) : null

export const missedText = (days: readonly string[]) => {
  const list = days.join(', ')
  return translate(
    message(
      `Hạn trả lời ${list} đã qua`,
      `Reply deadline ${list} has passed`,
      `회신 기한 ${list}이(가) 지났습니다`,
    ),
  )
}

const COUNTER_TEXT: Record<KpiCounterStatus, Message> = {
  open: message('Chờ xử lý', 'Pending', '처리 대기'),
  accepted: message('Đã đồng ý', 'Accepted', '수락됨'),
  kept: message('Giữ mức cũ', 'Kept current value', '기존 값 유지'),
  countered: message('Đã đề nghị mức khác', 'Different value proposed', '다른 값 제안됨'),
}

export const COUNTER_LABEL: Record<KpiCounterStatus, { text: string; tone: Tone }> = {
  open: labelled(() => translate(COUNTER_TEXT.open), 'warning'),
  accepted: labelled(() => translate(COUNTER_TEXT.accepted), 'success'),
  kept: labelled(() => translate(COUNTER_TEXT.kept), 'draft'),
  countered: labelled(() => translate(COUNTER_TEXT.countered), 'running'),
}

export const TARGETS_PATH = '/sales/kpi/targets'

/** The team page reads the month from the same query name as every KPI screen. */
export const teamPath = (teamId: string, period: string) =>
  `/sales/kpi/team/${encodeURIComponent(teamId)}?${MONTH_PARAM}=${period}`

export const monthQuery = (period: string) => `?${MONTH_PARAM}=${period}`

/** Navigation state a link puts on `targetsPath` to land on the role's step even
 *  when the targets screen is already open. */
export const LAND_ON_STEP = { landOnStep: true } as const
export const landsOnStep = (state: unknown) =>
  typeof state === 'object' && state !== null && 'landOnStep' in state

/** The targets screen opened on a role, and on a team's package of it when given. */
export function targetsPath(period: string, role: RoleId, teamId?: string): string {
  const q = new URLSearchParams({ [MONTH_PARAM]: period, role })
  if (teamId) q.set('team', teamId)
  return `${TARGETS_PATH}?${q.toString()}`
}

/** The team's name after a role, for a package or counter that sits on a team. */
export const teamSuffix = (team: KpiTeamRef | null) =>
  team
    ? ` · ${translate(message(`Nhóm ${team.name}`, `Team ${team.name}`, `${team.name} 팀`))}`
    : ''

/** A team the room package splits a share to. */
export type TeamRow = { id: string; name: string; memberCount: number }

/** Teams with someone holding the role, plus any team a saved share still names
 *  after the roster moved: a share must stay visible to be cleared. */
export function teamRowsOf(
  role: RoleId,
  teams: readonly KpiTeam[],
  room: KpiAllocation | undefined,
): TeamRow[] {
  const rows = teams.flatMap((t) => {
    const memberCount = t.members.filter((m) => m.roleIds.includes(role)).length
    return memberCount > 0 ? [{ id: t.id, name: t.name, memberCount }] : []
  })
  const known = new Set(rows.map((r) => r.id))
  const strays = (room?.shares ?? []).filter((s) => !known.has(s.team.id) && known.add(s.team.id))
  return [
    ...rows,
    ...strays.map((s) => ({ id: s.team.id, name: s.team.name, memberCount: s.memberCount })),
  ]
}

/** A team's box key, prefixed so it never meets an actor's key in one `edits` map. */
export const teamCellKey = (teamId: string, metric: string) => `team/${teamId}|${metric}`

/** The share the room package holds for a team and metric, if saved. */
export const savedShare = (pkg: KpiAllocation | undefined, teamId: string, metric: string) =>
  pkg?.shares.find((s) => s.team.id === teamId && s.metricKey === metric)

/** Where a team's own package stands, as the head reads it under the team row.
 *  A changed share outranks the stored status: the package in force no longer
 *  matches what the room gave the team. */
export function teamStatusOf(pkg: KpiAllocation | undefined): { text: string; tone: Tone } {
  if (!pkg || pkg.status === 'draft') {
    const text = message(
      'Chưa chia cho thành viên',
      'Not yet split among members',
      '팀원에게 아직 배분되지 않음',
    )
    return { text: translate(text), tone: 'draft' }
  }
  if (pkg.shareChanged) {
    const text = message(
      'Phần của nhóm đã đổi, chờ chia lại',
      "The team's share changed; waiting to be split again",
      '팀 몫이 변경되어 재배분 대기 중',
    )
    return { text: translate(text), tone: 'warning' }
  }
  if (pkg.status === 'submitted') return { text: kpiPackageText('submitted'), tone: 'warning' }
  if (pkg.status === 'returned') return { text: kpiPackageText('returned'), tone: 'danger' }
  return { text: kpiPackageText('agreed'), tone: 'success' }
}

/** A stored value as the text a manager would type: `parseTyped` reads it back. */
export function typedOf(unit: KpiUnit, value: number): string {
  if (unit === 'count' || unit === 'money') {
    return value.toLocaleString('vi-VN', { maximumFractionDigits: 0 })
  }
  const shown = unit === 'ratio' ? value * 100 : value
  return shown.toLocaleString('vi-VN', { maximumFractionDigits: 2, useGrouping: false })
}

/** Name, verb and time; the verb and time alone when the name is missing. */
export function actedAt(who: { name: string } | null, verb: string, at: string): string {
  const time = dmhm(at)
  const cap = `${verb.charAt(0).toUpperCase()}${verb.slice(1)}`
  const sentence = who
    ? message(
        `${who.name} ${verb} lúc ${time}`,
        `${who.name} ${verb} at ${time}`,
        `${who.name} ${time} ${verb}`,
      )
    : message(`${cap} lúc ${time}`, `${cap} at ${time}`, `${time} ${verb}`)
  return translate(sentence)
}

/** The verb of a package's last decision, as `actedAt` takes it. */
export const decidedVerb = (status: KpiAllocationStatus) =>
  translate(
    status === 'returned'
      ? message('trả lại', 'returned', '반려')
      : message('duyệt', 'approved', '승인'),
  )

/** Said after a 409 where the refusal means the line moved under the reader. */
export const MOVED = message(
  'Số vừa thay đổi, xem lại rồi bấm lại.',
  'The figure just changed. Review it and try again.',
  '수치가 방금 변경되었습니다. 확인 후 다시 눌러 주세요.',
)

/** A 409 carries the server's own sentence; a 400 names the field it refused. */
export function failText(error: ApiError): string {
  if (error.kind !== 'invalid-data') return userMessage(error)
  return Object.values(error.errors ?? {}).flat()[0] ?? userMessage(error)
}

/** The code catalog, not the effective one (`data/kpi-catalog.ts`): a counter
 *  filed before its metric was switched off still needs its unit to be printed
 *  and answered — the server reads it the same way (`catalogDef`). */
export const defOfCounter = (c: KpiCounter): KpiMetricDef | undefined =>
  KPI_CATALOG[c.role].find((d) => d.key === c.metricKey)

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** What a holder asked for, in one sentence: only an open counter carries its "from".
 *  `named: false` drops the holder's name, for a place already headed with it. */
export function headlineOf(c: KpiCounter, def: KpiMetricDef, named = true): string {
  const lang = getLang()
  const metric = lower(kpiMetricText(c.metricKey, lang))
  const to = printValue(def.unit, c.proposed, true)
  const from = printValue(def.unit, c.assigned, true)
  const said =
    c.status !== 'open'
      ? message(`đề xuất ${metric} ${to}`, `proposed ${metric} ${to}`, `${metric} ${to} 제안`)
      : c.proposed === c.assigned
        ? message(
            `đề xuất giữ ${metric} ở ${to}`,
            `proposed keeping ${metric} at ${to}`,
            `${metric}을(를) ${to}로 유지하자고 제안`,
          )
        : c.proposed < c.assigned
          ? message(
              `xin giảm ${metric} từ ${from} xuống ${to}`,
              `asked to lower ${metric} from ${from} to ${to}`,
              `${metric}을(를) ${from}에서 ${to}로 낮춰 달라고 요청`,
            )
          : message(
              `xin tăng ${metric} từ ${from} lên ${to}`,
              `asked to raise ${metric} from ${from} to ${to}`,
              `${metric}을(를) ${from}에서 ${to}로 높여 달라고 요청`,
            )
  const text = translate(said, lang)
  if (!named) return text.charAt(0).toUpperCase() + text.slice(1)
  return `${c.name} ${text}`
}

/** What accepting an open counter would do to the split, as the server worked it out.
 *  On a team package the target it balances against is the team's share. */
export function effectLines(c: KpiCounter, def: KpiMetricDef): string[] {
  const { allocatedAfter, roleTarget, shortfall, compensators } = c.effect
  const target = translate(
    c.team
      ? message('phần của nhóm', "the team's share", '팀 몫')
      : message('chỉ tiêu vai trò', 'the role target', '역할 목표'),
  )
  const print = (v: number) => printValue(def.unit, v)
  if (allocatedAfter === null) {
    const scope = c.team ? message('nhóm', 'team', '팀') : message('vai trò', 'role', '역할')
    return [
      translate(
        message(
          `Chỉ số này không cộng dồn, tổng của ${scope.vi} không đổi.`,
          `This metric does not add up, so the ${scope.en} total is unchanged.`,
          `이 지표는 합산되지 않으므로 ${scope.ko} 합계는 변하지 않습니다.`,
        ),
      ),
    ]
  }
  const after = message(
    `Tổng sau khi đồng ý: ${print(allocatedAfter)}`,
    `Total after accepting: ${print(allocatedAfter)}`,
    `수락 후 합계: ${print(allocatedAfter)}`,
  )
  const lead = (extra: Message) =>
    translate(message(`${after.vi}${extra.vi}`, `${after.en}${extra.en}`, `${after.ko}${extra.ko}`))
  if (roleTarget === null) {
    const note = c.team
      ? message(
          'Nhóm chưa được giao phần.',
          'The team has no share yet.',
          '팀에 배정된 몫이 없습니다.',
        )
      : message(
          'Vai trò chưa có chỉ tiêu được duyệt.',
          'The role has no approved target.',
          '역할에 승인된 목표가 없습니다.',
        )
    return [lead(message(`. ${note.vi}`, `. ${note.en}`, `. ${note.ko}`))]
  }
  if (allocatedAfter > roleTarget) {
    const over = print(allocatedAfter - roleTarget)
    return [
      lead(
        message(
          ` · thừa ${over} so với ${target}.`,
          ` · ${over} over ${target}.`,
          ` · ${target} 대비 ${over} 초과.`,
        ),
      ),
    ]
  }
  if (!shortfall) {
    return [
      lead(
        message(
          ` · vẫn khớp ${target}.`,
          ` · still matches ${target}.`,
          ` · ${target}과(와) 일치.`,
        ),
      ),
    ]
  }
  const gap = lead(
    message(
      ` · thiếu ${print(shortfall)} so với ${target}.`,
      ` · ${print(shortfall)} short of ${target}.`,
      ` · ${target} 대비 ${print(shortfall)} 부족.`,
    ),
  )
  if (compensators.length === 0) {
    return [
      gap,
      translate(
        message(
          'Chưa có ai đúng tiến độ để bù phần thiếu.',
          'No one is on track to cover the shortfall.',
          '부족분을 메울 수 있는 진도 정상 인원이 없습니다.',
        ),
      ),
    ]
  }
  const who = compensators
    .map((p) =>
      translate(
        message(
          `${p.name} thêm ${print(p.delta)}`,
          `${p.name} +${print(p.delta)}`,
          `${p.name} +${print(p.delta)}`,
        ),
      ),
    )
    .join(' · ')
  return [
    gap,
    translate(
      message(
        `Gợi ý bù từ người đang đúng tiến độ: ${who}.`,
        `Suggested cover from people on track: ${who}.`,
        `진도 정상 인원의 보완 제안: ${who}.`,
      ),
    ),
  ]
}
