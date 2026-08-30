import { queryOptions } from '@tanstack/react-query'
import {
  filledSlots,
  type CurrencyCode,
  type ExitReason,
  type Lead,
  type LeadEvent,
  type LeadCategory,
  type LeadContact,
  type LeadProfile as ProfileForm,
  type LeadTier,
  type TranscriptTurn,
} from '@pv/engines/fixtures/das-vina'
import type { LeadProfile } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { EXIT_REASON_LABEL } from '@/data/leads'

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
 *  TWO ADAPTERS, AND WHY THEY ARE HERE RATHER THAN IN THE SCREEN
 *  ------------------------------------------------------------------
 *  The detail screen predates the endpoint: its form and its desk-backed
 *  blocks are written against the FROZEN fixture shapes, which spell "not dug
 *  out yet" as `''` / `null` and carry a few columns the table no longer has.
 *  `profileForm` and `leadOf` are the two translations between what the wire
 *  sends and what those blocks read. They live in `data/` because they are
 *  data-shape knowledge, not layout, and because both are meant to be DELETED
 *  — see the note on `leadOf`. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** What the route asks for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })` on
 *  `LeadController.profile`).
 *
 *  All three axes, exactly like `BOOK_NEED` in `data/leads.ts`, and the scope
 *  axis is the one that must not be dropped: the three Sale actors are
 *  `ownOnly`, and this endpoint answers a row-level question, so the server
 *  cuts by `owner_id` and answers 403 rather than handing over somebody else's
 *  lead. A query that declared only branch and permission would read as if any
 *  code were fair game. */
const PROFILE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.xem', scoped: true }

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
 *  A key missing from the JSON means NOT DUG OUT YET (`docs/tich-hop-be.md`),
 *  and the form already has a spelling for exactly that: `readField` turns
 *  `''` / `null` / `undefined` into an empty control, `filledSlots` counts a
 *  slot as empty on the same three values, and `FieldControl` prints "—" for a
 *  read-only one. So the translation is mechanical and it adds NOTHING: no
 *  invented currency, no invented category, no `0` standing in for an unknown
 *  headcount — `0` is a real answer ("nobody on site") and the two must not
 *  collapse into one.
 *
 *  The three casts (`category` · `tier` · `currency`) are the seam between a
 *  wire type where the value is OPTIONAL and a frozen fixture type that has no
 *  spelling for "unknown". `''` is the value every lookup around them already
 *  treats as unknown — `LEAD_CATEGORIES.find(…)` misses, `saleOfCategory`
 *  returns `undefined`, the `<select>` shows blank — so an absent category
 *  degrades to "no default Sale" instead of naming the wrong one.
 *
 *  ------------------------------------------------------------------
 *  TWO FIELDS THE TABLE NO LONGER HAS
 *  ------------------------------------------------------------------
 *  `dealCode` and `contractCode` are `''` here and are no longer DRAWN
 *  (`PROFILE_FIELDS` dropped both rows): lead → opportunity is 1-n now, so no
 *  single column can name "the" deal or "the" contract, and `signed` is the
 *  boolean that survived that change. Keeping the fixture's codes on screen
 *  would print a contract number the database has never heard of. */
export function profileForm(p: LeadProfile): ProfileForm {
  return {
    // ── 1 · who the customer is ─────────────────────────────────────────────
    legalName: p.legalName ?? '',
    taxCode: p.taxCode ?? '',
    address: p.address ?? '',
    province: p.province ?? '',
    category: (p.category ?? '') as LeadCategory,
    mainProduct: p.mainProduct ?? '',
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
       anything comparing people must read — see `leadOf` and the PIC block of
       the toolbar. */
    owner: p.ownerName ?? '',
    bdOwner: p.bdOwnerName ?? '',
    marketingOwner: p.marketingOwnerName ?? '',
    createdAt: p.createdAt,
    stage: p.stage ?? '',
    dealCode: '',
    contractCode: '',
    exitReason: exitLabel(p.exitReason),
  }
}

/** ASCII exit key → the Vietnamese label the frozen shapes carry.
 *
 *  The server stores and sends a key (`khong-goi-duoc`); the fixture typed the
 *  field as the label itself. One table does the translation for the whole app
 *  and it already exists next to the book — spelling a second one here is how
 *  two screens end up naming one exit reason two ways. */
function exitLabel(key: string | undefined): ExitReason | '' {
  if (!key) return ''
  return (EXIT_REASON_LABEL[key] ?? key) as ExitReason
}

// ---------------------------------------------------------------------------
// Wire → the frozen `Lead` shape · A BRIDGE, and it is meant to be removed
// ---------------------------------------------------------------------------

/** The wire profile dressed as a fixture `Lead` row.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS EXISTS AT ALL
 *  ------------------------------------------------------------------
 *  Six blocks of the detail screen are desk-backed (pins, notes, todos,
 *  assignment, convert, exit) and have no endpoint yet, so they stay exactly
 *  as they are. They — and the three shared derivations they call
 *  (`nextActions`, `assigneeOptions`, `peopleOn` in `data/leads.ts`) — are
 *  typed against the frozen `Lead`. This is the one place that shape is built
 *  from server data, instead of every block growing its own conversion.
 *
 *  ------------------------------------------------------------------
 *  WHAT IT REFUSES TO FILL IN
 *  ------------------------------------------------------------------
 *   · `history` is `[]` — `sales.touch` does not exist, so there are no
 *     touches to list. Not "no touches happened": no table to read them from.
 *     `leadTranscript` and `leadResearch` both fall to their empty answer on
 *     it, which is the honest one.
 *   · `dealCode` / `contractCode` are left OUT (both optional) rather than
 *     carried over from the fixture. `isRunning` reads `contractCode`, so on
 *     this bridge it cannot see a signed lead — nothing on this screen calls
 *     it, and the field that answers the question is `signed`.
 *   · `filled` is computed from the REAL profile (`filledSlots`), not from a
 *     positional guess off the two counters, so the init-data gate says the
 *     same thing here as it does inside the form.
 *   · `source` is left EMPTY rather than carrying the server's `SR-…` id — see
 *     the comment on the field.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS BRIDGE IS NOW SAFE TO KEEP — 28/08
 *  ------------------------------------------------------------------
 *  The bridge never lied about VALUES; what it could not say was that its
 *  result is not a frozen row. Three separate bugs came out of that one gap —
 *  `nextActions` reaching for `leadContact()`, `OriginCard` for `leadOrigin()`,
 *  `draftOpportunity` for `leadProfile()` — each one an invented person or a
 *  blank screen, each fixed on its own.
 *
 *  `@pv/engines` now brands the frozen rows (`FrozenLead`), and every GENERATOR
 *  in the fixture demands that brand. Only `LEADS` carries it. So the `Lead`
 *  built here is, by construction, accepted by everything that merely reads
 *  fields and rejected AT COMPILE TIME by everything that would invent data
 *  from a code. The prose warning became a type; the fourth bug of this family
 *  cannot be written.
 *
 *  ------------------------------------------------------------------
 *  THE ONE THING THAT USED TO LIE — FIXED, `realContact` BELOW IS THE SEAM
 *  ------------------------------------------------------------------
 *  `nextActions` used to call `leadContact()` internally — the frozen
 *  generator that INVENTS a contact name and phone from the lead code. For the
 *  100 frozen codes it agreed with the seeded rows; for a code outside them
 *  (the Apollo import, `LD-0201…LD-0219`) it made up a person, and the
 *  suggestion chips offered a "Gọi …" button that dialed a number nobody ever
 *  gave. `nextActions` now takes an explicit `contact: LeadContact | null`
 *  argument instead of reaching for the generator itself — `realContact`
 *  below builds that argument from the WIRE, so the caller with a real
 *  profile in hand (`lead-detail.tsx`) never goes near `leadContact()`. The
 *  one caller that still legitimately does is `myWork()` in `data/leads.ts`,
 *  because it only ever sees the frozen book (`LEADS`), which by construction
 *  never contains a code outside `LD-0101…LD-0200` — the generator is exactly
 *  right there. */
export function leadOf(p: LeadProfile): Lead {
  const filled = filledSlots(profileForm(p))

  return {
    code: p.code,
    company: p.company,
    province: p.province ?? '',
    category: (p.category ?? '') as LeadCategory,
    tier: (p.tier ?? '') as LeadTier,
    requiredFilled: p.requiredFilled,
    optionalFilled: p.optionalFilled,
    answered: p.requiredFilled + p.optionalFilled,
    filled,
    owner: p.ownerName,
    stage: p.stage,
    daysHere: p.daysHere,
    /* EMPTY on purpose, and this is the one field that must not be filled in.
       `Lead.source` documents itself as "mã nguồn — trỏ vào `SOURCES`", the
       frozen eight-row table. The wire carries `SR-…`, an id from the server's
       own `config_entry`. Those are two different namespaces, and putting the
       second one in a slot that promises the first is exactly the lie that
       made `leadOrigin()` throw on every profile the screen opened.
       Nothing on this side reads the field (the origin card reads
       `p.source` — the real two-part object — directly), so the honest value
       is "no frozen source code", which is what `''` means here. */
    source: '',
    createdAt: p.createdAt,
    exitReason: p.exitReason ? exitLabelOrUndefined(p.exitReason) : undefined,
    exitedAt: p.exitedAt,
    history: [],
  }
}

// ---------------------------------------------------------------------------
// What the touch endpoint will one day fill · TWO named constants, not `[]`
// ---------------------------------------------------------------------------

/** The lead's touches, and the verbatim conversation on them — EMPTY, because
 *  `sales.touch` does not exist yet.
 *
 *  `NO_TOUCHES` is no longer what the screens render: both detail screens read
 *  `sales.touch` through `data/touches.ts`, and it survives only as the fallback
 *  for a query that has not answered yet or failed. `NO_TRANSCRIPT` is still the
 *  real value at both call sites — the server has no transcript and will not.
 *
 *  Named constants rather than `[]` written inline, because a bare `[]` in JSX
 *  cannot say WHICH empty it is: nobody has spoken to this lead, or this screen
 *  has no such data to begin with. A reader six months from now would have to go
 *  find out.
 *
 *  Frozen module-level values, so they keep the same identity across renders
 *  and never make `ActivityCard`'s memo work for nothing.
 *
 *  Deliberately NOT filled by the fixture's generators: `leadTranscript()`
 *  invents an English conversation out of the lead code, which for an imported
 *  row is a conversation nobody ever had. `FrozenLead` in `@pv/engines` now
 *  refuses that call at compile time — see its docblock. */
export const NO_TOUCHES: readonly LeadEvent[] = []
export const NO_TRANSCRIPT: readonly TranscriptTurn[] = []

/** Same table as `exitLabel`, minus the `''` branch: a `Lead` spells "still
 *  running" as an ABSENT `exitReason`, and `''` there would read as "it exited
 *  for a reason nobody wrote down". */
function exitLabelOrUndefined(key: string): ExitReason | undefined {
  const label = exitLabel(key)
  return label === '' ? undefined : label
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
