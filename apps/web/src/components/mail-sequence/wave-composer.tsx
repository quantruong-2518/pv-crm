import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Button, Eye, GlassCard, Icon, Input, SegmentedControl, Select, SectionTitle } from '@pv/ui'
import { CAMPAIGN_START_MAX_WAVES } from '@pv/contracts'
import type { MailDoor, MailTemplateRow } from '@pv/contracts'
import { message, translate } from '@/app/i18n'
import { MailFloatingAids, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import { mailHints } from '@/data/mail-hints'
import { useMailPreview } from '@/data/mas'
import { localSlot } from '@/lib/date'
import { BodyField } from './body-field'
import { WaveStrip, WaveTimeline } from './wave-chain'
import { commitDraft, composerDraftValid, withTemplate, type ComposerState } from './wave-draft'

const tr = (vi: string, en: string, ko: string) => translate(message(vi, en, ko))
const doorName = (door: MailDoor) =>
  ({
    mas: tr('MAS', 'MAS', 'MAS'),
    campaign: tr('chiến dịch', 'campaigns', '캠페인'),
    lead: tr('lead', 'leads', '리드'),
    opportunity: tr('cơ hội', 'opportunities', '기회'),
    quote: tr('báo giá', 'quotes', '견적'),
    contract: tr('hợp đồng', 'contracts', '계약'),
  })[door]

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

const TEXT = {
  emailTemplateOptional: message(
    'Mẫu thư (không bắt buộc)',
    'Email template (optional)',
    '이메일 템플릿 (선택 사항)',
  ),
  waveNameDefaultsToTemplate: message(
    'Tên đợt · mặc định lấy từ tên mẫu',
    'Wave name · defaults to template name',
    '차수 이름 · 기본값은 템플릿 이름',
  ),
  eGWave1Introduction: message(
    'Ví dụ: Đợt 1 · giới thiệu',
    'e.g. Wave 1 · introduction',
    '예: 1차 · 소개',
  ),
  subjectRecipientsWillSeeIn: message(
    'Tiêu đề người nhận sẽ thấy trong hộp thư',
    'Subject recipients will see in their inbox',
    '수신자의 받은 편지함에 표시될 제목',
  ),
  emailButtonLabelOptional: message(
    'Nút trong email · nhãn (không bắt buộc)',
    'Email button · label (optional)',
    '이메일 버튼 · 문구 (선택 사항)',
  ),
  reviewTheEmailBeforeAdding: message(
    'Xem lại email trước khi thêm đợt',
    'Review the email before adding a wave',
    '차수를 추가하기 전에 이메일을 확인하세요',
  ),
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
      <SectionTitle>
        {letterOnly
          ? tr('Nội dung thư', 'Email content', '이메일 내용')
          : tr(`Soạn đợt ${index}`, `Compose wave ${index}`, `${index}차 작성`)}
      </SectionTitle>

      {/* No template picker in the run editor: swapping a whole letter into a
          batch that is already addressed is not the job that panel is for. */}
      {!letterOnly && (
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {door
              ? tr(
                  `Mẫu thư · chỉ mẫu dùng ở ${doorName(door)}`,
                  `Email template · available for ${doorName(door)} only`,
                  `이메일 템플릿 · ${doorName(door)} 전용`,
                )
              : translate(TEXT.emailTemplateOptional)}
          </span>
          <Select
            label={tr('Mẫu thư', 'Email template', '이메일 템플릿')}
            hideLabel
            size="lg"
            value={state.templateCode}
            onChange={pickTemplate}
            options={[
              { value: '', label: tr('Tự soạn', 'Write from scratch', '직접 작성') },
              ...templates.map((t) => ({ value: t.code, label: t.name })),
            ]}
          />
        </label>
      )}

      {showLabel && (
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {letterOnly
              ? tr('Tên đợt', 'Wave name', '차수 이름')
              : translate(TEXT.waveNameDefaultsToTemplate)}
          </span>
          <Input
            value={state.label}
            onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
            placeholder={translate(TEXT.eGWave1Introduction)}
            maxLength={200}
          />
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          {tr('Tiêu đề email', 'Email subject', '이메일 제목')} · {state.subject.length}/200
        </span>
        <Input
          value={state.subject}
          onChange={(e) => edit((s) => ({ ...s, subject: e.target.value }))}
          maxLength={200}
          placeholder={translate(TEXT.subjectRecipientsWillSeeIn)}
        />
      </label>

      <BodyField body={state.body} onBody={(body) => setState((s) => ({ ...s, body }))} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {translate(TEXT.emailButtonLabelOptional)}
          </span>
          <Input
            value={state.ctaLabel}
            onChange={(e) => setState((s) => ({ ...s, ctaLabel: e.target.value }))}
            maxLength={80}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {tr('Nút trong email · URL', 'Email button · URL', '이메일 버튼 · URL')}
          </span>
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
          <span className="text-muted-foreground text-[11px]">
            {translate(TEXT.reviewTheEmailBeforeAdding)}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="pointer-coarse:h-12"
            disabled={state.subject.trim() === '' || state.body.trim() === ''}
            aria-expanded={previewOpen}
            onClick={onTogglePreview}
          >
            <Icon icon={Eye} size={14} />
            {previewOpen
              ? tr('Đóng xem trước', 'Close preview', '미리 보기 닫기')
              : tr('Xem trước', 'Preview', '미리 보기')}
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
        label={tr('Thời điểm gửi', 'Send time', '발송 시간')}
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
          { value: 'now', label: tr('Gửi ngay', 'Send now', '지금 발송') },
          { value: 'later', label: tr('Đặt lịch gửi', 'Schedule send', '발송 예약') },
        ]}
      />
      {state.timing === 'later' && (
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {tr(
              'Giờ gửi (giờ địa phương của bạn)',
              'Send time (your local time)',
              '발송 시간 (현지 시간)',
            )}
          </span>
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
