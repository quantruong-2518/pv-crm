import type { ObjectRef } from '@pv/engines'
import type { LeadCreate, LeadIntakeBody } from '@pv/contracts'
import type { lead } from './lead.schema'

/** Contract shapes → column values, for the THREE write doors of the book.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT IN `lead.mapper.ts`
 *  ------------------------------------------------------------------
 *  That file maps the READ direction — a row that came out of the table into
 *  `LeadRow`, and a row into the `ObjectRef` the rail draws. This one maps the
 *  WRITE direction, and the two are not symmetric: the read side always has a
 *  complete `LeadRowDb` in hand, while the write side has a draft with no
 *  `code` yet, because the code is minted between the two halves of the
 *  transaction (see `lead-write.repository.ts`).
 *
 *  ------------------------------------------------------------------
 *  THE MIRROR ROW IS BUILT FROM THE DRAFT, NOT FROM THE STORED ROW
 *  ------------------------------------------------------------------
 *  `platform.object` has to hold the row BEFORE `sales.lead` does — the
 *  foreign key on `lead.code` refuses the insert otherwise. So `refOf` cannot
 *  call `lead.mapper.ts#toRef`, which takes a `LeadRowDb` that does not exist
 *  yet at that moment. It builds the SAME SHAPE from the draft instead, and
 *  that shape is the thing to keep in step: `kind: 'LD'`, `branch: 'Sales'`,
 *  `label` = company, `owner` = the DISPLAY NAME of the holder, `state` =
 *  stage. Change one side and change the other. */

/** Column values for one `sales.lead` row, minus the key.
 *
 *  `code` is absent on purpose: a draft that carried one would invite a caller
 *  to invent it, and the only legal source is `LeadRepository.nextCode()`. */
export type LeadValues = Omit<typeof lead.$inferInsert, 'code'>

/** One lead about to be written, plus the one thing the mirror row needs that
 *  is not a column of `sales.lead`.
 *
 *  `ownerName` travels beside the values rather than inside them because
 *  `lead` stores `owner_id` while `platform.object` stores a display name —
 *  debt #2 of `docs/ban-giao-backend.md`, the same split `lead.mapper.ts#toRef`
 *  lives with on the read side. Null means the lead is in the common pool. */
export type LeadWrite = {
  values: LeadValues
  ownerName: string | null
}

/** The mirror row for a draft, once its code has been minted.
 *
 *  Same shape as `lead.mapper.ts#toRef` — see the note at the top of this
 *  file for why it cannot simply call it. */
export function refOf(code: string, write: LeadWrite): ObjectRef {
  return {
    code,
    kind: 'LD',
    branch: 'Sales',
    label: write.values.company,
    ...(write.ownerName ? { owner: write.ownerName } : {}),
    ...(write.values.stage ? { state: write.values.stage } : {}),
  }
}

/** `POST /sales/leads` body → column values.
 *
 *  Nothing is normalised here and that is deliberate: `LeadCreate` already
 *  trimmed, collapsed, lowercased the mailbox and turned every `''` into
 *  `undefined` (see the docblock on `LeadCreate`). Normalising a second time
 *  is a second place for the two conventions to drift, and the one that would
 *  drift is the one nobody re-reads.
 *
 *  Four groups of columns are NOT written and each has its own reason:
 *   · `code`, `createdAt`, `stageSince`, `score` — minted or defaulted by the
 *     server; see `LeadValues` above and the column defaults.
 *   · `tier`, `stage` — withheld by the contract. A hand-typed lead has passed
 *     no gate, so it stands at no rung of the funnel yet.
 *   · `exitReason`, `exitedAt` — a lead cannot be born already lost.
 *   · `sourceKind` — set here, not accepted from the caller: the system records
 *     where a row came from. `MANUAL` reads as `KHAI_BAO` in `CHANNEL_TRUST`
 *     (somebody here put their name on every cell they typed), and a trust
 *     level the client asserted about itself would be worth nothing. Trust is
 *     derived, never stored. The caller may still name a CAMPAIGN — that half
 *     of the origin is attribution, not a trust claim. */
export function fromCreate(body: LeadCreate, ownerName: string | null): LeadWrite {
  return {
    ownerName,
    values: {
      company: body.company,
      contactName: body.contactName,
      email: body.email,

      legalName: body.legalName ?? null,
      taxCode: body.taxCode ?? null,
      address: body.address ?? null,
      province: body.province ?? null,
      category: body.category ?? null,
      mainProduct: body.mainProduct ?? null,
      headcount: body.headcount ?? null,
      plants: body.plants ?? null,

      contactTitle: body.contactTitle ?? null,
      phone: body.phone ?? null,
      contactChannel: body.contactChannel ?? null,

      pain: body.pain ?? null,
      currentStack: body.currentStack ?? null,
      decisionMaker: body.decisionMaker ?? null,
      approver: body.approver ?? null,
      budget: body.budget ?? null,
      currency: body.currency ?? null,
      deadline: body.deadline ?? null,

      ownerId: body.ownerId ?? null,
      bdOwnerId: body.bdOwnerId ?? null,
      marketingOwnerId: body.marketingOwnerId ?? null,

      sourceKind: 'MANUAL',
      motion: body.motion,
      campaignId: body.campaignId ?? null,
    },
  }
}

/** Public landing form → the smallest valid lead row. Origin and motion are
 *  stamped by the server; anonymous callers cannot choose either.
 *
 *  No `campaignId`: the form posts UTM parameters, and a UTM string is not a
 *  campaign id. Mapping one to the other needs a lookup table nobody has
 *  agreed on yet, and guessing it would attribute real leads to the wrong
 *  campaign — worse than attributing them to none. The raw UTMs are kept on
 *  `sales.lead_intake`, so nothing is lost while that table is designed. */
export function fromIntake(body: LeadIntakeBody): LeadWrite {
  return {
    ownerName: null,
    values: {
      company: body.company,
      contactName: body.contactName,
      email: body.email,
      phone: body.phone ?? null,
      province: body.province ?? null,
      pain: body.pain ?? null,
      sourceKind: 'LANDING_PAGE',
      motion: 'INBOUND',
    },
  }
}
