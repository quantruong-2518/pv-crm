import { useMemo, useRef, useState } from 'react'
import { MOTION_BY_CHANNEL, type LeadProfile as WireLeadProfile } from '@pv/contracts'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import {
  buildLeadCreate,
  createFailureMessage,
  emptyDraft,
  ROOT_FIELD,
  useCreateLead,
} from '@/data/lead-create'
import { buildLeadPatch, useUpdateLeadProfile, type SaveState } from '@/data/lead-patch'
import { profileForm } from '@/data/lead-profile'
import {
  changedFields,
  fieldOfWire,
  isEditable,
  PROFILE_TO_WIRE,
  writeField,
  type FieldKey,
  type FormField,
  type FormMode,
  type FormValues,
} from '@/data/lead-form'
import { useMotionChoices, type MotionChoice } from '@/data/sales-motions'

/** Module 2 · ONE DRAFT, THREE CARDS — the state of the lead form, lifted out
 *  of the form card so the page owns it.
 *
 *  It had to move: `OwnerSourceCard` sits in the RIGHT column while the boxes
 *  it draws on the create door belong to the same draft the form card on the
 *  LEFT is typing into. Two components, one draft, so the draft is a hook.
 *
 *  The edit door AUTOSAVES: a value that leaves a box is PATCHed on its own,
 *  narrowed to that one field, so a refused box cannot drag a good one into the
 *  same refusal. Typed boxes commit on blur; select, date and segmented boxes
 *  commit on change, because they have no blur a person would recognise.
 *
 *  The create door does none of that — nothing exists to patch until the 201
 *  comes back, so it keeps its button. */

/** What the boxes show, what the server holds, and the two doors out. */
export type LeadDraft = {
  mode: FormMode
  /** What the boxes show right now. */
  values: FormValues
  /** The server's copy (edit) or a blank draft (create). */
  base: FormValues
  /** Type into one box. Does NOT write anything through. */
  set: (field: FormField, raw: string) => void
  /** Edit door only: value left a box → PATCH that one field if it changed.
   *  No-op on the create door. */
  commit: (field: FormField) => void
  /** Edit door only: does saving this box reach the server for THIS lead —
   *  `isEditable`, asked with the lead's state: tier is shut once it left the
   *  funnel. */
  editable: (field: FormField) => boolean
  dirty: FieldKey[]
  /** Create door only: drops everything typed. */
  reset: () => void
  /** Create door only: POST. */
  submit: () => void
  pending: boolean
  saveState: SaveState
  /** The complaint aimed at ONE box, so a red sentence can sit under the box
   *  that caused it instead of wiping the whole card's notes. */
  fieldError: (key: FieldKey) => string | undefined
  /** Complaints that name no box (a 409, a network failure). */
  formError: string | undefined
  /** Create door only: the motions this door offers, in policy order. */
  motions: MotionChoice[]
  /** Create door only: the chosen motion's policy demands a campaign. */
  campaignRequired: boolean
}

export type UseLeadDraftArgs =
  { mode: 'edit'; profile: WireLeadProfile } | { mode: 'create'; onCreated: (code: string) => void }

/** Contract name of a box. Both contracts spell every shared name the same. */
const wireOf = (key: FieldKey): string => PROFILE_TO_WIRE[key] ?? key

/** A refusal, worded for the one line in the header meta row. Names the box
 *  where it can, because that line is read far from the box it is about. */
function refusalMessage(errors: FieldErrors): string {
  return Object.entries(errors)
    .flatMap(([wire, messages]) =>
      messages.map((m) => (wire === ROOT_FIELD ? m : `${fieldOfWire(wire)?.label ?? wire}: ${m}`)),
    )
    .join(' · ')
}

