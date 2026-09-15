import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  SETTING_REGISTRY,
  SettingKey,
  SettingListResponse,
  SettingRow,
  type SettingPatch,
  type SettingUnit,
} from '@pv/contracts'
import { AuditRepository } from '../audit/audit.repository'
import type { SettingRowDb } from '../db/platform.schema'
import { SettingRepository } from './setting.repository'

/** One key's current value, as the REST OF THE SERVER reads it — the shape
 *  `value()` answers in.
 *
 *  Not in `@pv/contracts` and deliberately not: nothing serialises this, it
 *  never crosses the wire, and the screen's read shape is `SettingRow`, which
 *  carries two fields (`isDefault`, `updatedAt`) that only an operator looking
 *  at a dial box cares about. It is composed from the contract's own types
 *  rather than restating them.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT A BARE `number`
 *  ------------------------------------------------------------------
 *  Five of the six keys are measured in days and the sixth counts steps, and a
 *  bare number carries neither fact. Handed down three call levels it is
 *  eventually added to a timestamp, and the one key that must never be added to
 *  a timestamp looks exactly like the five that may. An object cannot be added
 *  to a `Date` at all — TypeScript refuses it — so the call site has to write
 *  `.value`, and `unit` is then sitting on the line above where a reader sees
 *  it.
 *
 *  What this does NOT do is make the unit a compile-time fact per key: that
 *  would need `SETTING_REGISTRY`'s type to keep each entry's literal `unit`,
 *  which is upstream in the contract. Filed in `sharedRequests` rather than
 *  worked around with a second copy of the registry on this side. */
export type SettingAmount = {
  key: SettingKey
  unit: SettingUnit
  value: number
}

/** The dial box — two doors, one permission (`setting.manage`), plus the read
 *  path every other service uses.
 *
 *  ------------------------------------------------------------------
 *  A MISSING ROW IS THE DEFAULT. NOTHING HERE THROWS ON ONE
 *  ------------------------------------------------------------------
 *  Defaults live in `SETTING_REGISTRY`, in code; the table only ever holds
 *  OVERRIDES. So `list()` walks the registry and looks each key up among the
 *  rows, rather than selecting rows and mapping them — the first shape cannot
 *  return fewer than six, the second returns zero on a fresh environment. For
 *  the same reason a row whose `key` is not a member of `SettingKey` is simply
 *  never looked at: it cannot exist (`setting_key_known` refuses it), and if a
 *  hand-written INSERT ever put one there, the door that reads six known dials
 *  is not the place to discover it.
 *
 *  ------------------------------------------------------------------
 *  NO CACHE, AND THAT IS THE DECISION RATHER THAN THE DEFAULT
 *  ------------------------------------------------------------------
 *  These numbers are read often and changed almost never, which is the classic
 *  case for a cache. It is refused anyway, for a reason specific to this repo:
 *  the API process is not the only reader. The worker runs in a SEPARATE
 *  process and reads the same table, so a cache invalidated by `set()` below
 *  would only ever clear the copy in the process that took the PATCH. The
 *  operator would watch the number change on screen and watch the worker keep
 *  using the old one — the exact failure that is worse than no cache, because
 *  nothing on any screen says it is happening. A cross-process invalidation
 *  channel exists (pg-boss), but buying one to save a primary-key lookup of a
 *  six-row table is paying in the currency of things that go wrong silently.
 *
 *  The cost bought with that: one primary-key SELECT per question. If a caller
 *  ever needs a threshold inside a loop, it reads it ONCE above the loop — that
 *  is a call-site rule, not a reason to cache here.
 *
 *  ------------------------------------------------------------------
 *  THE WRITE LEAVES AN AUDIT LINE, INSIDE THE SAME TRANSACTION
 *  ------------------------------------------------------------------
 *  `AuditRepository.write` takes a `tx`, so the line and the row it explains
 *  commit or roll back together. The note carries BEFORE and AFTER, and "before"
 *  may be a number that was never in the table — see `changeNote`. */
@Injectable()
export class SettingService {
  constructor(
    private readonly repo: SettingRepository,
    private readonly audit: AuditRepository,
  ) {}

  /** All six dials, overrides merged over registry defaults.
   *
   *  Ordered by `SettingKey.options` — the contract's own declaration order, so
   *  the screen's rows do not reshuffle when somebody overrides one key. */
  async list(): Promise<SettingListResponse> {
    const overrides = new Map((await this.repo.all()).map((row) => [row.key, row]))

    return SettingListResponse.parse({
      rows: SettingKey.options.map((key) => toContract(key, overrides.get(key) ?? null)),
    })
  }

  /** Turn one dial. Returns the row as the screen reads it back.
   *
   *  The bound this value had to land inside was already enforced by zod at the
   *  door (`SettingPatch` is a union on `key`, each member carrying its own
   *  min/max out of the registry), so there is nothing left here to refuse —
   *  which is why this method has no validation of its own rather than a copy
   *  of the bounds that would drift the day one is retuned. */
  async set(who: Actor, body: SettingPatch): Promise<SettingRow> {
    const written = await this.repo.run(async (tx) => {
      const before = await this.repo.lock(tx, body.key)
      const row = await this.repo.upsert(tx, body.key, body.value, who.id)

      await this.audit.write(
        { actorId: who.id, action: 'edit', note: changeNote(body.key, before, row) },
        tx,
      )
      return row
    })

    return SettingRow.parse(toContract(body.key, written))
  }

  /** What one constant is worth right now — the door every other service uses.
   *
   *  Never throws and never returns `undefined`: an un-tuned key answers with
   *  its registry default, which is the whole point of the table holding
   *  overrides only. A caller therefore never needs a fallback of its own, and
   *  must not write one — a second default beside this call is a number that
   *  disagrees with the registry the first time somebody retunes it. */
  async value(key: SettingKey): Promise<SettingAmount> {
    const definition = SETTING_REGISTRY[key]
    const override = await this.repo.byKey(key)

    return { key, unit: definition.unit, value: override?.value ?? definition.defaultValue }
  }
}

/** One key as the read shape describes it. `row === null` is the un-tuned key,
 *  and it is where `isDefault` comes from — the two states the contract's
 *  `refine` keeps from being mixed up. */
function toContract(key: SettingKey, row: SettingRowDb | null): SettingRow {
  const definition = SETTING_REGISTRY[key]

  if (!row) {
    return { key, unit: definition.unit, value: definition.defaultValue, isDefault: true }
  }

  return {
    key,
    unit: definition.unit,
    value: row.value,
    isDefault: false,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  }
}

/** What the audit line says a PATCH did.
 *
 *  "Before" is a number that MAY NEVER HAVE BEEN IN THE TABLE — the first time
 *  anybody moves a dial, what it moved away from is the registry default in
 *  code. A note holding only the new value would leave a reader six months
 *  later unable to tell a first tuning from a re-tuning, and unable to learn the
 *  old number at all, since the row that would have held it is the row just
 *  overwritten. So the line says which of the two kinds of "before" it means. */
function changeNote(key: SettingKey, before: SettingRowDb | null, after: SettingRowDb): string {
  const from = before
    ? `${before.value}`
    : `${SETTING_REGISTRY[key].defaultValue} (registry default, no row)`

  return `platform.setting ${key} · ${from} → ${after.value} ${SETTING_REGISTRY[key].unit}`
}
