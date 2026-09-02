import { z } from 'zod'
import { email, phoneOptional, textNhap, textNhapTuyChon } from '../primitives'
import { type LeadMotion, type LeadSourceKind } from './enums'
import { LEAD_MAX } from './lead-fields'

/** How a lead entered the system — TWO axes, and what each origin implies.
 *
 *  ------------------------------------------------------------------
 *  THE TWO AXES THEMSELVES LIVE IN `./enums`
 *  ------------------------------------------------------------------
 *  `LeadSourceKind` (WHERE the row came from) and `LeadMotion` (WHO moved
 *  first) are declared there, next to the other stored vocabularies, because
 *  both are written into columns of `sales.lead`. This file holds only what is
 *  DERIVED from them: how far an origin can be trusted, and which pairs of the
 *  two axes actually occur.
 *
 *  The OPEN half of the origin — which campaign the lead is attributed to —
 *  is not an axis with rules like these. It is a catalogue row, and it lives
 *  in `./lead-source` alongside the object that carries both halves.
 *
 *  It is deliberately not a third declaration of either list. The six motions
 *  were briefly declared in three places at once — the engine, this file, and
 *  `enums.ts` — and the compiler caught it at the package entry point. Keeping
 *  the vocabulary in exactly one module per package is what makes that class of
 *  mistake loud instead of silent.
 *
 *  ------------------------------------------------------------------
 *  WHY THE AXES MUST STAY SEPARATE
 *  ------------------------------------------------------------------
 *  · MOTION answers "who moved first" — the customer reached out, or we did. It
 *    decides how you open the conversation.
 *  · SOURCE KIND answers "where did this row come from". It decides how much
 *    the row can be TRUSTED.
 *
 *  They are independent, and that is the point: an `EVENT` lead arrives by
 *  `IMPORT` (the registration list exported the next morning) or by `MANUAL` (a
 *  BD typing up badges that evening) — one event, two very different levels of
 *  confidence. Folding them into a single enum of thirty values is the reliable
 *  way to make both unfilterable.
 *
 *  ------------------------------------------------------------------
 *  KNOWN DEBT — THE ENGINE STILL HOLDS AN OLDER SHAPE
 *  ------------------------------------------------------------------
 *  `packages/engines/src/lead-intake.ts` models this axis with FIVE values
 *  (`dong-bo · tay · tep · quet · api`) in lower case, and the import panel in
 *  `apps/web` reads that one. The stored vocabulary is the four in `./enums`:
 *  every one of them has a code path behind it, whereas `dong-bo` and `quet`
 *  describe doors nothing has been built for yet. The tables below are that
 *  five-door table narrowed to the origins that exist, with `tay → MANUAL`,
 *  `tep → IMPORT`, `api → LANDING_PAGE`; `APOLLO` has no counterpart there at
 *  all, because the engine copy has no notion of a named vendor. Reconciling
 *  the two is the "enum declared twice" debt in `docs/ban-giao-api.md`; the
 *  conversion happens in `lead.mapper.ts`, in exactly ONE place, until it is
 *  paid. */

/** How far a row of a given origin can be trusted.
 *
 *  Derived from the origin rather than chosen, because it only asks one question:
 *  is there someone who confirmed this row, and who was it.
 *
 *   · `XAC_MINH` — someone on the CUSTOMER side confirmed it.
 *   · `KHAI_BAO` — someone on OUR side put their name on it.
 *   · `THO`      — nobody has confirmed anything yet.
 *
 *  Worth carrying on the wire because without it 500 rows out of a purchased
 *  file look exactly like 500 leads someone has actually spoken to, and every
 *  conversion rate computed over that total is wrong. */
export const IntakeTrust = z.enum(['XAC_MINH', 'KHAI_BAO', 'THO'])

export type IntakeTrust = z.infer<typeof IntakeTrust>

/** Trust is a CONSEQUENCE of where the row came from, never a field anyone
 *  types.
 *
 *  `LANDING_PAGE` is `XAC_MINH` because the customer filled the form and
 *  pressed send themselves; `MANUAL` is `KHAI_BAO` because a person here owns
 *  every cell they typed; `IMPORT` is `THO` because a file is a pile of rows
 *  until somebody has touched one.
 *
 *  `APOLLO` is `THO` for the same reason as `IMPORT`, and it is worth saying
 *  why it does not get its own level: paying for a row is not the same as
 *  confirming it. A bought contact is exactly as unverified as a free one —
 *  the invoice buys reach, not truth — and a vendor tier above `THO` would
 *  quietly inflate every conversion rate computed over purchased data. */
