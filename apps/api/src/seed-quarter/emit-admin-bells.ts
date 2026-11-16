import {
  NOTIFICATION_DETAIL_CONTRACT,
  NOTIFICATION_DETAIL_NO,
  OPPORTUNITY_STAGE_LABEL,
} from '@pv/contracts'
import {
  APPROVAL_DECIDED,
  APPROVAL_WAITING,
  CONTRACT_SIGNED,
  CONTRACT_TERMINATED,
  INSTALLMENT_PAID,
  OPPORTUNITY_ACCEPTED,
  OPPORTUNITY_OPENED,
  OPPORTUNITY_STAGE_MOVED,
  OVERDUE_REASON_DECIDED,
  OVERDUE_REASON_SENT,
} from '@pv/engines'
import { sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { rowsOf, ring, type Cand } from './emit-admin-ring'
import { CAST } from './params'

/** Bells of the deal and contract side, read back from the written rows so a
 *  line names what the database holds. Each door's event, audiences and detail
 *  are copied from the service that rings it in production. */

const ACCEPTORS = [CAST.head, CAST.director]
const DETAIL_DECISION = 'decision'
const DETAIL_NOTE = 'note'

type Opp = {
  code: string
  name: string
  state: string
  createdAt: Date
  acceptedAt: Date | null
  acceptedBy: string | null
  closedAt: Date | null
  openedBy: string | null
  lastBy: string | null
  owners: string[]
}

type Stage = { code: string; to: 'engaged' | 'quotation'; at: Date; by: string }

export async function dealBells(tx: Db): Promise<{ cands: Cand[]; owners: Map<string, string[]> }> {
  const opps = await rowsOf<Opp>(
    tx,
    sql`SELECT o.code, o.name, o.state, o.created_at AS "createdAt", o.accepted_at AS "acceptedAt",
        o.accepted_by_id AS "acceptedBy", o.closed_at AS "closedAt",
        (SELECT e.by_id FROM sales.opportunity_stage_event e
          WHERE e.opportunity_code = o.code AND e.from_stage IS NULL ORDER BY e.at LIMIT 1) AS "openedBy",
        (SELECT e.by_id FROM sales.opportunity_stage_event e
          WHERE e.opportunity_code = o.code ORDER BY e.at DESC LIMIT 1) AS "lastBy",
        COALESCE((SELECT array_agg(w.actor_id) FROM sales.opportunity_owner w
          WHERE w.opportunity_code = o.code), '{}') AS owners
        FROM sales.opportunity o`,
  )
  const stages = await rowsOf<Stage>(
    tx,
    sql`SELECT e.opportunity_code AS code, e.to_stage AS "to", e.at, e.by_id AS by
        FROM sales.opportunity_stage_event e WHERE e.to_stage IN ('engaged', 'quotation')`,
  )
  const owners = new Map(opps.map((o) => [o.code, o.owners]))
  const name = new Map(opps.map((o) => [o.code, o.name]))
  const cands: Cand[] = []
  for (const o of opps) {
    const subject = { kind: 'opportunity' as const, code: o.code, label: o.name }
    const bornAccepted =
      o.acceptedAt !== null && o.acceptedAt.getTime() - o.createdAt.getTime() < 60_000
    cands.push(
      ...ring({
        at: o.createdAt,
        subject,
        pending: o.acceptedAt === null && o.state === 'open',
        event: {
          name: OPPORTUNITY_OPENED,
          ref: { code: o.code },
          ...(o.openedBy ? { actorId: o.openedBy } : {}),
          audiences: { acceptors: ACCEPTORS, holders: o.owners },
          data: { lost: false, accepted: bornAccepted },
        },
      }),
    )
    if (o.acceptedAt && o.acceptedBy)
      cands.push(
        ...ring({
          at: o.acceptedAt,
          subject,
          event: {
            name: OPPORTUNITY_ACCEPTED,
            ref: { code: o.code },
            actorId: o.acceptedBy,
            audiences: { holders: o.owners },
          },
        }),
      )
    if (o.state === 'lost' && o.closedAt)
      cands.push(
        ...ring({
          at: o.closedAt,
          subject,
          event: {
            name: OPPORTUNITY_OPENED,
            ref: { code: o.code },
            ...(o.lastBy ? { actorId: o.lastBy } : {}),
            audiences: { holders: o.owners },
            data: { lost: true, accepted: o.acceptedAt !== null },
          },
        }),
      )
  }
  for (const s of stages)
    cands.push(
      ...ring({
        at: s.at,
        subject: { kind: 'opportunity', code: s.code, label: name.get(s.code) ?? null },
        event: {
          name: OPPORTUNITY_STAGE_MOVED,
          ref: { code: s.code },
          actorId: s.by,
          audiences: { owners: owners.get(s.code) ?? [] },
          occurrence: s.to,
        },
        detail: { stage: OPPORTUNITY_STAGE_LABEL[s.to] },
      }),
    )
  return { cands, owners }
}

type Approval = {
  id: string
  state: string
  raisedBy: string
  raisedAt: Date
  consequence: string
  decidedAt: Date | null
  decidedBy: string | null
  reason: string | null
  approver: string | null
}

export async function approvalBells(tx: Db): Promise<Cand[]> {
  const rows = await rowsOf<Approval>(
    tx,
    sql`SELECT a.id, a.state, a.raised_by_id AS "raisedBy", a.raised_at AS "raisedAt", a.consequence,
        a.decided_at AS "decidedAt", a.decided_by AS "decidedBy", a.decided_reason AS reason,
        a.chain -> 0 ->> 'personId' AS approver
        FROM platform.approval a`,
  )
  return rows.flatMap((a) => {
    const subject = { kind: 'approval' as const, code: a.id, label: a.consequence }
    const waiting = ring({
      at: a.raisedAt,
      subject,
      pending: a.state === 'waiting',
      event: {
        name: APPROVAL_WAITING,
        ref: { code: a.id },
        actorId: a.raisedBy,
        audiences: { approver: a.approver ? [a.approver] : [] },
        occurrence: '0',
      },
    })
    const decided =
      a.decidedAt && (a.state === 'approved' || a.state === 'rejected')
        ? ring({
            at: a.decidedAt,
            subject,
            event: {
              name: APPROVAL_DECIDED,
              ref: { code: a.id },
              ...(a.decidedBy ? { actorId: a.decidedBy } : {}),
              audiences: { requester: [a.raisedBy] },
              data: { approved: a.state === 'approved' },
            },
            detail: a.reason ? { reason: a.reason } : null,
          })
        : []
    return [...waiting, ...decided]
  })
}

type Contract = {
  code: string
  op: string
  opName: string
  signedAt: Date
  owner: string | null
  collector: string
  label: string
  participants: string[]
  raiser: string | null
  decider: string | null
}

type Paid = { code: string; no: number; by: string | null; at: Date }
type Reason = {
  id: number
  code: string
  no: number
  writtenBy: string
  writtenAt: Date
  state: string
  decidedBy: string | null
  decidedAt: Date | null
  note: string | null
}
type Ended = { code: string; at: Date; by: string }

export async function contractBells(tx: Db, owners: Map<string, string[]>): Promise<Cand[]> {
  const contracts = await rowsOf<Contract>(
    tx,
    sql`SELECT k.code, k.opportunity_code AS op, o.name AS "opName", k.signed_at AS "signedAt",
        k.owner_id AS owner, k.collector_id AS collector, COALESCE(ob.label, k.code) AS label,
        COALESCE((SELECT array_agg(DISTINCT a.id) FROM sales.contract_participant p
          JOIN platform.actor a ON a.id = p.actor_id AND NOT a.own_only AND a.disabled_at IS NULL
          WHERE p.contract_code = k.code), '{}') AS participants,
        ap.raised_by_id AS raiser, ap.decided_by AS decider
        FROM sales.contract k
        JOIN sales.opportunity o ON o.code = k.opportunity_code
        LEFT JOIN platform.object ob ON ob.code = k.code
        LEFT JOIN LATERAL (SELECT a.raised_by_id, a.decided_by FROM platform.approval a
          WHERE a.kind = 'contract-sign' AND a.state = 'approved'
            AND a.payload ->> 'opportunityCode' = k.opportunity_code
          ORDER BY a.decided_at DESC LIMIT 1) ap ON true`,
  )
  const paid = await rowsOf<Paid>(
    tx,
    sql`SELECT i.contract_code AS code, i.no, i.paid_by_id AS by, i.paid_recorded_at AS at
        FROM sales.contract_installment i WHERE i.paid_at IS NOT NULL AND i.paid_recorded_at IS NOT NULL`,
  )
  const reasons = await rowsOf<Reason>(
    tx,
    sql`SELECT r.id, r.contract_code AS code, r.installment_no AS no, r.written_by_id AS "writtenBy",
        r.written_at AS "writtenAt", r.state, r.decided_by_id AS "decidedBy",
        r.decided_at AS "decidedAt", r.decision_note AS note
        FROM sales.installment_overdue_reason r`,
  )
  const ended = await rowsOf<Ended>(
    tx,
    sql`SELECT t.contract_code AS code, t.terminated_at AS at, t.terminated_by_id AS by
        FROM sales.contract_termination t`,
  )
  const byCode = new Map(contracts.map((k) => [k.code, k]))
  const subjectOf = (k: Contract) => ({ kind: 'contract' as const, code: k.code, label: k.label })
  const cands: Cand[] = []
  for (const k of contracts) {
    const holders = owners.get(k.op) ?? []
    cands.push(
      ...ring({
        at: k.signedAt,
        subject: { kind: 'opportunity', code: k.op, label: k.opName },
        event: {
          name: CONTRACT_SIGNED,
          ref: { code: k.code },
          actorId: k.decider ?? k.owner ?? CAST.director,
          audiences: {
            director: [CAST.director].filter((id) => id !== k.raiser),
            owners: holders.filter((id) => id !== k.raiser),
            'commission-owner': k.owner && k.owner !== k.raiser ? [k.owner] : [],
          },
        },
        detail: { [NOTIFICATION_DETAIL_CONTRACT]: k.code },
      }),
    )
  }
  for (const p of paid) {
    const k = byCode.get(p.code)
    if (!k) continue
    cands.push(
      ...ring({
        at: p.at,
        subject: subjectOf(k),
        event: {
          name: INSTALLMENT_PAID,
          ref: { code: k.code },
          ...(p.by ? { actorId: p.by } : {}),
          occurrence: `${p.no}@${p.at.getTime()}`,
          audiences: {
            owner: [k.owner, k.collector].filter((id): id is string => !!id),
            participants: k.participants,
          },
        },
        detail: { [NOTIFICATION_DETAIL_NO]: p.no },
      }),
    )
  }
  for (const r of reasons) {
    const k = byCode.get(r.code)
    if (!k) continue
    cands.push(
      ...ring({
        at: r.writtenAt,
        subject: subjectOf(k),
        pending: r.state === 'waiting',
        event: {
          name: OVERDUE_REASON_SENT,
          ref: { code: k.code },
          actorId: r.writtenBy,
          occurrence: `${r.no}/${r.id}`,
          audiences: { approvers: [CAST.head, CAST.director] },
        },
        detail: { [NOTIFICATION_DETAIL_NO]: r.no },
      }),
    )
    if (r.decidedAt && r.decidedBy && r.state !== 'waiting')
      cands.push(
        ...ring({
          at: r.decidedAt,
          subject: subjectOf(k),
          event: {
            name: OVERDUE_REASON_DECIDED,
            ref: { code: k.code },
            actorId: r.decidedBy,
            occurrence: `${r.no}/${r.id}`,
            audiences: { writer: [r.writtenBy] },
          },
          detail: {
            [NOTIFICATION_DETAIL_NO]: r.no,
            [DETAIL_DECISION]: r.state,
            ...(r.note ? { [DETAIL_NOTE]: r.note } : {}),
          },
        }),
      )
  }
  for (const t of ended) {
    const k = byCode.get(t.code)
    if (!k) continue
    cands.push(
      ...ring({
        at: t.at,
        subject: { kind: 'contract', code: k.code, label: k.label },
        event: {
          name: CONTRACT_TERMINATED,
          ref: { code: k.code },
          actorId: t.by,
          audiences: {
            director: [CAST.director],
            owners: owners.get(k.op) ?? [],
            'commission-owner': k.owner ? [k.owner] : [],
          },
        },
      }),
    )
  }
  return cands
}
