import { z } from 'zod'
import { email, phoneOptional, textNhap, textNhapTuyChon } from '../primitives'
import { type IntakeChannel, type LeadMotion } from './enums'

/** How a lead entered the system — TWO axes, and what each door implies.
 *
 *  ------------------------------------------------------------------
 *  THE TWO AXES THEMSELVES LIVE IN `./enums`
 *  ------------------------------------------------------------------
 *  `IntakeChannel` (which DOOR the row came through) and `LeadMotion` (WHO
 *  moved first) are declared there, next to the other stored vocabularies,
 *  because both are written into columns of `sales.lead`. This file holds only
 *  what is DERIVED from them: how far a door can be trusted, and which pairs of
 *  the two axes actually occur.
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
 *  · CHANNEL answers "through which door did the row reach the table". It
 *    decides how much the row can be TRUSTED.
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
 *  `packages/engines/src/lead-intake.ts` models the door axis with FIVE values
 *  (`dong-bo · tay · tep · quet · api`) in lower case, and `apps/web` reads
 *  that one. The stored vocabulary is the three above: every one of them has a
 *  code path behind it, whereas `dong-bo` and `quet` describe doors nothing has
 *  been built for yet. The tables below are that five-door table narrowed to
 *  the doors that exist, with `tay → MANUAL`, `tep → IMPORT`, `api → LANDING`.
 *  Reconciling the two copies is the "enum declared twice" debt in
 *  `docs/ban-giao-api.md`; the conversion happens in `lead.mapper.ts`, in
 *  exactly ONE place, until it is paid. */

/** How far a row that came through a given door can be trusted.
 *
 *  Derived from the door rather than chosen, because it only asks one question:
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

/** Trust is a CONSEQUENCE of the door, never a field anyone types.
 *
 *  `LANDING` is `XAC_MINH` because the customer filled the form and pressed
 *  send themselves; `MANUAL` is `KHAI_BAO` because a person here owns every
 *  cell they typed; `IMPORT` is `THO` because a file is a pile of rows until
 *  somebody has touched one. */
export const CHANNEL_TRUST = {
  MANUAL: 'KHAI_BAO',
  IMPORT: 'THO',
  LANDING: 'XAC_MINH',
} as const satisfies Record<z.infer<typeof IntakeChannel>, z.infer<typeof IntakeTrust>>

/** Which door can carry which motion — the pairs that actually exist.
 *
 *  Not every combination does, and this table says so instead of leaving each
 *  caller to guess: `LANDING` carries only `INBOUND` and `PARTNER`, because a
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
  LANDING: ['INBOUND', 'PARTNER'],
} as const satisfies Record<z.infer<typeof IntakeChannel>, readonly z.infer<typeof LeadMotion>[]>

/** Does this pair exist. */
export function channelCarries(
  channel: z.infer<typeof IntakeChannel>,
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
 *  pipeline state, source codes, score and motion are server-owned and cannot
 *  be asserted by an anonymous caller. `website` is the honeypot: humans leave
 *  it empty; a non-empty value is acknowledged but never creates a lead. */
export const LeadIntakeBody = z
  .object({
    company: textNhap(200),
    contactName: textNhap(120),
    email,
    phone: phoneOptional,
    province: textNhapTuyChon(64),
    pain: textNhapTuyChon(1_000),
    website: z.string().max(200, 'website tối đa 200 ký tự').optional().default(''),
  })
  .strict()

/** Always generic: the public response must not reveal whether an email was
 *  new, duplicated, or caught by the honeypot. */
export const LeadIntakeResponse = z.object({ accepted: z.literal(true) })

export type LeadIntakeQuery = z.infer<typeof LeadIntakeQuery>
export type LeadIntakeBody = z.infer<typeof LeadIntakeBody>
export type LeadIntakeResponse = z.infer<typeof LeadIntakeResponse>
