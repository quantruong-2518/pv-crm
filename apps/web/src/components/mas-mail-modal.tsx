import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Check, Send } from '@pv/ui'
import { Badge, Button, Icon, Modal, Stepper } from '@pv/ui'
import type { CampaignWaveInput, MasAudience, MasSendRequest, MasSendResponse } from '@pv/contracts'
import { MAS_MAX_RECIPIENTS } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailSyntaxGuide } from '@/components/mail-syntax-guide'
import { WaveComposer } from '@/components/mail-sequence/wave-composer'
import {
  composerBlocker,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import {
  ComposeStep,
  DeliveryStep,
  PreviewPlaceholder,
  RecipientsStep,
  SaveTemplateBlock,
} from '@/components/mas-mail-steps'
import { campaignFacetQuery } from '@/data/campaign-book'
import { isHttpUrl } from '@/data/http-url'
import { mailHints } from '@/data/mail-hints'
import {
  NO_CAMPAIGN,
  NO_TEMPLATE,
  templateCodeFrom,
  useMasMailDraft,
  type MasMailDraft,
  type MasRecipient,
} from '@/data/mas-mail-draft'
import {
  masPreflight,
  masTemplatesQuery,
  useMailPreview,
  useMailTemplateCreate,
  useMasSend,
} from '@/data/mas'

/** One mail — or one CHAIN of them — composed in three answers: who · what · how.
 *
 *  It replaces a single long form in which the send button sat below a
 *  recipient grid, a compose box, a schedule and a checklist — everything at
 *  once, and nothing finished. Each step now asks one question, the preview
 *  stands beside all three so the letter is never out of sight, and the footer
 *  says in a sentence what is still missing.
 *
 *  THE PREFLIGHT GATE IS UNCHANGED and must stay where it is: the send button
 *  does not exist until `POST /sales/mail/preflight` has answered, because
 *  suppression and duplicate addresses are only known to the server. Picking
 *  anybody new throws the answer away again. */
export type MasMailModalProps = {
  open: boolean
  onClose: () => void
  leads: MasRecipient[]
  initialLeadCode?: string
  /** Rows highlighted out in the lead book. Seed, not a lock — more can be
   *  added in step 1. */
  initialLeadCodes?: readonly string[]
  /** THE DEAL this run is filed against, when the panel was opened from one.
   *
   *  Absent = a lead run, and the audience is whatever the picker holds. Present
   *  = the run goes out as `subjectType: 'opportunity'`, while `leads` still
   *  carries the deal's origin lead — that row is the mailbox, and preflight and
   *  preview are both lead-side doors (`MasPreflightRequest.leadCodes`). */
  opportunityCode?: string
  defaultLabel?: string
  onQueued: () => void
}

const STEPS = [
  { key: 'to', label: 'Gửi tới' },
  { key: 'content', label: 'Nội dung' },
  { key: 'how', label: 'Cách gửi' },
]

/** THE CHECK ON THE DEAL DOOR READS THE LEAD, AND SAYS SO.
 *
 *  `POST /sales/mail/preflight` takes lead codes only, so a run filed against an
 *  opportunity is checked through the origin lead — the mailbox the letter
 *  actually reaches. Posting the deal's own code there would ask a lead-shaped
 *  question about a code no lead carries. Written on screen rather than left to
 *  be assumed: a verdict about a different row than the one on the header is
 *  exactly the kind of quiet lie this panel's preflight exists to prevent. */
const DEAL_PREFLIGHT_NOTE =
  'Cơ hội chưa có bước kiểm riêng — danh sách dưới đây kiểm theo lead gốc của đơn, cũng là hộp thư sẽ nhận thư này.'

export function MasMailModal({
  open,
  onClose,
  leads,
  initialLeadCode,
  initialLeadCodes,
  opportunityCode,
  defaultLabel,
  onQueued,
}: MasMailModalProps) {
  const draft = useMasMailDraft(open, initialLeadCode, initialLeadCodes)
  const [chain, setChain] = useState<ComposerState>(emptyComposerState)
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof masPreflight>>>()
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)

  const { data: catalogue } = useQuery({ ...masTemplatesQuery, enabled: open })
  const { data: campaignBook } = useQuery({ ...campaignFacetQuery, enabled: open })
  const send = useMasSend()
  const saveTemplate = useMailTemplateCreate()
  const canSaveTemplate = useCan('campaign.edit')

  useEffect(() => {
    if (!open) {
      setGuideOpen(false)
      return
    }
    setStep(0)
    setReached(0)
    setChain(emptyComposerState())
    setPreflight(undefined)
    setChecking(false)
    setFailure('')
  }, [open])

  /* The audience changed, so the server's verdict about it is stale. Clearing
     it puts the send button back behind the check — the whole point of the
     gate is that it describes THIS list. */
  useEffect(() => setPreflight(undefined), [draft.selected])

  const templates = useMemo(
    () => (catalogue?.rows ?? []).filter((item) => item.active),
    [catalogue],
  )
  const campaigns = useMemo(
    () => (campaignBook?.rows ?? []).filter((item) => item.state === 'RUNNING'),
    [campaignBook],
  )
  const chosen = useMemo(
    () => leads.filter((lead) => draft.selected.has(lead.code)),
    [leads, draft.selected],
  )
  const previewLead = chosen.find((lead) => lead.code === draft.previewCode) ?? chosen[0] ?? null

  /* WHO THE RUN IS FILED AGAINST, in the one shape the contract accepts. The
     deal door carries its own code; every other door is the picked leads. */
  const audience: MasAudience = opportunityCode
    ? { subjectType: 'opportunity', codes: [opportunityCode] }
    : { subjectType: 'lead', codes: chosen.map((lead) => lead.code) }

  /* THE CHAIN DOOR — one subject, opened from its own screen. Firing several
     waves at a hand-picked batch is what a campaign is for, so a bulk pick
     never becomes a chain even when exactly one row is ticked. */
  const oneSubject = opportunityCode !== undefined || initialLeadCode !== undefined
  const chained = oneSubject && audience.codes.length === 1

  const ctaBroken = Boolean(draft.cta && (!draft.cta.label.trim() || !isHttpUrl(draft.cta.url)))
  const bookingBroken = Boolean(draft.bookingUrl.trim() && !isHttpUrl(draft.bookingUrl.trim()))
  const scheduleBroken =
    draft.sendTiming === 'later' &&
    (!draft.scheduledAt ||
      Number.isNaN(new Date(draft.scheduledAt).getTime()) ||
      new Date(draft.scheduledAt) <= new Date())

  /* EVERY DOOR SENDS A LIST OF WAVES, and the single letter is a list of one.
     Two code paths into `POST /sales/mail/runs` would be two places for the
     campaign field or the tracking flag to be forgotten. */
  const waves = chained ? effectiveWaves(chain) : [waveOfDraft(draft, templates, defaultLabel)]
  const letter = chained
    ? {
        subject: chain.subject,
        body: chain.body,
        cta: chainCta(chain),
        bookingUrl: chain.bookingUrl,
      }
    : {
        subject: draft.subject,
        body: draft.body,
        cta: draft.cta,
        bookingUrl: draft.bookingUrl.trim(),
      }

  const templateNameGap =
    draft.saveAsTemplate && canSaveTemplate && !templateCodeFrom(draft.templateName)
      ? 'Đặt tên cho mẫu sắp lưu.'
      : null

  const stepBlockers: (string | null)[] = [
    chosen.length > MAS_MAX_RECIPIENTS
      ? `Một lượt tối đa ${MAS_MAX_RECIPIENTS} người nhận — đang chọn ${chosen.length}.`
      : chosen.length === 0
        ? 'Chưa chọn người nhận.'
        : null,
    (chained ? composerBlocker(chain) : letterBlocker(draft, ctaBroken, bookingBroken)) ??
      templateNameGap,
    /* Each wave of a chain carries its own time, so this step asks for none. */
    !chained && scheduleBroken ? 'Thời gian đặt lịch phải sau thời điểm hiện tại.' : null,
  ]
  /* The send needs EVERY step to be clean, not just the one on screen — a
     subject deleted on the way back must not leave the button live. */
  const blocker = stepBlockers.find((item) => item !== null) ?? null

  /* The composer draws its own preview beside its own compose box, so the
     panel's column would be a second rendering of the same letter. */
  const ownPreview = chained && step === 1
  const letterReady = letter.subject.trim() !== '' && letter.body.trim() !== ''
  const preview = useMailPreview(
    {
      subject: letter.subject,
      body: letter.body,
      ...(letter.cta && !ctaBroken ? { cta: letter.cta } : {}),
      ...(letter.bookingUrl && !bookingBroken ? { bookingUrl: letter.bookingUrl } : {}),
      ...(previewLead ? { leadCode: previewLead.code } : {}),
    },
    letterReady && !ownPreview,
  )
  const hints = mailHints({
    subject: letter.subject,
    body: letter.body,
    ctaUrl: letter.cta?.url,
    bookingUrl: letter.bookingUrl,
    missing: preview.letter?.missing,
  })

  const goTo = (next: number) => {
    setStep(next)
    setReached((furthest) => Math.max(furthest, next))
    setFailure('')
  }

  const checkRecipients = async () => {
    if (blocker) return
    setChecking(true)
    setFailure('')
    try {
      setPreflight(await masPreflight(chosen.map((lead) => lead.code)))
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : 'Không kiểm tra được người nhận.')
    } finally {
      setChecking(false)
    }
  }

  /* ONE POST PER WAVE, IN ORDER, AND THE FAILURE IS NAMED. There is no door
     that opens several runs at once outside a campaign, and a wave already
     queued cannot be recalled — so a chain that dies at wave 3 says so. */
  const submit = async () => {
    if (blocker || !preflight || preflight.sendable === 0 || send.isPending) return
    const done: MasSendResponse[] = []

    setFailure('')
    try {
      for (const wave of waves) {
        done.push(
          await send.mutateAsync({
            ...wave,
            audience,
            ...(draft.campaignCode === NO_CAMPAIGN ? {} : { campaignCode: draft.campaignCode }),
            /* Stated on every send even though absent already means ON: this is
               the one value on the panel a person can turn OFF, and a field the
               request omits is a field nobody can read back off the wire. */
            trackEngagement: draft.trackEngagement,
          }),
        )
      }
      toast(sendReport(done), {
        tone: 'success',
        detail: 'Email sẽ rời hệ thống sau vài chục giây.',
      })
      const last = waves.at(-1)
      if (draft.saveAsTemplate && canSaveTemplate && last) keepAsTemplate(last)
      onQueued()
      onClose()
    } catch (error) {
      const reason = isApiError(error) ? userMessage(error) : 'Không tạo được lượt gửi này.'
      setFailure(
        done.length > 0
          ? `${reason} Đợt 1–${done.length} đã vào hàng đợi và không rút lại được.`
          : reason,
      )
    }
  }

  /* Fired AFTER the send resolves and never awaited: the letter is the job, and
     a template the library refuses (a code already taken) must not turn a
     successful send into an error on screen. */
  const keepAsTemplate = (wave: CampaignWaveInput) =>
    saveTemplate.mutate(
      {
        code: templateCodeFrom(draft.templateName),
        name: draft.templateName.trim(),
        subject: wave.subject,
        body: wave.body,
        ...(wave.cta ? { cta: wave.cta } : {}),
        ...(wave.bookingUrl ? { bookingUrl: wave.bookingUrl } : {}),
      },
      {
        onSuccess: () => toast('Đã lưu mẫu email', { tone: 'success' }),
        onError: (error) =>
          toast(isApiError(error) ? userMessage(error) : 'Không lưu được mẫu email', {
            tone: 'warning',
            detail: 'Thư vẫn đã được xếp hàng gửi.',
          }),
      },
    )

  const summaries = [
    chosen.length === 0
      ? 'Chưa chọn'
      : chosen.length === 1
        ? (chosen[0]?.contactName ?? '')
        : `${chosen.length} người nhận`,
    letter.subject.trim() || 'Chưa soạn',
    chained ? `${waves.length} đợt` : draft.sendTiming === 'later' ? 'Hẹn giờ' : 'Gửi ngay',
  ]

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="xl"
        title={oneSubject ? 'Gửi email' : 'Gửi email hàng loạt'}
        subtitle="Ba bước: chọn người nhận, viết nội dung, chọn cách gửi."
        meta={
          <Badge tone={preflight?.blocked ? 'warning' : preflight ? 'success' : 'draft'}>
            {preflight ? `${preflight.sendable} người sẽ nhận` : `${chosen.length} đã chọn`}
          </Badge>
        }
        footer={
          <MailFooter
            message={
              failure ||
              stepBlockers[step] ||
              footerNote(step, chosen.length, preflight ? preflight.sendable : null)
            }
            warning={Boolean(failure || stepBlockers[step])}
            step={step}
            stepBlocked={Boolean(stepBlockers[step])}
            sendBlocked={Boolean(blocker)}
            checking={checking}
            sending={send.isPending}
            preflightDone={Boolean(preflight)}
            sendable={preflight?.sendable ?? 0}
            waves={waves.length}
            timing={waves.length > 0 && waves.every((wave) => wave.scheduledAt) ? 'later' : 'now'}
            onBack={() => (step === 0 ? onClose() : goTo(step - 1))}
            onNext={() => goTo(step + 1)}
            onCheck={() => void checkRecipients()}
            onSend={() => void submit()}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <Stepper steps={STEPS} current={step} reached={reached} onGo={goTo} />
            <div className="grid min-w-0 grid-cols-3 gap-2">
              {summaries.map((summary, index) => (
                <p
                  key={STEPS[index]?.key}
                  className="text-glass-foreground m-0 min-w-0 truncate text-[11px]"
                >
                  {summary}
                </p>
              ))}
            </div>
          </div>

          {/* `wide:` (1440px), NOT `lg:` (1024px) — 1024 IS the tablet frame,
              and splitting there leaves the preview ~348px of usable width for
              a ~600px letter table with `overflow-hidden`, which crops the mail
              and quietly shrinks the "phone" view below a real phone. Below
              1440 the preview stacks under the form at full width. */}
          <div className="wide:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] grid min-w-0 items-start gap-6">
            {step === 0 && <RecipientsStep draft={draft} leads={leads} chosen={chosen} />}
            {step === 1 &&
              (chained ? (
                <div className="wide:col-span-2 flex min-w-0 flex-col gap-4">
                  <WaveComposer
                    state={chain}
                    setState={setChain}
                    templates={templates}
                    {...(previewLead ? { previewLeadCode: previewLead.code } : {})}
                  />
                  <SaveTemplateBlock draft={draft} allowed={canSaveTemplate} />
                </div>
              ) : (
                <ComposeStep
                  draft={draft}
                  templates={templates}
                  canSaveTemplate={canSaveTemplate}
                  ctaBroken={ctaBroken}
                  bookingBroken={bookingBroken}
                  onOpenGuide={() => setGuideOpen(true)}
                />
              ))}
            {step === 2 && (
              <DeliveryStep
                draft={draft}
                campaigns={campaigns}
                preflight={preflight}
                scheduleBroken={scheduleBroken}
                {...(chained ? { chain: { waves: waves.length, subject: letter.subject } } : {})}
                {...(opportunityCode ? { audienceNote: DEAL_PREFLIGHT_NOTE } : {})}
                onEdit={goTo}
              />
            )}

            {!ownPreview && (
              <section className="flex min-w-0 flex-col gap-4">
                {letterReady ? (
                  <MailPreviewCard
                    letter={preview.letter}
                    pending={preview.pending}
                    error={preview.error}
                    recipients={chosen.map((lead) => ({
                      code: lead.code,
                      label: `Như ${lead.contactName} nhận`,
                    }))}
                    recipientCode={previewLead?.code}
                    onRecipient={draft.setPreviewCode}
                  />
                ) : (
                  <PreviewPlaceholder />
                )}
                <MailHintList hints={hints} />
              </section>
            )}
          </div>
        </div>
      </Modal>

      {/* A sibling of the modal, not a child: it is a second overlay, and
          `overlay-stack.ts` gives Escape to whichever is on top. */}
      <MailSyntaxGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}

