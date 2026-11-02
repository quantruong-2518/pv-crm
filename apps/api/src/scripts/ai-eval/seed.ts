import { sql } from 'drizzle-orm'
import { contact } from '@api/branches/sales/contact/contact.schema'
import { contract, contractInstallment } from '@api/branches/sales/contract/contract.schema'
import { lead } from '@api/branches/sales/lead/lead.schema'
import {
  opportunity,
  opportunityContact,
  opportunityOwner,
} from '@api/branches/sales/opportunity/opportunity.schema'
import type { Db } from '@api/platform/db/db.module'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { fill, loadCases } from './cases'
import {
  ALL_SEATS,
  canariesOf,
  CHAINS,
  CONTRACT_AMOUNT,
  CONTRACT_CURRENCY,
  FIRST_CONTRACT,
  FIRST_LEAD,
  FIRST_OPPORTUNITY,
  TYPED_TAX_CODE,
  TYPED_WEBSITE,
  WORDS,
  type ChainSpec,
} from './seed-data'

/** Writes the made-up company into the memory database, table by table in the
 *  order the foreign keys demand: the `platform.object` mirror comes first because
 *  `sales.lead.code` and `sales.contract.code` are foreign keys into it. */

export type Chain = {
  key: string
  word: string
  lead: string
  opportunity: string
  contract: string | null
  canaries: readonly string[]
}

export type Seeded = {
  chains: ReadonlyMap<string, Chain>
  /** A contact on a sibling lead that a deal links to. */
  sibling: { canary: string; opportunity: string }
  /** Every canary in the world, so a cell can subtract what its door showed. */
  canaries: ReadonlySet<string>
}

const DUE = new Date('2026-12-15T00:00:00.000Z')
const SIGNED_AT = new Date('2026-09-20T00:00:00.000Z')

const mirror = (code: string, kind: 'LD' | 'OP' | 'HĐ', label: string, ownerId: string | null) => ({
  code,
  kind,
  branch: 'Sales' as const,
  label,
  ownerId,
})

const typedText = (spec: ChainSpec, n: number): string => {
  const { typedPhone, typedMail } = canariesOf(n)
  return spec.typed ? ` gọi ${typedPhone}, mail ${typedMail}` : ''
}

function leadValues(spec: ChainSpec, code: string, word: string, n: number) {
  const c = canariesOf(n)
  const state = spec.leadState ?? (spec.contract ? 'converted' : 'working')
  return {
    code,
    company: spec.plants?.company ?? `Công ty ${word} ${c.company}`,
    legalName: spec.plants?.legalName ?? `Công ty TNHH ${word} ${c.legalName}`,
    address: spec.plants?.address ?? `Khu công nghiệp ${word} ${c.address}`,
    pain: spec.plants?.pain ?? `Thiếu người vận hành ${c.pain}${typedText(spec, n)}`,
    mainProduct: spec.plants?.mainProduct ?? `Linh kiện ${word}`,
    contactName: `Chị ${c.contactName}`,
    contactTitle: spec.plants?.contactTitle ?? `Trưởng phòng ${c.contactTitle}`,
    email: c.email,
    phone: c.phone,
    ownerId: spec.leadOwner,
    state,
    ...(spec.typed ? { taxCode: TYPED_TAX_CODE, website: TYPED_WEBSITE } : {}),
    ...(state === 'nurturing' ? { exitReason: 'no-budget', exitedAt: DUE } : {}),
    ...(spec.disabled ? { disabledAt: DUE, disabledBy: 'rival' } : {}),
  }
}

/** Carries the chain's word, so the door's `contact` kind would hit it: a tool that
 *  stopped narrowing its kinds has to show up as a contact hit with a phone on it. */
async function seedContact(db: Db, leadCode: string, n: number, word: string): Promise<void> {
  const c = canariesOf(n)
  const code = `CT-${FIRST_LEAD + n}`
  await db.insert(objectRef).values(mirror(code, 'CT' as never, word, null))
  await db.insert(contact).values({
    code,
    leadCode,
    name: `Anh ${word} ${c.extraContact}`,
    phone: c.extraPhone,
    isPrimary: false,
    by: 'manual',
  } as never)
}

