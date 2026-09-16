import { z } from 'zod'
import { Moment } from './primitives'

/** System constants an operator may tune — `platform.setting`.
 *
 *      GET   /platform/settings         permission `setting.manage`
 *      PATCH /platform/settings         permission `setting.manage`
 *
 *  ONE permission for read and write both, the same call `comm.capture-manage`
 *  makes: nobody browses this table. It is the operator's dial box, read only
 *  while about to turn something. A separate view permission would grant sight
 *  of a list nobody opens on purpose. It needs no explicit grant either —
 *  `director` and `head-of-sales` spread `PERMISSIONS` whole, and no other
 *  role should be moving a number that changes how the whole system behaves.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT ANOTHER ROW IN `sales.config_entry`
 *  ------------------------------------------------------------------
 *  The case for a separate table was worked through once, and it is settled:
 *  `ConfigEntry` (`./sales/config`) is
 *  a registry of NAMED PICKLISTS — every row is an entry a person CHOOSES,
 *  with an `id`·`name`·`ord` and, on exactly two ladder lists, a `limitDays`.
 *  "How many days of silence counts as a first reply" has no name to show, no
 *  order to hold, and belongs to no list — it is a bare threshold, and
 *  forcing it into `config_entry` would mean opening a ninth `list` and
 *  loosening a CHECK anchored on purpose, to hold something the table was
 *  never shaped for.
 *
 *  The boundary, stated once so it does not have to be re-argued at the next
 *  key: `config_entry` holds VOCABULARY a user types; `platform.setting` holds
 *  SYSTEM CONSTANTS an operator tunes.
 *
 *  ------------------------------------------------------------------
 *  A MISSING ROW IS THE DEFAULT, NOT A 500
 *  ------------------------------------------------------------------
 *  Every key's default lives in `SETTING_REGISTRY`, in code. The database only
 *  ever holds OVERRIDES. A key with no row is not an error state — it is the
 *  ordinary state of a system nobody has tuned yet, and a table read that
 *  throws on an absent row would mean the server refuses to boot the day a
 *  fresh environment has zero rows in `platform.setting`, which is a worse
 *  failure than the threshold it exists to guard. `SettingRow.isDefault` is
 *  how the read shape tells the two states apart for an operator's screen. */

// ---------------------------------------------------------------------------
// THE SIX KEYS — see the registry below for what each one decides
// ---------------------------------------------------------------------------

export const SettingKey = z.enum([
  'comms.reply.silence-days',
  'comms.unmatched.retention-days',
  'comms.blob.retention-days',
  'sequence.step.default-wait-days',
  'sequence.max-steps',
  'content.share.expires-days',
])

export type SettingKey = z.infer<typeof SettingKey>

/** Every unit a system constant on this table is measured in today. `count`
 *  is the one non-duration member — `sequence.max-steps` counts steps, not
 *  days. */
export const SettingUnit = z.enum(['days', 'count'])

export type SettingUnit = z.infer<typeof SettingUnit>

// ---------------------------------------------------------------------------
// THE REGISTRY — one entry per key, the single source both zod and the admin
// screen read
// ---------------------------------------------------------------------------

/** One key's full definition: what it is measured in, what it defaults to
 *  absent a DB row, the bounds a write must land inside, and the sentence an
 *  operator reads to know what the number does.
 *
 *  `description` is Vietnamese and stays Vietnamese — it is a LABEL for the
 *  admin screen, not a key, the same exception `ApprovalRequestView.consequence`
 *  documents in `../approval.ts`. */
const SettingDefinition = z.object({
  unit: SettingUnit,
  defaultValue: z.number().int().positive(),
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  description: z.string().min(1),
})

type SettingDefinition = z.infer<typeof SettingDefinition>

/** DEFAULT VALUES ARE PROPOSALS, not settled numbers — every `defaultValue`
 *  and every bound below is this branch's best guess, flagged in the drafting
 *  agent's `openDecisions` as waiting on the project owner's sign-off. Nothing
 *  here should be read as chosen. */