/** The single-letter form as ONE wave, so both doors send the same shape. The
 *  run's name falls back the way it always has: the caller's label, then the
 *  template's name, then the subject — an unnamed run is a row nobody can find
 *  again in the run list. */
function waveOfDraft(
  draft: MasMailDraft,
  templates: readonly { code: string; name: string }[],
  defaultLabel?: string,
): CampaignWaveInput {
  const label = (
    defaultLabel ||
    templates.find((item) => item.code === draft.template)?.name ||
    draft.subject
  ).trim()
  /* Built on every render, so a half-typed time must not throw: an emptied
     `datetime-local` is `Invalid Date`, and `toISOString()` on one is a
     RangeError. The send button is already held by `scheduleBroken`. */
  const at = draft.sendTiming === 'later' ? new Date(draft.scheduledAt) : null

  return {
    label,
    subject: draft.subject,
    body: draft.body,
    ...(draft.template === NO_TEMPLATE ? {} : { templateCode: draft.template }),
    ...(draft.cta ? { cta: draft.cta } : {}),
    ...(draft.bookingUrl.trim() ? { bookingUrl: draft.bookingUrl.trim() } : {}),
    ...(at && !Number.isNaN(at.getTime()) ? { scheduledAt: at.toISOString() } : {}),
  }
}

