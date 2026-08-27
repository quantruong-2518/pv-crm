import { z } from 'zod'
import { MaConfig } from './config'
import { LeadSourceKind } from './enums'

/** Where a lead came from — ONE object, two facts, one label table.
 *
 *  ------------------------------------------------------------------
 *  WHY AN OBJECT AND NOT TWO FLAT FIELDS
 *  ------------------------------------------------------------------
 *  The two facts below are always read together and are meaningless apart:
 *  "Apollo" without a campaign is a vendor invoice with no campaign to charge
 *  it to, and a campaign id without a kind cannot say whether those rows were
 *  bought, typed, or filled in by the customer. They used to sit on `LeadRow`
 *  as two unrelated top-level fields (`source` holding a bare `SR-…` code and
 *  `intakeChannel` holding the door), and the cost of that was visible on
 *  screen: the profile card printed the raw catalogue id `SR-09` because
 *  nothing in the shape said the code had a name attached to it.
 *
 *  Grouping them fixes exactly that. `campaignName` travels beside
 *  `campaignId` for the reason `ownerName` travels beside `ownerId` (see
 *  `./lead`): the id is the only thing anything may COMPARE, the name is the
 *  only thing anything may PRINT. With both on the wire the screen never has
 *  a reason to render an id, and the raw code has no path to a user's eyes.
 *
 *  ------------------------------------------------------------------
 *  EVERY FIELD IS OPTIONAL, AND EACH ABSENCE MEANS SOMETHING DIFFERENT
 *  ------------------------------------------------------------------
 *   · no `kind`       — the 100 frozen fixture rows predate the server having
 *     an origin concept at all. Guessing one for them would put invented data
 *     on the Performance screen; absent is the honest answer.
 *   · no `campaignId` — the lead belongs to no campaign. A real answer, not a
 *     gap: hand-typed rows and walk-up landing-page rows are like this, and
 *     the Performance screen needs its "no campaign" group to stay truthful.
 *   · `campaignId` present but `campaignName` absent — the campaign row was
 *     turned off or deleted underneath the lead. The screen falls back to a
 *     neutral label rather than printing the bare code. */
export const LeadSource = z.object({
  kind: LeadSourceKind.optional(),
  campaignId: MaConfig.optional(),
  campaignName: z.string().min(1).optional(),
})

export type LeadSource = z.infer<typeof LeadSource>

/** The display name of every origin kind — ONE table, both ends read it.
 *
 *  ------------------------------------------------------------------
 *  THIS IS A DELIBERATE EXCEPTION TO "LABELS BELONG TO THE VIEW LAYER"
 *  ------------------------------------------------------------------
 *  `./enums` says labels do not live next to stored vocabularies, and for
 *  screen copy that still holds. This table is not screen copy. It is the
 *  agreed NAME of each key, and it has more than one reader: the book, the
 *  profile card, and anything the server renders outside a browser — an
 *  export, a digest mail, an audit line. Two copies of a four-row table is
 *  how "Web landing" and "Landing page" end up on two screens describing one
 *  value, which is the drift `apps/web`'s deleted `SOURCE_KIND_FACE` and the
 *  still-live `EXIT_REASON_LABEL` both document the cost of.
 *
 *  Vietnamese, because these reach a user's eyes and user-facing strings in
 *  this product are Vietnamese. Anything ABOUT a label — an icon, a tone, a
 *  shortened form — stays in the view layer where it belongs. */
export const SOURCE_KIND_LABEL = {
  MANUAL: 'Thêm thủ công',
  IMPORT: 'Nạp theo lô',
  APOLLO: 'Apollo',
  LANDING_PAGE: 'Web landing',
} as const satisfies Record<z.infer<typeof LeadSourceKind>, string>

/** What to print when a lead carries no `kind` at all.
 *
 *  A named constant rather than an inline `?? '…'` at each call site: the book
 *  and the profile must say the same thing about the same absence, and the
 *  100 fixture rows mean this is the COMMON case today, not an edge one. */
export const SOURCE_KIND_UNKNOWN = 'Chưa rõ nguồn'

/** The label for one source's KIND, or the unknown fallback. */
export function sourceKindLabel(source: LeadSource | undefined): string {
  return source?.kind ? SOURCE_KIND_LABEL[source.kind] : SOURCE_KIND_UNKNOWN
}

/** No campaign at all — a complete answer, not a gap. */
export const CAMPAIGN_NONE = 'Không thuộc chiến dịch'

/** A campaign id that resolved to nothing. */
export const CAMPAIGN_UNRESOLVED = 'Chiến dịch không tra được'

/** What to call the campaign half — THREE states, kept apart on purpose.
 *
 *  "no campaign" and "a campaign whose row could not be found" look identical
 *  on screen if both collapse to one label, and they are opposite problems:
 *  the first is normal and needs nobody, the second means a lead is pointing
 *  at a row that is not there and somebody has to go look.
 *
 *  That second state is not hypothetical. `campaign_id` has no foreign key
 *  yet (the debt is recorded on the column in `lead.schema.ts`), and the last
 *  time something wrote the wrong kind of code into it, 100 of 119 rows
 *  pointed at nothing while every screen rendered as though nothing was
 *  wrong. A label that says so is the cheapest detector there is. */
export function campaignLabel(source: LeadSource): string {
  if (source.campaignName) return source.campaignName
  return source.campaignId ? CAMPAIGN_UNRESOLVED : CAMPAIGN_NONE
}
