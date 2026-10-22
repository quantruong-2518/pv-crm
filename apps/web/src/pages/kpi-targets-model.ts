import type {
  KpiAllocation,
  KpiCounter,
  KpiMonthClose,
  KpiPerson,
  KpiRoleTargets,
  KpiTargetsResponse,
  KpiTeam,
  OverdueReasonRow,
  RoleId,
} from '@pv/contracts'
import type { BlockQuery, KpiCatalog } from '@/data/kpi-catalog'
import { stepPick } from './home-model'
import type { Recipient } from './kpi-allocate-table'
import { monthEnded, monthPick } from './kpi-model'

/** What the month's targets screen works out before it draws: what waits on
 *  the reader, a role's holders, and which step an address lands on. No
 *  render, no fetch. `waitingOf` builds the targets screen's waiting list and
 *  the company screen's count from the same reads, so the two never disagree. */

export type QueueItem =
  | { kind: 'targets'; id: string; at: string; role: RoleId; who: string; metrics: number }
  | { kind: 'package'; id: string; at: string; pkg: KpiAllocation }
  | { kind: 'returned'; id: string; at: string; pkg: KpiAllocation }
  | { kind: 'counter'; id: string; at: string; counter: KpiCounter }

/** The four steps of a role's month; each names a section of the role pane. */
export type StepKey = 'total' | 'split' | 'ack' | 'lock'
export const stepId = (role: RoleId, step: StepKey) => `kpi-${role}-${step}`
export const teamStepId = (role: RoleId, teamId: string) => `kpi-${role}-team-${teamId}`

const latest = (stamps: readonly string[]) => stamps.reduce((a, b) => (b > a ? b : a), '')

/** Role targets proposed and not yet agreed, packages sent and not yet decided
 *  (room and team tier), room packages returned, and open counters; oldest first.
 *  `skip` is the reader: what they proposed, sent, returned or asked for is not
 *  waiting on them, and the server would refuse most of it anyway. A returned
 *  team package waits on its lead, on the team page. */
export function queueOf(
  catalog: KpiCatalog,
  roles: readonly KpiRoleTargets[],
  packages: readonly KpiAllocation[],
  skip: string | undefined,
  counters: readonly KpiCounter[] = [],
): QueueItem[] {
  const mine = (actorId: string | undefined) => skip !== undefined && actorId === skip
  const targets = roles.flatMap((entry): QueueItem[] => {
    const keys = new Set(catalog[entry.role].map((d) => d.key))
    const pending = entry.metrics.flatMap((m) => (m.pending && keys.has(m.key) ? [m.pending] : []))
    if (pending.length === 0 || pending.some((p) => mine(p.proposedBy.actorId))) return []
    const names = [...new Set(pending.map((p) => p.proposedBy.name))]
    return [
      {
        kind: 'targets',
        id: `targets/${entry.role}`,
        at: latest(pending.map((p) => p.proposedAt)),
        role: entry.role,
        who: names.join(', '),
        metrics: pending.length,
      },
    ]
  })
  const tier = (pkg: KpiAllocation) => `${pkg.role}/${pkg.team?.id ?? 'room'}`
  const sent = packages
    .filter((pkg) => pkg.status === 'submitted' && !mine(pkg.submittedBy?.actorId))
    .map((pkg): QueueItem => ({
      kind: 'package',
      id: `package/${tier(pkg)}`,
      at: pkg.submittedAt ?? '',
      pkg,
    }))
  const returned = packages
    .filter((pkg) => pkg.status === 'returned' && !pkg.team && !mine(pkg.decidedBy?.actorId))
    .map((pkg): QueueItem => ({
      kind: 'returned',
      id: `returned/${tier(pkg)}`,
      at: pkg.decidedAt ?? '',
      pkg,
    }))
  const open = counters
    .filter((c) => c.status === 'open' && !mine(c.actorId))
    .map((c): QueueItem => ({
      kind: 'counter',
      id: `counter/${c.id}`,
      at: c.createdAt,
      counter: c,
    }))
  return [...targets, ...sent, ...returned, ...open].sort((a, b) => a.at.localeCompare(b.at))
}

/** A team counter is the lead's to answer, on the team page; the head takes the
 *  room's, a lead's own, a locked lead's, and one whose team has no lead in the
 *  month's roster (the roster drops such a team), as the bell does. */
