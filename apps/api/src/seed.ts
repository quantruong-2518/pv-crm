import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import {
  normalisePhone,
  StageKey,
  type OpportunityCreateState,
  type TouchKind,
} from '@pv/contracts'
import { createDb } from '@api/platform/db/create-db'
import { loadEnv } from '@api/platform/config/env'
import { actor, edge, objectRef } from '@api/platform/db/platform.schema'
import { account } from '@api/branches/sales/account/account.schema'
import { campaign, campaignMember } from '@api/branches/sales/campaign/campaign.schema'
import { sourceCost, sourceEvent, sourceFollower } from '@api/branches/sales/campaign/source.schema'
import { configEntry } from '@api/branches/sales/config/config.schema'
import { stageCriterion } from '@api/branches/sales/config/stage-criterion.schema'
import { contact } from '@api/branches/sales/contact/contact.schema'
import { contract, contractInstallment } from '@api/branches/sales/contract/contract.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { meeting, meetingAttendee } from '@api/branches/sales/meeting/meeting.schema'
import { opportunityCriterionTick } from '@api/branches/sales/opportunity/opportunity-criterion-tick.schema'
import { NOTE } from '@api/branches/sales/opportunity/opportunity.mapper'
import {
  opportunity,
  opportunityOwner,
  opportunityProduct,
  opportunityStageEvent,
} from '@api/branches/sales/opportunity/opportunity.schema'
import { touch } from '@api/branches/sales/touch/touch.schema'
import { workstream } from '@api/branches/sales/workstream/workstream.schema'
import { STAFF, type StaffMember } from './staff'
import { JOURNEYS, PRODUCTS, SOURCES, type DealSeed, type JourneySeed } from './seed-book'
import { ACCOUNTS, type ContactSeed } from './seed-companies'
import {
  configSeed,
  CRITERIA,
  criteriaSeed,
  EXIT_NAME,
  person,
  productRows,
  sourceIdOf,
} from './seed-config'

/** Wipe every demo row and plant the chip-industry book from `seed-book.ts`.
 *
 *  The cast is `STAFF`, the seven real seats, so the book can be walked by
 *  signing in; passwords still come from `pnpm db:seed:accounts -- --apply`.
 *  Refuses anything but pglite unless `--remote` is passed: it empties whole
 *  schemas, and `.env` has pointed at Neon before.
 *
 *  Run: `pnpm db:migrate && pnpm db:seed && pnpm db:seed:accounts -- --apply`. */

/** Reference data the migrations plant and no seed rebuilds — same list as
 *  `reset-staff.ts` plus the two catalogs migrations insert. */
const KEEP = [
  'role_permission',
  'permission_seed',
  'email_suppression',
  'mail_template',
  'motion_policy',
]
const OWNED_SCHEMAS = ['platform', 'sales', 'comms']

const DAY = 86_400_000
const NOW = Date.now()

/** `days` ago at 09:00 Vietnam time (02:00 UTC) plus `hours` — the hour
 *  orders events sharing a day, whatever timezone the seed runs in. */
