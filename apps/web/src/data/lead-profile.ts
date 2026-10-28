import { queryOptions } from '@tanstack/react-query'
import {
  type CurrencyCode,
  type ExitReason,
  type LeadContact,
  type LeadTier,
} from '@pv/engines/fixtures/das-vina'
import type { LeadProfile } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import type { ProfileValues } from '@/data/lead-form'

/** Module 2 · `GET /sales/leads/:code` — ONE whole lead profile.
 *
 *  ------------------------------------------------------------------
 *  WHY A FILE OF ITS OWN AND NOT A SECTION OF `data/leads.ts`
 *  ------------------------------------------------------------------
 *  `data/leads.ts` is the BOOK: a page of rows, its facets, and the three
 *  derivations every screen shares. This is one row read whole, and it asks a
 *  different question of the server — the book filters rows away and reports
 *  the size of the cut in `hidden`, while the profile has a single row to show
 *  and therefore has to REFUSE (403 · `out-of-scope`) when that row is not
 *  yours. One file per question keeps those two failure vocabularies from
 *  being read as one. Same split the write doors already took
 *  (`lead-create.ts`, `lead-import-wire.ts`).
 *
 *  ------------------------------------------------------------------
 *  ADAPTERS, AND WHY THEY ARE HERE RATHER THAN IN THE SCREEN
 *  ------------------------------------------------------------------
 *  The detail screen predates the endpoint: its form is written against the
 *  FROZEN fixture shape, which spells "not dug out yet" as `''` / `null` and
 *  carries a few columns the table no longer has. `profileForm` translates
 *  what the wire sends into what the form reads; it lives in `data/` because
 *  it is data-shape knowledge, not layout, and it is meant to be DELETED. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** What the route asks for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'lead.view', scoped: true })` on
 *  `LeadController.profile`).
 *
 *  All three axes, exactly like `BOOK_NEED` in `data/leads.ts`, and the scope
 *  axis is the one that must not be dropped: the three Sale actors are
 *  `ownOnly`, and this endpoint answers a row-level question, so the server
 *  cuts by `owner_id` and answers 403 rather than handing over somebody else's
 *  lead. A query that declared only branch and permission would read as if any
 *  code were fair game. */
const PROFILE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }

/** One lead profile, by code.
 *
 *  A FUNCTION of the code, and `code` is inside `queryKey`: a profile is not
 *  one value but one value per lead, and a key that forgot the code would hand
 *  the previous lead's profile to the next lead opened — the exact bug the
 *  book's paged key avoids on the other side.
 *
 *  `signal` is wired to TanStack's `AbortSignal` so walking back to the book
 *  mid-flight cancels the request instead of letting it land on an unmounted
 *  screen. No `load`: this query has no fixture side left (see
 *  `app/api/client.ts` — dropping `load` IS the ritual that cuts a query over
 *  to the server). */
export const leadProfileQuery = (code: string) =>
  queryOptions({
    queryKey: ['sales', 'lead-profile', code] as const,
    queryFn: ({ signal }) =>
      api.read<LeadProfile>(`/sales/leads/${encodeURIComponent(code)}`, {
        need: PROFILE_NEED,
        signal,
      }),
  })

// ---------------------------------------------------------------------------
// Wire → the shape the profile FORM reads
// ---------------------------------------------------------------------------

/** The wire profile as the thirty-field form wants it.
 *
 *  ------------------------------------------------------------------
 *  ABSENT ON THE WIRE IS `''` / `null` IN THE FORM — NOT A DEFAULT
 *  ------------------------------------------------------------------
 *  A key missing from the JSON means NOT DUG OUT YET,
 *  and the form already has a spelling for exactly that: `readField` turns
 *  `''` / `null` / `undefined` into an empty control, `filledSlots` counts a
 *  slot as empty on the same three values, and `FieldControl` prints "—" for a
 *  read-only one. So the translation is mechanical and it adds NOTHING: no
 *  invented currency, no invented category, no `0` standing in for an unknown
 *  headcount — `0` is a real answer ("nobody on site") and the two must not
 *  collapse into one.
 *
 *  The two casts (`tier` · `currency`) are the seam between a wire type where
 *  the value is OPTIONAL and a frozen fixture type that has no spelling for
 *  "unknown"; `''` is what every lookup around them treats as unknown. The
 *  category and industries are config ids, `''` and `[]` when none.
 *
 *  ------------------------------------------------------------------
 *  TWO FIELDS THE TABLE NO LONGER HAS
 *  ------------------------------------------------------------------
 *  `dealCode` and `contractCode` are `''` here and are no longer DRAWN
 *  (`PROFILE_FIELDS` dropped both rows): lead → opportunity is 1-n now, so no
 *  single column can name "the" deal or "the" contract, and `signed` is the
 *  boolean that survived that change. Keeping the fixture's codes on screen
 *  would print a contract number the database has never heard of. */
