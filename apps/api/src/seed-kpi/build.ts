import { BOOK } from './book'
import { PEOPLE, TAG, DIRECTOR, vn } from './cast'
import { orgRows, SEED_COMPANY, TIERED } from './org'
import { emptyPlan, type Mint, type Plan } from './plan'
import { leadEmail, plantLead } from './plant-lead'
import { ackRows, absenceRows, targetRows } from './targets'
import type { World } from './world'
import type { Extra } from './write'

/** World + minter → every row of one run. Pure and deterministic in what it
 *  plants, so a dry build counts the codes the real build then draws. */
export function buildAll(
  world: World,
  mint: Mint,
  passwordHash: string,
): { plan: Plan; extra: Extra } {
  const plan = emptyPlan()
  const campaignOf = new Map(world.campaignOf)
  for (const p of PEOPLE.filter((x) => x.roleIds.includes('marketing'))) {
    if (campaignOf.has(p.id)) continue
    const code = mint('CP')
    campaignOf.set(p.id, code)
    plan.campaigns.push({
      code,
      name: `${TAG}Chiến dịch của ${p.name.slice(TAG.length)}`,
      ownerId: p.id,
      state: 'DONE',
      createdAt: vn('2026-08-01'),
    })
  }
  const ctx = {
    plan,
    mint,
    hand: (id: string) => ({ id, name: world.names.get(id) ?? id }),
    origin: world.origin,
    campaignOf,
  }
  BOOK.filter((l) => !world.leadsTaken.has(leadEmail(l.no))).forEach((l) => plantLead(ctx, l))

  const org = orgRows(world.catalog, world.org)
  if (!world.org.hasCompany) {
    org.nodes.unshift({
      fromPeriod: TIERED,
      unitId: SEED_COMPANY,
      kind: 'company',
      name: `${TAG}Công ty`,
      parentId: null,
    })
  }
  const extra: Extra = {
    actors: world.newPeople.map(({ key: _key, ...p }) => ({ ...p, passwordHash })),
    version: world.org.version ? null : { fromPeriod: TIERED, savedBy: DIRECTOR },
    org,
    targets: targetRows(world.catalog, world.targetsTaken),
    acks: ackRows(world.acksTaken),
    absences: absenceRows(world.absencesTaken),
  }
  return { plan, extra }
}
