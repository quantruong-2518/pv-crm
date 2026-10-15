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
import { KpiConfigService } from './kpi-config.service'
import { KpiContributionsRepository } from './kpi-contributions.repository'
import { KpiReadingsRepository, seriesKey, type KpiSeat } from './kpi-readings.repository'
import { monthClock } from './kpi-rules'

/** The records counted into one person's KPI figures (ADR 0099 §5).
 *
 *  One door on `kpi.view`; E2 widens it past the caller's own line for
 *  `kpi.view-all`, the cut `KpiAllocationService.read` makes. Only code, a
 *  label of the fact, date and amount leave here — never a debrief's text. */

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
  closed: COMM_RECORD_STATE_LABEL.done,
  overdue: 'Quá hạn chưa thu',
  collected: 'Đã thu',
  took: 'Đã nhận cơ hội',
}

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
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async of(who: Actor, period: KpiPeriodKey, actorId: string): Promise<KpiContributionsResponse> {
    if (actorId !== who.id && !this.access.allows(who, 'kpi.view-all')) {
      throw denied('permission-denied', 'Bạn chỉ xem được bản ghi tính vào KPI của mình.')
    }
    const person = (await this.readings.people()).find((p) => p.id === actorId)
    if (!person) throw notFound('người này')

    /* `toReadings`' rule: a snapshot is today's figure, so another month has no records. */
    const running = monthClock(period).phase === 'running'
    const catalog = await this.config.effectiveCatalog()
    const seats: KpiSeat[] = person.roleIds
      .map(toContractRole)
      .flatMap((role) =>
        catalog[role]
          .filter((def) => !UNLISTED.has(def.key) && (running || !def.snapshot))
          .map((def) => ({ role, def })),
      )
    const rows = await this.repo.rows(seats, spansOf(period).current, actorId, CAP)

    return KpiContributionsResponse.parse({
      period,
      actorId,
      groups: seats.map((seat) => {
        const mine = rows.filter((r) => r.series === seriesKey(seat))
        return {
          actorId,
          role: seat.role,
          metricKey: seat.def.key,
          items: mine.map((r) => ({
            kind: r.kind,
            code: r.code,
            label: labelOf(r.tag),
            at: r.at === null ? null : new Date(r.at).toISOString(),
            /* A share's 1/0 is the label's yes/no, not an amount to print. */
            value: seat.def.unit === 'ratio' ? null : r.value,
          })),
          truncated: (mine[0]?.total ?? 0) > mine.length,
        }
      }),
    })
  }
}