export function profileForm(p: LeadProfile): ProfileValues {
  return {
    // ── 1 · who the customer is ─────────────────────────────────────────────
    legalName: p.legalName ?? '',
    taxCode: p.taxCode ?? '',
    website: p.website ?? '',
    address: p.address ?? '',
    province: p.province ?? '',
    category: p.category?.id ?? '',
    mainProduct: p.mainProduct ?? '',
    /* Ids, as the write takes them; the picker names them from the catalogue. */
    industries: p.industries.map((i) => i.id),
    headcount: p.headcount ?? null,
    plants: p.plants ?? null,

    // ── 2 · who we talk to ──────────────────────────────────────────────────
    contactName: p.contactName,
    contactTitle: p.contactTitle ?? '',
    phone: p.phone ?? '',
    email: p.email,
    /* `ContactChannel` and the fixture's `WaveChannel` are the same seven
       values on purpose (see the contract) — one campaign channel out, the
       same channel back — so this one needs no cast. */
    channel: p.contactChannel ?? '',
    channelUrl: p.contactChannelUrl ?? '',

    // ── 3 · what the customer wants solved ──────────────────────────────────
    pain: p.pain ?? '',
    currentStack: p.currentStack ?? '',
    decisionMaker: p.decisionMaker ?? '',
    approver: p.approver ?? '',
    budget: p.budget ?? null,
    currency: (p.currency ?? '') as CurrencyCode,
    deadline: p.deadline ?? '',

    // ── 4 · the book's own columns ──────────────────────────────────────────
    code: p.code,
    company: p.company,
    tier: (p.tier ?? '') as LeadTier,
    /* The legacy fixture shape models a source as ONE code, so it can only
       carry the campaign half. The other half (`p.source.kind`) has no slot
       here and is not forced into one: the blocks reading this shape ask
       "which campaign", never "bought or typed". */
    source: p.source.campaignId ?? '',
    /* NAMES, because these three are `select` controls whose options are
       spelled by name. The ids travel next to them on the wire and are what
       anything comparing people must read — see the PIC block of
       the toolbar. */
    owner: p.ownerName ?? '',
    bdOwner: p.bdOwnerName ?? '',
    marketingOwner: p.marketingOwnerName ?? '',
    createdAt: p.createdAt,
    /* A lead has no pipeline column since ADR 0058 — its status is `p.state`,
       which the header prints; the frozen shape still has the slot. */
    stage: '',
    dealCode: '',
    contractCode: '',
    /* Raw stop key (config id, or `'other'`), not a label — the catalogue is
       admin-edited now (ADR 0070), so a fixed lookup table cannot cover it.
       The screen resolves the label with `stopReasonLabel` instead. */
    exitReason: (p.exitReason ?? '') as ExitReason,
  }
}

// ---------------------------------------------------------------------------
// Wire → the contact `nextActions` reads — no generator involved
// ---------------------------------------------------------------------------

/** The lead's real contact person, straight off the wire.
 *
 *  `LeadContact` (`packages/engines/src/fixtures/das-vina.ts`) is reused on
 *  purpose: it is the exact shape `nextActions` already knows how to read, and
 *  reusing it here means the ONLY thing that changes is where the value comes
 *  from — a mechanical field copy, not a new contract.
 *
 *  `contactName` is one of `LeadRow`'s three `NOT NULL` columns, so it is never
 *  missing here the way `leadContact()`'s `null` return used to be — a real
 *  lead always has a name. What is genuinely allowed to be absent is `phone`;
 *  `nextActions` reads that absence to drop the "Gọi" suggestion rather than
 *  invent a number. `contactTitle` degrades to `''`, the same "not dug out
 *  yet" sentinel `profileForm` already uses — not a fabricated title. */
export function realContact(p: LeadProfile): LeadContact {
  return {
    name: p.contactName,
    title: p.contactTitle ?? '',
    phone: p.phone,
    email: p.email,
    channel: p.contactChannel,
  }
}
