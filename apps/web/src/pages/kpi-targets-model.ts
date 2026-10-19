import type { KpiAllocation, KpiRoleTargets, RoleId } from '@pv/contracts'
import type { KpiCatalog } from '@/data/kpi-catalog'

/** What waits for approval on the targets desk: role targets proposed and not
 *  yet agreed, and allocation packages sent and not yet decided (room and team tier), oldest first.
 *  One function, so the desk and the company screen's door count the same items. */

export type QueueItem =
  | { kind: 'targets'; id: string; at: string; role: RoleId; who: string; metrics: number }
  | { kind: 'package'; id: string; at: string; pkg: KpiAllocation }

const latest = (stamps: readonly string[]) => stamps.reduce((a, b) => (b > a ? b : a), '')

/** `skip` is the reader when they can approve: their own proposal or package
 *  is not waiting on them, and the server would refuse them anyway. */
export function queueOf(
  catalog: KpiCatalog,
  roles: readonly KpiRoleTargets[],
  packages: readonly KpiAllocation[],
  skip: string | undefined,
): QueueItem[] {
  const targets = roles.flatMap((entry): QueueItem[] => {
    const keys = new Set(catalog[entry.role].map((d) => d.key))
    const pending = entry.metrics.flatMap((m) => (m.pending && keys.has(m.key) ? [m.pending] : []))
    if (pending.length === 0) return []
    if (skip && pending.some((p) => p.proposedBy.actorId === skip)) return []
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
  const sent = packages
    .filter((pkg) => pkg.status === 'submitted' && !(skip && pkg.submittedBy?.actorId === skip))
    .map((pkg): QueueItem => ({
      kind: 'package',
      id: `package/${pkg.role}/${pkg.team?.id ?? 'room'}`,
      at: pkg.submittedAt ?? '',
      pkg,
    }))
  return [...targets, ...sent].sort((a, b) => a.at.localeCompare(b.at))
}
