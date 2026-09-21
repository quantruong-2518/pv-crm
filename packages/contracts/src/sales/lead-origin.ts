import { z } from 'zod'
import { ObjectCode, Bool, Day, textInput } from '../primitives'
import { LeadMotion } from './enums'

/** Level 2 of lead origin — the user-extensible catalog (the "source" a user
 *  picks) sitting under level 1 `LeadMotion` (the "direction"). `sales.lead_origin`.
 *
 *  ------------------------------------------------------------------
 *  WHY A CATALOG AND NOT A THIRD ENUM
 *  ------------------------------------------------------------------
 *  `LeadMotion` is closed because each value needs a code path; an origin
 *  ("Apollo", "LinkedIn", a partner's name) has none — it is a fact somebody
 *  typed, and the list grows every time marketing tries a new channel. Anyone
 *  may CREATE one (`lead.edit`, the same door as `POST /sales/leads`);
 *  renaming, hiding or merging one needs `lead-origin.manage`, because those
 *  three move OTHER people's leads.
 *
 *  `key` is what collision is decided on, never `name` — see `originKey`. */

/** Which half of `MOTION_SIDE` a motion falls into — derived, never stored:
 *  a lead's `side` is read off its `motion`, so the two can never disagree. */
export const LeadSide = z.enum(['PASSIVE', 'ACTIVE'])
export type LeadSide = z.infer<typeof LeadSide>

/** The customer reached out first (`PASSIVE`) or we did (`ACTIVE`) — the
 *  grouping the book's side filter reads. Closed over `LeadMotion`'s six
 *  values, so `tsc` catches a seventh motion arriving with no side. */
export const MOTION_SIDE = {
  INBOUND: 'PASSIVE',
  REFERRAL: 'PASSIVE',
  PARTNER: 'PASSIVE',
  OUTBOUND: 'ACTIVE',
  EVENT: 'ACTIVE',
  RECYCLE: 'ACTIVE',
} as const satisfies Record<LeadMotion, LeadSide>

export const LEAD_SIDE_LABEL: Record<LeadSide, string> = {
  PASSIVE: 'Bị động',
  ACTIVE: 'Chủ động',
}

/** Default Vietnamese label for each motion. `apps/web/src/data/lead-form.ts`
 *  keeps its own longer copy for the create form; this is the short one every
 *  other screen (book filter, stats) reads instead of retyping six strings. */
export const MOTION_LABEL: Record<LeadMotion, string> = {
  INBOUND: 'Inbound',
  OUTBOUND: 'Outbound',
  EVENT: 'Sự kiện',
  REFERRAL: 'Giới thiệu',
  PARTNER: 'Đối tác',
  RECYCLE: 'Đánh thức lại',
}

// ---------------------------------------------------------------------------
// The collision key — pure, no I/O, both ends may import it
// ---------------------------------------------------------------------------

const DOMAIN_SUFFIX = /\.(com\.vn|com|net|org|io|vn)(\/.*)?$/i

/** Turn typed text into the key that decides "same origin". Trims, drops a
 *  URL's protocol/`www.`/domain-and-path, folds the Vietnamese d-bar, strips accents, then
 *  keeps only `[a-z0-9]` — so `LinkedIn`, `linkedin.com` and
 *  `https://www.linkedin.com/in/x` all key to `linkedin`. Returns `''` when
 *  nothing alphanumeric is left, which callers must treat as "not a name". */
