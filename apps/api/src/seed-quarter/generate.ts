import { expand } from './expand'
import { Infeasible } from './expand-time'
import { bulkKnobs, lower, scenarioKnobs } from './knobs'
import { DEAL, COUNTS, MEETINGS } from './params'
import type { Rng } from './rng'
import { SCENARIOS } from './scenarios'
import type { Beat, Knobs, Story } from './story.types'
import type { GenCtx } from './types'
import { summarize, validate } from './validate'
import { isAccepted } from './knobs-age'

/** Scenarios first (J0001..), then the sampled bulk up to `COUNTS.leads`; every
 *  journey draws from its own `story:<key>` fork, so adding a scenario never
 *  shifts the bulk. Two quotas (meetings today, sign approvals waiting) are
 *  dealt out of the bulk afterwards, from the same candidates in key order. */

type Entry = { key: string; knobs: Knobs; rng: Rng }

const keyOf = (i: number): string => `J${String(i + 1).padStart(4, '0')}`

/** Raises `count` more journeys to a flag, drawn from `candidates` (sorted by key). */
function quota(
  rng: Rng,
  entries: Entry[],
  label: string,
  want: number,
  has: (k: Knobs) => boolean,
  can: (k: Knobs) => boolean,
  set: (k: Knobs) => Knobs,
): void {
  const have = entries.filter((e) => has(e.knobs)).length
  const pool = entries.filter((e) => !e.knobs.scenario && !has(e.knobs) && can(e.knobs))
  const need = want - have
  if (need > pool.length)
    throw new Error(`quota ${label}: ${need} wanted, ${pool.length} candidates`)
  const pick = rng.fork(`quota:${label}`)
  for (let n = 0; n < need; n++) {
    const e = pool.splice(pick.int(0, pool.length - 1), 1)[0]!
    e.knobs = set(e.knobs)
  }
}

function applyQuotas(rng: Rng, entries: Entry[]): void {
  quota(
    rng,
    entries,
    'meetings-today',
    MEETINGS.todayCount,
    (k) => k.meetings.today,
    (k) => {
      const d = k.deal
      return d
        ? d.end.kind === 'open' && isAccepted(d.end)
        : !k.disabled && (k.lead.state === 'assigned' || k.lead.state === 'working')
    },
    (k) => ({ ...k, meetings: { ...k.meetings, today: true } }),
  )
  quota(
    rng,
    entries,
    'sign-waiting',
    DEAL.waitingApprovals,
    (k) => k.deal?.end.kind === 'open' && k.deal.signApproval === 'waiting',
    (k) => k.deal?.end.kind === 'open' && k.deal.end.stage === 'quotation',
    (k) => ({ ...k, deal: { ...k.deal!, signApproval: 'waiting' } }),
  )
}

const LEAD_ONLY = new Set<Beat['kind']>([
  'lead-born',
  'lead-claimed',
  'lead-handed',
  'lead-released',
  'first-touch',
  'care',
  'tier',
  'parked',
  'pool-reply',
  'reclaimed',
  'merged',
  'disabled',
])

/** A re-buy is a second deal on the SAME lead and journey (ADR 0121 §6), so the
 *  re-buy story keeps what happens to the deal and drops what happens to a lead.
 *  Done after `validate`, which still checks the whole expanded journey. */
function dealOnly(s: Story): Story {
  const onLead = (b: Beat): boolean => 'on' in b && b.on === 'lead'
  const beats = s.beats.filter((b) => !LEAD_ONLY.has(b.kind) && !onLead(b))
  return { ...s, beats }
}

const TRIES = 400

function build(e: Entry, ctx: GenCtx): Story {
  let k = e.knobs
  for (let n = 0; n < TRIES; n++) {
    try {
      return expand(k, e.key, e.rng.fork(`expand:${n}`), ctx)
    } catch (error) {
      if (!(error instanceof Infeasible)) throw error
      if (!k.scenario && n % 8 === 7) k = lower(k, e.rng.fork(`lower:${n}`))
    }
  }
  throw new Error(
    `${e.key}${e.knobs.scenario ? ` (${e.knobs.scenario})` : ''}: no dates satisfy its outcome in ${TRIES} tries`,
  )
}

export function generate(ctx: GenCtx): Story[] {
  const entries: Entry[] = []
  for (let i = 0; i < COUNTS.leads; i++) {
    const key = keyOf(i)
    const rng = ctx.rng.fork(`story:${key}`)
    const s = SCENARIOS[i]
    entries.push({ key, rng, knobs: s ? scenarioKnobs(s, rng, ctx) : bulkKnobs(i, rng, ctx) })
  }
  applyQuotas(ctx.rng, entries)
  const stories = entries
    .map((e) => build(e, ctx))
    .sort((a, b) => a.bornAt.getTime() - b.bornAt.getTime() || a.key.localeCompare(b.key))
  validate(stories, ctx.now)
  if (process.env.SEED_QUARTER_SUMMARY) {
    process.stdout.write(`${summarize(stories, ctx.now).join('\n')}\n`)
  }
  return stories.map((s) => (s.growth ? { ...s, growth: dealOnly(s.growth) } : s))
}
