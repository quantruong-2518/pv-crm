import { z } from 'zod'
import { PageQuery, paged } from '../pagination'
import { ContractCode, Moment, ObjectCode, textInput } from '../primitives'

/** The spine of `comms` — the table that says which person a wire address
 *  belongs to. `docs/tam-nhin-giao-tiep-va-noi-dung.md` §2 has the full case for
 *  this shape (why `object_code` and not `contact_code` — the precondition pass
 *  address the mail flow actually sends to, `lead.email`, does not live on
 *  `sales.contact` at all); this file only turns that shape into zod.
 *
 *      GET    /comms/identities        permission `comm.capture-manage`
 *      POST   /comms/identities        permission `comm.capture-manage`
 *      PATCH  /comms/identities/:id    permission `comm.capture-manage`
 *      POST   /comms/identities/merge  permission `comm.capture-manage`
 *
 *  Turn 0 only — no `comms.thread`, no capture adapters. Those come later. */

// ---------------------------------------------------------------------------
// CHANNEL — the same wire spelling as E4's `Channel`, plus `'phone'`
// ---------------------------------------------------------------------------

/** `'zalo-oa' | 'telegram' | 'email' | 'in-app'` are `Channel` in
 *  `packages/engines/src/e4-notifications.ts`, spelled identically here for the
 *  reason `RoleId`/`Permission` are spelled identically in `../auth.ts`: a
 *  contract must not import the engine to borrow its type, so the two lists are
 *  kept as one spelling by hand instead.
 *
 *  `auth.mapper.ts` closes that gap with an identity function whose SIGNATURE
 *  only compiles while the two unions hold exactly the same members —
 *  `toContractRole(r: EngineRoleId): ContractRoleId => r`. That trick needs
 *  EQUALITY, and this union is not equal to E4's `Channel`: it is E4's four
 *  members plus `'phone'`, a real fifth channel `comms.identity` has to carry
 *  (a phone number an inbound call or SMS arrives from) that E4 has never sent
 *  a notification through. An identity function typed `(c: Channel) => Channel`
 *  would reject `'phone'` at the call site, which is the one value this table
 *  exists to add — so the same mechanism cannot be reused verbatim here.
 *
 *  ANSWERED, 15/09: E4 is NOT widened — a `'phone'` member there would be a
 *  channel the notification engine can never send through. The check is the
 *  narrower one and it lives in `apps/api/src/platform/comms/comms.mapper.ts`
 *  as `toCommsChannel(c: Channel): CommsChannel => c` — one direction only,
 *  which is exactly the claim being made: every channel E4 knows is one this
 *  union holds. The reverse function would reject `'phone'`, so it does not
 *  exist. Widen this enum and that line stays green; misspell a shared member
 *  and it goes red at the mapper. */
export const CommsChannel = z.enum(['email', 'zalo-oa', 'telegram', 'phone', 'in-app'])
export type CommsChannel = z.infer<typeof CommsChannel>

/** Which half of a conversation this address sits on. `'member'` is one of
 *  ours, `actorId` names them; `'guest'` is the customer's, `objectCode`
 *  names them — see `IdentityRow` for why exactly one of the two follows. */
export const IdentitySide = z.enum(['member', 'guest'])
export type IdentitySide = z.infer<typeof IdentitySide>

export const IdentityId = z.uuid('Mã định danh phải là UUID')

/** Ceiling on the raw cell. Wide enough to hold `EMAIL_MAX` (254) with room
 *  left for a Zalo OA user id or a Telegram chat id, neither of which is an
 *  email and neither of which this file tries to shape-check on its own. */
export const IDENTITY_ADDRESS_MAX = 320

/** The wire address itself: an email mailbox, an E.164 phone number, or a
 *  platform-specific user id (Zalo, Telegram, an in-app account). Zod checks
 *  only that a non-blank string was sent — it CANNOT know which of the three
 *  shapes applies without reading `channel` first, and even then "is this a
 *  valid E.164 number" is a job `phoneOptional` already does for a field that
 *  is always a phone number, not for a field that is a phone number on one row
 *  and a Zalo user id on the next.
 *
 *  Normalising is therefore entirely the server's job, at write time, before
 *  the row lands in a column carrying `UNIQUE (channel, address)`: an email
 *  address is lowercased, a phone number is turned into E.164, the same rules
 *  `primitives.ts` already applies elsewhere. The web side must NOT invent a
 *  second normaliser of its own — sending the address as typed and trusting
 *  the server to fold it is the only way two spellings of one mailbox do not
 *  quietly become two rows. */
export const identityAddress = textInput(IDENTITY_ADDRESS_MAX)

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

const IdentityFields = z.object({
  id: IdentityId,
  channel: CommsChannel,
  address: identityAddress,
  verifiedAt: Moment.nullable(),
})

