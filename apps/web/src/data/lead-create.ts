import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadCreate, type LeadCreateResponse } from '@pv/contracts'
import type { CurrencyCode, LeadCategory, LeadTier } from '@pv/engines/fixtures/das-vina'
import { api, userMessage, type ApiError, type ApiNeed, type FieldErrors } from '@/app/api'
import {
  createWireOf,
  CREATE_FIELDS,
  isRequiredOnCreate,
  readField,
  type FormValues,
} from '@/data/lead-form'

/** Module 2 · `POST /sales/leads` — the HAND-TYPED door of the lead book.
 *
 *  ------------------------------------------------------------------
 *  WHY A FILE OF ITS OWN AND NOT A SECTION OF `data/leads.ts`
 *  ------------------------------------------------------------------
 *  `data/leads.ts` is the READ side — the book, its facets, and the three
 *  derivations every screen shares. This is the WRITE side, and it asks for a
 *  higher permission (`lead.edit`, not `lead.view`), carries its own body
 *  contract, and has its own failure vocabulary (per-field complaints). None
 *  of that is shared with a query; putting it next to the queries would mean
 *  one file where a reader has to work out which half a given `need` belongs
 *  to. The import door already sits in its own file (`lead-import-wire.ts`)
 *  for the same reason.
 *
 *  ------------------------------------------------------------------
 *  THE FORM IS DERIVED FROM THE CONTRACT, NEVER DECLARED A SECOND TIME
 *  ------------------------------------------------------------------
 *  Two tables already exist and this file writes neither of them again:
 *
 *   · `PROFILE_FIELDS` (`data/lead-form.ts`) knows how a lead field LOOKS —
 *     Vietnamese label, control kind, group, option list, hint.
 *   · `LeadCreate` (`@pv/contracts`) knows what the endpoint ACCEPTS — which
 *     fields exist, which are required, and what each one normalises to.
 *
 *  `CREATE_FIELDS` — the intersection of those two, computed — lives NEXT TO
 *  the blueprint since 17/09, because the profile screen draws it too: one lead
 *  form, three doors (xem · sửa · tạo). What is left here is the WIRE. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

const CREATE_PATH = '/sales/leads'

/** What the route asks for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'lead.edit' })` on
 *  `LeadController.create`).
 *
 *  No `scoped` axis, and that is not an omission: the row does not exist yet,
 *  so there is no `owner_id` to cut by. Compare `BOOK_NEED` in `data/leads.ts`,
 *  which does carry it because a book of existing rows can be cut.
 *
 *  Higher than the read door on purpose — `lead.view` gets you the book,
 *  `lead.edit` gets you a pen. Presales holds the first and not the second. */
const CREATE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit' }

/** Every lead-book query in `data/leads.ts` hangs under this prefix.
 *
 *  Copied rather than imported because `data/leads.ts` exports the query
 *  objects, not the prefix, and this file must not reach into them to invent
 *  one. Two literals is a small duplication with a real cost the day somebody
 *  renames the key — noted here so the rename finds both. */
const LEAD_BOOK_KEY = ['sales', 'lead-book'] as const

/** One lead, typed by a person. 201 answers with the whole row.
 *
 *  `api.write` and not `fetch`: the write door goes through the SAME
 *  interceptor chain as every read — session stamp, dead-session refusal, and
 *  `requireAccess` asking E2 before a byte moves. A bare `fetch` in a
 *  `mutationFn` is a data path that walks around the permission fence, which
 *  is the one thing `app/api/client.ts` exists to make impossible. */
export function createLead(body: LeadCreate, signal?: AbortSignal): Promise<LeadCreateResponse> {
  return api.write<LeadCreateResponse>(CREATE_PATH, {
    method: 'POST',
    body,
    need: CREATE_NEED,
    signal,
  })
}

/** The mutation the create form runs.
 *
 *  `onSuccess` invalidates the book so the lead book refetches behind it.
 *  It deliberately does NOT go looking for the new row: the 201 already
 *  carries the whole `LeadRow`, normalised, and handing that to the caller is
 *  both faster and the only way the person who typed it sees what was actually
 *  stored (mailbox lowercased, runs of spaces collapsed).
 *
 *  Typed `ApiError` because `dispatch` guarantees it — "sau hàm này, không chỗ
 *  nào trong app còn phải đoán mình vừa bắt được cái gì" (`app/api/client.ts`).
 *
 *  No retry is configured and none should be: `mayReplay` already refuses to
 *  replay a POST that reached the wire, because a lead inserted twice is two
 *  rows nothing downstream can tell apart. Guarding the second HUMAN click is
 *  the form's job — see `pending` in `LeadForm`. */
export function useCreateLead() {
  const client = useQueryClient()

  return useMutation<LeadCreateResponse, ApiError, LeadCreate>({
    mutationFn: (body) => createLead(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: LEAD_BOOK_KEY })
    },
  })
}

// ---------------------------------------------------------------------------
// What the thirty boxes start out holding
// ---------------------------------------------------------------------------

/** What a hand-typed lead is unless told otherwise. Somebody sitting down to
 *  type one row has almost always just put the phone down. */
const DEFAULT_MOTION: LeadCreate['motion'] = 'INBOUND'

