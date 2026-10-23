import { Inject, Injectable } from '@nestjs/common'
import { sql, type SQL } from 'drizzle-orm'
import {
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type StopLogKind,
  type StopLogNow,
  type StopLogQuery,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { VN_TODAY } from '../after-sale/after-sale.sql'
import { dealLost } from '../open-deal'

/** One stop before the mapper. `stageRaw` is a lead state, a deal stage, or a
 *  collected percent, by `kind`; `note` on a lead row is the whole touch note. */
export type StopLogRead = {
  at: string
  kind: StopLogKind
  code: string
  name: string
  stageRaw: string | null
  actorName: string | null
  reasonKey: string
  reasonLabel: string
  note: string | null
  now: StopLogNow
}

export type StopFacetRead = { key: string; label: string; count: number }
export type StopStageFacetRead = { kind: StopLogKind; stageRaw: string | null; count: number }

export type StopLogPage = {
  total: number
  rows: StopLogRead[]
  byReason: StopFacetRead[]
  byStage: StopStageFacetRead[]
  byActor: StopFacetRead[]
}

/** The caller's cut: which kinds it may read, and whose acts (`ownOnly`). */
export type StopLogReach = { kinds: StopLogKind[]; onlyActorId: string | null }

/** SQL of the stop log (ADR 0125): one UNION ALL of the three stop events, read
 *  once for the page, the total and the three facets, so all five agree.
 *  Vietnam-day edges; a missing end is this month's. A disabled lead takes its
 *  deals and contracts out with it. Ties break on the code, so PGlite and Neon
 *  order alike. Which kinds and whose acts is the service's decision. */
@Injectable()
export class StopLogRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async page(q: StopLogQuery, reach: StopLogReach): Promise<StopLogPage> {
    const parts = reach.kinds.map((k) => BRANCH[k](windowOf(q), reach.onlyActorId))
    const stops = sql.join(parts, sql` UNION ALL `)
    const r = (await this.db.execute(sql`
      WITH s AS (${stops})
      SELECT
        (SELECT count(*)::int FROM s) AS total,
        (SELECT coalesce(json_agg(p ORDER BY p.at DESC, p.code COLLATE "C"), '[]')
           FROM (SELECT * FROM s ORDER BY at DESC, code COLLATE "C"
                  LIMIT ${q.size} OFFSET ${(q.page - 1) * q.size}) p) AS rows,
        (SELECT coalesce(json_agg(f ORDER BY f.count DESC, f.key COLLATE "C"), '[]')
           FROM (SELECT "reasonKey" AS key, max("reasonLabel") AS label, count(*)::int AS count
                   FROM s GROUP BY "reasonKey") f) AS "byReason",
        (SELECT coalesce(json_agg(f ORDER BY f.count DESC, f.kind, f."stageRaw" COLLATE "C"), '[]')
           FROM (SELECT kind, "stageRaw", count(*)::int AS count
                   FROM s GROUP BY kind, "stageRaw") f) AS "byStage",
        (SELECT coalesce(json_agg(f ORDER BY f.count DESC, f.key COLLATE "C"), '[]')
           FROM (SELECT coalesce("actorId", "actorName", '') AS key,
                        max(coalesce("actorName", '')) AS label, count(*)::int AS count
                   FROM s GROUP BY coalesce("actorId", "actorName", '')) f) AS "byActor"
    `)) as { rows: StopLogPage[] }
    const [row] = r.rows
    return row ?? { total: 0, rows: [], byReason: [], byStage: [], byActor: [] }
  }
}

type Window = { lo: SQL; hi: SQL }

/** `[lo, hi)` as instants; each end defaults to the edge of the current month. */
function windowOf(q: StopLogQuery): Window {
  const month = sql`date_trunc('month', ${VN_TODAY})::date`
  const from = sql`coalesce(${q.from ?? null}::date, ${month})`
  const to = sql`coalesce(${q.to ?? null}::date, (${month} + interval '1 month')::date - 1)`
  return {
    lo: sql`(${from})::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`,
    hi: sql`((${to}) + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`,
  }
}

const within = (column: SQL, w: Window) => sql`${column} >= ${w.lo} AND ${column} < ${w.hi}`

const mine = (column: SQL, actorId: string | null) =>
  actorId === null ? sql`true` : sql`${column} = ${actorId}`

