import {
  KPI_CATALOG,
  KPI_METRIC_LABEL,
  type KpiForecast,
  type KpiForecastResponse,
  type KpiMeResponse,
  type KpiMetricKey,
  type KpiPeopleResponse,
  type KpiPerson,
  type KpiQuarterMeResponse,
  type KpiTeamRosterResponse,
  type KpiTeamViewResponse,
  type RoleId,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { vietnamToday } from '@api/branches/sales/kpi/kpi-rules'
import { KpiController } from '@api/branches/sales/kpi/kpi.controller'
import { KpiForecastController } from '@api/branches/sales/kpi/kpi-forecast.controller'
import { KpiQuarterController } from '@api/branches/sales/kpi/kpi-quarter.controller'
import { KpiTeamController } from '@api/branches/sales/kpi/kpi-team.controller'
import { KpiTeamViewController } from '@api/branches/sales/kpi/kpi-team-view.controller'
import { runTurn, trailText, type Trail } from './bench'
import type { Check } from './report'
import {
  chainOf,
  dig,
  gateLinesOnly,
  shutDoors,
  toolBody,
  type Json,
} from './scope-customers-oracle'
import { askCall, canariesIn, doorId } from './scope-door'
import { parrot } from './scripted-client'
import type { World } from './world'

/** The two KPI tools, seat by seat. The oracle asks the doors as the seat and spells out
 *  the rows the tools say they build from them: a figure under its unit's name (₫ as
 *  `…Money` with `currency`, a ratio as `…Percent` out of 100, the rest plain), people
 *  behind on their primary metric first, a team total only for the metrics that add up,
 *  and a pipeline only on the asker's own money line (never on a room metric, never in a
 *  team list). A reader shut out of
 *  the door a call stands on gets a refusal and not one figure. */

export const GROUP = 'scope-kpi'
export const MINE = 'get_my_kpi'
export const TEAM = 'get_team_kpi'

export const ID = {
  me: doorId([KpiController, 'me']),
  forecast: doorId([KpiForecastController, 'mine']),
  quarter: doorId([KpiQuarterController, 'me']),
  people: doorId([KpiController, 'people']),
  forecastAll: doorId([KpiForecastController, 'everyone']),
  roster: doorId([KpiTeamController, 'read']),
  team: doorId([KpiTeamViewController, 'read']),
}

/* Typed here, not imported: the page size of the tool is what is under test. */
const PEOPLE_LIST = 20

export type KpiCall = { name: string; input: Record<string, unknown> }
export type KpiCell = { name: string; who: Actor; call: KpiCall }

export type KpiExpected =
  | { refused: true; allShut: boolean }
  | { refused: false; out: Json; rowCount: number; reveals: boolean }

type Pace = {
  key: KpiMetricKey
  value: number | null
  target: number | null
  expected: number | null
  verdict: string
}
type Card = { role: RoleId; readings: readonly Pace[] }

const UNIT_SUFFIX: Record<string, string> = { money: 'Money', ratio: 'Percent' }

/** A ratio goes from 0-1 to percent, a count is whole, the rest stand. */
const figureOf = (unit: string, n: number): number =>
  unit === 'ratio' ? Math.round(n * 10_000) / 100 : unit === 'count' ? Math.round(n) : n

/** Zero or one row; a metric the catalog does not carry has none. */
function rowsOf(role: RoleId, pace: Pace, ahead?: KpiForecast, pipeline = false): object[] {
  const def = KPI_CATALOG[role].find((d) => d.key === pace.key)
  if (!def) return []
  const suffix = UNIT_SUFFIX[def.unit] ?? ''
  const figures: Record<string, number | null | undefined> = {
    value: pace.value,
    target: pace.target,
    expected: pace.expected,
    projected: ahead?.projected,
    pipeline:
      pipeline && def.unit === 'money' && def.scope === 'own'
        ? (ahead?.pipeline ?? undefined)
        : undefined,
  }
  const shown = Object.entries(figures).flatMap(([name, n]) =>
    n === undefined ? [] : [[name + suffix, n === null ? n : figureOf(def.unit, n)]],
  )
  return [
    {
      trusted: {
        role,
        metric: def.key,
        label: KPI_METRIC_LABEL[def.key],
        unit: def.unit,
        verdict: pace.verdict,
        ...(def.unit === 'money' && { currency: 'VND' }),
        ...Object.fromEntries(shown),
        ...(ahead && { flag: ahead.flag }),
      },
    },
  ]
}

const cardRows = (
  cards: readonly Card[],
  ahead?: (role: RoleId, key: KpiMetricKey) => KpiForecast | undefined,
  pipeline = false,
) =>
  cards.flatMap((card) =>
    card.readings.flatMap((r) => rowsOf(card.role, r, ahead?.(card.role, r.key), pipeline)),
  )

const aheadOf =
  (items: readonly KpiForecast[] = []) =>
  (actorId: string) =>
  (role: RoleId, key: KpiMetricKey) =>
    items.find((i) => i.actorId === actorId && i.role === role && i.metricKey === key)

/** Behind or missed on a primary metric of one of the roles the person holds. */
export const isBehind = (p: KpiPerson): boolean =>
  p.scorecards.some((card) =>
    card.readings.some(
      (r) =>
        (r.verdict === 'behind' || r.verdict === 'missed') &&
        KPI_CATALOG[card.role].some((d) => d.key === r.key && d.primary),
    ),
  )

/** The doors whose refusal ends the call; the forecast ones only leave the call a column short. */
function mustOpen(call: KpiCall): string[] {
  if (call.name === MINE) return call.input.period === 'quarter' ? ['quarter'] : ['me']
  return call.input.team === undefined ? ['people'] : ['people', 'roster', 'team']
}

export async function expectedOf(world: World, who: Actor, call: KpiCall): Promise<KpiExpected> {
  const { keys, shut } = shutDoors(world, who as never, call)
  if (mustOpen(call).some((key) => shut.includes(key))) {
    return { refused: true, allShut: shut.length === keys.length }
  }
  /* The adapters ask no chain; any one stands for the type. */
  const door = await askCall(world, who, call, chainOf(world, 'care-own'))
  if (!door.ok) return { refused: true, allShut: false }
  const at = (call.input.at as string | undefined) ?? vietnamToday().slice(0, 7)
  const bodies = door.bodies

  if (call.name === MINE && call.input.period === 'quarter') {
    const quarter = bodies[ID.quarter] as KpiQuarterMeResponse
    const rows = cardRows(quarter.scorecards)
    const monthOnly = [...new Set(quarter.scorecards.flatMap((s) => s.monthOnly))]
    const out = { kpi: { trusted: { period: quarter.quarter, monthOnly }, rows } }
    return { refused: false, out: wire(out), rowCount: rows.length, reveals: rows.length > 0 }
  }
  if (call.name === MINE) {
    const card = bodies[ID.me] as KpiMeResponse
    const forecast = bodies[ID.forecast] as KpiForecastResponse | undefined
    const rows = cardRows(card.scorecards, aheadOf(forecast?.items)(who.id), true)
    const out = { kpi: { trusted: { period: card.period }, rows } }
    return { refused: false, out: wire(out), rowCount: rows.length, reveals: rows.length > 0 }
  }

  const named = bodies[ID.team] as (KpiTeamViewResponse & { teamNotFound?: boolean }) | undefined
  if (named?.teamNotFound) {
    const { teams } = bodies[ID.roster] as KpiTeamRosterResponse
    const out = {
      teamNotFound: true,
      teams: { rows: teams.map((t) => ({ untrusted: { name: t.name } })) },
    }
    return { refused: false, out: wire(out), rowCount: teams.length, reveals: teams.length > 0 }
  }
  const people = named ? named.people : (bodies[ID.people] as KpiPeopleResponse).people
  const forecast = bodies[ID.forecastAll] as KpiForecastResponse | undefined
  const ahead = aheadOf(forecast?.items)
  const ordered = [...people].sort((a, b) => Number(isBehind(b)) - Number(isBehind(a)))
  const rows = ordered.slice(0, PEOPLE_LIST).map((p) => ({
    untrusted: { name: p.name },
    trusted: { behind: isBehind(p) },
    readings: cardRows(p.scorecards, ahead(p.actorId)),
  }))
  /* A ratio, hours or days has no team total: the page shows members only. */
  const total = (named?.readings ?? [])
    .filter((r) => r.value !== null || r.share !== null)
    .flatMap((r) =>
      rowsOf(r.role, {
        key: r.metricKey,
        value: r.value,
        target: r.share,
        expected: r.expected,
        verdict: r.verdict,
      }),
    )
  const out = {
    kpi: { trusted: { period: at, more: ordered.length > PEOPLE_LIST }, rows },
    ...(named && { team: { untrusted: { name: named.team.name }, rows: total } }),
  }
  return {
    refused: false,
    out: wire(out),
    rowCount: rows.length,
    reveals: named ? true : rows.length > 0,
  }
}

/** As the tool's answer is read back: JSON, so a field the tool left undefined is not there. */
const wire = (value: object): Json => JSON.parse(JSON.stringify(value)) as Json

/** Every metric row of an answer, wherever the tool nested it. */
export function metricRows(value: unknown): Json[] {
  if (Array.isArray(value)) return value.flatMap(metricRows)
  if (typeof value !== 'object' || value === null) return []
  const own = 'metric' in value && 'unit' in value ? [value as Json] : []
  return [...own, ...Object.values(value).flatMap(metricRows)]
}

const FIGURES = ['value', 'target', 'expected', 'projected', 'pipeline']

/** A figure is printed under the name of its unit: money in VND, a ratio as a percent. */
function unitsBind(c: Check, out: Json): void {
  for (const row of metricRows(out)) {
    const suffix = UNIT_SUFFIX[String(row.unit)] ?? ''
    const named = Object.keys(row).filter((k) => FIGURES.some((f) => k.startsWith(f)))
    c.ok(
      named.every(
        (k) => FIGURES.includes(k.slice(0, k.length - suffix.length)) && k.endsWith(suffix),
      ),
      `${String(row.metric)}: every figure of a ${String(row.unit)} ends in "${suffix}"`,
    )
    c.eq(row.currency, row.unit === 'money' ? 'VND' : undefined, `${String(row.metric)}: currency`)
  }
}

const NO_COMPANY = /"(company|targets|history|contributions)"/

export function agreeOnRefusal(
  c: Check,
  want: KpiExpected & { refused: true },
  trail: Trail,
): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'refused', 'the tool must refuse what the doors refuse')
  c.eq(row?.codes, [], 'a refused tool names no record')
  c.eq(row?.revealsContent, false, 'a refusal reveals nothing')
  c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
  const { out, text } = toolBody(trail)
  c.eq(out.error, want.allShut ? 'not-allowed' : 'not-found-or-not-allowed', 'the refusal says why')
  c.ok(!/kpi|Money|Percent|team/.test(Object.keys(out).join()), 'a refusal carries no figure')
  c.ok(
    !/"(value|target|expected|projected|pipeline)(Money|Percent)?"/.test(text),
    'no figure leaks',
  )
  c.ok(!trail.audits.some((a) => a.action === 'ai-read'), 'a refused call writes no ai-read line')
  const line = trail.audits.some((a) => a.action === 'view' && !!a.note?.includes('chặn'))
  c.ok(line === want.allShut, 'the gate writes its refusal line only when every door is shut')
}

export function agreeOnAnswer(
  c: Check,
  want: KpiExpected & { refused: false },
  trail: Trail,
): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'ok', 'the tool must answer what the doors answer')
  c.eq(row?.codes, [], 'a KPI answer names no record')
  c.eq(row?.rowCount, want.rowCount, 'the rows')
  c.eq(row?.revealsContent, want.reveals, 'it reveals when there is a figure or a person')
  const { out, text } = toolBody(trail)
  c.eq(out, want.out, 'the answer, as the doors give it')
  unitsBind(c, out)
  c.ok(
    !NO_COMPANY.test(text),
    'neither the company card, the targets, the history nor the contributions',
  )
  c.eq(dig(out, 'hidden'), undefined, 'a KPI answer hides nothing')
}

/** One call by one seat, against what the doors hand the same seat. */
export async function runKpi(world: World, c: Check, cell: KpiCell): Promise<KpiExpected> {
  const want = await expectedOf(world, cell.who, cell.call)
  const trail = await gateLinesOnly(world, c, () =>
    runTurn(world, { who: cell.who, script: [{ calls: [cell.call] }, parrot] }),
  )
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (want.refused) agreeOnRefusal(c, want, trail)
  else agreeOnAnswer(c, want, trail)
  return want
}