/** Any code a thread may hang on.
 *
 *  A UNION, and it is not tidiness — it is the one place the oldest wart in
 *  `ObjectKind` surfaces. `ObjectCode` accepts one to three ASCII capitals
 *  before the dash; the contract book's prefix is not ASCII, which is why
 *  `ContractCode` exists beside it in `../primitives` with a pattern of its
 *  own. Migration 0042 gave `sales.contract.code` a real foreign key into
 *  `platform.object`, so the database now accepts a thread hung on a signed
 *  contract — and without this union the zod pipe would refuse that one layer
 *  earlier, with a message reading "wrong code format" rather than the truth,
 *  which is that one of this product's object kinds is spelled in Vietnamese.
 *
 *  A union rather than a widened `ObjectCode` pattern, on purpose: the day the
 *  identifier clean-up renames that kind, this collapses back to one member and
 *  the removal is a line, not an excavation. */
export const LinkableCode = z.union([ObjectCode, ContractCode], 'Mã object sai dạng')
export type LinkableCode = z.infer<typeof LinkableCode>

/** A discriminated union on `side`, not one object with both fields optional
 *  plus a `superRefine`.
 *
 *  Either would enforce "exactly one of `actorId`/`objectCode`", but only the
 *  union makes it a fact the TYPE states rather than a fact only a runtime
 *  parse checks: `row.side === 'member'` narrows `row.actorId` into scope at
 *  the web end the same way `row.side === 'guest'` narrows `row.objectCode`,
 *  with no `!` and no branch the compiler cannot see. A `superRefine` version
 *  would still let `IdentityRow` TYPE claim both fields are simultaneously
 *  optional everywhere it is read, which is exactly the shape `TouchHolder`'s
 *  docblock warns against ("both fields or neither... an id with no name"). */
export const IdentityRow = z.discriminatedUnion('side', [
  IdentityFields.extend({ side: z.literal('member'), actorId: z.string().min(1).max(64) }),
  IdentityFields.extend({ side: z.literal('guest'), objectCode: LinkableCode }),
])

export type IdentityRow = z.infer<typeof IdentityRow>

// ---------------------------------------------------------------------------
// WRITING ONE
// ---------------------------------------------------------------------------

const IdentityCreateFields = z.object({
  channel: CommsChannel,
  address: identityAddress,
  /** Absent means "not verified yet" — the server's default. Present lets the
   *  one door that mints an identity from a known-good source (resolving
   *  the unmatched queue, where a human just confirmed the
   *  match) skip a separate verify step for the same row. */
  verifiedAt: Moment.nullable().optional(),
})

export const IdentityCreate = z.discriminatedUnion('side', [
  IdentityCreateFields.extend({
    side: z.literal('member'),
    actorId: z.string().min(1).max(64),
  }),
  IdentityCreateFields.extend({ side: z.literal('guest'), objectCode: LinkableCode }),
])

export type IdentityCreate = z.infer<typeof IdentityCreate>

/** `side` is not here, and neither is a way to flip `actorId` for `objectCode`
 *  or back. Once a row exists, WHICH half it points into is not something a
 *  correction touches — it is a different identity wearing the same address,
 *  and `IdentityMerge` is the door for the one legitimate reason two identities
 *  end up describing the same person (a duplicate, not a mistake). A schema
 *  here cannot refuse "patch `actorId` on a row that is actually `guest`"
 *  without reading the row first — the same limit `ContactPatch` documents for
 *  `isPrimary` — so that refusal is the SERVICE's job, not this file's. */
export const IdentityPatch = z
  .object({
    actorId: z.string().min(1).max(64).optional(),
    objectCode: LinkableCode.optional(),
    verifiedAt: Moment.nullable().optional(),
  })
  .refine((p) => !(p.actorId !== undefined && p.objectCode !== undefined), {
    message: 'Chỉ sửa một nửa — actorId hoặc objectCode, không cả hai trong một lượt.',
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'Không có gì để sửa.',
  })

export type IdentityPatch = z.infer<typeof IdentityPatch>

/** Two rows describing one person, folded into one. `keepId` survives;
 *  `mergeId`'s threads, messages and links move onto it and the row itself
 *  goes away — the server's job, this schema only names the two ends so a
 *  caller cannot merge a row with itself. */
export const IdentityMerge = z
  .object({
    keepId: IdentityId,
    mergeId: IdentityId,
  })
  .refine((v) => v.keepId !== v.mergeId, {
    message: 'Không thể gộp một định danh với chính nó.',
  })

export type IdentityMerge = z.infer<typeof IdentityMerge>

// ---------------------------------------------------------------------------
// THE BOOK
// ---------------------------------------------------------------------------

export const IdentityQuery = PageQuery.extend({
  channel: CommsChannel.optional(),
  /** One box — an operator looking for a person types the address they
   *  remember, not a channel first. Matches on a substring of `address`,
   *  the server's job same as `ContactBookQuery.q`. */
  address: z.string().trim().min(1).max(IDENTITY_ADDRESS_MAX).optional(),
})

export type IdentityQuery = z.infer<typeof IdentityQuery>

export const IdentityListResponse = paged(IdentityRow)

export type IdentityListResponse = z.infer<typeof IdentityListResponse>