export function useLeadDraft(args: UseLeadDraftArgs): LeadDraft {
  const mode: FormMode = args.mode
  const profile = args.mode === 'edit' ? args.profile : null
  /* Both doors opened up front: a hook cannot sit behind a branch, and a
     mutation nobody calls costs nothing. */
  const save = useUpdateLeadProfile()
  const create = useCreateLead()
  const motions = useMotionChoices(MOTION_BY_CHANNEL.MANUAL, mode === 'create')
  const needsCampaign = (motion: string | undefined) =>
    motions.some((m) => m.motion === motion && m.requiresCampaign)

  /* `profileForm` turns a field the wire left out into the `''`/`null` the
     boxes and the init-data gate read as "not dug out yet". No browser-side
     copy in between: one would hide the very value just written down. */
  const base = useMemo<FormValues>(() => (profile ? profileForm(profile) : emptyDraft()), [profile])
  const [values, setValues] = useState<FormValues>(base)
  const [failed, setFailed] = useState<FieldErrors | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })

  /* A select commits in the SAME tick it is set, before React has re-rendered,
     so `commit` reads the draft from here rather than from the closure. */
  const live = useRef(values)
  live.current = values

  /* Fields already sent and not yet mirrored back into `base`. Without this, a
     box blurred twice writes the same value twice — and the second write lands
     a second row on the timeline, one sitting reading as two. */
  const sent = useRef<Partial<Record<FieldKey, unknown>>>({})

  /** Which lead is on screen right now — read by the callbacks above. */
  const openCode = useRef(profile?.code ?? '')
  openCode.current = profile?.code ?? ''

  /* A sent value the refetch has mirrored back is no longer in flight. Kept in
     here it would outrank a NEWER `base` a colleague wrote, and `commit` would
     read the stale one as "the server already holds this" and write nothing. */
  for (const key of Object.keys(sent.current) as FieldKey[]) {
    if (sent.current[key] === base[key]) delete sent.current[key]
  }

  /* Reloading the boxes on a LEAD change is an assignment during render, React's
     own pattern for it — an effect runs after the paint, so stepping to another
     lead would flash the previous lead's answers first. */
  const [seededFor, setSeededFor] = useState(profile?.code ?? '')
  if (seededFor !== (profile?.code ?? '')) {
    setSeededFor(profile?.code ?? '')
    setValues(base)
    live.current = base
    sent.current = {}
    setFailed(null)
    setSaveState({ kind: 'idle' })
  }

  /** Drops the complaint about ONE box and leaves every other one standing. */
  const dropComplaint = (key: FieldKey) =>
    setFailed((cur) => {
      const wire = wireOf(key)
      if (!cur || !(wire in cur)) return cur
      const next = { ...cur }
      delete next[wire]
      return Object.keys(next).length > 0 ? next : null
    })

  const refuse = (errors: FieldErrors) => {
    setFailed((cur) => ({ ...cur, ...errors }))
    setSaveState({ kind: 'failed', message: refusalMessage(errors) })
  }

  const refuseCall = (error: ApiError) =>
    refuse(
      error.errors ?? {
        [ROOT_FIELD]: [mode === 'create' ? createFailureMessage(error) : userMessage(error)],
      },
    )

  const set = (field: FormField, raw: string) => {
    const next = { ...live.current, [field.key]: writeField(field, raw) } as FormValues
    live.current = next
    setValues(next)
    dropComplaint(field.key)
  }

  const commit = (field: FormField) => {
    if (profile === null || !isEditable(field, profile)) return
    /* A patch answers after the reader may have stepped to another lead, and
       this hook is the same instance for both. A stale answer must not paint a
       saved state — or a refusal — over a profile it never touched. */
    const wrote = profile.code
    const key = field.key
    const value = live.current[key]
    /* Compared against the last value KNOWN to be on the server, which during a
       flight is what was sent, not `base`. Typing A→B→A before the refetch lands
       leaves B stored: measured against `base` that undo writes nothing. */
    const server = key in sent.current ? sent.current[key] : base[key]
    if (value === server) return

    /* Diffed from `server` too, not from `base`: the body carries only what
       differs, so an undo back to the value `base` still holds would build an
       EMPTY body and leave the one already sent standing on the server. */
    const from = { ...base, [key]: server } as FormValues
    const built = buildLeadPatch(from, { ...from, [key]: value } as FormValues)
    if (!built.ok) {
      refuse(built.errors)
      return
    }

    sent.current[key] = value
    setSaveState({ kind: 'saving' })
    save.mutate(
      { code: profile.code, body: built.body },
      {
        onSuccess: () => {
          if (openCode.current !== wrote) return
          dropComplaint(key)
          setSaveState({ kind: 'saved' })
        },
        onError: (error) => {
          if (openCode.current !== wrote) return
          delete sent.current[key]
          refuseCall(error)
        },
      },
    )
  }

  const submit = () => {
    if (args.mode !== 'create' || create.isPending) return
    const built = buildLeadCreate(live.current, {
      campaignRequired: needsCampaign(live.current.motion),
    })
    if (!built.ok) {
      refuse(built.errors)
      return
    }

    setFailed(null)
    setSaveState({ kind: 'saving' })
    create.mutate(built.body, {
      onSuccess: (lead) => args.onCreated(lead.code),
      onError: refuseCall,
    })
  }

  const reset = () => {
    live.current = base
    setValues(base)
    setFailed(null)
    setSaveState({ kind: 'idle' })
  }

  /* Complaints that name no box of this form stay visible as ONE line under the
     card. A refusal nobody can see is how a screen starts looking broken. */
  const formError = useMemo(() => {
    const loose = Object.entries(failed ?? {})
      .filter(([wire]) => wire === ROOT_FIELD || fieldOfWire(wire) === undefined)
      .flatMap(([, messages]) => messages)
    return loose.length > 0 ? loose.join(' · ') : undefined
  }, [failed])

  return {
    mode,
    values,
    base,
    set,
    commit,
    editable: (field) => profile !== null && isEditable(field, profile),
    dirty: changedFields(base, values),
    reset,
    submit,
    pending: mode === 'create' ? create.isPending : save.isPending,
    saveState,
    fieldError: (key) => failed?.[wireOf(key)]?.[0],
    formError,
    motions,
    campaignRequired: needsCampaign(values.motion),
  }
}