export function waitsOnHead(c: KpiCounter, teams: readonly KpiTeam[]): boolean {
  const team = c.team ? teams.find((t) => t.id === c.team?.id) : undefined
  return team === undefined || team.leadLocked || team.lead.actorId === c.actorId
}

/** The month a head closes from the targets screen: the picked one once it is
 *  over, else the one before the running month. */
export const closingOf = (period: string) =>
  monthEnded(period) ? period : (stepPick(monthPick(), -1)?.month ?? period)

export type Waiting = {
  items: QueueItem[]
  reasons: OverdueReasonRow[]
  /** An ended month nobody has closed, for a reader who may close it. */
  closing: string | null
}

/** Everything the targets screen's waiting list shows. A failed roster leaves
 *  `teams` empty, so every team counter shows rather than hides; the reader's
 *  own reasons are out, since the writer may not decide them. */
export function waitingOf(input: {
  catalog: KpiCatalog
  targets: KpiTargetsResponse
  packages: readonly KpiAllocation[]
  counters: readonly KpiCounter[]
  teams: readonly KpiTeam[]
  me: string | undefined
  canSet: boolean
  reasons: readonly OverdueReasonRow[]
  /** `closingOf(period)` and its close line; `undefined` while unread. */
  closing: string
  closingClose: KpiMonthClose | undefined
}): Waiting {
  const { catalog, targets, packages, counters, teams, me, canSet } = input
  const forHead = counters.filter((c) => waitsOnHead(c, teams))
  return {
    items: canSet && !targets.closed ? queueOf(catalog, targets.roles, packages, me, forHead) : [],
    reasons: input.reasons.filter((r) => me === undefined || r.writtenBy.id !== me),
    closing:
      canSet && monthEnded(input.closing) && input.closingClose === null ? input.closing : null,
  }
}

export const waitingCount = (w: Waiting) => w.items.length + w.reasons.length + (w.closing ? 1 : 0)

/** Where `?role=&team=` lands: the first of these ids the pane draws. */
export function landingOf(
  entry: KpiRoleTargets,
  pkg: KpiAllocation | undefined,
  team: string | null,
): string[] {
  const at = (...steps: StepKey[]) => steps.map((s) => stepId(entry.role, s))
  if (team) return [teamStepId(entry.role, team), ...at('split')]
  if (entry.metrics.some((m) => m.pending)) return at('total')
  if (pkg?.status === 'submitted') return at('lock', 'ack')
  if (pkg?.status === 'agreed') return at('ack', 'split')
  return at(pkg ? 'split' : 'total')
}

type DataOf<Q> = [Q] extends [{ data: infer D }] ? Exclude<D, undefined> : never

/** `withCatalog` for any number of reads: one block, one loading and failure state. */
export function allOf<const Q extends readonly BlockQuery<unknown>[]>(
  ...queries: Q
): BlockQuery<{ [K in keyof Q]: DataOf<Q[K]> }> {
  const data = queries.map((q) => q.data)
  return {
    data: data.every((d) => d !== undefined)
      ? (data as { [K in keyof Q]: DataOf<Q[K]> })
      : undefined,
    error: queries.find((q) => q.error)?.error ?? null,
    isRefetchError: queries.some((q) => q.isRefetchError),
    refetch: () => queries.filter((q) => q.error).forEach((q) => void q.refetch()),
  }
}

/** Holders of the role in no team, plus anyone still on a line who no longer
 *  holds it (or has since joined a team, so the line can be cleared). People
 *  in a team are not listed: the team has one row, and its lead splits it. */
export function holdersOf(
  role: RoleId,
  people: readonly KpiPerson[],
  pkg: KpiAllocation | undefined,
  teams: readonly KpiTeam[],
): Recipient[] {
  const inTeam = new Set(teams.flatMap((t) => t.members.map((m) => m.actorId)))
  const held: Recipient[] = people
    .filter((p) => !inTeam.has(p.actorId) && p.scorecards.some((c) => c.role === role))
    .map((p) => ({ actorId: p.actorId, name: p.name }))
  const known = new Set(held.map((h) => h.actorId))
  const strays = (pkg?.lines ?? []).filter((l) => !known.has(l.actorId) && known.add(l.actorId))
  return [...held, ...strays.map((l) => ({ actorId: l.actorId, name: l.name }))]
}
