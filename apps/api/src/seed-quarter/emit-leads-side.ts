import { doneNote } from '@api/branches/sales/next-step/next-step.mapper'
import { normalisePhone } from '@pv/contracts'
import { normalisePhone as phoneKeyOf } from '@pv/engines'
import { reminderMarks } from './emit-deals-holds'
import { handOf, type LeadFacts } from './emit-leads-replay'
import type { Story } from './story.types'
import type { Contact as Person, Ctx } from './types'

/** What hangs off one lead besides its own row: the people, the holds and the
 *  open next step. Contacts hang off a lead, so the same person in two
 *  journeys of one company is two rows (two CT codes). */

const HOLD_NOTES = [
  'Khách đi công tác, hẹn gặp lại sau',
  'Chờ bên khách chốt ngân sách',
  'Khách đang kiểm kê cuối quý',
  'Chờ lãnh đạo khách họp xong',
]

/** Each wording carries the STEP_KIND it belongs to, matched by name. */
const STEP_TEXT: { kind: string; text: (name: string) => string }[] = [
  { kind: 'Gọi lại', text: (n) => `Gọi lại ${n} xác nhận nhu cầu` },
  { kind: 'Hẹn gặp', text: (n) => `Hẹn ${n} khảo sát nhà xưởng` },
  { kind: 'Gửi tài liệu', text: (n) => `Gửi tài liệu giới thiệu cho ${n}` },
  { kind: 'Gửi mẫu', text: (n) => `Gửi mẫu thử cho ${n}` },
  { kind: 'Gửi báo giá', text: (n) => `Gửi báo giá cho ${n}` },
  { kind: 'Theo dõi phản hồi', text: (n) => `Theo dõi phản hồi của ${n}` },
]

function contactRow(
  ctx: Ctx,
  leadCode: string,
  p: Person,
  primary: boolean,
  at: Date,
  by: string | null,
) {
  const code = ctx.mint('CT')
  const who = handOf(ctx, by)
  ctx.plan.object.push({ code, kind: 'CT', branch: 'Sales', label: p.name })
  ctx.plan.edge.push({ fromCode: code, toCode: leadCode, kind: 'belongs-to' })
  ctx.plan.contact.push({
    code,
    leadCode,
    name: p.name,
    title: p.title,
    email: p.email,
    phone: normalisePhone(p.phone),
    phoneKey: phoneKeyOf(p.phone),
    channel: 'email',
    isPrimary: primary,
    by: who.by,
    createdBy: who.actorId,
    createdAt: at,
    updatedAt: at,
  })
  return code
}

/** The story's own contact arrives with the lead; colleagues are met on the way
 *  to a deal, and a merged duplicate brings one more at the merge instant. */
export function emitContacts(ctx: Ctx, story: Story, leadCode: string): void {
  const k = story.knobs
  const people = ctx.companies[k.company]!.contacts
  const known = (ctx.ids.contact[k.company] ??= [])
  const own = people[story.contact]!
  const record = (p: Person, primary: boolean, at: Date, by: string | null): void => {
    const code = contactRow(ctx, leadCode, p, primary, at, by)
    known[p.index] ??= code
  }
  record(own, true, story.bornAt, k.marketer)

  const others = people.filter((p) => p.index !== own.index)
  const merged = story.beats.find((b) => b.kind === 'merged')
  const opened = story.beats.find((b) => b.kind === 'deal-opened')
  const met = story.beats.find((b) => b.kind === 'lead-claimed')
  if (merged && others.length > 0) record(ctx.rng.pick(others), false, merged.at, merged.by)
  if (opened && met && k.deal) {
    const count = Math.min(ctx.rng.int(0, 2), others.length)
    const picked = [...others].sort(() => ctx.rng.next() - 0.5).slice(0, count)
    for (const p of picked) {
      const span = opened.at.getTime() - met.at.getTime()
      const at = new Date(met.at.getTime() + span * ctx.rng.real(0.2, 0.8))
      record(p, false, at, k.worker)
    }
  }
}

/** Lead holds, in beat order; one is open at most. An open hold carries only the
 *  reminder marks the sweeper would already have set. */
export function emitHolds(ctx: Ctx, story: Story, leadCode: string): void {
  let open: (typeof ctx.plan.hold)[number] | null = null
  for (const b of story.beats) {
    if (b.kind === 'hold-set' && b.on === 'lead') {
      open = {
        id: ctx.rng.uuid(),
        subjectType: 'lead',
        subjectCode: leadCode,
        untilDay: b.until,
        note: ctx.rng.pick(HOLD_NOTES),
        setBy: b.by,
        setAt: b.at,
        ...reminderMarks(ctx, b.until, b.at),
      }
      ctx.plan.hold.push(open)
    } else if (b.kind === 'hold-ended' && b.on === 'lead' && open) {
      Object.assign(open, {
        endedAt: b.at,
        endedBy: b.by,
        endKind: b.end,
        remindedSoonAt: null,
        remindedDueAt: null,
      })
      open = null
    }
  }
}

/** The step still open at the end is a `next_step` row; each finished one left
 *  only its `next-step-done` touch, because done means the row is deleted. */
export function emitNextSteps(ctx: Ctx, story: Story, leadCode: string, facts: LeadFacts): void {
  const kinds = ctx.world.config.get('STEP_KIND') ?? []
  const name = ctx.companies[story.knobs.company]!.contacts[story.contact]!.name
  let open: { text: string; kindId: string | null } | null = null
  const text = (): NonNullable<typeof open> => {
    const t = ctx.rng.pick(STEP_TEXT)
    return { text: t.text(name), kindId: kinds.find((e) => e.name === t.kind)?.id ?? null }
  }
  for (const b of story.beats) {
    if (b.kind === 'next-step-open' && b.on === 'lead') {
      open = text()
      ctx.plan.nextStep.push({
        subjectCode: leadCode,
        text: open.text,
        due: b.due,
        doerId: b.doer,
        createdBy: b.by,
        createdAt: b.at,
        updatedAt: b.at,
        kindId: open.kindId,
      })
    } else if (b.kind === 'next-step-done' && b.on === 'lead' && open) {
      const row = ctx.plan.nextStep.pop()!
      const who = handOf(ctx, b.by)
      facts.touches.push({
        id: ctx.rng.uuid(),
        subjectCode: leadCode,
        subjectKind: 'lead',
        kind: 'next-step-done',
        at: b.at,
        by: who.by,
        actorId: who.actorId,
        note: doneNote(row.text),
      })
      open = null
    }
  }
}