/** The chain's live wave as the preview reads it — the button only travels when
 *  the pair is complete, exactly as the composer's own preview gates it. */
function chainCta(chain: ComposerState): MasSendRequest['cta'] {
  const label = chain.ctaLabel.trim()
  const url = chain.ctaUrl.trim()
  return label !== '' && isHttpUrl(url) ? { label, url } : undefined
}

/** What still stops the single-letter form from going out. */
function letterBlocker(
  draft: MasMailDraft,
  ctaBroken: boolean,
  bookingBroken: boolean,
): string | null {
  if (!draft.subject.trim() && !draft.body.trim()) return 'Còn thiếu tiêu đề, nội dung.'
  if (!draft.subject.trim()) return 'Còn thiếu tiêu đề.'
  if (!draft.body.trim()) return 'Còn thiếu nội dung.'
  if (ctaBroken) return 'Nút trong email cần đủ nhãn và địa chỉ bắt đầu bằng http/https.'
  if (bookingBroken) return 'Link đặt lịch phải bắt đầu bằng http/https.'
  return null
}

/** What the toast says — "queued", never "sent": rows are written and a worker
 *  posts them seconds later. A chain reports its length, because the number of
 *  letters is not what the person just decided. */
function sendReport(results: readonly MasSendResponse[]): string {
  const queued = results.reduce((total, result) => total + result.queued, 0)
  if (results.length > 1) return `Đã xếp hàng ${results.length} đợt · ${queued} email`
  return results.every((result) => result.state === 'SCHEDULED')
    ? `Đã đặt lịch ${queued} email`
    : `Đã xếp hàng ${queued} email`
}

