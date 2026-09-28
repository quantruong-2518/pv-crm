import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Button, Eye, GlassCard, Icon, Input, SegmentedControl, Select, SectionTitle } from '@pv/ui'
import { CAMPAIGN_START_MAX_WAVES, MAIL_DOOR_LABEL } from '@pv/contracts'
import type { MailDoor, MailTemplateRow } from '@pv/contracts'
import { MailFloatingAids, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import { mailHints } from '@/data/mail-hints'
import { useMailPreview } from '@/data/mas'
import { localSlot } from '@/lib/date'
import { BodyField } from './body-field'
import { WaveStrip, WaveTimeline } from './wave-chain'
import { commitDraft, composerDraftValid, withTemplate, type ComposerState } from './wave-draft'

/** THE MAIL SEQUENCE — one wave composed on the left, the whole chain beside
 *  it.
 *
 *  Knows nothing about WHO receives the letters: it produces waves
 *  (`CampaignWaveInput`, i.e. a `MasSendRequest` with no `audience`), and the
 *  caller — the campaign wave drawer, one lead, one opportunity — puts the
 *  audience back on at send time. That is why it lives here and not in
 *  `pages/`. Second door: Quick MAS on one subject. */

export function WaveComposer({
  state,
  setState,
  templates,
  showAdd = true,
  alreadyFired = 0,
  previewLeadCode,
  frame = 'own',
  door,
}: {
  state: ComposerState
  setState: Dispatch<SetStateAction<ComposerState>>
  templates: MailTemplateRow[]
  /** Off for a running campaign: see `WaveDrawer`, one wave per round. */
  showAdd?: boolean
  /** Whose name fills the `{{…}}` slots of the preview. Absent for a campaign:
   *  its audience is frozen `campaign_member` rows, not a mailbox this draft can
   *  name, so the server renders sample values instead. */
  previewLeadCode?: string
  /** Waves this chain's subject has ALREADY been sent — the number the composer
   *  counts up FROM. A local draft knows nothing of the server, so numbering off
   *  `committed.length` alone opened every composer at wave one. */
  alreadyFired?: number
  /** How much of the panel this caller wants: `'own'` the campaign wave drawer
   *  (everything) · `'host'` the MAS modal (preview and `?` already stand in
   *  its shell) · `'letter'` the run editor (one batch, schedule is a step). */
  frame?: 'own' | 'host' | 'letter'
  /** The door the picker was filtered by (G4) — named on its label so an
   *  absent template reads as "not for here", not as missing. */
  door?: MailDoor
}) {
  const own = frame === 'own'
  const letterOnly = frame === 'letter'
  const [previewOpen, setPreviewOpen] = useState(false)
  /* Has the person CLOSED the preview themselves? Auto-opening is a suggestion,
     and a suggestion that comes back after being refused is a nag. */
  const [previewDismissed, setPreviewDismissed] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  /* The button travels only when the pair is COMPLETE and the URL parses:
     `MailCta` refuses a half-typed address, and somebody in the middle of
     typing `https://` has one on every keystroke. */
  const previewCta =
    state.ctaLabel.trim() !== '' && /^https?:\/\/\S+$/.test(state.ctaUrl.trim())
      ? { label: state.ctaLabel.trim(), url: state.ctaUrl.trim() }
      : undefined
  const preview = useMailPreview(
    {
      subject: state.subject,
      body: state.body,
      ...(previewCta ? { cta: previewCta } : {}),
      ...(previewLeadCode ? { leadCode: previewLeadCode } : {}),
    },
    own && previewOpen,
  )
  const hints = mailHints({
    subject: state.subject,
    body: state.body,
    ctaUrl: state.ctaUrl,
    missing: preview.letter?.missing,
  })

  /* THE LETTER SHOWS ITSELF ONCE THERE IS ONE: the box is a plain textarea, so
     bold, lists and both buttons exist only in the rendered preview, findable
     otherwise by nobody. Closing it keeps it closed for this draft. */
  const canPreview = state.subject.trim() !== '' && state.body.trim() !== ''
  useEffect(() => {
    if (!canPreview) {
      setPreviewOpen(false)
      setPreviewDismissed(false)
    } else if (!previewDismissed) setPreviewOpen(true)
  }, [canPreview, previewDismissed])

  const togglePreview = () => {
    setPreviewDismissed(previewOpen)
    setPreviewOpen(!previewOpen)
  }

  const draftValid = composerDraftValid(state)
  /* The live draft already counts as the last wave. At 19 committed waves a
     valid draft is wave 20 and must not open a blank wave 21. */
  const canAdd = draftValid && state.committed.length + 1 < CAMPAIGN_START_MAX_WAVES
  const nextIndex = alreadyFired + state.committed.length + 1

  const chain = {
    state,
    setState,
    alreadyFired,
    nextIndex,
    showAdd,
    canAdd,
    draftValid,
    onAdd: () => {
      if (canAdd) setState(commitDraft)
    },
  }
  const compose = (
    <ComposeCard
      state={state}
      setState={setState}
      templates={templates}
      index={nextIndex}
      previewOpen={previewOpen}
      letterOnly={letterOnly}
      {...(door ? { door } : {})}
      /* G3: inside the MAS modal a lone wave is named after its template and
         nobody needs to see that — the field appears once there is a chain. */
      showLabel={frame !== 'host' || state.committed.length > 0}
      {...(own ? { onTogglePreview: togglePreview } : {})}
    />
  )

  if (letterOnly) return compose

  if (!own) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {compose}
        <WaveStrip {...chain} />
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-[7fr_5fr] md:items-start">
      {compose}

      <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
        {/* The same preview component the MAS panel shows: a wave leaves
            through the identical send path, so a second one would drift. */}
        {previewOpen && (
          <MailPreviewCard
            letter={preview.letter}
            pending={preview.pending}
            error={preview.error}
          />
        )}

        <WaveTimeline {...chain} />
      </GlassCard>

      {/* The hints float like the MAS panel's (G-Bulk): sticky to the bottom
          of the drawer's scroll, so advice never pushes the letter down. */}
      <div className="pointer-events-none sticky bottom-6 flex justify-end md:col-span-2">
        <div className="pointer-events-auto">
          <MailFloatingAids hints={hints} onGuide={() => setGuideOpen(true)} />
        </div>
      </div>

      <MailGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}

function ComposeCard({
  state,
  setState,
  templates,
  index,
  previewOpen,
  letterOnly,
  showLabel,
  door,
  onTogglePreview,
}: {
  state: ComposerState
  setState: Dispatch<SetStateAction<ComposerState>>
  templates: MailTemplateRow[]
  index: number
  previewOpen: boolean
  showLabel: boolean
  /** The run editor: one existing batch. No schedule here — it is that panel's
   *  second step, and one value must not have two controls — and no wave
   *  number, because the panel's own subtitle already names the batch. */
  letterOnly: boolean
  door?: MailDoor
  /** Absent inside the MAS modal: the preview stands open in the shell's own
   *  column. The `?` floats in the corner of every frame that has one. */
  onTogglePreview?: () => void
}) {
  /* G3: the wave is named after its template (or, hand-written, its subject)
     until somebody types a name — a label still equal to the old default
     is a default, and follows the next one. */
  const autoLabel = (s: ComposerState) =>
    templates.find((t) => t.code === s.templateCode)?.name ?? s.subject.trim()
  const edit = (change: (s: ComposerState) => ComposerState) =>
    setState((s) => {
      const next = change(s)
      const follows = !letterOnly && (s.label === '' || s.label === autoLabel(s))
      return follows ? { ...next, label: autoLabel(next) } : next
    })

  const pickTemplate = (value: string) => {
    const found = templates.find((t) => t.code === value)
    edit((s) => withTemplate(s, value, found))
  }

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <SectionTitle>{letterOnly ? 'Nội dung thư' : `Soạn Đợt ${index}`}</SectionTitle>

      {/* No template picker in the run editor: swapping a whole letter into a
          batch that is already addressed is not the job that panel is for. */}
      {!letterOnly && (
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {door
              ? `Mẫu thư · chỉ mẫu dùng ở ${MAIL_DOOR_LABEL[door].toLowerCase()}`
              : 'Mẫu thư (không bắt buộc)'}
          </span>
          <Select
            label="Mẫu thư"
            hideLabel
            size="lg"
            value={state.templateCode}
            onChange={pickTemplate}
            options={[
              { value: '', label: 'Tự soạn' },
              ...templates.map((t) => ({ value: t.code, label: t.name })),
            ]}
          />
        </label>
      )}

      {showLabel && (
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {letterOnly ? 'Phase / tên đợt' : 'Phase / tên đợt · tự lấy tên mẫu'}
          </span>
          <Input
            value={state.label}
            onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
            placeholder="Ví dụ: Đợt 1 · giới thiệu"
            maxLength={200}
          />
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          Tiêu đề email · {state.subject.length}/200
        </span>
        <Input
          value={state.subject}
          onChange={(e) => edit((s) => ({ ...s, subject: e.target.value }))}
          maxLength={200}
          placeholder="Tiêu đề người nhận đọc thấy trong hộp thư"
        />
      </label>

      <BodyField body={state.body} onBody={(body) => setState((s) => ({ ...s, body }))} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            Nút trong email · nhãn (không bắt buộc)
          </span>
          <Input
            value={state.ctaLabel}
            onChange={(e) => setState((s) => ({ ...s, ctaLabel: e.target.value }))}
            maxLength={80}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Nút trong email · URL</span>
          <Input
            value={state.ctaUrl}
            onChange={(e) => setState((s) => ({ ...s, ctaUrl: e.target.value }))}
            placeholder="https://…"
          />
        </label>
      </div>

      {!letterOnly && <SendWhen state={state} setState={setState} />}

      {/* The toggle stays here, next to the field being typed into — but the
          letter itself is DRAWN in the sibling column, so opening it never
          pushes the rest of this card down. */}
      {onTogglePreview && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11px]">Kiểm lại thư trước khi thêm đợt</span>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-coarse:h-12"
            disabled={state.subject.trim() === '' || state.body.trim() === ''}
            aria-expanded={previewOpen}
            onClick={onTogglePreview}
          >
            <Icon icon={Eye} size={14} />
            {previewOpen ? 'Đóng xem trước' : 'Xem trước'}
          </Button>
        </div>
      )}
    </GlassCard>
  )
}