export const SETTING_REGISTRY: Record<SettingKey, SettingDefinition> = {
  'comms.reply.silence-days': {
    unit: 'days',
    defaultValue: 3,
    min: 1,
    max: 30,
    description: 'Im lặng bao nhiêu ngày thì lượt khách trả lời được tính là một mốc phễu.',
  },
  'comms.unmatched.retention-days': {
    unit: 'days',
    defaultValue: 30,
    min: 1,
    max: 365,
    description: 'Thư chưa nối được vào ai thì giữ bao lâu trước khi xoá.',
  },
  'comms.blob.retention-days': {
    unit: 'days',
    defaultValue: 90,
    min: 1,
    max: 730,
    description: 'Ghi âm, ghi hình, tệp đính kèm giữ bao lâu.',
  },
  'sequence.step.default-wait-days': {
    unit: 'days',
    defaultValue: 2,
    min: 1,
    max: 30,
    description: 'Khoảng chờ mặc định giữa hai bước của một nhịp gửi.',
  },
  'sequence.max-steps': {
    unit: 'count',
    defaultValue: 10,
    min: 1,
    max: 50,
    description: 'Trần số bước một nhịp gửi được phép có.',
  },
  'content.share.expires-days': {
    unit: 'days',
    defaultValue: 14,
    min: 1,
    max: 90,
    description: 'Link theo dõi nội dung hết hạn sau bao nhiêu ngày.',
  },
}

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One key's current value, as the admin screen reads it.
 *
 *  `isDefault: true` and `updatedAt`/`updatedBy` absent means nobody has ever
 *  written a row for this key — `value` is `SETTING_REGISTRY[key].defaultValue`,
 *  served straight from code. `isDefault: false` means a row exists in
 *  `platform.setting`; an operator set it, possibly to the same number the
 *  default already held, and that is a fact worth keeping distinct from
 *  "nobody has touched this" — the whole reason this field exists rather than
 *  the response only ever carrying a number. */
export const SettingRow = z
  .object({
    key: SettingKey,
    unit: SettingUnit,
    value: z.number().int().positive(),
    isDefault: z.boolean(),
    updatedAt: Moment.optional(),
    updatedBy: z.string().min(1).optional(),
  })
  .refine((r) => r.isDefault === (r.updatedAt === undefined && r.updatedBy === undefined), {
    message: 'Dòng mặc định không được mang updatedAt/updatedBy, dòng ghi đè phải mang cả hai.',
  })

export type SettingRow = z.infer<typeof SettingRow>

export const SettingListResponse = z.object({ rows: z.array(SettingRow) })

export type SettingListResponse = z.infer<typeof SettingListResponse>

// ---------------------------------------------------------------------------
// WRITING ONE
// ---------------------------------------------------------------------------

/** `value`'s bound for one key, read out of `SETTING_REGISTRY` rather than
 *  typed a second time next to each union member below — the one place the
 *  min/max for a key is written. */
function boundedValue(key: SettingKey) {
  const def = SETTING_REGISTRY[key]
  const unit = def.unit === 'days' ? 'ngày' : 'lần'
  /* Vietnamese messages, not zod's defaults: this refusal reaches an operator's
     screen, and zod would otherwise answer "Too big: expected number to be <=50"
     in a product whose every other refusal speaks Vietnamese. The bound itself
     is named in the sentence — being told a number is wrong without being told
     what would be right sends the reader back to the source. */
  return z
    .number('Giá trị phải là một con số.')
    .int('Giá trị phải là số nguyên.')
    .min(def.min, `Thấp nhất là ${def.min} ${unit}.`)
    .max(def.max, `Cao nhất là ${def.max} ${unit}.`)
}

/** Set one key's override. A discriminated union on `key` rather than a plain
 *  `{ key, value }` object, because the bound each key must land inside is
 *  PER KEY (`sequence.max-steps` tops out at 50, `comms.blob.retention-days`
 *  at 730) and rule 3 of the drafting brief requires zod itself to enforce
 *  that bound at write time — not the service, not a shared `positive()` that
 *  would let a `max-steps` of 10000 through as happily as a `retention-days`
 *  of 1. */
export const SettingPatch = z.discriminatedUnion('key', [
  z.object({
    key: z.literal('comms.reply.silence-days'),
    value: boundedValue('comms.reply.silence-days'),
  }),
  z.object({
    key: z.literal('comms.unmatched.retention-days'),
    value: boundedValue('comms.unmatched.retention-days'),
  }),
  z.object({
    key: z.literal('comms.blob.retention-days'),
    value: boundedValue('comms.blob.retention-days'),
  }),
  z.object({
    key: z.literal('sequence.step.default-wait-days'),
    value: boundedValue('sequence.step.default-wait-days'),
  }),
  z.object({
    key: z.literal('sequence.max-steps'),
    value: boundedValue('sequence.max-steps'),
  }),
  z.object({
    key: z.literal('content.share.expires-days'),
    value: boundedValue('content.share.expires-days'),
  }),
])

export type SettingPatch = z.infer<typeof SettingPatch>
