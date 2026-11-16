import { addDays, isWeekend, plusHours, vnAt } from './clock'
import { THEME } from './emit-funnel-data'
import { CAMPAIGNS } from './params'
import type { Rng } from './rng'
import type { Day } from './story.types'
import type { Ctx } from './types'

/** Who a campaign mails and when. Recipients are LEADS (MAS mails members, and
 *  members are leads), read from the rows the leads emitter planned so the
 *  address in a letter is the address on the lead. */

export type Campaign = (typeof CAMPAIGNS)[number]

export type Recipient = {
  code: string
  email: string
  contactName: string
  company: string
  categoryId: string | null
  bornAt: Date
  disabledAt: Date | null
  /** Held meetings: a lead who met us is withheld from a later wave. */
  heldAts: Date[]
  campaignKey: string | null
}

export type Member = { who: Recipient; addedAt: Date; removed: boolean }

export type Wave = { no: number; state: 'sent' | 'draft'; sendAt: Date | null; createdAt: Date }

const REMOVED_SHARE = 0.04

export function recipientsOf(ctx: Ctx): Recipient[] {
  const rows = new Map(ctx.plan.lead.map((l) => [l.code, l]))
  const out: Recipient[] = []
  for (const story of ctx.stories) {
    for (const [key, s] of [
      [story.key, story],
      [`${story.key}+g`, story.growth],
    ] as const) {
      const code = ctx.ids.lead.get(key)
      const row = code ? rows.get(code) : undefined
      if (!s || !row || !row.email.endsWith('.example')) continue
      out.push({
        code: row.code,
        email: row.email.trim().toLowerCase(),
        contactName: row.contactName,
        company: row.company,
        categoryId: row.categoryId ?? null,
        bornAt: row.createdAt ?? s.bornAt,
        disabledAt: row.disabledAt ?? null,
        heldAts: s.beats.flatMap((b) => (b.kind === 'meeting' && b.state === 'held' ? [b.at] : [])),
        campaignKey: s.knobs.campaign,
      })
    }
  }
  return out
}

/** Sends land on weekdays 9–10h; event campaigns write the day after the event. */
export function wavesOf(c: Campaign, today: Day): Wave[] {
  const end = c.to === 'today' ? today : c.to
  if (!c.from || !end) return []
  const span = Math.max(1, Math.round((Date.parse(end) - Date.parse(c.from)) / 86_400_000))
  return c.waves.map((kind, i) => {
    const base = c.event
      ? addDays(c.event.day, 1 + i * 5)
      : addDays(c.from!, Math.round((span * (i + 1)) / (c.waves.length + 1)))
    let day = base
    while (isWeekend(day)) day = addDays(day, 1)
    if (day >= today) day = addDays(today, -1)
    const sendAt = vnAt(day, 9, (i * 7) % 40)
    const createdAt = i === 0 ? plusHours(sendAt, -1 / 6) : plusHours(sendAt, -48)
    if (kind === 'draft')
      return {
        no: i + 1,
        state: 'draft',
        sendAt: null,
        createdAt: vnAt(addDays(today, -1), 15, 10),
      }
    return { no: i + 1, state: 'sent', sendAt, createdAt }
  })
}

const shuffled = <T>(rng: Rng, xs: readonly T[]): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Members first, topped up with other leads that already existed when wave 1
 *  was filed, those of the campaign's category first. Short of leads, the
 *  audience stays short: a letter never goes to a lead born after it. */
export function membersOf(ctx: Ctx, people: Recipient[]): Map<string, Member[]> {
  const out = new Map<string, Member[]>()
  const category = new Map((ctx.world.config.get('CATEGORY') ?? []).map((r) => [r.id, r.name]))
  for (const c of CAMPAIGNS) {
    const own = people.filter((p) => p.campaignKey === c.key)
    const members: Member[] = own.map((who) => ({
      who,
      addedAt: new Date(who.bornAt.getTime() + ctx.rng.int(5, 90) * 60_000),
      removed: ctx.rng.chance(REMOVED_SHARE),
    }))
    const first = wavesOf(c, ctx.today)[0]
    if (first && c.audience > 0) {
      const at = first.createdAt
      const live = (m: Member): boolean => !m.removed && m.addedAt <= at
      const missing = c.audience - members.filter(live).length
      const theme = THEME[c.key]
      const taken = new Set(own.map((p) => p.code))
      const pool = shuffled(
        ctx.rng,
        people.filter(
          (p) =>
            !taken.has(p.code) &&
            p.bornAt.getTime() <= at.getTime() - 86_400_000 &&
            (!p.disabledAt || p.disabledAt > at),
        ),
      )
      const themed = (p: Recipient): boolean =>
        !!theme && category.get(p.categoryId ?? '') === theme
      const ranked = [...pool.filter(themed), ...pool.filter((p) => !themed(p))]
      for (const who of ranked.slice(0, Math.max(0, missing))) {
        const addedAt = plusHours(at, -ctx.rng.int(2, 40))
        members.push({
          who,
          addedAt: addedAt > who.bornAt ? addedAt : plusHours(who.bornAt, 1),
          removed: false,
        })
      }
    }
    out.set(c.key, members)
  }
  return out
}
