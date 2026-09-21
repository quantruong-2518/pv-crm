import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  Button,
  Eye,
  GlassCard,
  Icon,
  Info,
  Input,
  MetaPill,
  Plus,
  SectionTitle,
  SegmentedControl,
  Select,
  Textarea,
  Timeline,
  Trash2,
} from '@pv/ui'
import { CAMPAIGN_START_MAX_WAVES } from '@pv/contracts'
import type { MailTemplateRow } from '@pv/contracts'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailSyntaxGuide } from '@/components/mail-syntax-guide'
import { mailHints } from '@/data/mail-hints'
import { useMailPreview } from '@/data/mas'
import { dmhm, localSlot } from '@/lib/date'
import {
  commitDraft,
  composerDraftValid,
  dropCommitted,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from './wave-draft'

/** THE MAIL SEQUENCE — one wave composed on the left, the whole chain on the
 *  right.
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
}) {
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
  /* Same gate as the CTA above and for the same reason: `MailBookingUrl` refuses
     a half-typed address, and somebody mid-way through `https://` has one on
     every keystroke. */
  const previewBooking = /^https?:\/\/\S+$/.test(state.bookingUrl.trim())
    ? state.bookingUrl.trim()
    : undefined
  const preview = useMailPreview(
    {
      subject: state.subject,
      body: state.body,
      ...(previewCta ? { cta: previewCta } : {}),
      ...(previewBooking ? { bookingUrl: previewBooking } : {}),
      ...(previewLeadCode ? { leadCode: previewLeadCode } : {}),
    },
    previewOpen,
  )
  const hints = mailHints({
    subject: state.subject,
    body: state.body,
    ctaUrl: state.ctaUrl,
    bookingUrl: state.bookingUrl,
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
  const totalCount = effectiveWaves(state).length

  const addEvent = () => {
    if (canAdd) setState(commitDraft)
  }

  return (
    <div className="grid gap-4 md:grid-cols-[7fr_5fr] md:items-start">
      <ComposeCard
        state={state}
        setState={setState}
        templates={templates}
        index={nextIndex}
        previewOpen={previewOpen}
        onTogglePreview={togglePreview}
        onOpenGuide={() => setGuideOpen(true)}
      />

      <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
        {/* THE SAME TWO BLOCKS THE MAS COMPOSE PANEL SHOWS, and the same
            components rather than a second pair: a wave leaves through the
            identical send path, so a second preview would drift from it. */}
        <MailHintList hints={hints} />

        {previewOpen && (
          <MailPreviewCard
            letter={preview.letter}
            pending={preview.pending}
            error={preview.error}
          />
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Two panels, two honest titles: without the add button there is no
              chain and no ceiling, so printing `1/20` would invent both. */}
          <SectionTitle>
            {showAdd ? `Chuỗi đợt · ${totalCount}/${CAMPAIGN_START_MAX_WAVES}` : `Đợt ${nextIndex}`}
          </SectionTitle>
          {showAdd && (
            <Button size="sm" variant="ghost" onClick={addEvent} disabled={!canAdd}>
              <Icon icon={Plus} size={14} />
              Thêm đợt
            </Button>
          )}
        </div>

        <Timeline
          items={[
            ...state.committed.map((w, i) => ({
              id: w.localId,
              state: 'next' as const,
              marker: `Đợt ${alreadyFired + i + 1}`,
              title: w.label,
              meta: (
                <MetaPill>
                  {w.scheduledAt ? `Hẹn · ${dmhm(w.scheduledAt)}` : 'Gửi ngay khi bắt đầu chạy'}
                </MetaPill>
              ),
              children: <span className="line-clamp-1">{w.subject}</span>,
              actions: (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setState((s) => dropCommitted(s, w.localId))}
                >
                  <Icon icon={Trash2} size={14} />
                  Xoá
                </Button>
              ),
            })),
            liveDraftItem(state, nextIndex, draftValid, () =>
              setState((s) => ({ ...emptyComposerState(), committed: s.committed })),
            ),
          ]}
        />
      </GlassCard>

      <MailSyntaxGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}

/** The wave being typed, as the last row of the timeline — always present, so
 *  the chain shows where the next letter lands before it is finished. */
function liveDraftItem(
  state: ComposerState,
  index: number,
  draftValid: boolean,
  onClear: () => void,
) {
  const touched =
    state.label.trim() !== '' || state.subject.trim() !== '' || state.body.trim() !== ''

  return {
    id: 'live-draft',
    state: 'current' as const,
    marker: `Đợt ${index}`,
    title: state.label.trim() || <span className="text-muted-foreground">(đang soạn…)</span>,
    meta: (
      <MetaPill>
        {draftValid ? 'Đang soạn — sẽ gửi' : 'Chưa đủ để gửi — điền tiêu đề và nội dung'}
      </MetaPill>
    ),
    children: state.subject.trim() ? (
      <span className="line-clamp-1">{state.subject}</span>
    ) : (
      <span className="text-muted-foreground">Chưa có tiêu đề</span>
    ),
    actions: touched ? (
      <Button size="sm" variant="ghost" onClick={onClear}>
        <Icon icon={Trash2} size={14} />
        Xoá
      </Button>
    ) : undefined,
  }
}

function ComposeCard({
  state,
  setState,
  templates,
  index,
  previewOpen,
  onTogglePreview,
  onOpenGuide,
}: {
  state: ComposerState
  setState: Dispatch<SetStateAction<ComposerState>>
  templates: MailTemplateRow[]
  index: number
  previewOpen: boolean
  onTogglePreview: () => void
  onOpenGuide: () => void
}) {
  const pickTemplate = (value: string) => {
    const found = templates.find((t) => t.code === value)
    setState((s) => ({
      ...s,
      templateCode: value,
      ...(found ? { subject: found.subject, body: found.body } : {}),
      ...(found && s.label.trim() === '' ? { label: found.name } : {}),
      ctaLabel: found?.cta?.label ?? '',
      ctaUrl: found?.cta?.url ?? '',
      bookingUrl: found?.bookingUrl ?? '',
    }))
  }

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <SectionTitle>Soạn Đợt {index}</SectionTitle>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">Mẫu thư (không bắt buộc)</span>
        <Select
          label="Mẫu thư"
          hideLabel
          value={state.templateCode}
          onChange={pickTemplate}
          options={[
            { value: '', label: 'Tự soạn' },
            ...templates.map((t) => ({ value: t.code, label: t.name })),
          ]}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">Phase / tên đợt</span>
        <Input
          value={state.label}
          onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
          placeholder="Ví dụ: Đợt 1 · giới thiệu"
          maxLength={200}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          Tiêu đề email · {state.subject.length}/200
        </span>
        <Input
          value={state.subject}
          onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))}
          maxLength={200}
          placeholder="Tiêu đề người nhận đọc thấy trong hộp thư"
        />
      </label>

      {/* The label row carries the guide button, so it sits OUTSIDE the
          `<label>`: a button inside a label re-focuses the textarea on every
          click. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[11px]">Nội dung</span>
        <Button size="sm" variant="ghost" type="button" onClick={onOpenGuide}>
          <Icon icon={Info} size={14} />
          Cách viết nội dung
        </Button>
      </div>
      <label className="flex flex-col gap-2">
        <Textarea
          value={state.body}
          onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
          rows={6}
          placeholder="Thân thư. **đậm**, _nghiêng_, đầu dòng `- ` thành danh sách. Dùng {{company}} và {{contactName}} để điền tên từng người nhận."
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Nút CTA · nhãn (không bắt buộc)</span>
          <Input
            value={state.ctaLabel}
            onChange={(e) => setState((s) => ({ ...s, ctaLabel: e.target.value }))}
            maxLength={80}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Nút CTA · URL</span>
          <Input
            value={state.ctaUrl}
            onChange={(e) => setState((s) => ({ ...s, ctaUrl: e.target.value }))}
            placeholder="https://…"
          />
        </label>
      </div>

      {/* Full width and on its own row, not a third cell beside the CTA pair:
          it is the letter's SECOND button, not a third piece of the first one.
          No label field — the wording is a constant, see `BOOKING_LABEL`. */}
      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">Link đặt lịch (không bắt buộc)</span>
        <Input
          value={state.bookingUrl}
          onChange={(e) => setState((s) => ({ ...s, bookingUrl: e.target.value }))}
          placeholder="https://calendly.com/…"
        />
      </label>

      <SendWhen state={state} setState={setState} />

      {/* The toggle stays here, next to the field being typed into — but the
          letter itself is DRAWN in the sibling column, so opening it never
          pushes the rest of this card down. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[11px]">Kiểm lại thư trước khi thêm đợt</span>
        <Button
          size="sm"
          variant="secondary"
          disabled={state.subject.trim() === '' || state.body.trim() === ''}
          aria-expanded={previewOpen}
          onClick={onTogglePreview}
        >
          <Icon icon={Eye} size={14} />
          {previewOpen ? 'Đóng xem trước' : 'Xem trước'}
        </Button>
      </div>
    </GlassCard>
  )
}

/** WHEN this wave leaves — the one question of the compose card that is about
 *  the send rather than the letter. */
function SendWhen({
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