export function originKey(text: string): string {
  let s = text.trim()
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  s = s.replace(DOMAIN_SUFFIX, '')
  s = s.replace(/đ/gi, 'd')
  s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// ---------------------------------------------------------------------------
// The catalog itself
// ---------------------------------------------------------------------------

export const LeadOriginId = z.string().regex(/^LO-\d{4,}$/, 'Mã nguồn sai dạng')
export type LeadOriginId = z.infer<typeof LeadOriginId>

/** One catalog row. `aliases` are the OLD keys folded into this one by a
 *  merge (`LeadOriginMerge`); `mergedInto` is set exactly when this row was
 *  itself the one folded away, and `active: false` then follows automatically. */
export const LeadOrigin = z.object({
  id: LeadOriginId,
  name: z.string().min(1),
  key: z.string().min(1),
  active: z.boolean(),
  mergedInto: LeadOriginId.optional(),
  motions: z.array(LeadMotion),
  aliases: z.array(z.string()),
  leadCount: z.number().int().nonnegative(),
})
export type LeadOrigin = z.infer<typeof LeadOrigin>

/** `GET /sales/lead-origins` — the picker's own search, not the book's
 *  filter facet (that one is `LeadFacets.origins`). */
export const LeadOriginListQuery = z.object({
  motion: LeadMotion.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  includeInactive: Bool.optional(),
})
export type LeadOriginListQuery = z.infer<typeof LeadOriginListQuery>

/** `exact` lets a create form skip the "did you mean" step outright; `similar`
 *  is what draws that step when there is no exact hit. Both are computed from
 *  `originKey(q)`, never a substring match on `name`. */
export const LeadOriginListResponse = z.object({
  rows: z.array(LeadOrigin),
  exact: LeadOrigin.optional(),
  similar: z.array(LeadOrigin),
})
export type LeadOriginListResponse = z.infer<typeof LeadOriginListResponse>

/** The one name rule shared by create and `LeadOriginPick`: must still hold a
 *  character after `originKey` strips it, or a name of pure punctuation mints
 *  a row that can never be found again. */
export const ORIGIN_NAME_MAX = 60

const leadOriginName = textInput(ORIGIN_NAME_MAX).refine(
  (v) => originKey(v).length > 0,
  'Tên nguồn phải còn chữ hoặc số sau khi chuẩn hoá',
)

/** `POST /sales/lead-origins`. Anyone with `lead.edit` may call this —
 *  it is how a Sale typing "Apollo" for the first time gets a real row. */
export const LeadOriginCreate = z.object({
  name: leadOriginName,
  motions: z.array(LeadMotion).min(1, 'Chọn ít nhất một thế'),
})
export type LeadOriginCreate = z.infer<typeof LeadOriginCreate>

/** `created: false` means the key already existed — the EXISTING row comes
 *  back, not a duplicate, so a double-click never mints two origins. */
export const LeadOriginCreateResponse = z.object({
  origin: LeadOrigin,
  created: z.boolean(),
})
export type LeadOriginCreateResponse = z.infer<typeof LeadOriginCreateResponse>

/** `PATCH /sales/lead-origins/:id` — `lead-origin.manage`. */
export const LeadOriginPatch = z
  .object({
    name: leadOriginName.optional(),
    motions: z.array(LeadMotion).min(1, 'Chọn ít nhất một thế').optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Không có ô nào để sửa',
  })
export type LeadOriginPatch = z.infer<typeof LeadOriginPatch>

/** `POST /sales/lead-origins/:id/merge` — `lead-origin.manage`. The
 *  merged-away id becomes an alias of `into`, and every lead pointing at it
 *  is repointed; `movedLeads` is that count, for the confirmation dialog. */
export const LeadOriginMerge = z.object({ into: LeadOriginId })
export type LeadOriginMerge = z.infer<typeof LeadOriginMerge>

export const LeadOriginMergeResponse = z.object({
  into: LeadOrigin,
  movedLeads: z.number().int().nonnegative(),
})
export type LeadOriginMergeResponse = z.infer<typeof LeadOriginMergeResponse>

/** What a WRITE door accepts for "which origin" — an id when the picker
 *  already resolved one, a name when the user typed past the last suggestion.
 *  A name arriving here goes through the same create-or-reuse path as
 *  `LeadOriginCreate`, which is why it carries the same rule. */
export const LeadOriginPick = z.union([
  z.object({ id: LeadOriginId }),
  z.object({ name: leadOriginName }),
])
export type LeadOriginPick = z.infer<typeof LeadOriginPick>

// ---------------------------------------------------------------------------
// The performance view — one flat row per (motion, origin, campaign)
// ---------------------------------------------------------------------------

/** `GET /sales/leads/source-stats` — `campaign.view`, the same permission the
 *  campaign sources screen (`./campaign`) already gates its book behind. */
export const LeadSourceStatsQuery = z.object({
  from: Day.optional(),
  to: Day.optional(),
})
export type LeadSourceStatsQuery = z.infer<typeof LeadSourceStatsQuery>

/** One row per group the funnel actually has, flat — the screen nests them
 *  by `side` → `motion` → `origin` → `campaign`, the server just counts.
 *  `motion: null` is a real group: leads written before this feature carry
 *  no motion at all, and folding them into `INBOUND` would be inventing
 *  history nobody recorded. */
export const LeadSourceStatsResponse = z.object({
  rows: z.array(
    z.object({
      side: LeadSide.nullable(),
      motion: LeadMotion.nullable(),
      originId: LeadOriginId.optional(),
      originName: z.string().min(1).optional(),
      campaignCode: ObjectCode.optional(),
      campaignName: z.string().min(1).optional(),
      leads: z.number().int().nonnegative(),
      mql: z.number().int().nonnegative(),
      sql: z.number().int().nonnegative(),
      deals: z.number().int().nonnegative(),
      won: z.number().int().nonnegative(),
    }),
  ),
})
export type LeadSourceStatsResponse = z.infer<typeof LeadSourceStatsResponse>