function ago(days: number, hours = 0): Date {
  const d = new Date(NOW - days * DAY)
  d.setUTCHours(2 + hours, 0, 0, 0)
  return d
}
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)
const code = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, '0')}`

const MARKETING = person('u-marketing')
const BD = person('u-bd')
const HEAD = person('u-grace')
const PRESALES = person('u-presales')

/** Every row the seed writes, grouped by table, in insert order. */
const out = {
  objects: [] as (typeof objectRef.$inferInsert)[],
  edges: [] as (typeof edge.$inferInsert)[],
  accounts: [] as (typeof account.$inferInsert)[],
  runs: [] as (typeof workstream.$inferInsert)[],
  leads: [] as (typeof lead.$inferInsert)[],
  contacts: [] as (typeof contact.$inferInsert)[],
  members: [] as (typeof campaignMember.$inferInsert)[],
  deals: [] as (typeof opportunity.$inferInsert)[],
  owners: [] as (typeof opportunityOwner.$inferInsert)[],
  products: [] as (typeof opportunityProduct.$inferInsert)[],
  moves: [] as (typeof opportunityStageEvent.$inferInsert)[],
  ticks: [] as (typeof opportunityCriterionTick.$inferInsert)[],
  contracts: [] as (typeof contract.$inferInsert)[],
  installments: [] as (typeof contractInstallment.$inferInsert)[],
  touches: [] as (typeof touch.$inferInsert)[],
  meetings: [] as (typeof meeting.$inferInsert)[],
  attendees: [] as (typeof meetingAttendee.$inferInsert)[],
}

const accountCodeOf = new Map(ACCOUNTS.map((a, i) => [a.key, code('AC', i + 1)]))

function plantAccounts(): void {
  ACCOUNTS.forEach((a) => {
    const ac = accountCodeOf.get(a.key)!
    const owner = a.ownerId ? person(a.ownerId) : null
    out.objects.push({ code: ac, kind: 'AC', branch: 'Sales', label: a.name, owner: owner?.name })
    out.accounts.push({
      code: ac,
      name: a.name,
      legalName: a.legalName,
      address: a.address,
      province: a.province,
      category: a.category,
      headcount: a.headcount,
      plants: a.plants,
      ownerId: owner?.id ?? null,
      note: a.note ?? null,
      createdAt: ago(
        Math.max(...JOURNEYS.filter((j) => j.account === a.key).map((j) => j.bornDaysAgo)),
      ),
    })
  })
}

type Hand = Pick<StaffMember, 'id' | 'name' | 'roleId'>

/** One line of a timeline, on the lead or on its deal. */
function pushTouch(
  subjectCode: string,
  subjectKind: 'lead' | 'opportunity',
  kind: TouchKind,
  at: Date,
  by: Hand | null,
  note: string,
  extra: Partial<typeof touch.$inferInsert> = {},
): void {
  out.touches.push({
    subjectCode,
    subjectKind,
    kind,
    at,
    by: by?.name ?? 'Trợ lý AI',
    actorId: by?.id ?? null,
    note,
    ...extra,
  })
}

const handTo = (p: Hand) => ({ toActorId: p.id, toName: p.name, toRole: p.roleId })

/** Days-ago of each pre-pipeline milestone, never later than the day the
 *  lead leaves that phase, so the timeline cannot run backwards. */
function milestones(j: JourneySeed) {
  const end = j.deals?.[0]?.enteredDaysAgo ?? j.exit?.daysAgo ?? 0
  const at = (offset: number) => Math.max(j.bornDaysAgo - offset, end)
  return { contacted: at(1), mql: at(3), handover: at(4), meeting: at(7) }
}

let contactNo = 0
let dealNo = 0
let contractNo = 0

/** The primary arrives with the lead; the rest are met at the site survey. */
function plantContacts(ld: string, domain: string, people: ContactSeed[], born: Date, met: Date) {
  people.forEach((p, n) => {
    const ct = code('CT', ++contactNo)
    out.objects.push({ code: ct, kind: 'CT', branch: 'Sales', label: p.name })
    out.edges.push({ fromCode: ct, toCode: ld, kind: 'belongs-to' })
    out.contacts.push({
      code: ct,
      leadCode: ld,
      name: p.name,
      title: p.title,
      email: `${p.mail}@${domain}`,
      phone: normalisePhone(p.phone),
      channel: p.channel,
      isPrimary: n === 0,
      by: n === 0 ? MARKETING.name : BD.name,
      createdBy: n === 0 ? MARKETING.id : BD.id,
      createdAt: n === 0 ? born : met,
    })
  })
}

function plantJourney(j: JourneySeed, i: number): void {
  const a = ACCOUNTS.find((x) => x.key === j.account)
  if (!a) throw new Error(`Journey ${i} names unknown account "${j.account}"`)
  const src = SOURCES.find((s) => s.key === j.source)!
  const ld = code('LD', i + 1)
  const ws = code('WS', i + 1)
  const ac = accountCodeOf.get(a.key)!
  const owner = j.ownerId ? person(j.ownerId) : null
  const people = (j.contacts ?? a.contacts.map((_, n) => n)).map((n) => a.contacts[n]!)
  const primary = people[0]!
  const m = milestones(j)
  const reached = j.tier !== 'prospect'
  const born = ago(j.bornDaysAgo)

  plantContacts(ld, a.domain, people, born, ago(m.meeting, 6))

  /* Timeline on the lead: arrival, first reply, and — once real — the hand-over to BD. */
  pushTouch(ld, 'lead', 'created', born, MARKETING, `Vào sổ từ ${src.name}`, handTo(MARKETING))
  pushTouch(
    ld,
    'lead',
    'contacted',
    ago(m.contacted, 1),
    null,
    'Agent 1 nhắn lại trên kênh khách vừa dùng',
  )
  if (reached) {
    pushTouch(
      ld,
      'lead',
      'tier-raised',
      ago(m.mql, 2),
      MARKETING,
      'Xác minh công ty có thật · lên bậc MQL',
      { toTier: 'mql' },
    )
    pushTouch(
      ld,
      'lead',
      'handed-over',
      ago(m.handover, 3),
      HEAD,
      `Giao cho ${BD.name} đi lấy nốt ô bắt buộc`,
      {
        fromActorId: MARKETING.id,
        fromName: MARKETING.name,
        ...handTo(BD),
      },
    )
    pushTouch(
      ld,
      'lead',
      'first-meeting',
      ago(m.meeting, 5),
      BD,
      'Buổi gặp đầu tiên — khảo sát xưởng',
    )
    pushTouch(
      ld,
      'lead',
      'field-filled',
      ago(m.meeting, 6),
      BD,
      'Điền quy mô, người liên hệ và nỗi đau sau buổi khảo sát',
    )
    plantMeeting(ld, ago(m.meeting, 5), 'Khảo sát xưởng lần đầu', 'onsite', 90, [BD], people)
  }

  const deals = (j.deals ?? []).map((d, k) =>
    plantDeal(ld, ws, ac, a.name, owner!, people, d, k === 0),
  )
  const exitedAt = j.exit ? ago(j.exit.daysAgo, 8) : null
  if (j.exit) {
    pushTouch(
      ld,
      'lead',
      'exited',
      exitedAt!,
      owner ?? MARKETING,
      `Ra khỏi luồng · ${EXIT_NAME[j.exit.reason]}`,
    )
  }

  /* A lost deal never ends the run by itself — the lead can raise another,
     which is exactly what a second entry in `deals` does. Only a SIGNED deal
     or the lead's own exit closes the journey. */
  const won = deals.find((r) => r.signedAt !== null)
  /* The rung the run stands on: the OPEN deal furthest along, so a deal that
     already died does not blank out one still moving right beside it. */
  const live = deals.reduce<(typeof deals)[number] | null>(
    (best, r) =>
      r.openStage !== null &&
      (!best || StageKey.options.indexOf(r.openStage) > StageKey.options.indexOf(best.openStage!))
        ? r
        : best,
    null,
  )

  const closedAt = won?.signedAt ?? exitedAt
  out.runs.push({
    code: ws,
    accountCode: ac,
    openedAt: born,
    closedAt,
    closeReason: won ? 'WON' : exitedAt ? 'LOST' : null,
  })

  /* The fields a phase fills: a prospect is a name and a mailbox, MQL adds
     who they are, SQL adds why they buy — the init-data gate counts these. */
  const filled = <T>(v: T, from: 'mql' | 'sql' = 'mql') =>
    j.tier === 'sql' || (from === 'mql' && reached) ? v : null
  out.objects.push({
    code: ld,
    kind: 'LD',
    branch: 'Sales',
    label: a.name,
    owner: owner?.name,
    state: live?.openStage,
  })
  out.edges.push({ fromCode: ld, toCode: ac, kind: 'belongs-to' })
  out.leads.push({
    code: ld,
    createdAt: born,
    accountCode: ac,
    workstreamCode: ws,
    company: a.name,
    legalName: filled(a.legalName),
    address: filled(a.address),
    province: a.province,
    category: a.category,
    mainProduct: filled(a.mainProduct),
    headcount: filled(a.headcount),
    plants: filled(a.plants),
    contactName: primary.name,
    contactTitle: primary.title,
    email: `${primary.mail}@${a.domain}`,
    phone: filled(normalisePhone(primary.phone)),
    contactChannel: primary.channel,
    pain: j.pain ?? null,
    currentStack: j.currentStack ?? null,
    decisionMaker: j.decisionMaker ?? null,
    approver: j.approver ?? null,
    budget: j.budget ?? null,
    currency: j.budget ? 'VND' : null,
    deadline: j.deadlineInDays === undefined ? null : dateOnly(ago(-j.deadlineInDays)),
    ownerId: owner?.id ?? null,
    bdOwnerId: reached ? BD.id : null,
    marketingOwnerId: MARKETING.id,
    tier: j.tier,
    stage: live?.openStage ?? null,
    stageSince: live?.openStageSince ?? closedAt ?? ago(reached ? m.mql : j.bornDaysAgo),
    sourceKind: src.sourceKind,
    motion: src.motion,
    campaignId: sourceIdOf(src.key),
    lastTouchAt: out.touches
      .filter((t) => t.subjectCode === ld)
      .reduce((max, t) => (t.at! > max ? t.at! : max), born),
    exitReason: j.exit?.reason ?? null,
    exitedAt,
  })
  if (src.campaign) {
    out.members.push({ campaignCode: campaignCodeOf.get(src.key)!, leadCode: ld, addedAt: born })
  }
}

function plantMeeting(
  ld: string,
  at: Date,
  title: string,
  mode: 'online' | 'onsite' | 'office',
  minutes: 30 | 45 | 60 | 90 | 120,
  hosts: Hand[],
  guests: ContactSeed[],
): void {
  const id = randomUUID()
  out.meetings.push({
    id,
    leadCode: ld,
    at,
    title,
    mode,
    durationMinutes: minutes,
    link: mode === 'online' ? 'https://meet.google.com/pvo-demo-chip' : null,
    by: hosts[0]!.name,
    createdBy: hosts[0]!.id,
    createdAt: at < new Date(NOW) ? at : new Date(NOW),
  })
  hosts.forEach((h) =>
    out.attendees.push({ meetingId: id, side: 'host', actorId: h.id, name: h.name }),
  )
  guests.forEach((g) => {
    const ct = out.contacts.find((c) => c.leadCode === ld && c.name === g.name)?.code
    out.attendees.push({
      meetingId: id,
      side: 'guest',
      contactCode: ct ?? null,
      name: g.name,
      role: g.title,
    })
  })
}

/** Deal → columns walked → signature or loss, with both timelines.
 *
 *  `first` gates the tier-raise touch: a lead qualifies to SQL once, not once
 *  per deal it ever opens — a second entry in `deals` is the same lead trying
 *  again, already sitting at SQL. */
function plantDeal(
  ld: string,
  ws: string,
  ac: string,
  company: string,
  owner: Hand,
  people: ContactSeed[],
  d: DealSeed,
  first: boolean,
) {
  const op = code('OP', ++dealNo)
  const name = `${company} · ${PRODUCTS[d.products[0]!].split(' — ')[0]}`
  const path = StageKey.options.slice(0, StageKey.options.indexOf(d.stage) + 1)
  const entered = ago(d.enteredDaysAgo, 8)

  if (first) {
    /* Qualified to SQL and opened as a deal in one sitting — one act, two ledgers. */
    pushTouch(
      ld,
      'lead',
      'tier-raised',
      ago(d.enteredDaysAgo, 7),
      HEAD,
      'Đủ ô bắt buộc · qua cổng init data',
      { toTier: 'sql' },
    )
  }
  pushTouch(ld, 'lead', 'entered-pipeline', entered, owner, NOTE.promoted(op, name))
  pushTouch(op, 'opportunity', 'entered-pipeline', entered, owner, NOTE.opened(ld, 'pending'))

  /* Columns spread evenly from the day it opened to the day it reached the last one. */
  const when = path.map((_, k) =>
    k === 0
      ? entered
      : ago(d.enteredDaysAgo - ((d.enteredDaysAgo - d.stageDaysAgo) * k) / (path.length - 1), 4),
  )
  path.forEach((stage, k) => {
    const from = k === 0 ? null : path[k - 1]!
    out.moves.push({
      opportunityCode: op,
      at: when[k]!,
      fromStage: from,
      toStage: stage,
      daysInFrom: from ? Math.round((when[k]!.getTime() - when[k - 1]!.getTime()) / DAY) : null,
      byId: owner.id,
      by: owner.name,
    })
    if (from)
      pushTouch(op, 'opportunity', 'stage-changed', when[k]!, owner, NOTE.moved(from, stage))
    if (stage === 'demo-done') {
      plantMeeting(
        ld,
        when[k]!,
        'Demo PV One trên dữ liệu xưởng',
        'online',
        60,
        [PRESALES, owner],
        people,
      )
    }
  })

  const leftDiscovery = path.includes('discovery') && path.at(-1) !== 'discovery'
  const tickAt = leftDiscovery ? when[path.indexOf('discovery') + 1]! : null
  CRITERIA.slice(0, leftDiscovery ? CRITERIA.length : (d.ticks ?? 0)).forEach((_, n) =>
    out.ticks.push({
      opportunityCode: op,
      criterionId: criteriaSeed[n]!.id,
      tickedAt: tickAt ?? ago(d.stageDaysAgo - n - 1, 2),
      tickedById: owner.id,
      tickedBy: owner.name,
    }),
  )

  const last = path[path.length - 1]!
  const signedAt = d.won ? ago(d.won.signedDaysAgo, 6) : null
  const lostAt = d.lost ? ago(d.lost.daysAgo, 6) : null
  const openState: OpportunityCreateState =
    last === 'quoted' ? 'quote-sent' : last === 'awaiting-signature' ? 'nego' : 'pending'
  const closedAt = signedAt ?? lostAt

  if (closedAt) {
    out.moves.push({
      opportunityCode: op,
      at: closedAt,
      fromStage: last,
      toStage: null,
      daysInFrom: Math.round((closedAt.getTime() - when[when.length - 1]!.getTime()) / DAY),
      byId: owner.id,
      by: owner.name,
    })
  }
  if (lostAt)
    pushTouch(
      op,
      'opportunity',
      'stage-changed',
      lostAt,
      owner,
      NOTE.restated(openState, 'close-lost'),
    )
  if (!closedAt && (last === 'quoted' || last === 'awaiting-signature')) {
    const next = last === 'quoted' ? 'Chốt phạm vi và giá' : 'Rà soát điều khoản hợp đồng'
    plantMeeting(
      ld,
      ago(last === 'quoted' ? -3 : -2, 5),
      next,
      'office',
      60,
      [owner],
      people.slice(0, 1),
    )
  }

  out.objects.push({
    code: op,
    kind: 'OP',
    branch: 'Sales',
    label: name,
    owner: owner.name,
    state: closedAt ? null : last,
    amount: d.amount,
  })
  out.edges.push({ fromCode: ld, toCode: op, kind: 'spawned' })
  out.deals.push({
    code: op,
    leadCode: ld,
    state: lostAt ? 'close-lost' : openState,
    stage: closedAt ? null : last,
    stageSince: closedAt ? null : when[when.length - 1]!,
    name,
    accountCode: ac,
    workstreamCode: ws,
    amount: d.amount,
    currency: d.amount === null ? null : 'VND',
    expectedClose: d.expectedCloseInDays === null ? null : dateOnly(ago(-d.expectedCloseInDays)),
    probability: d.probability,
    description: d.description,
    closedAt,
    lostReason: d.lost?.reason ?? null,
    lostNote: d.lost?.note ?? null,
    createdAt: entered,
  })
  out.owners.push({ opportunityCode: op, actorId: owner.id, role: 'SALE' })
  if (owner.id !== BD.id) out.owners.push({ opportunityCode: op, actorId: BD.id, role: 'BD' })
  d.products.forEach((n) =>
    out.products.push({ opportunityCode: op, productId: productRows[n]!.id, list: 'PRODUCT' }),
  )

  if (signedAt) plantContract(ld, op, ws, owner, name, d.amount!, signedAt)
  return {
    signedAt,
    openStage: closedAt ? null : last,
    openStageSince: closedAt ? null : when[when.length - 1]!,
  }
}

/** Standard PV One terms: 30% on signing, 50% at go-live, 20% after a year. */
const TERMS = [
  { label: 'Tạm ứng khi ký', share: 30, dueDays: 7 },
  { label: 'Nghiệm thu go-live', share: 50, dueDays: 90 },
  { label: 'Hết bảo hành năm đầu', share: 20, dueDays: 365 },
]

function plantContract(
  ld: string,
  op: string,
  ws: string,
  owner: Hand,
  name: string,
  amount: number,
  signedAt: Date,
): void {
  const hd = code('HĐ', ++contractNo)
  out.objects.push({
    code: hd,
    kind: 'HĐ',
    branch: 'Sales',
    label: name,
    owner: owner.name,
    amount,
  })
  out.edges.push({ fromCode: op, toCode: hd, kind: 'spawned' })
  out.contracts.push({
    code: hd,
    opportunityCode: op,
    leadCode: ld,
    amount,
    currency: 'VND',
    signedAt,
    ownerId: owner.id,
    workstreamCode: ws,
  })
  TERMS.forEach((t, n) => {
    const due = new Date(signedAt.getTime() + t.dueDays * DAY)
    out.installments.push({
      contractCode: hd,
      no: n + 1,
      label: t.label,
      share: t.share,
      amount: (amount * t.share) / 100,
      due,
      paidAt: due.getTime() < NOW ? new Date(due.getTime() - 2 * DAY) : null,
    })
  })
  pushTouch(ld, 'lead', 'signed', signedAt, owner, NOTE.signed(hd))
  pushTouch(op, 'opportunity', 'signed', signedAt, owner, NOTE.signed(hd))
}

const campaigns = SOURCES.flatMap((s, i) =>
  s.campaign
    ? [
        {
          key: s.key,
          row: {
            code: code('CP', i + 1),
            name: s.campaign.name,
            slogan: s.campaign.slogan,
            ownerId: MARKETING.id,
            sourceId: sourceIdOf(s.key),
            state: s.campaign.state,
            createdAt: ago(Math.max(...s.costs.map((c) => c.daysAgo), 0) + 5),
          },
        },
      ]
    : [],
)
const campaignCodeOf = new Map(campaigns.map((c) => [c.key, c.row.code]))

async function seed(): Promise<void> {
  const env = loadEnv()
  const { db, close, kind } = await createDb(env.DATABASE_URL)
  if (kind !== 'pglite' && !process.argv.includes('--remote')) {
    await close()
    throw new Error('db:seed empties the database — pglite only, or pass --remote on purpose.')
  }

  plantAccounts()
  JOURNEYS.forEach(plantJourney)

  await db.transaction(async (tx) => {
    /* Every table the app owns except `KEEP`, in one TRUNCATE so foreign keys
       need no ordering; `actor` last by DELETE, so `role_permission.granted_by`
       falls to NULL instead of cascading the permission matrix away. */
    const listed = (await tx.execute(sql`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_schema IN (${sql.join(
        OWNED_SCHEMAS.map((x) => sql`${x}`),
        sql`, `,
      )})
        AND table_type = 'BASE TABLE'
    `)) as { rows: { table_schema: string; table_name: string }[] }
    const wiped = listed.rows
      .filter((t) => !KEEP.includes(t.table_name) && t.table_name !== 'actor')
      .map((t) => `"${t.table_schema}"."${t.table_name}"`)
    await tx.execute(sql.raw(`TRUNCATE TABLE ${wiped.join(', ')} RESTART IDENTITY`))
    await tx.execute(sql.raw(`DELETE FROM "platform"."actor"`))

    await tx
      .insert(actor)
      .values(STAFF.map(({ ownOnly, ...p }) => ({ ...p, ownOnly: ownOnly ?? false })))
    await tx.insert(configEntry).values(configSeed)
    await tx.insert(stageCriterion).values(criteriaSeed)
    await tx.insert(objectRef).values(out.objects)
    await tx.insert(account).values(out.accounts)
    await tx.insert(workstream).values(out.runs)
    await tx.insert(lead).values(out.leads)
    await tx.insert(contact).values(out.contacts)
    await tx.insert(edge).values(out.edges)
    await tx.insert(campaign).values(campaigns.map((c) => c.row))
    await tx.insert(campaignMember).values(out.members)
    await tx.insert(sourceCost).values(
      SOURCES.flatMap((s) =>
        s.costs.map((c) => ({
          sourceId: sourceIdOf(s.key),
          kind: c.kind,
          label: c.label,
          amount: c.amount,
          spentOn: dateOnly(ago(c.daysAgo)),
        })),
      ),
    )
    await tx.insert(sourceEvent).values(
      SOURCES.flatMap((s) =>
        s.event
          ? [
              {
                sourceId: sourceIdOf(s.key),
                venue: s.event.venue,
                registered: s.event.registered,
                checkedIn: s.event.checkedIn,
                heldOn: dateOnly(ago(s.event.daysAgo)),
              },
            ]
          : [],
      ),
    )
    await tx.insert(sourceFollower).values(
      SOURCES.filter((s) => s.kind !== 'organic').map((s) => ({
        sourceId: sourceIdOf(s.key),
        actorId: BD.id,
      })),
    )
    await tx.insert(opportunity).values(out.deals)
    await tx.insert(opportunityOwner).values(out.owners)
    await tx.insert(opportunityProduct).values(out.products)
    await tx.insert(opportunityStageEvent).values(out.moves)
    await tx.insert(opportunityCriterionTick).values(out.ticks)
    await tx.insert(contract).values(out.contracts)
    await tx.insert(contractInstallment).values(out.installments)
    await tx.insert(touch).values(out.touches)
    await tx.insert(meeting).values(out.meetings)
    await tx.insert(meetingAttendee).values(out.attendees)

    /* Codes above were minted from indexes; move each sequence past them so
       the first real write door does not collide with a seeded row. */
    const counts: [string, number][] = [
      ['account_code_seq', out.accounts.length],
      ['contact_code_seq', out.contacts.length],
      ['lead_code_seq', out.leads.length],
      ['workstream_code_seq', out.runs.length],
      ['opportunity_code_seq', out.deals.length],
      ['contract_code_seq', out.contracts.length],
      ['campaign_code_seq', SOURCES.length],
    ]
    for (const [seq, n] of counts) await tx.execute(sql.raw(`SELECT setval('sales.${seq}', ${n})`))
  })

  console.log(
    `Đã nạp ${STAFF.length} actor · ${out.accounts.length} account · ${out.contacts.length} liên hệ · ` +
      `${out.leads.length} lead · ${campaigns.length} chiến dịch · ${out.deals.length} cơ hội · ` +
      `${out.contracts.length} hợp đồng · ${out.meetings.length} buổi gặp · ${out.touches.length} lần chạm · driver ${kind}.`,
  )
  await close()
}

void seed().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
