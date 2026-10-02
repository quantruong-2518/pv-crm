import { useMemo, useState } from 'react'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { ApiError, FieldErrors } from '@/app/api'
import { missingOf } from '@/data/opportunities'
import {
  draftErrorsOf,
  echoBodyOf,
  updateBodyOf,
  useSaveOpportunity,
} from '@/data/opportunities-write'

/** Module 3 · the deal form's draft — ONE hook behind the three edit drawers.
 *
 *  Each edit drawer of the profile (terms, details, owners — ADR 0077 §5) mounts
 *  its own copy on open, so a box abandoned in one drawer never rides along on
 *  another's save. All send the whole editable set (PATCH); details and owners
 *  echo the stored terms (`echoBodyOf`) so a won deal's lock is not tripped.
 *
 *  ONE WRITE DOOR. A seller picks neither state nor column (ADR 0064), so every
 *  box waits for the Save button; where the deal STANDS moves through the
 *  action bar's doors (`useLogMilestone`, `useStopDeal`), never this draft.
 *
 *  `currency` has no box of its own and rides through `dealBody` untouched: a
 *  form that dropped it would silently rewrite a USD deal as VND. */

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

/** Which drawer the draft serves; decides the body and the completeness check. */
export type DealEditPart = 'terms' | 'details' | 'owners'

export type DealDraft = {
  work: OpportunityDraft
  set: SetDraft
  errors: FieldErrors
  dirty: string[]
  missing: string[]
  /** The server's two edit verdicts (ADR 0077 §5): terms (amount, close date,
   *  products) shut while a signature waits and once signed; details until lost. */
  canEditTerms: boolean
  canEditDetails: boolean
  /** Complete and changed; the drawer adds its own verdict on top. */
  canSubmit: boolean
  busy: boolean
  error: ApiError | null
  reset: () => void
  submit: (onSaved?: () => void) => void
}

/** Printed on the profile's value strip and on the locked boxes alike. */
export const WAITING_SIGN = 'Giá trị và Sale đứng đơn tạm khoá trong lúc chờ duyệt ký.'

export type UseDealDraftArgs = {
  /** The server's copy of the form. */
  saved: OpportunityDraft
  /** The stored row. A deal is opened in the drawer of
   *  `components/convert-dialog.tsx`, which also carries its contacts. */
  op: OpportunityProfileResponse
  part: DealEditPart
}

export function useDealDraft({ saved, op, part }: UseDealDraftArgs): DealDraft {
  const canEditTerms = op.acts.editTerms.ok
  const canEditDetails = op.acts.editDetails.ok
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

  const dirty = useMemo(() => changedFields(saved, work), [saved, work])
  /* Only the terms drawer owns the required boxes; the others echo them. */
  const body = part === 'terms' ? updateBodyOf(work) : echoBodyOf(op, work)
  const missing = part === 'terms' ? missingOf(work) : []
  const busy = save.isPending
  const error = save.error

  const submit = (onSaved?: () => void) => {
    /* The server names the box it refused and `draftErrorsOf` turns its
       spelling into the form's. An EMPTY map is a complaint about no one box,
       not the absence of a complaint — the sticky bar carries those. */
    if (!body) return
    save.mutate(body, {
      onSuccess: () => onSaved?.(),
      onError: (failure: ApiError) => setErrors(draftErrorsOf(failure.errors)),
    })
  }

  return {
    work,
    set,
    errors,
    dirty,
    missing,
    canEditTerms,
    canEditDetails,
    canSubmit: missing.length === 0 && !busy && dirty.length > 0,
    busy,
    error,
    reset: () => {
      setWork(saved)
      setErrors({})
    },
    submit,
  }
}