/** WHEN this wave leaves — the one question of the compose card that is about
 *  the send rather than the letter. Exported for the run editor, which asks it
 *  on its own step and must ask it with the same control. */
export function SendWhen({
  state,
  setState,
}: {
  state: ComposerState
  setState: Dispatch<SetStateAction<ComposerState>>
}) {
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label="Thời điểm gửi"
        /* `quiet`: this sits inside the wave drawer, where azure is spoken for
           by the one button that cannot be taken back (law 3). */
        tone="quiet"
        value={state.timing}
        /* Switching to the scheduled option fills the field with a real slot:
           an empty `datetime-local` locks the send button with the reason
           written nowhere. */
        onChange={(v) =>
          setState((s) => ({
            ...s,
            timing: v as 'now' | 'later',
            ...(v === 'later' && s.at === '' ? { at: localSlot() } : {}),
          }))
        }
        options={[
          { value: 'now', label: 'Gửi ngay' },
          { value: 'later', label: 'Đặt lịch gửi' },
        ]}
      />
      {state.timing === 'later' && (
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Giờ gửi (giờ máy bạn)</span>
          <Input
            type="datetime-local"
            value={state.at}
            onChange={(e) => setState((s) => ({ ...s, at: e.target.value }))}
          />
        </label>
      )}
    </div>
  )
}
