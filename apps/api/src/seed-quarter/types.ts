import type { Db } from '@api/platform/db/db.module'
import type { configEntry } from '@api/branches/sales/config/config.schema'
import type { Ids } from './ids'
import type { Plan, Mint } from './plan'
import type { Rng } from './rng'
import type { Day, Story } from './story.types'

/** Shared domain types beyond `story.types.ts`. */

export type Contact = {
  index: number
  name: string
  title: string
  email: string // @<company domain>
  phone: string
  isDecisionMaker: boolean
}

export type Company = {
  index: number
  name: string
  shortName: string
  slug: string
  domain: string // '<slug>.example'
  categoryId: string | null // config_entry CATEGORY id
  industryId: string | null // config_entry INDUSTRY id
  province: string
  sizeBand: 'lt50' | '50-200' | '200-500' | '500-1000' | 'gt1000'
  headcount: number
  phone: string
  address: string
  contacts: Contact[]
}

export type Partner = { index: number; name: string; slug: string }

/** One active config row. Only the lookups an emitter needs are carried. */
export type ConfigRow = Pick<
  typeof configEntry.$inferSelect,
  'id' | 'name' | 'ord' | 'kind' | 'stage' | 'ownerId' | 'doNotContact' | 'parentId' | 'criterionId'
>

/** Every row of one list, active or not. Ids are minted above the global
 *  maximum (as the app does) and a hardcoded id is checked against `ids`. */
export type ConfigLedger = { ids: Set<string>; maxSeq: number; maxOrd: number }

export type SeatActor = {
  id: string
  name: string
  email: string
  roleIds: string[]
}

/** Read-only picture of the target database; see `world.ts`. */
export type World = {
  /** Every distinct `params.CAST` id; `readWorld` throws if one is missing or disabled. */
  actors: Map<string, SeatActor>
  /** Active config rows by list name, in `ord` order. */
  config: Map<string, ConfigRow[]>
  /** The same lists with inactive rows too, by list name; see `ConfigLedger`. */
  allConfig: Map<string, ConfigLedger>
  industries: ConfigRow[]
  /** `lead_origin.id` by its name. */
  origins: Map<string, string>
  /** PRODUCT list rows (`opportunity_product.product_id` points at them). */
  products: ConfigRow[]
  /** Existing member-mailbox `comms.identity.id` by actor id. */
  seatIdentity: Map<string, string>
  /** Rows a previous seed left; both must be 0 for a run to start. */
  seeded: { leads: number; accounts: number }
}

export type Ctx = {
  plan: Plan
  mint: Mint
  world: World
  now: Date
  today: Day
  /** This emitter's own stream (`fork(emitter key)`), so skipping one emitter never shifts another. */
  rng: Rng
  companies: Company[]
  partners: Partner[]
  stories: Story[]
  ids: Ids
}

/** What `generate` sees: the story list does not exist yet. */
export type GenCtx = Omit<Ctx, 'stories'>

/** Runs inside the write transaction after every row is in. Use `tx` for every
 *  read and write: on PGlite a pool read inside an open transaction hangs. */
export type AfterWrite = (tx: Db, ctx: Ctx) => Promise<void>
