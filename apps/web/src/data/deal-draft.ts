import { useMemo, useState } from 'react'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { ApiError, FieldErrors } from '@/app/api'
import { useCan } from '@/app/auth'
import { missingOf } from '@/data/opportunities'
import { draftErrorsOf, updateBodyOf, useSaveOpportunity } from '@/data/opportunities-write'

/** Module 3 · the deal form's draft — ONE hook behind both write doors.
 *
 *  The form card and the sticky bar are two blocks of the same screen and they
 *  type into the same boxes, so neither of them may own the draft; the same
 *  split `useLeadDraft` made for the lead screens.
 *
 *  ONE WRITE DOOR NOW. The status box is gone with ADR 0064 — a seller picks
 *  neither state nor column, so this draft carries no cell that writes itself
 *  through, and every box waits for the Save button. Where the deal STANDS moves
 *  through the two doors on the sticky bar (`useLogMilestone`, `useStopDeal`),
 *  which touch the server row and never this draft.
 *
 *  `probability` and `currency` have no box on screen since 17/09 and still
 *  ride through here untouched: they are carried by `dealBody`, and a form
 *  that dropped them would silently rewrite a USD deal as VND. */

/** Which boxes of the form a person may change. Exactly `OpportunityUpdate`'s
 *  field set — change one side and change the other. */
const EDITABLE = [
  'name',
  'closedDate',
  'amount',
  'currency',
  'saleOwners',
  'bdOwners',
  'probability',
  'products',
  'description',
  'attachments',
] as const satisfies readonly (keyof OpportunityDraft)[]

export type SetDraft = <K extends keyof OpportunityDraft>(
  key: K,
  value: OpportunityDraft[K],
) => void

const sameValue = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b

/** Which boxes differ between two copies of the form.
 *
 *  Compared box by box rather than object to object: two objects never share a
 *  reference, and a dirty flag that is always on is a dirty flag worth nothing.
 *  The three array boxes compare by content — picking a person and unpicking
 *  them has to read as "nothing changed". */
function changedFields(base: OpportunityDraft, work: OpportunityDraft): string[] {
  return EDITABLE.filter((key) => !sameValue(base[key], work[key]))
}

/** A newer server copy, with whatever the person has already typed kept on top.
 *
 *  Plain re-seeding is what this replaces, and it lost work: recording a
 *  milestone writes a new row into the cache mid-edit, so every other box the
 *  person had touched would snap back to the server's answer under their hands. */
function rebase(
  stale: OpportunityDraft,
  work: OpportunityDraft,
  next: OpportunityDraft,
): OpportunityDraft {
  const out = { ...next }
  for (const key of EDITABLE) {
    if (!sameValue(stale[key], work[key])) Object.assign(out, { [key]: work[key] })
  }
  return out
}

export type DealDraft = {
  work: OpportunityDraft
  set: SetDraft
  /** Amount and the sale owners, locked while a signature is in play. */
  moneyLocked: boolean
  moneyHint: string | null
  /** The SALE lane: editable only at `new`; after accept the assign door is
   *  the only way in, for everyone (ADR 0071). */
  saleLocked: boolean
  saleHint: string | null
  errors: FieldErrors
  dirty: string[]
  missing: string[]
  /** The server's `acts.edit` verdict for this reader on this deal — a stopped
   *  deal (ADR 0069 §1) and an out-of-scope reader both turn the form read-only. */
  canEdit: boolean
  canClose: boolean
  canSubmit: boolean
  busy: boolean
  error: ApiError | null
  reset: () => void
  submit: () => void
}

export const WAITING_SIGN = 'Đơn đang chờ duyệt ký — tiền, đồng tiền và Sale đứng đơn tạm khoá.'

export const SIGNED_MONEY_NEEDS_CLOSE =
  'Đổi tiền/người ăn hoa hồng của đơn đã ký cần quyền chốt đơn.'

export const SALE_BY_ASSIGN =
  'Đã nhận PIC — chỉ trưởng phòng Kinh doanh đổi được Sale, qua nút Giao Sale.'

export type UseDealDraftArgs = {
  /** The server's copy of the form. */
  saved: OpportunityDraft
  /** The stored row. A deal is opened in the drawer of
   *  `components/convert-dialog.tsx`, which also carries its contacts. */
  op: OpportunityProfileResponse
}

export function useDealDraft({ saved, op }: UseDealDraftArgs): DealDraft {
  const canEdit = op.acts.edit.ok
  const canClose = useCan('opportunity.close')
  const save = useSaveOpportunity(op.code)

  const [work, setWork] = useState<OpportunityDraft>(saved)
  const [errors, setErrors] = useState<FieldErrors>({})

  /* Adjusting state during render rather than in an effect, React's own
     pattern: an effect runs after the paint, so stepping to another deal would
     flash the previous deal's answers for one frame. */
  const [priorSaved, setPriorSaved] = useState(saved)
  if (priorSaved !== saved) {
    setPriorSaved(saved)
    setWork((w) => rebase(priorSaved, w, saved))
    setErrors({})
  }

  /* Typing into a box the server just refused clears that refusal. A red mark
     surviving the fix reads as "still wrong", and people stop believing the
     other red marks on the form. */
  const set: SetDraft = (key, value) => {
    setWork((w) => ({ ...w, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const signed = op.state === 'won'
  const waiting = Boolean(op.pendingSign)
  const moneyLocked = waiting || (signed && !canClose)
  /* Past `new` the PATCH refuses any SALE change, for everyone (ADR 0071), so
     the box shuts before anyone types into it. */
  const accepted = Boolean(op.acceptedBy) || op.stage !== 'new'
  const moneyHint = waiting ? WAITING_SIGN : moneyLocked ? SIGNED_MONEY_NEEDS_CLOSE : null

  const dirty = useMemo(() => changedFields(saved, work), [saved, work])
  const missing = missingOf(work)
  const busy = save.isPending
  const error = save.error

  const submit = () => {
    /* The server names the box it refused and `draftErrorsOf` turns its
       spelling into the form's. An EMPTY map is a complaint about no one box,
       not the absence of a complaint — the sticky bar carries those. */
    save.mutate(updateBodyOf(work), {
      onError: (failure: ApiError) => setErrors(draftErrorsOf(failure.errors)),
    })
  }

  return {
    work,
    set,
    moneyLocked,
    moneyHint,
    saleLocked: moneyLocked || accepted,
    saleHint: waiting ? WAITING_SIGN : accepted ? SALE_BY_ASSIGN : moneyHint,
    errors,
    dirty,
    missing,
    canEdit,
    canClose,
    canSubmit: canEdit && missing.length === 0 && !busy && dirty.length > 0,
    busy,
    error,
    reset: () => {
      setWork(saved)
      setErrors({})
    },
    submit,
  }
}
