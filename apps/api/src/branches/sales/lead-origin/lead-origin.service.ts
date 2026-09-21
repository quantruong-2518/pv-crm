import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LeadOriginCreateResponse,
  LeadOriginListResponse,
  LeadOriginMergeResponse,
  LeadSourceStatsResponse,
  MOTION_SIDE,
  originKey,
  type LeadMotion,
  type LeadOrigin,
  type LeadOriginCreate,
  type LeadOriginListQuery,
  type LeadOriginPatch,
  type LeadOriginPick,
  type LeadSourceStatsQuery,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { toContract } from './lead-origin.mapper'
import { LeadOriginRepository } from './lead-origin.repository'
import type { LeadOriginRowDb } from './lead-origin.schema'

/** Key or id → the surviving origin, for the import's dry run. */
export type OriginIndex = {
  byKey: ReadonlyMap<string, { id: string; active: boolean }>
  byId: ReadonlyMap<string, { id: string; active: boolean }>
}

/** The origin catalog: search, find-or-create, tidy (rename · motions · hide ·
 *  merge), and `resolveOrigin` — the one door every lead write goes through.
 *
 *  Collision is decided on `originKey()`, and a key must never be both one
 *  origin's `key` and ANOTHER origin's alias: the tables cannot fence that
 *  (see `lead-origin.schema.ts`), so every write here asks both before writing.
 *  A merged row keeps its own key and ALSO lends it to the survivor as an
 *  alias; lookups follow `merged_into`, so both paths land on the survivor. */
