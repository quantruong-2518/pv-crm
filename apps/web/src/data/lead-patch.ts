import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadPatch, type LeadPatchResponse } from '@pv/contracts'
import type { LeadProfile as ProfileForm } from '@pv/engines/fixtures/das-vina'
import { api, type ApiError, type ApiNeed, type FieldErrors } from '@/app/api'
import { PROFILE_TO_WIRE, ROOT_FIELD } from '@/data/lead-create'
import { changedFields, PROFILE_FIELDS, type ProfileField } from '@/data/lead-form'

/** Module 2 · `PATCH /sales/leads/:code` — the SAVE button of the profile card.
 *
 *  ------------------------------------------------------------------
 *  THE DOOR THAT REPLACES A DRAWER
 *  ------------------------------------------------------------------
 *  Until this file existed, the save button wrote into `useLeadDesk.profiles`
 *  — a zustand store in the browser. It looked like saving and behaved like
 *  saving right up to the moment somebody opened the same lead on another
 *  machine, and then the correction was simply gone. That store is now off the
 *  profile path entirely; the server is the only thing that remembers.
 *
 *  ------------------------------------------------------------------
 *  IT SENDS THE DIFF, NEVER THE WHOLE PROFILE
 *  ------------------------------------------------------------------
 *  `buildLeadPatch` walks `changedFields` and nothing else, so a body carries
 *  the three boxes a person touched and stays silent about the other eighteen.
 *  That is not about payload size — it is the only way two people can work on
 *  one lead in the same hour. A body carrying all twenty-one would write the
 *  eighteen untouched fields back with the values this tab read BEFORE the
 *  colleague's edit, and their work would disappear with nothing on either
 *  screen suggesting it had.
 *
 *  ------------------------------------------------------------------
 *  A CLEARED BOX SENDS `null`, WHICH IS WHY THIS FILE ASKS THE SCHEMA
 *  ------------------------------------------------------------------
 *  The form has one spelling for "empty" (`''`) and the wire needs two — `null`
 *  to clear a column, `''` on the two NOT NULL fields so the contract refuses it
 *  ITSELF, against that box, rather than the form inventing a second sentence
 *  about a rule it does not own. Worth knowing what that refusal says: emptying
 *  the name gives the blank-field complaint, while emptying the mailbox gives
 *  the malformed-mailbox one, because `email` checks a shape and `''` has none.
 *  Not lovely, and deliberately not fixed here — the create drawer answers a
 *  blank mailbox with exactly the same sentence, and one door quietly wording
 *  it better is how two doors start disagreeing about one rule.
 *
 *  Which field is which is ASKED of `LeadPatch` (`clearable` below), never
 *  listed here: a hand-written list of two would be a second place to keep in
 *  step, and the day the contract makes a third field nullable this follows in
 *  the same commit. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

/** Word for word with the `@Need` on `LeadController.patch` — same branch,
 *  same permission (the pen, not the reader), and `scoped: true`.
 *
 *  `scoped` is here while `CREATE_NEED` omits it, and the difference is real:
 *  a create has no row yet to cut by owner, while a patch names an existing
 *  lead and the server refuses one standing in somebody else's name — the same
 *  refusal, in the same words, that `GET /sales/leads/:code` already gives. */
const PATCH_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.sửa', scoped: true }

/** Three prefixes thrown away after a save, and each earns its place:
 *
 *   · `lead-profile` — the card itself, so the re-read carries `requiredFilled`
 *     recomputed by Postgres rather than the count this tab loaded earlier;
 *   · `lead-book` — the book behind the screen prints `contactName`, `phone`,
 *     `contactChannel` and the init-data gate, all of which this door moves;
 *   · `lead-touches` — the server just wrote a `dien-o` row on the timeline,
 *     and the timeline card is on this very page.
 *
 *  Copied strings rather than imported objects, same debt `lead-owner.ts` and
 *  `lead-create.ts` both record: those files export query objects, not their
 *  prefixes. Noted here so a rename finds all three. */
const TOUCHED_KEYS = [
  ['sales', 'lead-book'],
  ['sales', 'lead-profile'],
  ['sales', 'lead-touches'],
] as const

export const patchPath = (code: string) => `/sales/leads/${encodeURIComponent(code)}`

export type PatchInput = { code: string; body: LeadPatch }

