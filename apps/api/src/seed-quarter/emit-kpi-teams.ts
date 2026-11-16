import { and, inArray, lte, ne } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { orgVersionAt } from '@api/platform/org/org-version'
import { kpiTeam, kpiTeamMember, kpiTeamRoster } from '@api/branches/sales/kpi/kpi-team.schema'
import { vnAt } from './clock'
import { CAST, TEAMS } from './params'
import type { Rng } from './rng'

/** The KPI teams of the quarter (ADR 0101), rostered from August.
 *
 *  `reset-data` keeps `kpi_team*`, so a team of the same name already in the
 *  database is reused: a second team row would split one real team in two. The
 *  uuid is drawn either way so the stream never depends on what exists. */

export const ROSTER_FROM = '2026-08'

export type TeamRef = {
  key: string
  id: string
  name: string
  lead: string
  members: readonly string[]
}

/** Packages are written for November, which reads this roster; another one in
 *  force (a later header, or an org tree) would make their team ids wrong. */
async function assertOurRoster(tx: Db): Promise<void> {
  const others = await tx
    .select({ from: kpiTeamRoster.fromPeriod })
    .from(kpiTeamRoster)
    .where(and(lte(kpiTeamRoster.fromPeriod, '2026-11'), ne(kpiTeamRoster.fromPeriod, ROSTER_FROM)))
  const tree = await orgVersionAt(tx, '2026-11')
  if (others.length > 0 || tree) {
    throw new Error(
      `kpi: a roster or org tree already governs 2026-11 (${[...others.map((o) => o.from), tree].join(', ')}); ` +
        'the November packages would name the wrong teams',
    )
  }
}

export async function writeTeams(tx: Db, rng: Rng): Promise<TeamRef[]> {
  await assertOurRoster(tx)
  const drawn = TEAMS.map((t) => ({ t, id: rng.uuid() }))
  const have = await tx
    .select({ id: kpiTeam.id, name: kpiTeam.name })
    .from(kpiTeam)
    .where(
      inArray(
        kpiTeam.name,
        TEAMS.map((t) => t.name),
      ),
    )
  const refs: TeamRef[] = drawn.map(({ t, id }) => ({
    key: t.key,
    id: have.find((h) => h.name === t.name)?.id ?? id,
    name: t.name,
    lead: t.lead,
    members: t.members,
  }))
  const made = vnAt('2026-07-30', 9)
  await tx
    .insert(kpiTeam)
    .values(refs.map((r) => ({ id: r.id, name: r.name, createdBy: CAST.head, createdAt: made })))
    .onConflictDoNothing()
  await tx
    .insert(kpiTeamRoster)
    .values({ fromPeriod: ROSTER_FROM, savedBy: CAST.head, savedAt: vnAt('2026-07-30', 9, 30) })
    .onConflictDoNothing()
  await tx
    .insert(kpiTeamMember)
    .values(
      refs.flatMap((r) =>
        r.members.map((actorId) => ({
          fromPeriod: ROSTER_FROM,
          actorId,
          teamId: r.id,
          lead: actorId === r.lead,
        })),
      ),
    )
    .onConflictDoNothing()
  return refs
}