export const CHANNEL_TRUST = {
  MANUAL: 'KHAI_BAO',
  IMPORT: 'THO',
  APOLLO: 'THO',
  LANDING_PAGE: 'XAC_MINH',
} as const satisfies Record<z.infer<typeof LeadSourceKind>, z.infer<typeof IntakeTrust>>

/** Which origin can carry which motion — the pairs that actually exist.
 *
 *  Not every combination does, and this table says so instead of leaving each
 *  caller to guess: `LANDING_PAGE` carries only `INBOUND` and `PARTNER`, because a
 *  public form is something a stranger walks up to — nothing `OUTBOUND` ever
 *  falls out of it. `MANUAL` carries everything except `EVENT`, which arrives
 *  as a list rather than as one typed row.
 *
 *  A pair missing from this table is not "not supported yet"; it is a pair that
 *  DOES NOT HAPPEN. That is why the import and create contracts narrow their
 *  `motion` field with `z.enum(MOTION_BY_CHANNEL[...])` rather than accepting
 *  all six and refusing later: an impossible pair then fails at the zod gate,
 *  on the `motion` field, with a message the form can attach to the right
 *  control.
 *
 *  `as const satisfies` rather than a plain annotation, on purpose — `as const`
 *  keeps the literal tuples so `z.enum()` can narrow to exactly the allowed
 *  motions, while `satisfies` still makes `tsc` check every key and value
 *  against the two axes in `./enums`. */
export const MOTION_BY_CHANNEL = {
  MANUAL: ['INBOUND', 'OUTBOUND', 'REFERRAL', 'PARTNER', 'RECYCLE'],
  IMPORT: ['OUTBOUND', 'EVENT', 'PARTNER', 'RECYCLE'],
  /* Narrower than `IMPORT`, and that is the point of naming the vendor: a
     bought list is cold outbound, or the same list bought again to wake old
     contacts. It never carries `EVENT` — nobody registered for anything — and
     never `PARTNER`, because a partner who hands over contacts hands over a
     file, not an Apollo invoice. */
  APOLLO: ['OUTBOUND', 'RECYCLE'],
  LANDING_PAGE: ['INBOUND', 'PARTNER'],
} as const satisfies Record<z.infer<typeof LeadSourceKind>, readonly z.infer<typeof LeadMotion>[]>

/** Does this pair exist. */
export function channelCarries(
  channel: z.infer<typeof LeadSourceKind>,
  motion: z.infer<typeof LeadMotion>,
): boolean {
  return (MOTION_BY_CHANNEL[channel] as readonly string[]).includes(motion)
}

// ---------------------------------------------------------------------------
// Public landing-page door — POST /sales/leads/intake
// ---------------------------------------------------------------------------

const landingPage = z
  .string('landingPage là bắt buộc')
  .trim()
  .min(1, 'landingPage là bắt buộc')
  .max(64, 'landingPage tối đa 64 ký tự')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'landingPage chỉ gồm chữ thường, số và dấu gạch ngang')

const campaignParam = (max = 120) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .transform((value) => (value === '' ? undefined : value))
    .optional()

/** Query string is attribution, not authentication. `from=landingpage` is
 *  required so a copied integration URL cannot silently become another write
 *  door; `landingPage` names the concrete form for reporting and allowlisting. */
export const LeadIntakeQuery = z
  .object({
    from: z.literal('landingpage', 'from phải là "landingpage"'),
    landingPage,
    utm_source: campaignParam(),
    utm_medium: campaignParam(),
    utm_campaign: campaignParam(),
    utm_content: campaignParam(),
    utm_term: campaignParam(),
  })
  .strict()

/** The public form gets a deliberately small write surface. Ownership,
 *  pipeline state, campaign attribution, score and motion are server-owned and
 *  cannot be asserted by an anonymous caller. `website` is the honeypot: humans leave
 *  it empty; a non-empty value is acknowledged but never creates a lead. */
export const LeadIntakeBody = z
  .object({
    company: textNhap(LEAD_MAX.company),
    contactName: textNhap(LEAD_MAX.contactName),
    email,
    phone: phoneOptional,
    province: textNhapTuyChon(LEAD_MAX.province),
    pain: textNhapTuyChon(LEAD_MAX.pain),
    website: z.string().max(200, 'website tối đa 200 ký tự').optional().default(''),
  })
  .strict()

/** Always generic: the public response must not reveal whether an email was
 *  new, duplicated, or caught by the honeypot. */
export const LeadIntakeResponse = z.object({ accepted: z.literal(true) })

export type LeadIntakeQuery = z.infer<typeof LeadIntakeQuery>
export type LeadIntakeBody = z.infer<typeof LeadIntakeBody>
export type LeadIntakeResponse = z.infer<typeof LeadIntakeResponse>