/** A blank lead, in the SAME shape the profile card edits — that shape is what
 *  lets one form serve both doors.
 *
 *  Written out rather than derived from the field table, because "empty" is a
 *  matter of the column's TYPE: a number nobody has dug out is `null`, not `0`
 *  and not `''`, and `filledSlots` reads exactly that distinction. */
export const emptyDraft = (): FormValues => ({
  legalName: '',
  taxCode: '',
  address: '',
  province: '',
  category: '' as LeadCategory,
  mainProduct: '',
  headcount: null,
  plants: null,

  contactName: '',
  contactTitle: '',
  phone: '',
  email: '',
  channel: '',
  channelUrl: '',

  pain: '',
  currentStack: '',
  decisionMaker: '',
  approver: '',
  budget: null,
  currency: '' as CurrencyCode,
  deadline: '',

  code: '',
  company: '',
  tier: '' as LeadTier,
  source: '',
  owner: '',
  bdOwner: '',
  marketingOwner: '',
  createdAt: '',
  stage: '',
  dealCode: '',
  contractCode: '',
  exitReason: '',

  motion: DEFAULT_MOTION,
})

// ---------------------------------------------------------------------------
// Draft → body
// ---------------------------------------------------------------------------

/** Key that carries a complaint belonging to no single field.
 *
 *  Same string the server uses (`zod.pipe.ts` and `db-error.ts` both fall back
 *  to it) so the form has ONE convention to render, whether the refusal came
 *  from the copy of the contract running here or the copy running there. */
export const ROOT_FIELD = '(gốc)'

export type BuildResult = { ok: true; body: LeadCreate } | { ok: false; errors: FieldErrors }

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

/** Draft → body, validated by THE CONTRACT ITSELF.
 *
 *  ------------------------------------------------------------------
 *  THE SAME SCHEMA THE SERVER RUNS, SO THE FORM CANNOT INVENT A RULE
 *  ------------------------------------------------------------------
 *  Every alternative to this is a second copy of the rules: a `required` flag
 *  per control, a regex for the mailbox, an `if (budget && !currency)`. The
 *  second copy is always the one that is wrong — it refuses what the server
 *  would have taken, or waves through what the server refuses, and either way
 *  the user is arguing with a rule nobody wrote down. Running `LeadCreate`
 *  here means a complaint raised in the browser is word for word the one the
 *  server would have raised, on the same field, in the same Vietnamese.
 *
 *  It is a courtesy, not a fence. The server parses again and has the last
 *  word; the form handles a 400 exactly as it handles this.
 *
 *  ------------------------------------------------------------------
 *  EMPTY IS ABSENT — AND THAT IS WHY OPTIONAL FIELDS ARE OMITTED
 *  ------------------------------------------------------------------
 *  `textInputOptional` turns `''` into `undefined` by itself, so an untouched
 *  text box would survive being sent as `''`. An untouched SELECT or DATE
 *  would not: `LeadCategory.optional()` and `Day.optional()` accept a valid
 *  value or nothing at all, and `''` is neither — the user gets "Invalid
 *  option" on an industry they never chose. So the rule is by absence, not by
 *  control type: leave an optional field out entirely when it is blank.
 *
 *  Required fields keep the opposite treatment — a blank one is SENT as `''`
 *  so the contract answers "Không được để trống" against that field, rather
 *  than the form quietly posting three fields and calling it a lead. */
export function buildLeadCreate(values: FormValues): BuildResult {
  const candidate: Record<string, unknown> = {}

  for (const field of CREATE_FIELDS) {
    const wire = createWireOf(field)
    if (!wire) continue

    const raw = readField(values, field.key)
    if (field.kind === 'num' || field.kind === 'money') {
      /* Every numeric box on this door is optional, so a blank one is simply
         absent. `writeField` already made a cleared box `null`, which reads
         back as `''` here. */
      if (raw !== '') candidate[wire] = Number(raw)
      continue
    }

    if (raw === '' && !isRequiredOnCreate(field)) continue
    candidate[wire] = raw
  }

  const parsed = LeadCreate.safeParse(candidate)
  if (parsed.success) return { ok: true, body: parsed.data }
  return { ok: false, errors: fieldErrorsOf(parsed.error.issues) }
}

/** The one sentence shown above the buttons when the write is refused.
 *
 *  `userMessage` owns this for every failure but one. A 409 here is not two
 *  people editing one row — it is `lead_email_live_idx`, one mailbox already
 *  holding a live lead — and the generic "người khác vừa sửa dữ liệu này, tải
 *  lại rồi làm lại thao tác" sends the user to reload a page that will tell
 *  them exactly the same thing on the next attempt. The server writes a
 *  sentence for that case that names the real fix, so use it.
 *
 *  Trade-off, stated: if a 409 ever arrives without a `title` (a gateway, not
 *  our server), `ApiError.message` falls back to a technical line and the user
 *  sees it. That is a worse sentence than the generic one, and still better
 *  than confidently telling somebody to reload. */
export function createFailureMessage(error: ApiError): string {
  if (error.kind === 'conflict' && error.message !== '') return error.message
  return userMessage(error)
}
