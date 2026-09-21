import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadPatch, type LeadPatchResponse } from '@pv/contracts'
import type { LeadProfile as ProfileForm } from '@pv/engines/fixtures/das-vina'
import { api, type ApiError, type ApiNeed, type FieldErrors } from '@/app/api'
import { ROOT_FIELD } from '@/data/lead-create'
import { changedFields, PROFILE_TO_WIRE, type ProfileField } from '@/data/lead-form'

/** Module 2 · `PATCH /sales/leads/:code` — the autosave door of the profile
 *  card. Since 17/09 there is no save button: a value that leaves a box goes
 *  through here on its own, one field at a time.
 *
 *  IT SENDS THE DIFF, NEVER THE WHOLE PROFILE. `buildLeadPatch` walks
 *  `changedFields` and nothing else. Not about payload size — it is the only
 *  way two people can work on one lead in the same hour: a body carrying all
 *  twenty-one fields would write the untouched ones back with the values this
 *  tab read BEFORE a colleague's edit, and their work would vanish with nothing
 *  on either screen suggesting it had. Autosave narrows the pair it is given to
 *  ONE field, so a refused box cannot drag a good one into the same refusal.
 *
 *  A CLEARED BOX SENDS `null`. The form spells "empty" one way (`''`) and the
 *  wire needs two, so the contract itself is asked which fields may be emptied
 *  (`clearable`) rather than a hand-kept list of two going stale. */

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
const PATCH_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

/** Three prefixes thrown away after a save, and each earns its place:
 *
 *   · `lead-profile` — the card itself, so the re-read carries `requiredFilled`
 *     recomputed by Postgres rather than the count this tab loaded earlier;
 *   · `lead-book` — the book behind the screen prints `contactName`, `phone`,
 *     `contactChannel` and the init-data gate, all of which this door moves;
 *   · `lead-touches` — the server just wrote a `field-filled` row on the timeline,
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
 *  second `field-filled` row on the timeline — one save reading as two sittings. The
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
 *  send (`code`, `stage`, the three owner names, `createdAt`…). `tier` does
 *  map, and `isEditable` keeps it shut until the lead is past verification.
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
    /* The three create-only boxes `changedFields` also tracks
       (`data/lead-form.ts`) — no profile column holds them, so the patch door
       has nothing to send for them. */
    if (key === 'motion' || key === 'origin' || key === 'campaignCode') continue
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

/** What the header meta row says about the last thing typed.
 *
 *  Four branches and never a fifth: with the save button gone, this sentence is
 *  the ONLY thing telling a person whether their correction reached the server,
 *  so "nothing yet" and "saved" must not share a state. `failed` carries its
 *  own wording because the reason is never the same twice. */
export type SaveState =
  { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; message: string }
