import { Injectable } from '@nestjs/common'
import { ROLE_LABEL, type KpiPeriodKey, type RoleId } from '@pv/contracts'
import { KPI_ASSIGNMENT_LATE, KPI_ASSIGNMENT_SENT } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { monthLabel } from './kpi-alert.service'
import { nodeOf, type Book, type Line } from './kpi-assignment.mapper'
import { KpiSeatService } from './kpi-seat.service'

/** Bell lines of the tiered sets (ADR 0120 §10), inside the writer's
 *  transaction. Every recipient is a seat read through `KpiSeatService`, so a
 *  unit whose head is away is told through its stand-in or the heads above.
 *  A `kpi-assignment` code is `<period>:<role>` (a person's own lines) or
 *  `<period>:<role>:<unitId>` (one unit's set). */

type Slot = { period: KpiPeriodKey; role: RoleId; unitId: string; version: number }

export const setCode = (period: KpiPeriodKey, role: RoleId, unitId?: string): string =>
  [period, role, unitId].filter(Boolean).join(':')

const changed = (now: readonly Line[], before: readonly Line[] | null, to: (l: Line) => boolean) =>
  before === null ||
  now
    .filter(to)
    .some(
      (l) =>
        !before.some(
          (b) => to(b) && b.metricKey === l.metricKey && b.kind === l.kind && b.value === l.value,
        ),
    )

@Injectable()
export class KpiAssignmentBells {
  constructor(
    private readonly hub: NotificationHub,
    private readonly seats: KpiSeatService,
  ) {}

  /** Each receiver whose lines are new or changed since `before`, the version
   *  in force until now: whoever acts for a child unit's head, or the person.
   *  `actorId` null is the sweep: no sender to leave out. */
  async received(
    tx: Db,
    actorId: string | null,
    book: Book,
    slot: Slot,
    lines: readonly Line[],
    before: readonly Line[] | null,
    today: string,
  ): Promise<void> {
    const units = [...new Set(lines.flatMap((l) => (l.childUnitId ? [l.childUnitId] : [])))]
    const people = [...new Set(lines.flatMap((l) => (l.personId ? [l.personId] : [])))]
    const told = units.filter((u) => changed(lines, before, (l) => l.childUnitId === u))
    const without = actorId ? [actorId] : []
    const acting = await this.seats.bellUnitSeats(book.tree, told, today, tx, without)
    const event = {
      name: KPI_ASSIGNMENT_SENT,
      ref: { code: slot.period },
      actorId: actorId ?? undefined,
    }
    const base = `${slot.role}/${slot.unitId}/${slot.version}`
    for (const u of told) {
      await this.hub.announce(tx, {
        event: {
          ...event,
          occurrence: `${base}/${u}`,
          audiences: { receivers: acting.get(u) ?? [] },
        },
        subject: {
          kind: 'kpi-assignment',
          code: setCode(slot.period, slot.role, u),
          label: this.label(book, slot.role, u),
        },
      })
    }
    const holders = people.filter((p) => changed(lines, before, (l) => l.personId === p))
    if (holders.length === 0) return
    await this.hub.announce(tx, {
      event: { ...event, occurrence: base, audiences: { receivers: holders } },
      subject: {
        kind: 'kpi-assignment',
        code: setCode(slot.period, slot.role),
        label: `${ROLE_LABEL[slot.role]} · ${monthLabel(slot.period)}`,
      },
    })
  }

  /** The sweep wrote `unitId`'s set by default: the head one level up hears it,
   *  through the seat walk; the company's late set goes to the setters. Keyed on
   *  the slot, so a second sweep is a no-op. */
  async late(tx: Db, book: Book, role: RoleId, unitId: string, today: string): Promise<void> {
    const parent = nodeOf(book.tree, unitId)?.parentId
    const above = parent
      ? ((await this.seats.bellUnitSeats(book.tree, [parent], today, tx)).get(parent) ?? [])
      : await this.seats.bellActors({ kind: 'setters' }, book.period, today, tx)
    await this.hub.announce(tx, {
      event: {
        name: KPI_ASSIGNMENT_LATE,
        ref: { code: book.period },
        occurrence: `${role}/${unitId}`,
        audiences: { above },
      },
      subject: {
        kind: 'kpi-assignment',
        code: setCode(book.period, role, unitId),
        label: this.label(book, role, unitId),
      },
    })
  }

  private label(book: Book, role: RoleId, unitId: string): string {
    const name = nodeOf(book.tree, unitId)?.name ?? ''
    return `${name} · ${ROLE_LABEL[role]} · ${monthLabel(book.period)}`
  }
}
