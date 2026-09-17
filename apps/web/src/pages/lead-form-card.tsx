import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GlassCard, SectionTitle, SegmentedControl, Textarea, type SegmentedOption } from '@pv/ui'
import { useLeadDesk } from '@/app/desk'
import { ContactsCard } from '@/components/contacts-card'
import { leadContactsQuery } from '@/data/contacts'
import type { LeadDraft } from '@/data/lead-draft'
import type { SaveState } from '@/data/lead-patch'
import { fieldsOf, PROFILE_GROUPS, readField } from '@/data/lead-form'
import { FieldRow } from './lead-fields'

/** Module 2 · The profile card — one tab row and the boxes of the open tab.
 *
 *  IT WAS AN ACCORDION UNTIL 17/09. Three groups folded by "still missing an
 *  answer" — right idea, wrong shape: opening one group pushed everything below
 *  it down the page, so the card's height changed under the hand every time,
 *  and two open groups still meant scrolling past thirty boxes.
 *
 *  Tabs keep the card one height and put the count of every part on screen at
 *  once, which is what the accordion's fold state was really for.
 *
 *  NO BUTTONS ON EITHER DOOR. The edit door writes a box through the moment it
 *  loses a value (`useLeadDraft`); the create door's submit and clear buttons
 *  live in `LeadToolsBar`. What stays here is the line about which boxes are
 *  required and the refusal that names no box — both are about the boxes, and
 *  the toolbar deliberately prints neither. */

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

export function LeadForm({
  draft,
  code,
  /** `lead.edit`, reaching EVERY tab: the contacts buttons and the boxes of the
   *  other three, which print as text without it. DEFAULTS TO DENY — a reader
   *  handed typing earns a 403 on every blur. The create door omits it. */
  canEdit = false,
}: {
  draft: LeadDraft
  code: string | null
  canEdit?: boolean
}) {
  /* The contacts tab counts PEOPLE, not slots: there is no denominator for how
     many people a company has. Idle on the create door — no lead, no list. */
  const contacts = useQuery({ ...leadContactsQuery(code ?? ''), enabled: code !== null })

  const [tab, setTab] = useState<TabKey>(() => firstTab(draft))
  /* Same reset-during-render as the draft itself: stepping to another lead must
     not leave the previous lead's tab open for one painted frame. */
  const [seededFor, setSeededFor] = useState(code ?? '')
  if (seededFor !== (code ?? '')) {
    setSeededFor(code ?? '')
    setTab(firstTab(draft))
  }

  const options: SegmentedOption[] = TABS.map((entry) => {
    if (entry.key === 'note') return { value: entry.key, label: entry.label }
    if (entry.key === 'person' && code !== null) {
      return { value: entry.key, label: entry.label, count: contacts.data?.rows.length }
    }
    /* Counted over the BOXES of the tab, not over the ten init-data slots: the
       number answers "how much of this tab is still empty", which is what the
       reader is looking at. The slot score lives on the lead book. */
    const boxes = fieldsOf(entry.key, draft.mode)
    const got = boxes.filter((box) => readField(draft.values, box.key) !== '').length
    return { value: entry.key, label: entry.label, count: `${got}/${boxes.length}` }
  })

  const purpose = TABS.find((entry) => entry.key === tab)?.purpose

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-5 p-4 sm:p-5 lg:p-6"
      aria-label={draft.mode === 'create' ? 'Lead mới' : 'Hồ sơ lead'}
    >
      <SectionTitle size="detail" hint={purpose}>
        {draft.mode === 'create' ? 'Thông tin lead' : 'Chi tiết lead'}
      </SectionTitle>

      <SegmentedControl
        label="Phần hồ sơ"
        hideLabel
        tone="quiet"
        value={tab}
        options={options}
        onChange={(next) => setTab(next as TabKey)}
      />

      <TabPanel tab={tab} draft={draft} code={code} canEdit={canEdit} />

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
    </GlassCard>
  )
}

function TabPanel({
  tab,
  draft,
  code,
  canEdit,
}: {
  tab: TabKey
  draft: LeadDraft
  code: string | null
  canEdit: boolean
}) {
  if (tab === 'note') return <NoteBox code={code} />
  /* The edit door hands the tab to the contacts card: a lead has many people
     and the profile's five contact boxes mirror whoever is primary. The create
     door draws those boxes — no lead yet, no list yet, and `LeadCreate` asks. */
  if (tab === 'person' && code !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <ContactsCard code={code} canEdit={canEdit} embedded />
        <ChannelUrlBox draft={draft} canEdit={canEdit} />
      </div>
    )
  }
  return <FieldRow fields={fieldsOf(tab, draft.mode)} draft={draft} canEdit={canEdit} />
}

/** The one box of the `person` group the contacts list cannot carry.
 *
 *  `ContactRow` has no column for it and should not: this URL is the CUSTOMER's
 *  page — LinkedIn, fanpage, website — not one person's. It stayed on the lead
 *  when the five contact boxes moved to the list, so without this line a value
 *  `LeadProfile` holds and `LeadPatch` still accepts would be drawn nowhere. */
const CHANNEL_URL_FIELDS = fieldsOf('person').filter((field) => field.key === 'channelUrl')

function ChannelUrlBox({ draft, canEdit }: { draft: LeadDraft; canEdit: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
        Trang của KHÁCH — LinkedIn công ty, fanpage hay website. Không phải trang riêng của một
        người trong danh sách trên.
      </span>
      <FieldRow fields={CHANNEL_URL_FIELDS} draft={draft} canEdit={canEdit} />
    </div>
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
  const short = PROFILE_GROUPS.find((group) =>
    fieldsOf(group.key, 'edit').some((box) => readField(draft.base, box.key) === ''),
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
 *  against `nextSteps`: this text lives in one machine's `localStorage`, so a
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