/** A retired catalogue row keeps its name; `other` has none and takes the shared label. */
const labelOf = (key: SQL) => sql`coalesce(c.name,
  CASE WHEN ${key} = ${OPPORTUNITY_STOP_REASON_OTHER}
       THEN ${OPPORTUNITY_STOP_REASON_OTHER_LABEL}::text ELSE ${key} END)`

/** The same column list and order in every branch: UNION ALL matches by position. */
const BRANCH: Record<StopLogKind, (w: Window, actorId: string | null) => SQL> = {
  /* A park is `waiting` only while the lead still sits in the pool from THIS
     park: a later park means it was taken back in between. A machine park has
     no actor (`byOf(null)`): a hand-picked EX-08/09 still counts. */
  lead: (w, actorId) => sql`
    SELECT t.at, 'lead'::text AS kind, l.code, l.company AS name, t.parked_from AS "stageRaw",
           t.actor_id AS "actorId", t.by AS "actorName", t.reason_id AS "reasonKey",
           ${labelOf(sql`t.reason_id`)} AS "reasonLabel", t.note,
           CASE WHEN l.state = 'nurturing' AND NOT EXISTS (
                  SELECT 1 FROM sales.touch t2 WHERE t2.subject_code = t.subject_code
                     AND t2.kind = 'nurtured' AND t2.at > t.at)
                THEN 'waiting' ELSE 'reclaimed' END::text AS now
      FROM sales.touch t
      JOIN sales.lead l ON l.code = t.subject_code AND l.disabled_at IS NULL
      LEFT JOIN sales.config_entry c ON c.id = t.reason_id AND c.list = 'EXIT_REASON'
     WHERE t.kind = 'nurtured' AND t.subject_kind = 'lead' AND ${within(sql`t.at`, w)}
       AND t.actor_id IS NOT NULL AND t.reason_id IS NOT NULL
       AND ${mine(sql`t.actor_id`, actorId)}`,
  /* The stopper is the closing stage event; a deal stopped before events were
     written has none and prints no actor. */
  deal: (w, actorId) => sql`
    SELECT o.closed_at AS at, 'deal'::text AS kind, o.code, l.company AS name,
           o.stopped_at_stage AS "stageRaw", ev.by_id AS "actorId", ev.by AS "actorName",
           o.stop_reason AS "reasonKey", ${labelOf(sql`o.stop_reason`)} AS "reasonLabel",
           o.stop_note AS note, 'ended'::text AS now
      FROM sales.opportunity o
      JOIN sales.lead l ON l.code = o.lead_code AND l.disabled_at IS NULL
      LEFT JOIN sales.config_entry c ON c.id = o.stop_reason AND c.list = 'LOSS_REASON'
      LEFT JOIN LATERAL (
        SELECT e.by_id, e.by FROM sales.opportunity_stage_event e
         WHERE e.opportunity_code = o.code AND e.to_stage IS NULL
         ORDER BY e.at DESC LIMIT 1) ev ON true
     WHERE ${dealLost(sql`o.code`, sql`o.state`)} AND ${within(sql`o.closed_at`, w)}
       AND ${mine(sql`ev.by_id`, actorId)}`,
  /* Collected is a snapshot in the contract's currency, so the share needs no
     conversion; a contract with no value has no share. */
  contract: (w, actorId) => sql`
    SELECT t.terminated_at AS at, 'contract'::text AS kind, k.code, l.company AS name,
           CASE WHEN k.amount > 0
                THEN round(100.0 * t.collected_amount / k.amount)::int::text END AS "stageRaw",
           t.terminated_by_id AS "actorId", a.name AS "actorName",
           t.reason_key AS "reasonKey", ${labelOf(sql`t.reason_key`)} AS "reasonLabel",
           t.note, 'ended'::text AS now
      FROM sales.contract_termination t
      JOIN sales.contract k ON k.code = t.contract_code
      JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL
      LEFT JOIN platform.actor a ON a.id = t.terminated_by_id
      LEFT JOIN sales.config_entry c
        ON c.id = t.reason_key AND c.list = 'CONTRACT_TERMINATION_REASON'
     WHERE ${within(sql`t.terminated_at`, w)} AND ${mine(sql`t.terminated_by_id`, actorId)}`,
}
