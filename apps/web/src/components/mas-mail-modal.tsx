import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Check, Send } from '@pv/ui'
import { Badge, Button, Icon, Modal, Stepper } from '@pv/ui'
import type { MasSendRequest } from '@pv/contracts'
import { MAS_MAX_RECIPIENTS } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailSyntaxGuide } from '@/components/mail-syntax-guide'
import {
  ComposeStep,
  DeliveryStep,
  PreviewPlaceholder,
  RecipientsStep,
} from '@/components/mas-mail-steps'
import { campaignFacetQuery } from '@/data/campaign-book'
import { isHttpUrl } from '@/data/http-url'
import { mailHints } from '@/data/mail-hints'
import {
  NO_CAMPAIGN,
  NO_TEMPLATE,
  templateCodeFrom,
  useMasMailDraft,
  type MasRecipient,
} from '@/data/mas-mail-draft'
import {
  masPreflight,
  masTemplatesQuery,
  useMailPreview,
  useMailTemplateCreate,
  useMasSend,
} from '@/data/mas'

/** One mail, composed in three answers: who · what · how.
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
  defaultLabel?: string
  onQueued: () => void
}

const STEPS = [
  { key: 'to', label: 'Gửi tới' },
  { key: 'content', label: 'Nội dung' },
  { key: 'how', label: 'Cách gửi' },
]

export function MasMailModal({
  open,
  onClose,
  leads,
  initialLeadCode,
  initialLeadCodes,
  defaultLabel,
  onQueued,
}: MasMailModalProps) {
  const draft = useMasMailDraft(open, initialLeadCode, initialLeadCodes)
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

  const ctaBroken = Boolean(draft.cta && (!draft.cta.label.trim() || !isHttpUrl(draft.cta.url)))
  const bookingBroken = Boolean(draft.bookingUrl.trim() && !isHttpUrl(draft.bookingUrl.trim()))
  const scheduleBroken =
    draft.sendTiming === 'later' &&
    (!draft.scheduledAt ||
      Number.isNaN(new Date(draft.scheduledAt).getTime()) ||
      new Date(draft.scheduledAt) <= new Date())

  const stepBlockers: (string | null)[] = [
    chosen.length > MAS_MAX_RECIPIENTS
      ? `Một lượt tối đa ${MAS_MAX_RECIPIENTS} lead — đang chọn ${chosen.length}.`
      : chosen.length === 0
        ? 'Chưa chọn người nhận.'
        : null,
    !draft.subject.trim() && !draft.body.trim()
      ? 'Còn thiếu tiêu đề, nội dung.'
      : !draft.subject.trim()
        ? 'Còn thiếu tiêu đề.'
        : !draft.body.trim()
          ? 'Còn thiếu nội dung.'
          : ctaBroken
            ? 'Nút trong email cần đủ nhãn và địa chỉ bắt đầu bằng http/https.'
            : bookingBroken
              ? 'Link đặt lịch phải bắt đầu bằng http/https.'
              : draft.saveAsTemplate && canSaveTemplate && !templateCodeFrom(draft.templateName)
                ? 'Đặt tên cho mẫu sắp lưu.'
                : null,
    scheduleBroken ? 'Thời gian đặt lịch phải sau thời điểm hiện tại.' : null,
  ]
  /* The send needs EVERY step to be clean, not just the one on screen — a
     subject deleted on the way back must not leave the button live. */
  const blocker = stepBlockers.find((item) => item !== null) ?? null

  const letterReady = draft.subject.trim() !== '' && draft.body.trim() !== ''
  const preview = useMailPreview(
    {
      subject: draft.subject,
      body: draft.body,
      ...(draft.cta && !ctaBroken ? { cta: draft.cta } : {}),
      ...(draft.bookingUrl.trim() && !bookingBroken ? { bookingUrl: draft.bookingUrl.trim() } : {}),
      ...(previewLead ? { leadCode: previewLead.code } : {}),
    },
    letterReady,
  )
  const hints = mailHints({
    subject: draft.subject,
    body: draft.body,
    ctaUrl: draft.cta?.url,
    bookingUrl: draft.bookingUrl,
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

  const submit = async () => {
    if (blocker || !preflight || preflight.sendable === 0 || send.isPending) return
    const label = (
      defaultLabel ||
      templates.find((item) => item.code === draft.template)?.name ||
      draft.subject
    ).trim()
    const payload: MasSendRequest = {
      leadCodes: chosen.map((lead) => lead.code),
      label,
      subject: draft.subject,
      body: draft.body,
      ...(draft.template === NO_TEMPLATE ? {} : { templateCode: draft.template }),
      ...(draft.cta ? { cta: draft.cta } : {}),
      ...(draft.bookingUrl.trim() ? { bookingUrl: draft.bookingUrl.trim() } : {}),
      ...(draft.sendTiming === 'later'
        ? { scheduledAt: new Date(draft.scheduledAt).toISOString() }
        : {}),
      ...(draft.campaignCode === NO_CAMPAIGN ? {} : { campaignCode: draft.campaignCode }),
      /* Stated on every send even though absent already means ON: this is the
         one value on the panel a person can turn OFF, and a field the request
         omits is a field nobody can read back off the wire. */
      trackEngagement: draft.trackEngagement,
    }

    setFailure('')
    try {
      const result = await send.mutateAsync(payload)
      toast(
        result.state === 'SCHEDULED'
          ? `Đã đặt lịch ${result.queued} email`
          : `Đã xếp hàng ${result.queued} email`,
        { tone: 'success', detail: 'Email sẽ rời hệ thống sau vài chục giây.' },
      )
      if (draft.saveAsTemplate && canSaveTemplate) keepAsTemplate()
      onQueued()
      onClose()
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : 'Không tạo được lượt gửi này.')
    }
  }

  /* Fired AFTER the send resolves and never awaited: the letter is the job, and
     a template the library refuses (a code already taken) must not turn a
     successful send into an error on screen. */
  const keepAsTemplate = () =>
    saveTemplate.mutate(
      {
        code: templateCodeFrom(draft.templateName),
        name: draft.templateName.trim(),
        subject: draft.subject,
        body: draft.body,
        ...(draft.cta ? { cta: draft.cta } : {}),
        ...(draft.bookingUrl.trim() ? { bookingUrl: draft.bookingUrl.trim() } : {}),
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
    draft.subject.trim() || 'Chưa soạn',
    draft.sendTiming === 'later' ? 'Hẹn giờ' : 'Gửi ngay',
  ]

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="xl"
        title={initialLeadCode ? 'Gửi email' : 'Gửi email hàng loạt'}
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
            timing={draft.sendTiming}
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
            {step === 1 && (
              <ComposeStep
                draft={draft}
                templates={templates}
                canSaveTemplate={canSaveTemplate}
                ctaBroken={ctaBroken}
                bookingBroken={bookingBroken}
                onOpenGuide={() => setGuideOpen(true)}
              />
            )}
            {step === 2 && (
              <DeliveryStep
                draft={draft}
                campaigns={campaigns}
                preflight={preflight}
                scheduleBroken={scheduleBroken}
                onEdit={goTo}
              />
            )}

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
          </div>
        </div>
      </Modal>

      {/* A sibling of the modal, not a child: it is a second overlay, and
          `overlay-stack.ts` gives Escape to whichever is on top. */}
      <MailSyntaxGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
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
            {sending ? 'Đang tạo lượt gửi…' : `Gửi ${sendable} email`}
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
