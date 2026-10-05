import { useState } from 'react'
import { SegmentedControl, Textarea, type SegmentedOption } from '@pv/ui'
import { useLeadDesk } from '@/app/desk'
import type { LeadDraft } from '@/data/lead-draft'
import type { SaveState } from '@/data/lead-patch'
import { fieldsOf, PROFILE_GROUPS, readField, type FormMode } from '@/data/lead-form'
import { RecordCard } from '@/components/record/record-card'
import { FieldRow } from './lead-fields'

/** Module 2 · The profile card — one tab row and the boxes of the open tab.
 *
 *  Tabs, not the accordion it was until 17/09: one card height, and the count
 *  of every part on screen at once.
 *
 *  NO BUTTONS ON EITHER DOOR. The edit door writes a box through the moment it
 *  loses a value (`useLeadDraft`); the create door's submit and clear buttons
 *  live in `LeadToolsBar`. What stays here is the line about which boxes are
 *  required and the refusal that names no box.
 *
 *  The edit door is the profile's reference card (ADR 0078 §1), set lighter
 *  and with no people tab: the run rail's contacts block holds the people. */

/** The fourth tab is the free-text note, a card of its own until 17/09. It sits
 *  inside the form because it is the same act — writing down what is known
 *  about this customer — and a card holding one textarea is a card too many. */
const NOTE_TAB = {
  key: 'note',
  label: 'Ghi chú',
  purpose: 'Điều cần nhớ khi liên hệ khách này.',
} as const

const TABS = [...PROFILE_GROUPS, NOTE_TAB]

type TabKey = (typeof TABS)[number]['key']

const tabsOf = (mode: FormMode) =>
  mode === 'edit' ? TABS.filter((entry) => entry.key !== 'person') : TABS

/** The customer's own page (LinkedIn, fanpage, website) stays on the lead row
 *  when its people move to the contacts list, so the edit door asks it with
 *  the company. */
const CHANNEL_URL_FIELDS = fieldsOf('person').filter((field) => field.key === 'channelUrl')

const boxesOf = (tab: (typeof PROFILE_GROUPS)[number]['key'], mode: FormMode) =>
  tab === 'company' && mode === 'edit'
    ? [...fieldsOf(tab, mode), ...CHANNEL_URL_FIELDS]
    : fieldsOf(tab, mode)

/** The boxes whose emptiness means an answer is still missing. */
const countedOf = (tab: (typeof PROFILE_GROUPS)[number]['key'], mode: FormMode) =>
  boxesOf(tab, mode).filter((box) => !box.notesOnly)

export function LeadForm({
  draft,
  code,
  /** `lead.edit`, reaching EVERY tab: the boxes print as text without it.
   *  DEFAULTS TO DENY — a reader handed typing earns a 403 on every blur. The
   *  create door omits it. */
  canEdit = false,
}: {
  draft: LeadDraft
  code: string | null
  canEdit?: boolean
}) {
  const [tab, setTab] = useState<TabKey>(() => firstTab(draft))
  /* Same reset-during-render as the draft itself: stepping to another lead must
     not leave the previous lead's tab open for one painted frame. */
  const [seededFor, setSeededFor] = useState(code ?? '')
  if (seededFor !== (code ?? '')) {
    setSeededFor(code ?? '')
    setTab(firstTab(draft))
  }

  const options: SegmentedOption[] = tabsOf(draft.mode).map((entry) => {
    if (entry.key === 'note') return { value: entry.key, label: entry.label }
    /* Counted over the BOXES of the tab, not over the ten init-data slots: the
       number answers "how much of this tab is still empty", which is what the
       reader is looking at. The slot score lives on the lead book. */
    const boxes = countedOf(entry.key, draft.mode)
    const got = boxes.filter((box) => readField(draft.values, box.key) !== '').length
    return { value: entry.key, label: entry.label, count: `${got}/${boxes.length}` }
  })

  const purpose = TABS.find((entry) => entry.key === tab)?.purpose

  const editing = draft.mode === 'edit'

  return (
    <RecordCard
      title="Thông tin lead"
      tone={editing ? 'reference' : 'work'}
      hint={purpose}
      actions={editing && <SaveStateNote state={draft.saveState} />}
    >
      <SegmentedControl
        label="Phần hồ sơ"
        hideLabel
        tone="quiet"
        value={tab}
        options={options}
        onChange={(next) => setTab(next as TabKey)}
      />

      {tab === 'note' ? (
        <NoteBox code={code} />
      ) : (
        <FieldRow fields={boxesOf(tab, draft.mode)} draft={draft} canEdit={canEdit} />
      )}

      {/* Which boxes refuse to stay empty is the contract's answer, given
          against the boxes themselves — this line only says so out loud. */}
      {draft.mode === 'create' && (
        <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
          Ô có dấu sao là bắt buộc. Ô bỏ trống không được ghi xuống sổ.
        </span>
      )}

      {draft.formError && (
        <span
          role="alert"
          className="text-destructive-foreground max-w-[520px] text-[12.5px] leading-[1.5]"
        >
          {draft.formError}
        </span>
      )}
    </RecordCard>
  )
}

