import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadCreate, MOTION_BY_CHANNEL, type LeadCreateResponse } from '@pv/contracts'
import { api, userMessage, type ApiError, type ApiNeed, type FieldErrors } from '@/app/api'
import {
  PROFILE_FIELDS,
  PROFILE_GROUPS,
  type FieldKind,
  type GroupKey,
  type ProfileField,
} from '@/data/lead-form'

/** Module 2 · `POST /sales/leads` — the HAND-TYPED door of the lead book.
 *
 *  ------------------------------------------------------------------
 *  WHY A FILE OF ITS OWN AND NOT A SECTION OF `data/leads.ts`
 *  ------------------------------------------------------------------
 *  `data/leads.ts` is the READ side — the book, its facets, and the three
 *  derivations every screen shares. This is the WRITE side, and it asks for a
 *  higher permission (`lead.sửa`, not `lead.xem`), carries its own body
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
 *  `CREATE_FIELDS` below is the intersection of those two, computed. Nothing
 *  is enumerated by hand, and that is the point: the day the contract drops a
 *  field or makes one required, the form follows in the same commit as the
 *  contract instead of drifting until somebody notices a control the server
 *  refuses to hear about. */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

const CREATE_PATH = '/sales/leads'

/** What the route asks for, in the SAME words `apps/api` uses on the other end
 *  (`@Need({ branch: 'Sales', permission: 'lead.sửa' })` on
 *  `LeadController.create`).
 *
 *  No `scoped` axis, and that is not an omission: the row does not exist yet,
 *  so there is no `owner_id` to cut by. Compare `BOOK_NEED` in `data/leads.ts`,
 *  which does carry it because a book of existing rows can be cut.
 *
 *  Higher than the read door on purpose — `lead.xem` gets you the book,
 *  `lead.sửa` gets you a pen. Presales holds the first and not the second. */
const CREATE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.sửa' }

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

/** The mutation the dialog runs.
 *
 *  `onSuccess` invalidates the book so the table behind the dialog refetches.
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
 *  the form's job — see `isPending` in the dialog. */
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
// Which of the profile fields this door actually carries
// ---------------------------------------------------------------------------

type CreateKey = keyof LeadCreate

/** The contract's own field table, read structurally.
 *
 *  Only two questions are asked of it — "does this field exist" and "may it be
 *  absent" — so the type is narrowed to the one method that answers them
 *  rather than dragging zod's types into `apps/web`, which does not depend on
 *  zod and should not start. */
type FieldProbe = { safeParse: (value: unknown) => { success: boolean } }

const SHAPE = LeadCreate.shape as Record<CreateKey, FieldProbe>

/** Is this field required?
 *
 *  ASKED OF THE SCHEMA, never listed by hand. A field is required exactly when
 *  the contract refuses `undefined` for it, which today means `company`,
 *  `contactName`, `email` (the three NOT NULL columns) and `motion`. A
 *  hand-written list of four would be a fifth place to keep in step, and the
 *  star on a label that disagrees with the server is worse than no star: the
 *  user fills the form, presses the button, and is told about a field that
 *  carried no mark. */
const requiredOnWire = (key: CreateKey) => !SHAPE[key].safeParse(undefined).success

/** The one field the two books spell differently.
 *
 *  `LeadProfile.channel` is `LeadCreate.contactChannel` — same value set
 *  (`ContactChannel`), two names, because the profile calls it "the channel"
 *  while the table has a `contact_channel` column and a `contact_*` family
 *  around it. Kept as a one-entry table rather than renamed on either side:
 *  renaming the profile field touches the fixture, the gate (`SLOT_FIELDS`)
 *  and four screens for a cosmetic win. */
const RENAMED: Partial<Record<ProfileField['key'], CreateKey>> = { channel: 'contactChannel' }

