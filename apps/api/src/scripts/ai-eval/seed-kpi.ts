import {
  isTieredPeriod,
  quarterMonths,
  quarterOf,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { contract } from '@api/branches/sales/contract/contract.schema'
import { kpiAllocation, kpiAllocationShare } from '@api/branches/sales/kpi/kpi-allocation.schema'
import { kpiAssignment, kpiAssignmentLine } from '@api/branches/sales/kpi/kpi-assignment.schema'
import { vietnamToday } from '@api/branches/sales/kpi/kpi-rules'
import { kpiTarget } from '@api/branches/sales/kpi/kpi.schema'
import { kpiTeam, kpiTeamMember, kpiTeamRoster } from '@api/branches/sales/kpi/kpi-team.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { opportunity, opportunityOwner } from '@api/branches/sales/opportunity/opportunity.schema'
import type { Db } from '@api/platform/db/db.module'
import { objectRef } from '@api/platform/db/platform.schema'
import { CONTRACT_CURRENCY, NAMED_SEATS, wideSeatId } from './seed-data'

/** Targets, one team and signed contracts for the KPI doors, written straight into the
 *  tables they read. "Now" is the real Vietnam clock, the one the doors use: the KPI
 *  services have no clock to fix, so the months are derived here, not typed.
 *
 *  The previous month is seeded too: on the 1st a running month has no pace yet, so
 *  only a closed one can read `missed`. A month from `TIERED_FROM` reads sent
 *  assignment lines instead of role targets, so each month is written the way it
 *  will be read; no org tree is seeded, which leaves the roster header in force. */

export const KPI_TARGET = 1_000_000_000
/** The weighted open pipeline of `kpiLead`: 500M at 40%, due today, so the month still has it to close. */
export const KPI_PIPELINE = 200_000_000
/** The team's slice of the room package: what its three signers add up to. */
export const KPI_TEAM_SHARE = 3_000_000_000
/** What each signer closes in each seeded month: over, under, and a fair way short. */
export const KPI_SIGNED = {
  [NAMED_SEATS.kpiLead.id]: 600_000_000,
  [NAMED_SEATS.kpiAhead.id]: 1_200_000_000,
  [NAMED_SEATS.kpiBehind.id]: 100_000_000,
} as const

const FIRST_KPI_NUMBER = 900
const SENT_AT = new Date('2026-01-05T08:00:00.000Z')

/** The seats a role's target covers once the tiered months name people one by one. */
const HOLDERS: Partial<Record<RoleId, readonly string[]>> = {
  sale: [NAMED_SEATS.kpiLead.id, NAMED_SEATS.kpiAhead.id, NAMED_SEATS.kpiBehind.id],
  'account-executive': [NAMED_SEATS.casesExecutive.id],
}

export type KpiSeeded = {
  current: KpiPeriodKey
  previous: KpiPeriodKey
  teamId: string
}

export class KpiSeeder {
  private next = FIRST_KPI_NUMBER

  constructor(private readonly db: Db) {}

  private async target(month: KpiPeriodKey): Promise<void> {
    const head = NAMED_SEATS.kpiHead.id
    for (const [role, people] of Object.entries(HOLDERS) as [RoleId, readonly string[]][]) {
      if (!isTieredPeriod(month)) {
        await this.db.insert(kpiTarget).values({
          role,
          period: month,
          metricKey: 'signed-value',
          version: 1,
          value: String(KPI_TARGET),
          proposedById: head,
          proposedAt: SENT_AT,
          agreedById: wideSeatId('director'),
          agreedAt: SENT_AT,
        })
        continue
      }
      const [set] = await this.db
        .insert(kpiAssignment)
        .values({
          period: month,
          role,
          unitId: crypto.randomUUID(),
          version: 1,
          status: 'sent',
          sentBy: head,
          sentAt: SENT_AT,
          createdBy: head,
        })
        .returning({ id: kpiAssignment.id })
      if (!set) throw new Error('seed: no assignment set returned')
      await this.db.insert(kpiAssignmentLine).values(
        people.map((personId) => ({
          assignmentId: set.id,
          metricKey: 'signed-value' as const,
          kind: 'person' as const,
          personId,
          value: String(KPI_TARGET),
        })),
      )
    }
  }

  /** A lead, its deal and a contract signed on the 2nd of `month`, owned by `owner`. */
  private async signed(month: KpiPeriodKey, owner: string, amount: number): Promise<void> {
    const n = this.next++
    const leadCode = `LD-${5000 + n}`
    const dealCode = `OP-${6000 + n}`
    const paperCode = `HĐ-${7000 + n}`
    const mirror = (code: string, kind: 'LD' | 'OP' | 'HĐ') => ({
      code,
      kind,
      branch: 'Sales' as const,
      label: `kpi-${n}`,
      ownerId: owner,
    })
    await this.db
      .insert(objectRef)
      .values([mirror(leadCode, 'LD'), mirror(dealCode, 'OP'), mirror(paperCode, 'HĐ')])
    await this.db.insert(lead).values({
      code: leadCode,
      company: `Công ty KPI ${n}`,
      contactName: `Chị KPI ${n}`,
      email: `kpi-${n}@eval.invalid`,
      ownerId: owner,
      state: 'converted',
    } as never)
    await this.db.insert(opportunity).values({
      code: dealCode,
      leadCode,
      state: 'open',
      name: `Đơn KPI ${n}`,
      amount,
      currency: CONTRACT_CURRENCY,
      probability: 40,
    })
    await this.db.insert(contract).values({
      code: paperCode,
      opportunityCode: dealCode,
      leadCode,
      amount,
      currency: CONTRACT_CURRENCY,
      signedAt: new Date(`${month}-02T08:00:00.000Z`),
      ownerId: owner,
      collectorId: owner,
    })
  }

  /** An open deal due to close today under `owner`'s primary lane: the forecast's pipeline. */
  private async due(owner: string): Promise<void> {
    const n = this.next++
    const leadCode = `LD-${5000 + n}`
    const dealCode = `OP-${6000 + n}`
    const mirror = (code: string, kind: 'LD' | 'OP') => ({
      code,
      kind,
      branch: 'Sales' as const,
      label: `kpi-${n}`,
      ownerId: owner,
    })
    await this.db.insert(objectRef).values([mirror(leadCode, 'LD'), mirror(dealCode, 'OP')])
    await this.db.insert(lead).values({
      code: leadCode,
      company: `Công ty KPI ${n}`,
      contactName: `Chị KPI ${n}`,
      email: `kpi-${n}@eval.invalid`,
      ownerId: owner,
      state: 'converted',
    } as never)
    await this.db.insert(opportunity).values({
      code: dealCode,
      leadCode,
      state: 'open',
      name: `Đơn KPI ${n}`,
      amount: (KPI_PIPELINE * 100) / 40,
      currency: CONTRACT_CURRENCY,
      probability: 40,
      expectedClose: vietnamToday(),
    })
    await this.db
      .insert(opportunityOwner)
      .values({ opportunityCode: dealCode, actorId: owner, role: 'SALE', isPrimary: true })
  }

  /** An agreed room package with one share, so the team view has a team total to read. */
  private async share(month: KpiPeriodKey, teamId: string): Promise<void> {
    const at = new Date(`${month}-01T01:00:00.000Z`)
    const [room] = await this.db
      .insert(kpiAllocation)
      .values({
        period: month,
        role: 'sale',
        version: 1,
        status: 'agreed',
        submittedBy: NAMED_SEATS.kpiHead.id,
        submittedAt: at,
        decidedBy: wideSeatId('director'),
        decidedAt: at,
      })
      .returning({ id: kpiAllocation.id })
    if (!room) throw new Error('seed: no room package returned')
    await this.db.insert(kpiAllocationShare).values({
      allocationId: room.id,
      teamId,
      metricKey: 'signed-value',
      value: String(KPI_TEAM_SHARE),
    })
  }

  async seed(): Promise<KpiSeeded> {
    const current = vietnamToday().slice(0, 7) as KpiPeriodKey
    const [year, month] = current.split('-').map(Number) as [number, number]
    const previous = new Date(Date.UTC(year, month - 2, 1))
      .toISOString()
      .slice(0, 7) as KpiPeriodKey
    const months = [...new Set([previous, ...quarterMonths(quarterOf(current))])].sort()
    for (const m of months) await this.target(m)
    for (const m of new Set([previous, current])) {
      for (const [owner, amount] of Object.entries(KPI_SIGNED)) await this.signed(m, owner, amount)
    }

    const [team] = await this.db
      .insert(kpiTeam)
      .values({ name: 'Hà Nội', createdBy: NAMED_SEATS.kpiHead.id })
      .returning({ id: kpiTeam.id })
    const first = months[0]
    if (!team || !first) throw new Error('seed: no team or month')
    await this.db
      .insert(kpiTeamRoster)
      .values({ fromPeriod: first, savedBy: NAMED_SEATS.kpiHead.id })
    await this.db.insert(kpiTeamMember).values(
      [NAMED_SEATS.kpiLead, NAMED_SEATS.kpiAhead, NAMED_SEATS.kpiBehind].map((seat) => ({
        fromPeriod: first,
        actorId: seat.id,
        teamId: team.id,
        lead: seat.id === NAMED_SEATS.kpiLead.id,
      })),
    )
    await this.due(NAMED_SEATS.kpiLead.id)
    await this.share(current, team.id)
    return { current, previous, teamId: team.id }
  }
}