/** The mutation the profile card runs.
 *
 *  No retry, and for a different reason than `useCreateLead`: a repeated PATCH
 *  is harmless because it writes the same values twice, but it also writes a
 *  second `dien-o` row on the timeline — one save reading as two sittings. The
 *  human double-click is guarded by `isPending` in the card. */
export function useUpdateLeadProfile() {
  const client = useQueryClient()

  return useMutation<LeadPatchResponse, ApiError, PatchInput>({
    mutationFn: ({ code, body }) =>
      api.write<LeadPatchResponse>(patchPath(code), {
        method: 'PATCH',
        body,
        need: PATCH_NEED,
      }),
    onSuccess: () => {
      for (const key of TOUCHED_KEYS) void client.invalidateQueries({ queryKey: key })
    },
  })
}

// ---------------------------------------------------------------------------
// Draft → body
// ---------------------------------------------------------------------------

type PatchKey = keyof LeadPatch

/** Narrowed to the one method this file asks the schema for, same reason
 *  `lead-create.ts` narrows it: `apps/web` does not depend on zod. */
type FieldProbe = { safeParse: (value: unknown) => { success: boolean } }

const SHAPE = LeadPatch.shape as Record<PatchKey, FieldProbe>

/** May this field be emptied? True for every box but the two NOT NULL columns
 *  (`contactName`, `email`), asked of the contract rather than listed. */
const clearable = (key: PatchKey) => SHAPE[key].safeParse(null).success

/** Which `LeadPatch` field a drawn profile field writes into — `undefined` when
 *  the contract has no such field, which is how the save drops what it must not
 *  send (`code`, `tier`, `stage`, the three owner names, `createdAt`…).
 *
 *  The cast is the one `PROFILE_TO_WIRE` documents: the table is typed against
 *  `LeadCreate`, and every name the two contracts share they spell the same. */
function wireKeyOf(key: ProfileField['key']): PatchKey | undefined {
  const renamed = PROFILE_TO_WIRE[key] as PatchKey | undefined
  if (renamed) return renamed in SHAPE ? renamed : undefined
  return key in SHAPE ? (key as PatchKey) : undefined
}

export type PatchResult = { ok: true; body: LeadPatch } | { ok: false; errors: FieldErrors }

function fieldErrorsOf(
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || ROOT_FIELD
    ;(errors[key] ??= []).push(issue.message)
  }
  return errors
}

/** What changed between the stored profile and the one on screen, as a body.
 *
 *  Validated by THE CONTRACT ITSELF before it leaves, for the reason
 *  `buildLeadCreate` spells out at length: any second copy of the rules is the
 *  one that turns out to be wrong, and a complaint raised here is then word for
 *  word the one the server would have raised, on the same field.
 *
 *  Returns `ok: false` with a root complaint when nothing changed. The card
 *  disables the button in that state, so reaching it means the diff and the
 *  button disagree — and answering with a silent no-op would hide that. */
export function buildLeadPatch(base: ProfileForm, work: ProfileForm): PatchResult {
  const candidate: Record<string, unknown> = {}

  for (const key of changedFields(base, work)) {
    const wire = wireKeyOf(key)
    if (!wire) continue

    const value = work[key]
    /* `''` means two different things depending on the column, and `clearable`
       is the only thing that knows which. Numbers arrive as `number | null`
       already — `writeField` made that distinction when the box was typed in,
       and an empty number box is `null`, not `0`. */
    candidate[wire] = value === '' && clearable(wire) ? null : value
  }

  const parsed = LeadPatch.safeParse(candidate)
  if (parsed.success) return { ok: true, body: parsed.data }
  return { ok: false, errors: fieldErrorsOf(parsed.error.issues) }
}

/** Contract field name → the Vietnamese label of the box that carries it.
 *
 *  The server answers with `{ currency: […] }`, keyed by CONTRACT field, while
 *  the profile card knows its boxes by profile field. Rather than outlining the
 *  box — which would mean threading an error map through four components for a
 *  screen that saves twenty-one fields at once — the card prints
 *  the label and the complaint side by side beside the button, and this is what turns the first half of
 *  that sentence into something a person recognises.
 *
 *  Falls back to the wire name: a complaint nobody can place is still better
 *  than a complaint nobody can see. */
export function patchFieldLabel(wire: string): string {
  const field = PROFILE_FIELDS.find((f) => wireKeyOf(f.key) === wire)
  return field?.label ?? wire
}
