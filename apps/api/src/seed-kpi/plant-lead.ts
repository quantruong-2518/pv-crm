import type { LeadState } from '@pv/contracts'
import { keysOf } from '@api/branches/sales/account/account.mapper'
import { LEAD_PARK_REASON } from '@api/branches/sales/lead/lead-state'
import { LEAD_NOTE } from '@api/branches/sales/lead/lead-write.mapper'
import { DIRECTOR, HEAD, SEED_MAIL, TAG, idOf, vn } from './cast'
import type { LeadSpec } from './book'
import { plantDeal, type LeadFrame } from './plant-deal'
import { pushTouch, type Ctx } from './plan'

/** One book line → its account, run, lead, contact, mirror rows and lead
 *  timeline, then its deals. The lead's state is derived from the story the
 *  way the state writer would have left it (ADR 0058, 0109): a deal makes it
 *  `converted`, every deal lost parks it, a hand-over without an answer is
 *  `assigned`. */

export const leadEmail = (no: number): string => `ld${String(no).padStart(2, '0')}${SEED_MAIL}`

/** Where the lead stands, who holds it, and since when. */
function standOf(spec: LeadSpec) {
  const deals = spec.deals ?? []
  const allLost = deals.length > 0 && deals.every((d) => d.lost)
  const lastLost = allLost ? Math.max(...deals.map((d) => vn(d.lost!.at).getTime())) : null
  const parked = spec.parked
    ? { at: vn(spec.parked.at), reason: spec.parked.reason, byMachine: false }
    : lastLost
      ? { at: new Date(lastLost), reason: LEAD_PARK_REASON.dealStopped, byMachine: true }
      : null
  const bd = spec.bd ? idOf(spec.bd.to) : null
  const state: LeadState = parked
    ? 'nurturing'
    : deals.length > 0
      ? 'converted'
      : spec.bd?.answered
        ? 'working'
        : spec.bd
          ? 'assigned'
          : 'new'
  const firstSale = deals.find((d) => d.sale)?.sale
  const holder = state === 'new' || state === 'nurturing' ? null : firstSale ? idOf(firstSale) : bd
  const since =
    parked?.at ??
    (deals[0] ? vn(deals[0].opened) : spec.bd ? vn(spec.bd.answered ?? spec.bd.at) : vn(spec.born))
  const tier = state === 'new' ? null : deals.length > 0 ? 'sql' : 'mql'
  return { state, holder, since, parked, tier } as const
}

export function plantLead(ctx: Ctx, spec: LeadSpec): void {
  const { plan, mint, hand } = ctx
  const company = `${TAG}${spec.company}`
  const person = `${TAG}${spec.contact}`
  const email = leadEmail(spec.no)
  const [ac, ws, ld, ct] = [mint('AC'), mint('WS'), mint('LD'), mint('CT')]
  const born = vn(spec.born)
  const mkt = hand(idOf(spec.mkt))
  const { state, holder, since, parked, tier } = standOf(spec)
  const holderHand = holder ? hand(holder) : null
  const subject = { code: ld, kind: 'lead' as const }

  pushTouch(ctx, subject, 'created', born, mkt, LEAD_NOTE.typed, {
    toActorId: mkt.id,
    toName: mkt.name,
    toRole: 'marketing',
  })
  if (spec.bd) {
    const bd = hand(idOf(spec.bd.to))
    pushTouch(
      ctx,
      subject,
      'handed-over',
      vn(spec.bd.at),
      hand(HEAD),
      `${LEAD_NOTE.handedTo} ${bd.name}`,
      {
        fromActorId: mkt.id,
        fromName: mkt.name,
        toActorId: bd.id,
        toName: bd.name,
        toRole: 'bd',
      },
    )
    if (spec.bd.answered) {
      pushTouch(ctx, subject, 'exchange-logged', vn(spec.bd.answered), bd, LEAD_NOTE.exchanged)
    }
  }

  const frame: LeadFrame = { ld, ws, ac, company, contactCode: ct, contactName: person }
  const signedAt = (spec.deals ?? [])
    .map((d, k) => plantDeal(ctx, frame, d, k))
    .filter((at): at is Date => at !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0]

  if (parked) {
    const by = parked.byMachine ? null : spec.bd ? hand(idOf(spec.bd.to)) : mkt
    pushTouch(
      ctx,
      subject,
      'nurtured',
      parked.at,
      by,
      LEAD_NOTE.nurtured(parked.reason, undefined),
      {
        reasonId: parked.reason,
      },
    )
  }

  const disabledAt = spec.disabled ? vn(spec.disabled) : null
  const mirror = { branch: 'Sales' as const, owner: holderHand?.name, ownerId: holderHand?.id }
  plan.objects.push(
    { code: ac, kind: 'AC', label: company, ...mirror },
    { code: ld, kind: 'LD', label: company, state, disabledAt, ...mirror },
    { code: ct, kind: 'CT', branch: 'Sales', label: person },
  )
  plan.edges.push(
    { fromCode: ld, toCode: ac, kind: 'belongs-to' },
    { fromCode: ct, toCode: ld, kind: 'belongs-to' },
  )
  plan.accounts.push({
    code: ac,
    name: company,
    ...keysOf({ name: company }),
    province: 'Bắc Ninh',
    ownerId: holder,
    createdBy: mkt.id,
    createdAt: born,
  })
  const closedAt = signedAt ?? parked?.at ?? null
  plan.workstreams.push({
    code: ws,
    accountCode: ac,
    openedAt: born,
    closedAt,
    closeReason: signedAt ? 'WON' : closedAt ? 'LOST' : null,
  })
  const lastTouchAt = plan.touches
    .filter((t) => t.subjectCode === ld)
    .reduce((max, t) => (t.at! > max ? t.at! : max), born)
  plan.leads.push({
    code: ld,
    createdAt: born,
    createdBy: mkt.id,
    accountCode: ac,
    workstreamCode: ws,
    company,
    province: 'Bắc Ninh',
    contactName: person,
    contactTitle: 'Giám đốc nhà máy',
    email,
    ownerId: holder,
    bdOwnerId: spec.bd ? idOf(spec.bd.to) : null,
    marketingOwnerId: mkt.id,
    tier,
    state,
    stateSince: since,
    sourceKind: 'MANUAL',
    motion: spec.origin === 'Email lạnh' ? 'OUTBOUND' : 'INBOUND',
    originId: ctx.origin.get(spec.origin) ?? null,
    lastTouchAt,
    exitReason: parked?.reason ?? null,
    exitedAt: parked?.at ?? null,
    disabledAt,
    disabledBy: disabledAt ? DIRECTOR : null,
  })
  plan.contacts.push({
    code: ct,
    leadCode: ld,
    name: person,
    title: 'Giám đốc nhà máy',
    email,
    isPrimary: true,
    by: mkt.name,
    createdBy: mkt.id,
    createdAt: born,
  })
  const campaignCode = ctx.campaignOf.get(mkt.id)
  if (campaignCode) plan.members.push({ campaignCode, leadCode: ld, addedAt: born })
}
