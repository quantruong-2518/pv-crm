import { sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { SEED_ID, SEED_MAIL, SEED_UUID } from './cast'

/** Removes every row the KPI book planted — found by the technical markers
 *  only (`u-kpi-` ids, `@kpi-seed.test` mailboxes, `5eed0000-` units), never
 *  by the visible `[TEST KPI]` label — plus what the app hung on those rows
 *  since (bells, sessions, notes on a seeded deal). The keys are frozen into
 *  a temporary table first, so a step never loses its anchor to an earlier one.
 *
 *  One transaction, children first. A preview runs the same deletes and rolls
 *  them back, so its counts are exact. A real row still pointing at a seeded
 *  person (a real lead handed to a test seat) stops the whole purge and is
 *  named: deciding what becomes of it is a person's call. A tree header is
 *  dropped only if the book made it and it is empty again. */

const K = (kind: string): string => `(SELECT key FROM kpi_seed_key WHERE kind = '${kind}')`
const A = K('actor')
const SEEDED_UNIT = `unit_id::text LIKE '${SEED_UUID}%'`

const KEYS: [string, string][] = [
  [
    'actor',
    `SELECT id FROM platform.actor WHERE id LIKE '${SEED_ID}%' AND email LIKE '%${SEED_MAIL}'`,
  ],
  ['lead', `SELECT code FROM sales.lead WHERE email LIKE '%${SEED_MAIL}'`],
  ['opp', `SELECT code FROM sales.opportunity WHERE lead_code IN ${K('lead')}`],
  ['contract', `SELECT code FROM sales.contract WHERE lead_code IN ${K('lead')}`],
  ['contact', `SELECT code FROM sales.contact WHERE lead_code IN ${K('lead')}`],
  ...(['account', 'workstream'] as const).map((t): [string, string] => [
    t,
    `SELECT DISTINCT l.${t}_code FROM sales.lead l WHERE l.code IN ${K('lead')} AND l.${t}_code IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM sales.lead o WHERE o.${t}_code = l.${t}_code AND o.code NOT IN ${K('lead')})`,
  ]),
  [
    'code',
    `SELECT key FROM kpi_seed_key WHERE kind IN ('lead', 'opp', 'contract', 'contact', 'account')`,
  ],
  ['meeting', `SELECT id::text FROM sales.meeting WHERE subject_code IN ${K('code')}`],
  [
    'identity',
    `SELECT id::text FROM comms.identity WHERE actor_id IN ${A} OR object_code IN ${K('code')}`,
  ],
  [
    'thread',
    `SELECT thread_id::text FROM comms.link WHERE object_code IN ${K('code')}
     UNION SELECT thread_id::text FROM comms.debrief WHERE subject_code IN ${K('code')}
     UNION SELECT id::text FROM comms.thread WHERE channel = 'meeting' AND external_id IN ${K('meeting')}`,
  ],
  ['debrief', `SELECT id::text FROM comms.debrief WHERE thread_id::text IN ${K('thread')}`],
  [
    'approval',
    `SELECT id::text FROM platform.approval WHERE payload->>'opportunityCode' IN ${K('opp')}
     UNION SELECT request_id::text FROM platform.approval_link WHERE object_code IN ${K('code')}`,
  ],
  ['campaign', `SELECT code FROM sales.campaign WHERE owner_id IN ${A}`],
  [
    'set',
    `SELECT id::text FROM sales.kpi_assignment WHERE ${SEEDED_UNIT} OR created_by IN ${A} OR sent_by IN ${A}`,
  ],
  [
    'version',
    `SELECT from_period FROM platform.org_node WHERE kind = 'company' AND ${SEEDED_UNIT}`,
  ],
]

const STEPS: [string, string][] = [
  [
    'platform.notification',
    `recipient_id IN ${A} OR actor_id IN ${A} OR subject_code IN ${K('code')} OR subject_code IN ${K('approval')}`,
  ],
  ['platform.audit', `actor_id IN ${A} OR code IN ${K('code')}`],
  [
    'sales.kpi_assignment_line',
    `assignment_id::text IN ${K('set')} OR person_id IN ${A} OR child_unit_id::text LIKE '${SEED_UUID}%'`,
  ],
  ['sales.kpi_assignment', `id::text IN ${K('set')}`],
  ['sales.kpi_absence', `actor_id IN ${A} OR stand_in_id IN ${A} OR declared_by_id IN ${A}`],
  ['sales.kpi_acknowledgement', `actor_id IN ${A}`],
  ['sales.kpi_target', `proposed_by_id IN ${A} OR agreed_by_id IN ${A}`],
  ['sales.kpi_alert_sent', `actor_id IN ${A}`],
  ['platform.org_member', `actor_id IN ${A}`],
  ['platform.org_node', `${SEEDED_UNIT} AND kind = 'team'`],
  ['platform.org_node', `${SEEDED_UNIT} AND kind = 'department'`],
  [
    'platform.org_node',
    `${SEEDED_UNIT} AND kind = 'company'
     AND NOT EXISTS (SELECT 1 FROM platform.org_node c WHERE c.from_period = org_node.from_period AND c.parent_id = org_node.unit_id)
     AND NOT EXISTS (SELECT 1 FROM platform.org_member m WHERE m.from_period = org_node.from_period AND m.unit_id = org_node.unit_id)`,
  ],
  [
    'platform.org_version',
    `from_period IN ${K('version')} AND NOT EXISTS (SELECT 1 FROM platform.org_node n WHERE n.from_period = org_version.from_period)`,
  ],
  ['sales.kpi_team', `id::text LIKE '${SEED_UUID}%'`],
  ['platform.approval', `id::text IN ${K('approval')}`],
  [
    'sales.customer_temperature',
    `debrief_id::text IN ${K('debrief')} OR lead_code IN ${K('lead')}`,
  ],
  ['comms.thread', `id::text IN ${K('thread')}`],
  ['comms.identity', `id::text IN ${K('identity')}`],
  ['sales.next_step', `subject_code IN ${K('code')}`],
  ['sales.hold', `lead_code IN ${K('lead')} OR opportunity_code IN ${K('opp')}`],
  ['sales.meeting', `id::text IN ${K('meeting')}`],
  ['sales.quotation', `opportunity_code IN ${K('opp')}`],
  ['sales.contract', `code IN ${K('contract')}`],
  ['sales.opportunity', `code IN ${K('opp')}`],
  ['sales.touch', `subject_code IN ${K('lead')} OR subject_code IN ${K('opp')}`],
  ['sales.campaign_member', `lead_code IN ${K('lead')} OR campaign_code IN ${K('campaign')}`],
  ['sales.contact', `code IN ${K('contact')}`],
  ['sales.lead', `code IN ${K('lead')}`],
  ['sales.workstream', `code IN ${K('workstream')}`],
  ['sales.account', `code IN ${K('account')}`],
  ['platform.approval_link', `object_code IN ${K('code')}`],
  ['comms.link', `object_code IN ${K('code')}`],
  ['comms.debrief', `subject_code IN ${K('code')}`],
  ['platform.edge', `from_code IN ${K('code')} OR to_code IN ${K('code')}`],
  ['platform.object', `code IN ${K('code')}`],
  ['sales.campaign', `code IN ${K('campaign')}`],
  ['platform.session', `actor_id IN ${A}`],
  ['platform.password_reset', `actor_id IN ${A}`],
  ['platform.user_pin', `actor_id IN ${A}`],
  ['sales.search_recent', `actor_id IN ${A}`],
]

type Rows = { rows: Record<string, unknown>[] }
const run = async (tx: Db, text: string): Promise<Rows> => (await tx.execute(sql.raw(text))) as Rows

/** Columns that still name a seeded person and would block deleting them;
 *  SET NULL and CASCADE keys are the database's to resolve. */
async function blockers(tx: Db): Promise<string[]> {
  const fks = await run(
    tx,
    `SELECT cn.nspname || '.' || c.relname AS tbl, a.attname AS col
       FROM pg_constraint k
       JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace cn ON cn.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f' AND k.confrelid = 'platform.actor'::regclass AND k.confdeltype IN ('a', 'r')`,
  )
  const found: string[] = []
  for (const fk of fks.rows as { tbl: string; col: string }[]) {
    const r = await run(tx, `SELECT count(*)::int AS n FROM ${fk.tbl} WHERE ${fk.col} IN ${A}`)
    const n = Number(r.rows[0]?.n ?? 0)
    if (n > 0) found.push(`${fk.tbl}.${fk.col}: ${n}`)
  }
  return found
}

/** Rows per table across the three owned schemas, in one statement: the
 *  difference before and after counts what cascades removed too. */
async function census(tx: Db): Promise<Map<string, number>> {
  const tables = await run(
    tx,
    `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
      WHERE table_schema IN ('platform', 'sales', 'comms') AND table_type = 'BASE TABLE'`,
  )
  const names = (tables.rows as { t: string }[]).map((r) => r.t)
  const counts = await run(
    tx,
    names.map((t) => `SELECT '${t}' AS t, count(*)::int AS n FROM ${t}`).join(' UNION ALL '),
  )
  return new Map((counts.rows as { t: string; n: number }[]).map((r) => [r.t, Number(r.n)]))
}

class Preview extends Error {}

export async function purge(db: Db, apply: boolean, say: (line: string) => void): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const before = await census(tx)
      await run(
        tx,
        'CREATE TEMP TABLE kpi_seed_key (kind text NOT NULL, key text NOT NULL) ON COMMIT DROP',
      )
      for (const [kind, select] of KEYS) {
        await run(
          tx,
          `INSERT INTO kpi_seed_key (kind, key) SELECT '${kind}', k FROM (${select}) s(k) WHERE k IS NOT NULL`,
        )
      }
      for (const [table, where] of STEPS) await run(tx, `DELETE FROM ${table} WHERE ${where}`)
      const blocked = await blockers(tx)
      if (blocked.length > 0) {
        throw new Error(
          `Còn dòng thật trỏ tới tài khoản thử, chưa xoá gì:\n  ${blocked.join('\n  ')}`,
        )
      }
      await run(tx, `DELETE FROM platform.actor WHERE id IN ${A}`)
      const after = await census(tx)
      let total = 0
      for (const [table, n] of [...before].sort(([a], [b]) => a.localeCompare(b))) {
        const gone = n - (after.get(table) ?? 0)
        if (gone === 0) continue
        total += gone
        say(`  − ${table.padEnd(36)} ${gone}`)
      }
      say(`${total} dòng thử ${apply ? 'đã xoá' : 'sẽ bị xoá'}.`)
      if (!apply) throw new Preview()
    })
  } catch (e) {
    if (!(e instanceof Preview)) throw e
    say(
      'Xem trước: đã chạy lệnh xoá trong một giao dịch rồi huỷ, không dòng nào mất. Thêm --apply để xoá thật.',
    )
  }
}
