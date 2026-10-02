import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  CalendarClock,
  GlassCard,
  Icon,
  Modal,
  Pencil,
  SectionTitle,
  Send,
  Skeleton,
  Stepper,
  TriangleAlert,
  cn,
} from '@pv/ui'
import { MAS_RECIPIENT_BLOCK_LABEL, MasRecipientBlock } from '@pv/contracts'
import type {
  CampaignPreflightResponse,
  CampaignProfile,
  CampaignWaveInput,
  MailTemplateRow,
  MasRecipient,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { type useCampaignStart, type useCampaignWaveAdd } from '@/data/campaign-book'
import { mailHints } from '@/data/mail-hints'
import { useMailPreview } from '@/data/mas'
import { isHttpUrl } from '@/data/http-url'
import { dmhm } from '@/lib/date'
import { MailFloatingAids, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import { WaveComposer } from '@/components/mail-sequence/wave-composer'
import {
  composerBlocker,
  composerDraftInput,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import { ceilingNote, overlapNote } from './campaign-model'

/** Module 1 · THE ONE DOOR THAT SENDS CAMPAIGN MAIL — a Modal in the mould of
 *  `MasMailModal`, so a campaign wave reads like every other mail in the app.
 *
 *  Three answers, one per step: who (the audience, fixed — the step only shows
 *  what the server says of it), what (the letter beside its preview), and a
 *  last look beside the same letter before the button that cannot be undone.
 *  The letter stacks under the form below `wide:` (1440px), as in the MAS
 *  modal: half of a tablet frame crops a ~600px letter.
 *
 *  `firstRun` picks the endpoint and nothing else: a DRAFT with no wave is the
 *  only shape `/start` accepts, every later wave goes to `/waves`. ONE wave per
 *  press after the first, because a browser-side loop dying halfway could not
 *  say which waves went out — the server's own loop (`/start`) can. */

const STEPS = [
  { key: 'to', label: 'Gửi tới' },
  { key: 'content', label: 'Nội dung' },
  { key: 'review', label: 'Kiểm lại' },
]

/** The guide's recipient and delivery parts explain the MAS panel's fields,
 *  none of which this door draws. */
const CONTENT_ONLY = ['content' as const]

export function WaveModal({
  campaign,
  templates,
  open,
  onClose,
  start,
  waveAdd,
  preflight,
  preflightFailed = false,
}: {
  campaign: CampaignProfile
  templates: MailTemplateRow[]
  open: boolean
  onClose: () => void
  start: ReturnType<typeof useCampaignStart>
  waveAdd: ReturnType<typeof useCampaignWaveAdd>
  /** The server's answer to "who would this wave reach"; `undefined` while
   *  `POST /sales/campaigns/:code/preflight` is in the air. */
  preflight?: CampaignPreflightResponse
  preflightFailed?: boolean
}) {
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState)
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)

  /* A fresh sheet on every opening, never on closing: the panel stays mounted
     while it animates out, and clearing there empties it mid-animation. */
  useEffect(() => {
    if (open) {
      setComposer(emptyComposerState())
      setStep(0)
      setReached(0)
    } else setGuideOpen(false)
  }, [open])

  const firstRun = campaign.state === 'DRAFT' && campaign.waveCount === 0
  const waves = effectiveWaves(composer)
  const { busy, fire } = useFireWave(campaign, start, waveAdd, onClose)
  const scheduled = waves.length === 1 && waves[0]?.scheduledAt !== undefined
  /* The real count the moment there is one — the audience is who WOULD be
     written to, the preflight is who will be. */
  const people = (preflight?.sendable ?? campaign.audienceCount).toLocaleString('vi-VN')

  const stepBlockers = [recipientBlocker(campaign, preflight), composerBlocker(composer), null]
  /* Every step must be clean to fire, not only the open one — a subject
     deleted on the way back must not leave the button live. */
  const blocker = stepBlockers.find((b) => b !== null) ?? null

  const cta = liveCta(composer)
  const letterReady = composer.subject.trim() !== '' && composer.body.trim() !== ''
  const preview = useMailPreview(
    { subject: composer.subject, body: composer.body, ...(cta ? { cta } : {}) },
    open && step > 0 && letterReady,
  )
  const hints = mailHints({
    subject: composer.subject,
    body: composer.body,
    ctaUrl: composer.ctaUrl,
    missing: preview.letter?.missing,
  })

  const goTo = (next: number) => {
    setStep(next)
    setReached((furthest) => Math.max(furthest, next))
  }

  const submit = () => {
    if (!blocker) fire(firstRun, waves, composer)
  }

  const fireLabel = busy
    ? 'Đang gửi…'
    : waves.length > 1
      ? `Gửi ${waves.length} đợt cho ${people} người`
      : scheduled && waves[0]?.scheduledAt
        ? `Hẹn ${dmhm(waves[0].scheduledAt)} cho ${people} người`
        : `Gửi cho ${people} người`
  const note = stepBlockers[step] ?? (step === 2 ? blocker : null)
  const last = step === STEPS.length - 1
  const summaries = [
    `${people} người nhận`,
    composer.subject.trim(),
    `${Math.max(waves.length, 1)} đợt`,
  ]

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="wide"
        title={`Gửi đợt ${campaign.waveCount + 1}`}
        subtitle={`${campaign.code} · ${campaign.name}`}
        meta={<ReachBadge preflight={preflight} failed={preflightFailed} campaign={campaign} />}
        footer={
          <WaveFooter
            note={note ?? stepNote(step, preflight, preflightFailed)}
            warn={Boolean(note) || (preflightFailed && step !== 1)}
            hints={hints}
            onGuide={() => setGuideOpen(true)}
            back={step === 0 ? 'Huỷ' : 'Quay lại'}
            onBack={() => (step === 0 ? onClose() : goTo(step - 1))}
            busy={busy}
            {...(last
              ? {
                  fire: {
                    label: fireLabel,
                    scheduled,
                    disabled: Boolean(blocker) || busy,
                    onClick: submit,
                  },
                }
              : {
                  next: {
                    label: `Tiếp: ${STEPS[step + 1]?.label ?? ''}`,
                    disabled: Boolean(note),
                    onClick: () => goTo(step + 1),
                  },
                })}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-8">
          <StepHeader step={step} reached={reached} summaries={summaries} onGo={goTo} />

          {step === 0 ? (
            <AudienceStep preflight={preflight} failed={preflightFailed} />
          ) : (
            <div className="wide:grid-cols-2 grid min-w-0 items-start gap-8">
              {step === 1 ? (
                <WaveComposer
                  state={composer}
                  setState={setComposer}
                  templates={templates}
                  frame="host"
                  door="campaign"
                  showAdd={firstRun}
                  alreadyFired={campaign.waveCount}
                />
              ) : (
                <WaveReview
                  people={people}
                  waves={waves}
                  firstWave={campaign.waveCount + 1}
                  onEdit={goTo}
                />
              )}
              <LetterPreview
                ready={letterReady}
                preview={preview}
                to={`${people} người nhận của ${campaign.code}`}
              />
            </div>
          )}
        </div>
      </Modal>

      <MailGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        section="content"
        parts={CONTENT_ONLY}
      />
    </>
  )
}

/** Fires the wave through the right door and says what happened. The hook
 *  owns the two mutations' toasts so the panel only decides WHEN to fire. */
function useFireWave(
  campaign: CampaignProfile,
  start: ReturnType<typeof useCampaignStart>,
  waveAdd: ReturnType<typeof useCampaignWaveAdd>,
  onClose: () => void,
) {
  const busy = start.isPending || waveAdd.isPending
  const failed = (err: unknown) =>
    toast('Không bắn được đợt', {
      tone: 'danger',
      detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
    })
  const skipped = (n: number) => (n > 0 ? `, ${n} bị bỏ qua` : '')

  const fire = (firstRun: boolean, waves: CampaignWaveInput[], composer: ComposerState) => {
    if (busy) return
    if (firstRun) {
      start.mutate(
        { waves },
        {
          onSuccess: (res) => {
            const first = res.waves[0]
            toast('Chiến dịch đã bắt đầu chạy', {
              tone: 'success',
              detail: first
                ? `${first.queued} thư vào hàng đợi${skipped(first.skipped)}.`
                : undefined,
            })
            onClose()
          },
          onError: failed,
        },
      )
      return
    }
    waveAdd.mutate(
      { wave: composerDraftInput(composer) },
      {
        onSuccess: (res) => {
          toast(`Đã bắn đợt ${campaign.waveCount + 1}`, {
            tone: 'success',
            detail: `${res.queued} thư vào hàng đợi${skipped(res.skipped)}.`,
          })
          onClose()
        },
        onError: failed,
      },
    )
  }

  return { busy, fire }
}

/** The stepper with one line under each step saying what it already holds —
 *  blank until the step has been opened, as in the MAS modal. */
function StepHeader({
  step,
  reached,
  summaries,
  onGo,
}: {
  step: number
  reached: number
  summaries: string[]
  onGo: (step: number) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Stepper steps={STEPS} current={step} reached={reached} onGo={onGo} />
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {summaries.map((s, i) => (
          <p key={STEPS[i]?.key} className="text-muted-foreground m-0 min-w-0 truncate text-[11px]">
            {i <= reached ? s : ''}
          </p>
        ))}
      </div>
    </div>
  )
}

/** The letter beside the form — sample values in the merge slots, because a
 *  campaign audience is frozen members, not a mailbox this draft can name. */
function LetterPreview({
  ready,
  preview,
  to,
}: {
  ready: boolean
  preview: ReturnType<typeof useMailPreview>
  to: string
}) {
  if (!ready)
    return (
      <p className="text-muted-foreground m-0 px-1 text-[12px] leading-[1.6]">
        Bản xem trước hiện ở đây ngay khi đợt có tiêu đề và nội dung.
      </p>
    )
  return (
    <MailPreviewCard
      letter={preview.letter}
      pending={preview.pending}
      error={preview.error}
      envelope={[
        { label: 'Từ', value: preview.letter?.from ?? 'noreply · Pebble Vina' },
        { label: 'Tới', value: to },
      ]}
      caption="Tên và công ty trong bản này là dữ liệu mẫu — mỗi người nhận được thay tên riêng. Bố cục đúng như thư gửi đi."
    />
  )
}

/** The strip under the panel: one sentence about what is missing, then the
 *  way back and the one button that moves — `MailFooter`'s shape, with the
 *  campaign's own fire rules (a failed check never shuts the button). */
function WaveFooter({
  note,
  warn,
  hints,
  onGuide,
  back,
  onBack,
  busy,
  next,
  fire,
}: {
  note: string
  warn: boolean
  hints: ReturnType<typeof mailHints>
  onGuide: () => void
  back: string
  onBack: () => void
  busy: boolean
  next?: { label: string; disabled: boolean; onClick: () => void }
  fire?: { label: string; scheduled: boolean; disabled: boolean; onClick: () => void }
}) {
  return (
    <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-4">
      <div className="absolute bottom-full right-0 mb-8">
        <MailFloatingAids hints={hints} onGuide={onGuide} />
      </div>
      <span
        aria-live="polite"
        className={cn(
          'min-w-0 max-w-[560px] text-[12px] leading-5',
          warn ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {note}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" disabled={busy} onClick={onBack}>
          {back}
        </Button>
        {next && (
          <Button size="lg" disabled={next.disabled} onClick={next.onClick}>
            {next.label}
          </Button>
        )}
        {fire && (
          <Button size="lg" disabled={fire.disabled} onClick={fire.onClick}>
            <Icon icon={fire.scheduled ? CalendarClock : Send} size={16} />
            {fire.label}
          </Button>
        )}
      </div>
    </div>
  )
}

/** STEP 1 · the audience as the server reads it. Nothing to pick: the list is
 *  the campaign's, and a second place to edit it would be a second truth. */
function AudienceStep({
  preflight,
  failed,
}: {
  preflight?: CampaignPreflightResponse
  failed: boolean
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionTitle size="md">Ai sẽ nhận đợt này?</SectionTitle>
        <p className="text-muted-foreground m-0 max-w-[720px] text-[12.5px] leading-[1.65]">
          Đợt đi tới mọi người ở tab Người nhận của chiến dịch. Danh sách không sửa ở đây — muốn
          thêm hay bớt ai thì đóng cửa sổ này và sửa ở tab đó.
        </p>
      </div>
      {preflight && <WavePreflight report={preflight} />}
      {!preflight && !failed && <Skeleton className="h-40 w-full" />}
    </section>
  )
}

/** WHY NOBODY CAN BE WRITTEN TO — in the order somebody can act on it: an
 *  empty or oversized audience is theirs to fix, a dry run that reached nobody
 *  is the server's answer. `null` = the audience step is clean. */
function recipientBlocker(
  campaign: CampaignProfile,
  preflight: CampaignPreflightResponse | undefined,
): string | null {
  if (campaign.audienceCount === 0)
    return 'Chưa có người nhận nào — thêm ở tab Người nhận trước khi bắn.'
  if (campaign.audienceCount > campaign.batchCeiling)
    return ceilingNote(campaign.audienceCount, campaign.batchCeiling)
  if (preflight?.sendable === 0)
    return 'Không người nhận nào nhận được thư: tất cả đều đã rơi khỏi phễu, đã chặn, thiếu email hoặc trùng địa chỉ. Sửa ở tab Người nhận rồi quay lại.'
  return null
}

/** What the footer says when nothing is missing — one fact per step. A failed
 *  check never blocks: the server skips whoever it cannot write to. */
function stepNote(
  step: number,
  preflight: CampaignPreflightResponse | undefined,
  failed: boolean,
): string {
  if (step === 1) return 'Xem lại bản xem trước rồi hãy sang bước kiểm lại.'
  if (failed)
    return 'Không kiểm được người nhận nên số trên nút là toàn bộ người nhận — bắn vẫn chạy, máy chủ tự bỏ qua những người không gửi được.'
  if (!preflight) return 'Đang kiểm người nhận…'
  if (step === 0) return `${preflight.sendable} người sẽ nhận đợt này.`
  return 'Bấm là thư vào hàng đợi thật — đợt đã đi không gọi về được.'
}

/** The chain's live wave as the preview reads it — the button only travels
 *  when the pair is complete, exactly as the composer gates it. */
function liveCta(s: ComposerState): CampaignWaveInput['cta'] {
  const label = s.ctaLabel.trim()
  const url = s.ctaUrl.trim()
  return label !== '' && isHttpUrl(url) ? { label, url } : undefined
}

/** The header count — the server's, once it answered; the audience before. */
function ReachBadge({
  preflight,
  failed,
  campaign,
}: {
  preflight?: CampaignPreflightResponse
  failed: boolean
  campaign: CampaignProfile
}) {
  if (!preflight && !failed) return <Badge tone="draft">Đang kiểm tra…</Badge>
  if (!preflight)
    return (
      <Badge tone="draft">
        <span className="tnum">{`${campaign.audienceCount} người nhận`}</span>
      </Badge>
    )
  return (
    <Badge tone={preflight.blocked ? 'warning' : 'success'}>
      <span className="tnum">{`${preflight.sendable} người sẽ nhận`}</span>
    </Badge>
  )
}

/** THE LAST LOOK — four lines and a way back to each, beside the letter. A
 *  chain names its length instead of one hour, because each wave carries its
 *  own. */
function WaveReview({
  people,
  waves,
  firstWave,
  onEdit,
}: {
  people: string
  waves: CampaignWaveInput[]
  firstWave: number
  onEdit: (step: number) => void
}) {
  const one = waves.length === 1 ? waves[0] : undefined
  const rows = [
    { label: 'Người nhận', value: `${people} người`, step: 0 },
    {
      label: 'Đợt',
      value: one ? `Đợt ${firstWave} · ${one.label}` : `${waves.length} đợt, từ Đợt ${firstWave}`,
      step: 1,
    },
    { label: 'Tiêu đề', value: one?.subject ?? waves[0]?.subject ?? 'Chưa có', step: 1 },
    {
      label: 'Lúc gửi',
      value: !one ? 'Theo lịch của từng đợt' : one.scheduledAt ? dmhm(one.scheduledAt) : 'Gửi ngay',
      step: 1,
    },
  ]

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <SectionTitle size="md">Đúng như vậy chưa?</SectionTitle>
      <GlassCard variant="b" className="min-w-0 p-4">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((row) => (
            <li
              key={row.label}
              className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-sm py-1 pl-3 pr-1"
            >
              <span className="text-muted-foreground w-20 shrink-0 text-[11.5px]">{row.label}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.value}</span>
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => onEdit(row.step)}
              >
                <Icon icon={Pencil} size={14} />
                Sửa
              </Button>
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  )
}

/** WHO THIS WAVE REALLY REACHES — sendable first, then one group per refusal:
 *  the first question is whether the number on the button is the number meant,
 *  the second is who fell out. Reason labels are `MAS_RECIPIENT_BLOCK_LABEL`,
 *  the vocabulary the server's send report already prints. Overlap with other
 *  running campaigns is a warning line, never a group — those people still get
 *  this letter (ADR 0061 §5). No inner scroll: the modal body already scrolls. */
function WavePreflight({ report }: { report: CampaignPreflightResponse }) {
  const sendable = report.recipients.filter((r) => !r.block)
  const groups = MasRecipientBlock.options
    .map((reason) => ({ reason, rows: report.recipients.filter((r) => r.block === reason) }))
    .filter((g) => g.rows.length > 0)
  const overlap = overlapNote(report.alsoRunning)

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-5 p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">Người nhận sau kiểm tra</span>
        <span className="text-muted-foreground text-[12px]">
          <span className="tnum text-card-foreground font-semibold">{report.sendable}</span> gửi
          được · <span className="tnum">{report.blocked}</span> bị bỏ qua
        </span>
      </div>
      {overlap && (
        <p className="text-warning m-0 flex gap-2 text-[12px] leading-[1.5]">
          <Icon icon={TriangleAlert} size={16} className="shrink-0" />
          {overlap}
        </p>
      )}
      <RecipientGroup title={`Sẽ nhận thư (${sendable.length})`} rows={sendable} />
      {groups.map((g) => (
        <RecipientGroup
          key={g.reason}
          title={`${MAS_RECIPIENT_BLOCK_LABEL[g.reason]} (${g.rows.length})`}
          rows={g.rows}
          blocked
        />
      ))}
    </GlassCard>
  )
}

/** One reason and the people it applies to, NAMED rather than counted: a row
 *  nobody can name is a row nobody can go and fix. Two columns from `md` — a
 *  single file of names down a 1296px panel is mostly empty space. */
function RecipientGroup({
  title,
  rows,
  blocked = false,
}: {
  title: string
  rows: readonly MasRecipient[]
  blocked?: boolean
}) {
  if (rows.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span
        className={cn(
          'text-[12px] font-semibold',
          blocked ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {title}
      </span>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.subjectCode}
            className="bg-surface-ink/5 flex min-w-0 items-center justify-between gap-3 rounded-sm p-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{r.contactName}</span>
              <span className="text-muted-foreground truncate text-[11px]">{r.company}</span>
            </span>
            <span className="text-muted-foreground min-w-0 truncate font-mono text-[11px]">
              {r.email ?? 'Chưa có email'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
