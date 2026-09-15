import type { Channel } from '@pv/engines'
import { email, type CommsChannel, type IdentityRow } from '@pv/contracts'
import { invalid } from '@api/platform/http/problem'
import type { IdentityRowDb } from './comms.schema'

/** E4's `Channel` IS A SUBSET OF `CommsChannel` — asserted, not assumed.
 *
 *  The open question `contracts/src/comms/identity.ts` left for this file,
 *  answered the narrower of its two ways: E4 is NOT widened. `'phone'` is a
 *  channel `comms.identity` must carry (a number an inbound call arrives from)
 *  and one E4 has never sent a notification through — adding it to the
 *  notification engine would mint a delivery route with nothing behind it.
 *
 *  So the check runs one direction only. `auth.mapper.ts` asserts EQUALITY with
 *  a pair of identity functions; one of that pair is all that holds here, and
 *  it holds the half that can actually break: the day somebody renames E4's
 *  `'zalo-oa'` or adds a fifth notification channel, this line stops compiling
 *  and the two lists are reconciled by a person. The reverse function does not
 *  exist on purpose — it would reject `'phone'`, the one value this table was
 *  widened to hold. */
export const toCommsChannel = (c: Channel): CommsChannel => c

/** Row → wire, and the one place `side` becomes a narrowed union.
 *
 *  `identity_one_side_only` guarantees exactly one half is filled; the DB types
 *  do not know that, so the two throws below are the seam where a row that
 *  somehow got past the CHECK stops rather than travels on as `actorId: ''`. */
export function toContract(row: IdentityRowDb): IdentityRow {
  const base = {
    id: row.id,
    channel: row.channel,
    address: row.address,
    /* `verifiedAt` is `.nullable()` and NOT `.optional()` in the contract, the
       reverse of every other mapper in this repo: "not verified yet" is the
       normal state of a fresh row and the screen prints it, so the field has to
       arrive rather than vanish. */
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
  }

  if (row.side === 'member') {
    if (!row.actorId) throw new Error('comms.identity: member row has no actor_id')
    return { ...base, side: 'member', actorId: row.actorId }
  }

  if (!row.objectCode) throw new Error('comms.identity: guest row has no object_code')
  return { ...base, side: 'guest', objectCode: row.objectCode }
}

/** E.164: `+`, a country code that does not start with 0, 8…15 digits total. */
const E164 = /^\+[1-9]\d{7,14}$/

/** An address that HAS been through `normaliseAddress`, as a type.
 *
 *  A plain `string` return would have left folding as a call somebody has to
 *  remember, and turn 1 is exactly where it gets forgotten: `resolve.service.ts`
 *  mints identities from webhook payloads, the dirtiest addresses in the system,
 *  and one skipped fold there is two rows for one mailbox with `UNIQUE (channel,
 *  address)` unable to see it — every count in §7 of the vision doc wrong at the
 *  root, silently.
 *
 *  So the brand makes forgetting a COMPILE error: `IdentityRepository.insert`
 *  demands this type, and the only thing in the codebase that produces it is the
 *  function below.
 *
 *  Chosen over the other candidate — folding inside `insert()` itself — because
 *  of the layer rule in `apps/api/CLAUDE.md`: a repository decides nothing, and
 *  folding here can REFUSE (a phone that is not E.164, a mailbox with no `@`),
 *  which is an HTTP decision. Moving it down would put a 400 inside the SQL
 *  layer; the brand gets the same guarantee and leaves the refusal where the
 *  rest of this module's refusals live. */
declare const folded: unique symbol
export type NormalisedAddress = string & { readonly [folded]: true }

/** THE ONE PLACE AN ADDRESS IS FOLDED BEFORE IT TOUCHES THE TABLE.
 *
 *  `UNIQUE (channel, address)` compares bytes. Two spellings of one mailbox are
 *  two rows it cannot see, which is why `identityAddress` in the contract only
 *  checks that a non-blank string arrived and hands the folding to the server —
 *  zod cannot fold what it cannot key on, because the rule depends on `channel`
 *  and a discriminated union is parsed field by field.
 *
 *  Three rules, and the differences between them are the point:
 *
 *   · email — handed to `primitives.email`, the contract's own mailbox rule, not
 *     to a second checker written here. It trims, lowercases and then demands a
 *     real mailbox, so a person's NAME typed into the address box is refused
 *     instead of being filed as an address nothing can ever deliver to. Reusing
 *     it is also what keeps this table and `sales.lead.email` spelling one
 *     mailbox the same way.
 *   · phone — trim, then REQUIRE E.164. It does not call `normalisePhone`, and
 *     that is deliberate: that function assumes `+84` for anything without a
 *     `+` of its own, which is correct for a Vietnamese lead form and wrong
 *     here, where the address arrives from a call log or a webhook and the
 *     country is data rather than a safe assumption. A guessed country code
 *     writes a row that answers to the wrong person, and the UNIQUE fence would
 *     then defend that wrong answer. Refuse instead, and say the shape.
 *   · zalo-oa · telegram · in-app — trim only. Platform user ids are
 *     case-SENSITIVE, so lowercasing them would fold two accounts into one.
 *
 *  Throws rather than returning a flag so there is no call site that can forget
 *  to look; 400 with the field named, the same shape `zod.pipe.ts` produces, so
 *  the screen reddens the address box whichever layer caught it. */
export function normaliseAddress(channel: CommsChannel, raw: string): NormalisedAddress {
  const trimmed = raw.trim()

  if (channel === 'email') {
    const parsed = email.safeParse(trimmed)
    if (!parsed.success) {
      throw invalid({ address: parsed.error.issues.map((i) => i.message) }, 'Hòm thư sai dạng.')
    }
    return parsed.data as NormalisedAddress
  }

  if (channel === 'phone') {
    if (!E164.test(trimmed)) {
      throw invalid(
        {
          address: [
            'Số điện thoại phải viết đủ dạng quốc tế E.164: dấu +, mã nước, rồi số thuê bao — ví dụ +84912345678.',
          ],
        },
        'Số điện thoại sai dạng.',
      )
    }
    return trimmed as NormalisedAddress
  }

  return trimmed as NormalisedAddress
}