/** Which `LeadCreate` field a drawn profile field writes into — `undefined`
 *  when the contract has no such field, which is how the create form drops
 *  what it must not send.
 *
 *  This is the whole filter, and it needs no exclusion list. Everything the
 *  sketch says to leave out is already absent from `LeadCreate`, for reasons
 *  the contract states itself:
 *
 *   · `tier` · `stage` — withheld. A freshly typed lead has passed no gate and
 *     opened no opportunity; a client that can name its own tier can claim a
 *     gate it never went through.
 *   · `owner` · `bdOwner` · `marketingOwner` — the contract takes ACTOR IDS
 *     (`ownerId`…), never names, so the three name-valued profile fields match
 *     nothing here and fall out on their own. A new lead lands in the common
 *     pool with nobody holding it, exactly like the rows the importer makes.
 *   · `code` · `createdAt` · `dealCode` · `contractCode` · `exitReason` —
 *     the system's own bookkeeping, and all `kind: 'read'` besides.
 *   · `source` — present in the contract but `kind: 'read'` on the profile, so
 *     the read filter drops it. Right answer for the wrong-looking reason, and
 *     the contract agrees: a lead typed in by hand belongs to no campaign, and
 *     inventing a source code creates a source that is in no source book. */
function wireKeyOf(key: ProfileField['key']): CreateKey | undefined {
  const renamed = RENAMED[key]
  if (renamed) return renamed
  return key in SHAPE ? (key as CreateKey) : undefined
}

/** One control on the create form.
 *
 *  Keyed by the WIRE name, not the profile name, and that is the decision that
 *  makes per-field errors work: `ApiError.errors` arrives keyed by contract
 *  field (`{ email: […] }`, `{ currency: […] }`), so a draft keyed the same way
 *  needs no translation table between "what the server complained about" and
 *  "which box to outline". One rename lives in `RENAMED`; nothing else has two
 *  names anywhere in this file. */
export type CreateField = {
  wire: CreateKey
  label: string
  kind: FieldKind
  group: GroupKey
  required: boolean
  hint?: string
  placeholder?: string
  unit?: string
  mono?: boolean
  options?: { value: string; label: string }[]
}

/** Vietnamese for the five motions the `MANUAL` door can carry.
 *
 *  NOT read from `MOTION_FACE` in `data/intake.ts`, and this is deliberate:
 *  that table is keyed by the ENGINE's lower-case spelling (`inbound`), while
 *  the wire speaks `INBOUND`. Reaching across would mean a `.toUpperCase()`
 *  somewhere, and `@pv/contracts/sales/enums.ts` states that the conversion
 *  between the two spellings has exactly ONE legal site — `lead.mapper.ts` on
 *  the server — "a second conversion site is how two spellings start to drift,
 *  so there must not be one." A label table is not a conversion; labels are
 *  view-layer knowledge, and this one is keyed by the values actually sent.
 *
 *  Typed as a full `Record` over the narrowed union on purpose: widen or
 *  narrow `MOTION_BY_CHANNEL.MANUAL` and this stops compiling. */
const MOTION_LABEL: Record<LeadCreate['motion'], string> = {
  INBOUND: 'Inbound · khách tự tìm tới mình',
  OUTBOUND: 'Outbound · mình đi tìm khách',
  REFERRAL: 'Giới thiệu · khách cũ chỉ sang',
  PARTNER: 'Đối tác · đại lý đẩy khách sang',
  RECYCLE: 'Đánh thức lại · lead cũ quay lại',
}

/** What a hand-typed lead is unless told otherwise. Somebody sitting down to
 *  type one row has almost always just put the phone down. */
export const DEFAULT_MOTION: LeadCreate['motion'] = 'INBOUND'

/** Motion has no `PROFILE_FIELDS` row to reuse — it is not part of a lead's
 *  profile at all, it is how the lead got here — so it is the one control this
 *  file describes itself.
 *
 *  Five options, taken from `MOTION_BY_CHANNEL.MANUAL` rather than listed:
 *  `EVENT` is missing from that row because an event arrives as a LIST, and a
 *  hand-typed row claiming to be an event lead is a row nobody can trace back
 *  to an event. Listing the five here by hand would be a promise to remember
 *  that reasoning every time the table changes. */
const MOTION_FIELD: CreateField = {
  wire: 'motion',
  label: 'Thế',
  kind: 'select',
  group: 'so',
  required: true,
  hint: 'Ai chủ động. Lead của một sự kiện về theo danh sách, không gõ tay từng dòng.',
  options: MOTION_BY_CHANNEL.MANUAL.map((motion) => ({
    value: motion,
    label: MOTION_LABEL[motion],
  })),
}

/** Placeholder row for an OPTIONAL select whose option list has no "nothing
 *  chosen" entry of its own.
 *
 *  `CHANNEL_OPTIONS` in `data/lead-form.ts` already opens with one ("Chưa moi
 *  được kênh nào") because the profile form needs to un-set it; the industry
 *  and currency lists do not, because on a lead that already exists those are
 *  always set. On a blank create form they are not, and a select with no empty
 *  row silently posts its first option — an industry nobody chose. */