async function seedChain(db: Db, spec: ChainSpec, n: number): Promise<Chain> {
  const word = WORDS[n]
  if (!word) throw new Error(`seed: no search word for chain ${n}`)
  const c = canariesOf(n)
  const leadCode = `LD-${FIRST_LEAD + n}`
  const dealCode = `OP-${FIRST_OPPORTUNITY + n}`
  const paperCode = spec.contract ? `HĐ-${FIRST_CONTRACT + n}` : null

  await db
    .insert(objectRef)
    .values([
      mirror(leadCode, 'LD', word, spec.leadOwner),
      mirror(dealCode, 'OP', word, spec.dealOwners[0]?.id ?? null),
      ...(paperCode ? [mirror(paperCode, 'HĐ', word, spec.contract?.owner ?? null)] : []),
    ])
  await db.insert(lead).values(leadValues(spec, leadCode, word, n) as never)
  await db.insert(opportunity).values({
    code: dealCode,
    leadCode,
    state: 'open',
    name: spec.plants?.opportunityName ?? `Đơn ${word} ${c.opportunityName}`,
    description: spec.plants?.description ?? `Mô tả ${c.description}${typedText(spec, n)}`,
    amount: CONTRACT_AMOUNT,
    currency: CONTRACT_CURRENCY,
    probability: 40,
  })
  await seedContact(db, leadCode, n, word)
  if (spec.dealOwners.length > 0) {
    await db.insert(opportunityOwner).values(
      spec.dealOwners.map((o, i) => ({
        opportunityCode: dealCode,
        actorId: o.id,
        role: o.lane,
        isPrimary: i === 0 && o.lane === 'SALE',
      })),
    )
  }
  if (paperCode && spec.contract) {
    await db.insert(contract).values({
      code: paperCode,
      opportunityCode: dealCode,
      leadCode,
      amount: CONTRACT_AMOUNT,
      currency: CONTRACT_CURRENCY,
      signedAt: SIGNED_AT,
      ownerId: spec.contract.owner,
      collectorId: spec.contract.collector,
    })
    await db.insert(contractInstallment).values({
      contractCode: paperCode,
      no: 1,
      label: `Đợt 1 ${c.installment}${typedText(spec, n)}`,
      share: 100,
      amount: CONTRACT_AMOUNT,
      due: DUE,
    })
  }
  return {
    key: spec.key,
    word,
    lead: leadCode,
    opportunity: dealCode,
    contract: paperCode,
    canaries: Object.values(c),
  }
}

/** The deal of `a` names a contact of `rival`'s lead: search fences that contact
 *  on its own lead, so a read of the deal has to answer the same question. */
async function seedSibling(db: Db, chains: ReadonlyMap<string, Chain>, n: number) {
  const deal = chains.get('a')?.opportunity
  const theirs = chains.get('rival')?.lead
  if (!deal || !theirs) throw new Error('seed: the sibling chains are missing')
  const canary = canariesOf(n).contactName
  const code = `CT-${FIRST_LEAD + n}`
  await db.insert(objectRef).values(mirror(code, 'CT' as never, canary, 'rival'))
  await db.insert(contact).values({
    code,
    leadCode: theirs,
    name: canary,
    email: `${canary.toLowerCase()}@eval.invalid`,
    isPrimary: false,
    by: 'manual',
  } as never)
  await db.insert(opportunityContact).values({ opportunityCode: deal, contactCode: code })
  return { canary, opportunity: deal }
}

export async function seedWorld(db: Db): Promise<Seeded> {
  await db.insert(actor).values(
    ALL_SEATS.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      roleIds: [...s.roleIds],
      branches: [...s.branches],
      ownOnly: s.ownOnly,
    })),
  )
  const injected = loadCases().flatMap((c): ChainSpec[] =>
    c.plant
      ? [
          {
            key: c.id,
            leadOwner: 'cases-sale',
            dealOwners: [{ id: 'cases-sale', lane: 'SALE' }],
            contract: null,
            plants: { [c.plant.field]: c.plant.text },
          },
        ]
      : [],
  )
  const specs = [...CHAINS, ...injected]
  const chains = new Map<string, Chain>()
  for (const [n, spec] of specs.entries()) {
    /* In order: a planted sentence may name a chain seeded before it. */
    const plants = Object.entries(spec.plants ?? {}).map(([k, text]) => [k, fill(text, chains)])
    const planted = { ...spec, plants: Object.fromEntries(plants) as ChainSpec['plants'] }
    chains.set(spec.key, await seedChain(db, planted, n))
  }
  const sibling = await seedSibling(db, chains, specs.length)
  await db.execute(sql`UPDATE platform.ai_route SET enabled = true WHERE task = 'assistant'`)
  return {
    chains,
    sibling,
    canaries: new Set([...chains.values()].flatMap((c) => c.canaries).concat(sibling.canary)),
  }
}
