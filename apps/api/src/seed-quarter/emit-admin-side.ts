import { ROLE_LABEL, type RoleId } from '@pv/contracts'
import {
  CAMPAIGN_FINISHED,
  HOLD_DUE,
  HOLD_DUE_SOON,
  KPI_TARGET_AGREED,
  KPI_TARGET_PROPOSED,
  MAIL_REPLIED,
  MAIL_RUN_FINISHED,
  NEXT_STEP_SET,
} from '@pv/engines'
import { sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { addDays, vnAt } from './clock'
import { rowsOf, ring, type Cand } from './emit-admin-ring'
import { CAST } from './params'

/** Bells of the hold, campaign, mail, KPI and next-step doors, copied from the
 *  service that rings each one. A hold rings half a month before the see-again
 *  day and on it, as `HoldReminderSweeper` does. */

type Hold = {
  id: string
  type: 'lead' | 'opportunity'
  code: string
  until: string
  by: string
  setAt: Date
  endedAt: Date | null
  label: string | null
  holders: string[]
}

export async function holdBells(tx: Db, now: Date): Promise<Cand[]> {
  const holds = await rowsOf<Hold>(
    tx,
    sql`SELECT h.id, h.subject_type AS type, h.subject_code AS code, h.until_day::text AS until,
        h.set_by AS by, h.set_at AS "setAt", h.ended_at AS "endedAt",
        COALESCE(l.company, o.name) AS label,
        CASE WHEN h.subject_type = 'lead'
          THEN ARRAY[l.owner_id]::text[]
          ELSE COALESCE((SELECT array_agg(w.actor_id) FROM sales.opportunity_owner w
                          WHERE w.opportunity_code = h.subject_code), '{}')
        END AS holders
        FROM sales.hold h
        LEFT JOIN sales.lead l ON l.code = h.lead_code
        LEFT JOIN sales.opportunity o ON o.code = h.opportunity_code`,
  )
  return holds.flatMap((h) => {
    const due = vnAt(h.until, 8)
    const soon = new Date(
      Math.max(vnAt(addDays(h.until, -15), 8).getTime(), h.setAt.getTime() + 36e5),
    )
    const stop = Math.min(now.getTime(), h.endedAt?.getTime() ?? now.getTime())
    const one = (name: string, at: Date) =>
      at.getTime() < stop
        ? ring({
            at,
            subject: { kind: h.type, code: h.code, label: h.label },
            event: {
              name,
              ref: { code: h.code },
              audiences: { holders: h.holders.filter(Boolean), setter: [h.by] },
              occurrence: `${h.id}:${h.until}`,
            },
            detail: { until: h.until },
          })
        : []
    return [...one(HOLD_DUE_SOON, soon), ...one(HOLD_DUE, due)]
  })
}

type Finished = { code: string; name: string; owner: string; at: Date }
type Run = { id: string; label: string; by: string; at: Date }
type Replied = { id: string; code: string; at: Date; label: string | null; owner: string | null }

export async function mailBells(tx: Db): Promise<Cand[]> {
  const campaigns = await rowsOf<Finished>(
    tx,
    sql`SELECT c.code, c.name, c.owner_id AS owner, c.updated_at AS at
        FROM sales.campaign c WHERE c.state = 'DONE' AND c.owner_id IS NOT NULL`,
  )
  const runs = await rowsOf<Run>(
    tx,
    sql`SELECT r.id, r.label, r.created_by AS by, r.finished_at AS at
        FROM platform.mail_run r WHERE r.state = 'SENT' AND r.finished_at IS NOT NULL
          AND r.created_by IS NOT NULL`,
  )
  const replies = await rowsOf<Replied>(
    tx,
    sql`SELECT t.id, t.subject_code AS code, t.at, l.company AS label, l.owner_id AS owner
        FROM sales.touch t JOIN sales.lead l ON l.code = t.subject_code
        WHERE t.kind = 'customer-replied' AND t.subject_kind = 'lead'`,
  )
  return [
    ...campaigns.flatMap((c) =>
      ring({
        at: c.at,
        subject: { kind: 'campaign', code: c.code, label: c.name },
        event: {
          name: CAMPAIGN_FINISHED,
          ref: { code: c.code },
          audiences: { owner: [c.owner] },
          occurrence: String(c.at.getTime()),
        },
      }),
    ),
    ...runs.flatMap((r) =>
      ring({
        at: r.at,
        subject: { kind: 'mail-run', code: r.id, label: r.label },
        event: {
          name: MAIL_RUN_FINISHED,
          ref: { code: r.id },
          audiences: { sender: [r.by] },
        },
      }),
    ),
    ...replies.flatMap((p) =>
      ring({
        at: p.at,
        subject: { kind: 'lead', code: p.code, label: p.label },
        event: {
          name: MAIL_REPLIED,
          ref: { code: p.code },
          occurrence: p.id,
          data: { bulk: false },
          audiences: {
            holder: p.owner ? [p.owner] : [],
            'pool-watchers': p.owner ? [] : [CAST.head],
          },
        },
      }),
    ),
  ]
}

type Target = {
  period: string
  role: RoleId
  proposedAt: Date
  proposedBy: string
  agreedAt: Date | null
  agreedBy: string | null
}

export async function kpiBells(tx: Db): Promise<Cand[]> {
  const targets = await rowsOf<Target>(
    tx,
    sql`SELECT period, role, min(proposed_at) AS "proposedAt",
        (array_agg(proposed_by_id ORDER BY proposed_at))[1] AS "proposedBy",
        max(agreed_at) AS "agreedAt",
        (array_agg(agreed_by_id ORDER BY agreed_at DESC NULLS LAST))[1] AS "agreedBy"
        FROM sales.kpi_target GROUP BY period, role`,
  )
  const asks = [CAST.head, CAST.director]
  return targets.flatMap((t) => {
    const code = `${t.period}:${t.role}`
    const month = `Tháng ${Number(t.period.slice(5))} · ${t.period.slice(0, 4)}`
    const subject = { kind: 'kpi-target' as const, code, label: `${ROLE_LABEL[t.role]} · ${month}` }
    return [
      ...ring({
        at: t.proposedAt,
        subject,
        event: {
          name: KPI_TARGET_PROPOSED,
          ref: { code },
          actorId: t.proposedBy,
          audiences: { setters: asks },
          occurrence: String(t.proposedAt.getTime()),
        },
      }),
      ...(t.agreedAt && t.agreedBy
        ? ring({
            at: t.agreedAt,
            subject,
            event: {
              name: KPI_TARGET_AGREED,
              ref: { code },
              actorId: t.agreedBy,
              audiences: { proposers: [t.proposedBy] },
              occurrence: String(t.agreedAt.getTime()),
            },
          })
        : []),
    ]
  })
}

type Step = { code: string; doer: string; by: string; at: Date; label: string | null }

export async function stepBells(tx: Db): Promise<Cand[]> {
  const steps = await rowsOf<Step>(
    tx,
    sql`SELECT s.subject_code AS code, s.doer_id AS doer, s.created_by AS by, s.updated_at AS at,
        COALESCE(l.company, o.name) AS label
        FROM sales.next_step s
        LEFT JOIN sales.lead l ON l.code = s.subject_code
        LEFT JOIN sales.opportunity o ON o.code = s.subject_code`,
  )
  return steps.flatMap((s) =>
    ring({
      at: s.at,
      subject: {
        kind: s.code.startsWith('OP-') ? 'opportunity' : 'lead',
        code: s.code,
        label: s.label,
      },
      event: {
        name: NEXT_STEP_SET,
        ref: { code: s.code },
        actorId: s.by,
        audiences: { doer: [s.doer] },
        occurrence: s.at.toISOString(),
      },
    }),
  )
}