const EMPTY_OPTION = { value: '', label: '— chưa có —' }

function optionsOf(field: ProfileField, required: boolean) {
  if (field.kind !== 'select') return undefined
  const options = field.options ?? []
  if (required || options[0]?.value === '') return options
  return [EMPTY_OPTION, ...options]
}

/** The form, computed. Profile order is kept; `motion` is appended, which puts
 *  it right after `company` because those two are the only survivors of the
 *  book group. */
export const CREATE_FIELDS: CreateField[] = [
  ...PROFILE_FIELDS.flatMap((field): CreateField[] => {
    if (field.kind === 'read') return []
    const wire = wireKeyOf(field.key)
    if (!wire) return []
    const required = requiredOnWire(wire)
    return [
      {
        wire,
        label: field.label,
        kind: field.kind,
        group: field.group,
        required,
        hint: field.hint,
        placeholder: field.placeholder,
        unit: field.unit,
        mono: field.mono,
        options: optionsOf(field, required),
      },
    ]
  }),
  MOTION_FIELD,
]

/** Group order, and the book group comes FIRST here.
 *
 *  On the profile screen "Sổ sách" is last and collapsed, because there it is
 *  twelve fields the system wrote itself. On a create form the same group is
 *  down to two controls, both required, and burying the first thing anyone
 *  types under twenty optional ones is how a form gets abandoned halfway. Its
 *  own label and purpose line for the same reason — "Hệ tự ghi, đọc là chính"
 *  is a true sentence about the profile screen and a false one about this. */
export const CREATE_GROUPS: { key: GroupKey; label: string; purpose: string }[] = [
  { key: 'so', label: 'Dòng đầu sổ', purpose: 'Tên trong sổ và thế — hai ô đòi ngay.' },
  ...PROFILE_GROUPS.filter((group) => group.key !== 'so').map((group) => ({
    key: group.key as GroupKey,
    label: group.label as string,
    purpose: group.purpose as string,
  })),
]

export const createFieldsOf = (group: GroupKey) => CREATE_FIELDS.filter((f) => f.group === group)

// ---------------------------------------------------------------------------
// Draft → body
// ---------------------------------------------------------------------------

/** What the controls hold: raw strings, keyed by wire name. Strings all the
 *  way, including the three numeric fields — an `<input>` has no numbers, and
 *  a draft that pretends otherwise has to decide what a half-typed number is
 *  before the user has finished typing it. */
export type LeadDraft = Partial<Record<CreateKey, string>>

export const emptyDraft = (): LeadDraft => ({ motion: DEFAULT_MOTION })

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
 *  word; the dialog handles a 400 exactly as it handles this.
 *
 *  ------------------------------------------------------------------
 *  EMPTY IS ABSENT — AND THAT IS WHY OPTIONAL FIELDS ARE OMITTED
 *  ------------------------------------------------------------------
 *  `textNhapTuyChon` turns `''` into `undefined` by itself, so an untouched
 *  text box would survive being sent as `''`. An untouched SELECT or DATE
 *  would not: `LeadCategory.optional()` and `Ngay.optional()` accept a valid
 *  value or nothing at all, and `''` is neither — the user gets "Invalid
 *  option" on an industry they never chose. So the rule is by absence, not by
 *  control type: leave an optional field out entirely when it is blank.
 *
 *  Required fields keep the opposite treatment — a blank one is SENT as `''`
 *  so the contract answers "Không được để trống" against that field, rather
 *  than the form quietly posting three fields and calling it a lead. */
export function buildLeadCreate(draft: LeadDraft): BuildResult {
  const candidate: Record<string, unknown> = {}

  for (const field of CREATE_FIELDS) {
    const raw = draft[field.wire] ?? ''

    if (field.kind === 'num' || field.kind === 'money') {
      /* Every numeric field on this door is optional, so a blank one is simply
         absent. Digits only: the control shows `1.000.000` and the contract
         wants a number. */
      const digits = raw.replace(/\D/g, '')
      if (digits !== '') candidate[field.wire] = Number(digits)
      continue
    }

    if (raw === '' && !field.required) continue
    candidate[field.wire] = raw
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
  if (error.kind === 'xung-đột' && error.message !== '') return error.message
  return userMessage(error)
}
