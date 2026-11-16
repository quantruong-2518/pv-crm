import { NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import { creditsOf } from './emit-contracts-credits'
import { beatsOf, handOf } from './emit-deals-view'
import type { Story } from './story.types'
import type { Ctx } from './types'

/** The signed paper itself: what the sign door writes in one transaction, the
 *  object mirror, the deal -> contract edge, the lanes snapshot (ADR 0086), the
 *  optional credit split (ADR 0155) and the `signed` touch on deal and lead. */

export type Facts = {
  story: Story
  hd: string
  op: string
  ld: string
  ws: string
  value: number
  currency: 'VND' | 'USD'
  signedAt: Date
  owner: string
  collector: string
  customer: string
  contactName: string
}

/** Rows of earlier emitters, indexed once so a journey does not scan the plan. */
export type PlanIndex = {
  lanes: Map<string, { actorId: string; role: 'SALE' | 'BD' | 'PRESALES'; isPrimary: boolean }[]>
  dealName: Map<string, string>
  kindOf: Map<string, string>
}

export function indexPlan(ctx: Ctx): PlanIndex {
  const lanes: PlanIndex['lanes'] = new Map()
  for (const o of ctx.plan.opportunityOwner) {
    const list = lanes.get(o.opportunityCode) ?? []
    list.push({ actorId: o.actorId, role: o.role, isPrimary: o.isPrimary ?? false })
    lanes.set(o.opportunityCode, list)
  }
  const dealName = new Map(ctx.plan.opportunity.map((o) => [o.code, o.name]))
  const kindOf = new Map<string, string>()
  for (const q of ctx.plan.quotation)
    if (q.contractCode && q.kind) kindOf.set(q.contractCode, q.kind)
  return { lanes, dealName, kindOf }
}

export function factsOf(ctx: Ctx, story: Story): Facts {
  const k = story.knobs
  const signed = beatsOf(story, 'signed')[0]!
  const need = (m: Map<string, string>, what: string): string => {
    const v = m.get(story.key)
    if (!v)
      throw new Error(`contracts: no ${what} for ${story.key}; an earlier emitter must set it`)
    return v
  }
  const company = ctx.companies[k.company]!
  return {
    story,
    hd: need(ctx.ids.contract, 'HĐ code'),
    op: need(ctx.ids.opportunity, 'OP code'),
    ld: need(ctx.ids.lead, 'LD code'),
    ws: need(ctx.ids.workstream, 'WS code'),
    value: signed.value,
    currency: k.deal?.currency ?? 'VND',
    signedAt: signed.at,
    /* The closer is whoever signed (ADR 0113): the raiser after approval, the head on a direct sign. */
    owner: signed.by,
    collector: k.contract!.collector,
    customer: company.shortName,
    contactName: company.contacts[story.contact]?.name ?? 'khách hàng',
  }
}

function emitCredits(ctx: Ctx, f: Facts, lanes: PlanIndex['lanes']): void {
  const lane = (lanes.get(f.op) ?? []).map((l) => l.actorId)
  for (const c of creditsOf(ctx, f.story.key, f.owner, lane) ?? []) {
    ctx.plan.contractCredit.push({
      contractCode: f.hd,
      actorId: c.actorId,
      shareBp: c.shareBp,
      createdAt: f.signedAt,
    })
  }
}

export function emitContractRows(ctx: Ctx, f: Facts, index: PlanIndex): void {
  const owner = handOf(ctx, f.owner)
  const label = index.dealName.get(f.op) ?? f.customer
  ctx.plan.object.push({
    code: f.hd,
    kind: 'HĐ',
    branch: 'Sales',
    label,
    owner: owner.name,
    ownerId: owner.id,
    amount: f.value,
  })
  ctx.plan.edge.push({ fromCode: f.op, toCode: f.hd, kind: 'spawned' })
  ctx.plan.contract.push({
    code: f.hd,
    opportunityCode: f.op,
    leadCode: f.ld,
    amount: f.value,
    currency: f.currency,
    signedAt: f.signedAt,
    ownerId: f.owner,
    collectorId: f.collector,
    workstreamCode: f.ws,
    kind: index.kindOf.get(f.hd) ?? 'CK-02',
  })
  const lanes = index.lanes.get(f.op) ?? []
  const seen = new Set<string>()
  for (const l of lanes) {
    const key = `${l.actorId}/${l.role}`
    if (seen.has(key)) continue
    seen.add(key)
    ctx.plan.contractParticipant.push({
      contractCode: f.hd,
      actorId: l.actorId,
      role: l.role,
      isPrimary: l.isPrimary,
    })
  }
  emitCredits(ctx, f, index.lanes)
  const by = beatsOf(f.story, 'signed')[0]!.by
  for (const [code, subjectKind] of [
    [f.op, 'opportunity'],
    [f.ld, 'lead'],
  ] as const) {
    ctx.plan.touch.push({
      at: f.signedAt,
      subjectCode: code,
      subjectKind,
      kind: 'signed',
      actorId: by,
      by: handOf(ctx, by).name,
      note: NOTE.signed(f.hd),
    })
  }
}