/** What the footer says when nothing is wrong — one fact per step. */
function footerNote(step: number, picked: number, sendable: number | null): string {
  if (step === 0) return `${picked} người nhận · thư đi từ hộp thư chung của công ty`
  if (step === 1) return 'Xem bản bên phải trước khi sang bước sau.'
  return sendable === null ? 'Kiểm tra lại rồi gửi.' : `${sendable} người sẽ nhận thư này.`
}

function MailFooter({
  message,
  warning,
  step,
  stepBlocked,
  sendBlocked,
  checking,
  sending,
  preflightDone,
  sendable,
  waves,
  timing,
  onBack,
  onNext,
  onCheck,
  onSend,
}: {
  message: string
  warning: boolean
  step: number
  stepBlocked: boolean
  sendBlocked: boolean
  checking: boolean
  sending: boolean
  preflightDone: boolean
  sendable: number
  /** How many runs the button is about to open. More than one = a chain. */
  waves: number
  timing: 'now' | 'later'
  onBack: () => void
  onNext: () => void
  onCheck: () => void
  onSend: () => void
}) {
  const last = step === STEPS.length - 1

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <span
        aria-live="polite"
        className={
          warning
            ? 'text-warning min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
            : 'text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
        }
      >
        {message}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" onClick={onBack}>
          {step === 0 ? 'Huỷ' : 'Quay lại'}
        </Button>
        {!last ? (
          <Button size="lg" type="button" disabled={stepBlocked} onClick={onNext}>
            Tiếp: {STEPS[step + 1]?.label}
          </Button>
        ) : preflightDone ? (
          <Button
            size="lg"
            type="button"
            disabled={sendBlocked || sendable === 0 || sending}
            onClick={onSend}
          >
            <Icon icon={timing === 'later' ? CalendarClock : Send} size={16} />
            {sending
              ? 'Đang tạo lượt gửi…'
              : waves > 1
                ? `Gửi ${waves} đợt`
                : `Gửi ${sendable} email`}
          </Button>
        ) : (
          <Button size="lg" type="button" disabled={sendBlocked || checking} onClick={onCheck}>
            <Icon icon={Check} size={16} />
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra người nhận'}
          </Button>
        )}
      </div>
    </div>
  )
}