/** Which tab opens first: the one still missing an answer.
 *
 *  Measured on the SERVER's copy, never on what is being typed — measuring the
 *  live draft would move the tab out from under the cursor the moment the last
 *  box of a group is filled in. The create door always opens the first tab:
 *  nothing is dug out yet, so "where the work is" is everywhere. */
function firstTab(draft: LeadDraft): TabKey {
  if (draft.mode === 'create') return 'company'
  const short = PROFILE_GROUPS.find(
    (group) =>
      group.key !== 'person' &&
      countedOf(group.key, 'edit').some((box) => readField(draft.base, box.key) === ''),
  )
  return short?.key ?? 'company'
}

/** The one free-text box on the profile.
 *
 *  Deliberately outside the ten questions and uncounted by the gate: those ten
 *  are what the system can measure across leads, this is what only the person
 *  holding the lead knows. Mixing the two miscounts the gate.
 *
 *  STILL IN THE BROWSER, AND THE DEBT GREW — the same debt `app/desk.ts` records
 *  against `notes`: this text lives in one machine's `localStorage`, so a
 *  colleague opening the lead simply does not see it. The new layout sits it in
 *  a tab beside server data, which makes it easier to mistake for a record and
 *  worse to lose. Hence the line under the box until a table holds it. */
function NoteBox({ code }: { code: string | null }) {
  const note = useLeadDesk((s) => (code === null ? '' : (s.notes[code] ?? '')))
  const setNote = useLeadDesk((s) => s.setNote)

  if (code === null) {
    return (
      <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
        Ghi chú mở sau khi tạo lead.
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Textarea
        value={plainNote(note)}
        rows={4}
        autoGrow
        aria-label="Ghi chú về lead"
        onChange={(event) => setNote(code, event.target.value)}
        placeholder="Ví dụ: chỉ gọi trước 9h; người duyệt mới chưa tham gia buổi trao đổi…"
      />
      <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Ghi chú chỉ lưu trên máy này. Đồng nghiệp mở lead sẽ không thấy.
      </span>
    </div>
  )
}

/** An older note may be HTML left by `RichText`. Converted at the display layer
 *  only; the next keystroke saves plain text and finishes the move by itself. */
function plainNote(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value
  const node = document.createElement('div')
  node.innerHTML = value
  node.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'))
  node.querySelectorAll('p, div, li').forEach((block) => block.append('\n'))
  return (node.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

/** The save-state sentence for the header meta row.
 *
 *  ONE owner for this wording: with no save button on the screen, this line is
 *  the only thing telling a person whether what they typed reached the server,
 *  and two cards wording it two ways would be two answers to one question. */
export function SaveStateNote({ state }: { state: SaveState }) {
  if (state.kind === 'idle') return null

  if (state.kind === 'failed') {
    return (
      <span role="alert" className="text-destructive-foreground text-[12.5px] leading-[1.5]">
        {state.message}
      </span>
    )
  }

  return (
    <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
      {state.kind === 'saving' ? 'Đang lưu…' : 'Mọi thay đổi đã lưu'}
    </span>
  )
}
