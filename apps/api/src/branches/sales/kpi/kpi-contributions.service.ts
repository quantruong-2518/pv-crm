import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  COMM_RECORD_STATE_LABEL,
  KpiContributionsResponse,
  LEAD_STATE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  type KpiMetricKey,
  type KpiPeriodKey,
} from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { leadsOver, rosterOf } from './kpi-allocation-team'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiConfigService } from './kpi-config.service'
import {
  KpiContributionsRepository,
  type KpiAdjustmentRow,
  type KpiContributionRow,
} from './kpi-contributions.repository'
import { KpiReadingsRepository, seriesKey, type KpiSeat } from './kpi-readings.repository'
import { monthClock } from './kpi-rules'
import { KpiTeamRepository } from './kpi-team.repository'

/** The records counted into one person's KPI figures (ADR 0099 §5).
 *
 *  One door on `kpi.view`; E2 widens it past the caller's own line for
 *  `kpi.view-all`, the cut `KpiAllocationService.read` makes, and the roster
 *  for the lead of the person's team (ADR 0101). Only code, a label of the
 *  fact, date and amount leave here — never a debrief's text. */

const CAP = 50

/** An approval is no kind of record a contribution can name; its figure
 *  stays on the card and the list leaves the metric out. */
const UNLISTED: ReadonlySet<KpiMetricKey> = new Set(['approval-turnaround-hours'])

/** One word per basis `tag`, reusing the labels the screens already print. */
const LABEL: Readonly<Record<string, string>> = {
  sourced: 'Đã nạp lead',
  converted: LEAD_STATE_LABEL.converted,
  'not-converted': 'Chưa thành cơ hội',
  signed: 'Đã ký hợp đồng',
  opened: 'Đã mở cơ hội',
  accepted: 'Đã được nhận',
  'not-accepted': 'Chưa được nhận',
  answered: 'Đã liên hệ lần đầu',
  unanswered: 'Chưa liên hệ',
  attended: 'Đã tham gia buổi họp',
  won: OPPORTUNITY_STATE_LABEL.won,
  lost: OPPORTUNITY_STATE_LABEL.lost,
  terminated: OPPORTUNITY_STATE_LABEL.terminated,
  closed: COMM_RECORD_STATE_LABEL.done,
  overdue: 'Quá hạn chưa thu',
  collected: 'Đã thu',
  took: 'Đã nhận cơ hội',
}

const at = (r: { at: Date | string | null }): string | null =>
  r.at === null ? null : new Date(r.at).toISOString()

/** Newest first, the order each half already came in; an undated row sinks. */
const newestFirst = (a: { at: string | null }, b: { at: string | null }): number =>
  (b.at ?? '').localeCompare(a.at ?? '')

const labelOf = (tag: string): string => {
  const label = LABEL[tag]
  if (!label) throw new Error(`kpi: no contribution label for tag ${tag}`)
  return label
}

@Injectable()
export class KpiContributionsService {
  constructor(
    private readonly readings: KpiReadingsRepository,
    private readonly repo: KpiContributionsRepository,
    private readonly config: KpiConfigService,
    private readonly closes: KpiCloseRepository,
    private readonly teams: KpiTeamRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async of(who: Actor, period: KpiPeriodKey, actorId: string): Promise<KpiContributionsResponse> {
    if (actorId !== who.id && !this.access.allows(who, 'kpi.view-all')) {
      const roster = rosterOf(await this.teams.rosterAt(period))
      if (!leadsOver(roster, who.id, actorId)) {
        throw denied(
          'permission-denied',
          'Bạn chỉ xem được bản ghi tính vào KPI của mình và của thành viên nhóm bạn phụ trách.',
        )
      }
    }
    const person = await this.readings.person(actorId)
    if (!person) throw notFound('người này')

    /* `toReadings`' rule: a snapshot of a month not begun has no records. */
    const begun = monthClock(period).phase !== 'future'
    const catalog = await this.config.effectiveCatalog()
    const seats: KpiSeat[] = person.roleIds
      .map(toContractRole)
      .flatMap((role) =>
        catalog[role]
          .filter((def) => !UNLISTED.has(def.key) && (begun || !def.snapshot))
          .map((def) => ({ role, def })),
      )
    /* A month closed before 0136 has no frozen basis, reads the books and says so. */
    const frozen =
      (await this.closes.of(period)) !== null && (await this.readings.basisFrozen(period))
    const [rows, adjusted] = await Promise.all([
      this.repo.rows(seats, spansOf(period).current, actorId, CAP, frozen),
      this.repo.adjustments(seats, period, actorId, CAP),
    ])

    return KpiContributionsResponse.parse({
      period,
      frozen,
      actorId,
      groups: seats.map((seat) => {
        const key = seriesKey(seat)
        const mine = rows.filter((r) => r.series === key)
        const changes = adjusted.filter((r) => r.series === key)
        return {
          actorId,
          role: seat.role,
          metricKey: seat.def.key,
          items: [
            ...changes.map(toAdjustmentItem),
            ...mine.map((r) => toItem(r, seat.def.unit === 'ratio')),
          ].sort(newestFirst),
          /* Records only: the screen counts records, and the adjustments are few. */
          truncated: (mine[0]?.total ?? 0) > mine.length,
        }
      }),
    })
  }
}

/** A share's 1/0 is the label's yes/no, not an amount to print. */
function toItem(r: KpiContributionRow, share: boolean) {
  return {
    kind: r.kind,
    code: r.code,
    label: labelOf(r.tag),
    at: at(r),
    value: share ? null : r.value,
    adjustment: null,
  }
}

/** `value` is the signed delta, so the list sums to the adjusted figure. */
function toAdjustmentItem(r: KpiAdjustmentRow) {
  return {
    kind: r.kind,
    code: r.code,
    /* Every basis row carries a tag, so a NULL here is a bug for `labelOf` to throw. */
    label: labelOf(r.tag ?? ''),
    at: at(r),
    value: r.value,
    adjustment: { sourcePeriod: r.sourcePeriod, cause: r.cause },
  }
}