@Injectable()
export class LeadOriginService {
  constructor(
    private readonly repo: LeadOriginRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** `leadCount` follows the book's scope axis: an `ownOnly` caller counts own leads. */
  async list(who: Actor, q: LeadOriginListQuery): Promise<LeadOriginListResponse> {
    const all = await this.catalog(this.repo.handle, who.ownOnly ? who.id : undefined)
    const key = q.q ? originKey(q.q) : ''
    const needle = q.q?.toLowerCase() ?? ''

    const rows = all.filter(
      (o) =>
        (q.includeInactive || o.active) &&
        (!q.motion || o.motions.includes(q.motion)) &&
        (!q.q ||
          o.name.toLowerCase().includes(needle) ||
          (key !== '' && (o.key.includes(key) || o.aliases.some((a) => a.includes(key))))),
    )

    const hit = key ? all.find((o) => o.key === key || o.aliases.includes(key)) : undefined
    const survivor = hit?.mergedInto ? all.find((o) => o.id === hit.mergedInto) : hit
    const exact = survivor?.active ? survivor : undefined
    const reach = key.length <= SHORT_KEY ? 1 : 2
    const similar = key
      ? all
          .filter((o) => o.active && o.id !== exact?.id)
          .map((o) => ({ o, d: o.key.startsWith(key) ? 0 : levenshtein(o.key, key) }))
          .filter((x) => x.d <= reach)
          .sort((a, b) => a.d - b.d)
          .slice(0, MAX_SIMILAR)
          .map((x) => x.o)
      : []

    return LeadOriginListResponse.parse({ rows, ...(exact ? { exact } : {}), similar })
  }

  async create(who: Actor, body: LeadOriginCreate): Promise<LeadOriginCreateResponse> {
    const { id, created } = await this.repo.run((tx) =>
      this.findOrCreate(tx, body.name, body.motions, who.id),
    )
    return LeadOriginCreateResponse.parse({ origin: await this.one(id), created })
  }

  async patch(who: Actor, id: string, body: LeadOriginPatch): Promise<LeadOrigin> {
    await this.repo.run(async (tx) => {
      const row = await this.repo.byId(tx, id)
      if (!row) throw notFound('nguồn', id)
      if (row.mergedInto) throw conflict(`Nguồn ${id} đã được gộp vào ${row.mergedInto}.`)

      if (body.name !== undefined) await this.rename(tx, row, body.name, who)
      if (body.motions !== undefined) {
        await this.repo.replaceMotions(tx, id, body.motions)
        await this.note(tx, who.id, { kind: 'lead-origin-motions', id, motions: body.motions })
      }
      if (body.active !== undefined) {
        await this.repo.update(tx, id, { active: body.active })
        await this.note(tx, who.id, { kind: 'lead-origin-active', id, active: body.active })
      }
    })
    return this.one(id)
  }

  async merge(who: Actor, id: string, into: string): Promise<LeadOriginMergeResponse> {
    if (id === into) throw conflict('Không gộp một nguồn vào chính nó.')

    const movedLeads = await this.repo.run(async (tx) => {
      const [from, to] = await Promise.all([this.repo.byId(tx, id), this.repo.byId(tx, into)])
      if (!from) throw notFound('nguồn', id)
      if (!to) throw notFound('nguồn', into)
      if (from.mergedInto) throw conflict(`Nguồn ${id} đã được gộp vào ${from.mergedInto}.`)
      if (to.mergedInto || !to.active) {
        throw conflict(`Nguồn ${into} đang tắt hoặc đã bị gộp — chọn một nguồn đang dùng.`)
      }

      const moved = await this.repo.repointLeads(tx, id, into)
      await this.repo.moveAliases(tx, id, into)
      await this.repo.addAlias(tx, from.key, into)
      await this.repo.copyMotions(tx, id, into)
      /* Rows already folded into `id` now point at `into`: every merge chain stays one hop. */
      await this.repo.repointMerged(tx, id, into)
      await this.repo.update(tx, id, { mergedInto: into, active: false })
      await this.note(tx, who.id, { kind: 'lead-origin-merge', from: id, into, moved })
      return moved
    })

    return LeadOriginMergeResponse.parse({ into: await this.one(into), movedLeads })
  }

  /** Resolve a signed-in write door's origin pick inside the caller's
   *  transaction. `raw` is the typed name for `{ name }`, null for `{ id }`.
   *  Refuses on field `origin`. */
  async resolveOrigin(
    tx: Db,
    pick: LeadOriginPick,
    motion: LeadMotion,
    who: string,
  ): Promise<{ id: string; name: string; raw: string | null }> {
    const found =
      'id' in pick
        ? await this.repo.byId(tx, pick.id)
        : await this.repo.byId(tx, (await this.findOrCreate(tx, pick.name, [motion], who)).id)
    if (!found) throw invalid({ origin: ['Nguồn không có trong danh mục.'] })

    const live = await this.survivor(tx, found)
    if (!live.active)
      throw invalid({ origin: [`Nguồn "${live.name}" đang tắt — chọn nguồn khác.`] })

    await this.fileUnder(tx, live.id, [motion], who)
    return { id: live.id, name: live.name, raw: 'name' in pick ? pick.name : null }
  }

  /** Read-only key lookup for the public landing door: never creates, never
   *  links. A hidden survivor counts as no match. */
  async findLive(tx: Db, text: string): Promise<{ id: string } | null> {
    const key = originKey(text)
    const found = key ? await this.lookup(tx, key) : null
    const live = found ? await this.survivor(tx, found) : null
    return live?.active ? { id: live.id } : null
  }

  /** The whole catalog as lookups, merged rows already followed to survivors. */
  async index(): Promise<OriginIndex> {
    const all = await this.catalog(this.repo.handle)
    const live = (o: LeadOrigin) => {
      const s = o.mergedInto ? (all.find((x) => x.id === o.mergedInto) ?? o) : o
      return { id: s.id, active: s.active }
    }
    const byKey = new Map<string, { id: string; active: boolean }>()
    for (const o of all) for (const k of o.aliases) byKey.set(k, live(o))
    for (const o of all) byKey.set(o.key, live(o))
    return { byKey, byId: new Map(all.map((o) => [o.id, live(o)])) }
  }

  async sourceStats(who: Actor, q: LeadSourceStatsQuery): Promise<LeadSourceStatsResponse> {
    const rows = await this.repo.sourceStats({
      ...(q.from ? { from: q.from } : {}),
      ...(q.to ? { to: q.to } : {}),
      ...(who.ownOnly ? { ownerId: who.id } : {}),
    })
    return LeadSourceStatsResponse.parse({
      rows: rows.map((r) => ({
        side: r.motion ? MOTION_SIDE[r.motion] : null,
        motion: r.motion,
        ...(r.origin_id && r.origin_name
          ? { originId: r.origin_id, originName: r.origin_name }
          : {}),
        ...(r.campaign_code && r.campaign_name
          ? { campaignCode: r.campaign_code, campaignName: r.campaign_name }
          : {}),
        leads: r.leads,
        mql: r.mql,
        sql: r.sql,
        deals: r.deals,
        won: r.won,
      })),
    })
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** Key → origin (own key first, then alias), else a new row. The UNIQUE on
   *  `key` settles a concurrent insert: `insert` returns null and we re-read. */
  private async findOrCreate(
    tx: Db,
    name: string,
    motions: readonly LeadMotion[],
    who: string,
  ): Promise<{ id: string; created: boolean }> {
    const key = originKey(name)
    const known = await this.lookup(tx, key)
    if (known) {
      const live = await this.survivor(tx, known)
      await this.fileUnder(tx, live.id, motions, who)
      return { id: live.id, created: false }
    }

    const id = await this.repo.nextId(tx)
    const row =
      (await this.repo.insert(tx, { id, name, key, createdBy: who })) ??
      (await this.repo.byKey(tx, key))
    if (!row) throw new Error(`sales.lead_origin: key ${key} neither inserted nor found`)
    await this.repo.linkMotions(tx, row.id, motions)
    return { id: row.id, created: row.id === id }
  }

  /** Filing an existing origin under a new motion is the same act as creating
   *  one — anyone may extend the catalog — so it is allowed, and audited. */
  private async fileUnder(
    tx: Db,
    id: string,
    motions: readonly LeadMotion[],
    who: string,
  ): Promise<void> {
    const added = await this.repo.linkMotions(tx, id, motions)
    if (added.length > 0)
      await this.note(tx, who, { kind: 'lead-origin-filed', id, motions: added })
  }

  private note(tx: Db, actorId: string, payload: Record<string, unknown>): Promise<void> {
    return this.audit.write({ actorId, action: 'edit', note: JSON.stringify(payload) }, tx)
  }

  private async lookup(db: Db, key: string): Promise<LeadOriginRowDb | null> {
    const own = await this.repo.byKey(db, key)
    if (own) return own
    const owner = await this.repo.aliasOwner(db, key)
    return owner ? this.repo.byId(db, owner) : null
  }

  /** Follow `merged_into` to the row that survived. Bounded: a cycle cannot
   *  exist (a merge target must be unmerged), but a loop guard costs nothing. */
  private async survivor(db: Db, row: LeadOriginRowDb): Promise<LeadOriginRowDb> {
    let at = row
    for (let hop = 0; at.mergedInto && hop < 8; hop++) {
      const next = await this.repo.byId(db, at.mergedInto)
      if (!next) break
      at = next
    }
    return at
  }

  /** New key must be free of every OTHER origin's key and alias; the old key
   *  stays behind as this origin's alias so past spellings still resolve. */
  private async rename(tx: Db, row: LeadOriginRowDb, name: string, who: Actor): Promise<void> {
    const key = originKey(name)
    if (key === row.key) return this.repo.update(tx, row.id, { name })

    const own = await this.repo.byKey(tx, key)
    const aliasOf = await this.repo.aliasOwner(tx, key)
    const clash = own?.id ?? (aliasOf !== row.id ? aliasOf : null)
    if (clash) {
      throw conflict(
        `Tên "${name}" trùng với nguồn ${clash} — hãy gộp hai nguồn thay vì đổi tên.`,
        {
          name: [`Trùng với nguồn ${clash}. Dùng "Gộp nguồn" để gộp vào đó.`],
        },
      )
    }

    if (aliasOf === row.id) await this.repo.dropAlias(tx, key)
    await this.repo.update(tx, row.id, { name, key })
    await this.repo.addAlias(tx, row.key, row.id)
    await this.note(tx, who.id, { kind: 'lead-origin-rename', id: row.id, from: row.key, to: key })
  }

  private async catalog(db: Db, ownerId?: string): Promise<LeadOrigin[]> {
    const [reads, links] = await Promise.all([this.repo.origins(db, ownerId), this.repo.links(db)])
    return reads.map((r) => toContract(r, links))
  }

  private async one(id: string): Promise<LeadOrigin> {
    const found = (await this.catalog(this.repo.handle)).find((o) => o.id === id)
    if (!found) throw notFound('nguồn', id)
    return found
  }
}

/** Keys this short get a 1-edit reach: at 2 edits "zalo" would suggest "gg". */
const SHORT_KEY = 5
/** Enough for a "did you mean" row without turning it into a list. */
const MAX_SIMILAR = 3

/** Edit distance, plain DP — the catalog is tens of short keys. */
function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]!
}
