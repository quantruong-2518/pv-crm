import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Modal, Stepper } from '@pv/ui'
import type { CampaignWaveInput, MasAudience, MasSendRequest, MasSendResponse } from '@pv/contracts'
import { MAS_MAX_RECIPIENTS } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import {
  MailGuideButton,
  MailGuideDrawer,
  type MailGuideSection,
} from '@/components/mail-guide-drawer'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import { MailFooter } from '@/components/mas-mail-footer'
import { WaveComposer } from '@/components/mail-sequence/wave-composer'
import {
  composerBlocker,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import {
  DeliveryStep,
  PreviewPlaceholder,
  RecipientsStep,
  SaveTemplateBlock,
} from '@/components/mas-mail-steps'
import { campaignFacetQuery } from '@/data/campaign-book'
import { isHttpUrl } from '@/data/http-url'
import { mailHints } from '@/data/mail-hints'
import { NO_CAMPAIGN, useMasMailDraft, type MasRecipient } from '@/data/mas-mail-draft'
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
  recipients: MasRecipient[]
  initialCode?: string
  /** Rows highlighted in the source book. Seed, not a lock — more can be
   *  added in step 1. */
  initialCodes?: readonly string[]
  /** Which business book owns the selected destination codes. */
  subjectType?: MasAudience['subjectType']
  defaultLabel?: string
  onQueued: () => void
}

const STEPS = [
  { key: 'to', label: 'Gửi tới' },
  { key: 'content', label: 'Nội dung' },
  { key: 'how', label: 'Cách gửi' },
]

/** The guide opens on the part that answers the step being stood on. */
const GUIDE_SECTION: MailGuideSection[] = ['recipients', 'content', 'delivery']

export function MasMailModal({
  open,
  onClose,
  recipients,
  initialCode,
  initialCodes,
  subjectType = 'lead',
  defaultLabel,
  onQueued,
}: MasMailModalProps) {
  const draft = useMasMailDraft(open, initialCode, initialCodes, defaultLabel)
  const [chain, setChain] = useState<ComposerState>(emptyComposerState)
  const [sequenceId, setSequenceId] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof masPreflight>>>()
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState('')
  const [submittedWaves, setSubmittedWaves] = useState(0)
  const [queuedEmails, setQueuedEmails] = useState(0)

  const { data: catalogue } = useQuery({ ...masTemplatesQuery, enabled: open })
  const { data: campaignBook } = useQuery({ ...campaignFacetQuery, enabled: open })
  const send = useMasSend()
  const saveTemplate = useMailTemplateCreate()
  const canSaveTemplate = useCan('campaign.edit')

  useEffect(() => {
    if (!open) {
      /* The guide is a sibling of this panel, not a child — left open it would
         stay on screen after the panel it explains is gone. */
      setGuideOpen(false)
      return
    }
    setStep(0)
    setReached(0)
    setChain(emptyComposerState())
    setSequenceId(crypto.randomUUID())
    setPreflight(undefined)
    setChecking(false)
    setFailure('')
    setSubmittedWaves(0)
    setQueuedEmails(0)
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
    () => recipients.filter((recipient) => draft.selected.has(recipient.code)),
    [recipients, draft.selected],
  )
  const previewLead = chosen.find((lead) => lead.code === draft.previewCode) ?? chosen[0] ?? null

  /* WHO THE RUN IS FILED AGAINST, in the one shape the contract accepts. The
     deal door carries its own code; every other door is the picked leads. */
  const audience: MasAudience = { subjectType, codes: chosen.map((recipient) => recipient.code) }

  /* A sequence belongs to the selection as a whole. It can contain one or many
     destinations and does not need a campaign behind it. */
  const oneSubject = audience.codes.length === 1
  const cta = chainCta(chain)
  const bookingUrl = isHttpUrl(chain.bookingUrl.trim()) ? chain.bookingUrl.trim() : ''

  /* EVERY DOOR SENDS A LIST OF WAVES, and the single letter is a list of one.
     Two code paths into `POST /sales/mail/runs` would be two places for the
     campaign field or the tracking flag to be forgotten. */
  const waves = effectiveWaves(chain)
  const letter = { subject: chain.subject, body: chain.body, cta, bookingUrl }

  const templateNameGap =
    draft.saveAsTemplate && canSaveTemplate && draft.templateName.trim() === ''
      ? 'Đặt tên cho mẫu sắp lưu.'
      : null

  const stepBlockers: (string | null)[] = [
    chosen.length > MAS_MAX_RECIPIENTS
      ? `Một lượt tối đa ${MAS_MAX_RECIPIENTS} người nhận — đang chọn ${chosen.length}.`
      : chosen.length === 0
        ? 'Chưa chọn người nhận.'
        : null,
    composerBlocker(chain) ?? templateNameGap,
    draft.campaignCode === NO_CAMPAIGN && !draft.sequenceName.trim()
      ? 'Đặt tên cho chuỗi gửi này.'
      : null,
  ]
  /* The send needs EVERY step to be clean, not just the one on screen — a
     subject deleted on the way back must not leave the button live. */
  const blocker = stepBlockers.find((item) => item !== null) ?? null

  const letterReady = letter.subject.trim() !== '' && letter.body.trim() !== ''
  const preview = useMailPreview(
    {
      subject: letter.subject,
      body: letter.body,
      ...(letter.cta ? { cta: letter.cta } : {}),
      ...(letter.bookingUrl ? { bookingUrl: letter.bookingUrl } : {}),
      ...(previewLead ? { leadCode: previewLead.leadCode ?? previewLead.code } : {}),
    },
    letterReady,
  )
  const hints = mailHints({
    subject: letter.subject,
    body: letter.body,
    ctaUrl: letter.cta?.url,
    bookingUrl: letter.bookingUrl,
    missing: preview.letter?.missing,
  })

  const goTo = (next: number) => {
    /* Once any wave is queued, changing recipients or earlier phases would
       turn retry into a different sequence. The only safe action is resume. */
    if (submittedWaves > 0 && next < STEPS.length - 1) return
    setStep(next)
    setReached((furthest) => Math.max(furthest, next))
    setFailure('')
  }

  const checkRecipients = async () => {
    if (blocker) return
    setChecking(true)
    setFailure('')
    try {
      setPreflight(await masPreflight(audience))
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
    let completed = submittedWaves
    let queuedTotal = queuedEmails

    setFailure('')
    try {
      for (const [offset, wave] of waves.slice(submittedWaves).entries()) {
        const waveNo = submittedWaves + offset + 1
        const result = await send.mutateAsync({
          ...wave,
          audience,
          ...(draft.campaignCode === NO_CAMPAIGN ? {} : { campaignCode: draft.campaignCode }),
          ...(draft.campaignCode === NO_CAMPAIGN
            ? { sequence: { id: sequenceId, name: draft.sequenceName.trim(), waveNo } }
            : {}),
          ...(draft.cc.size > 0 ? { cc: [...draft.cc] } : {}),
          /* Stated on every send even though absent already means ON: this is
               the one value on the panel a person can turn OFF, and a field the
               request omits is a field nobody can read back off the wire. */
          trackEngagement: draft.trackEngagement,
        })
        done.push(result)
        completed += 1
        queuedTotal += result.queued
        setSubmittedWaves(completed)
        setQueuedEmails(queuedTotal)
      }
    } catch (error) {
      const reason = isApiError(error) ? userMessage(error) : 'Không tạo được lượt gửi này.'
      setFailure(
        completed > 0
          ? `${reason} Đợt 1–${completed} đã vào hàng đợi và không rút lại được; bấm gửi lại chỉ tiếp tục từ đợt ${completed + 1}.`
          : reason,
      )
      return
    }

    toast(sendReport(waves.length, queuedTotal, done), {
      tone: 'success',
      detail: 'Email sẽ rời hệ thống sau vài chục giây.',
    })
    const last = waves.at(-1)
    if (draft.saveAsTemplate && canSaveTemplate && last) keepAsTemplate(last)
    /* Screen cleanup is not part of sending. Even if a caller's optional
       callback fails, the completed sequence must close instead of being
       presented as a retryable mail failure. */
    try {
      onQueued()
    } finally {
      onClose()
    }
  }

  /* Fired AFTER the send resolves and never awaited: the letter is the job, and
     a template the library refuses for any other reason must not turn a
     successful send into an error on screen. */
  const keepAsTemplate = (wave: CampaignWaveInput) =>
    saveTemplate.mutate(
      {
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

  /* A step not yet walked has nothing to summarise: three lines saying
     "nothing picked, nothing written" under a panel somebody just opened only
     report back what they already know. */
  const summaries = [
    chosen.length === 0
      ? ''
      : chosen.length === 1
        ? (chosen[0]?.contactName ?? '')
        : `${chosen.length} người nhận`,
    letter.subject.trim(),
    `${waves.length} đợt`,
  ].map((summary, index) => (index <= reached ? summary : ''))

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
        headerAction={<MailGuideButton onOpen={() => setGuideOpen(true)} />}
        footer={
          <MailFooter
            failure={failure}
            stepBlocker={stepBlockers[step] ?? null}
            picked={chosen.length}
            step={step}
            last={step === STEPS.length - 1}
            nextLabel={STEPS[step + 1]?.label ?? ''}
            sendBlocked={Boolean(blocker)}
            checking={checking}
            sending={send.isPending}
            preflightDone={Boolean(preflight)}
            sendable={preflight?.sendable ?? 0}
            backBlocked={submittedWaves > 0}
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
            {step === 0 && <RecipientsStep draft={draft} recipients={recipients} chosen={chosen} />}
            {step === 1 && (
              <div className="flex min-w-0 flex-col gap-4">
                <WaveComposer
                  state={chain}
                  setState={setChain}
                  templates={templates}
                  frame="host"
                  {...(previewLead
                    ? { previewLeadCode: previewLead.leadCode ?? previewLead.code }
                    : {})}
                />
                <SaveTemplateBlock draft={draft} allowed={canSaveTemplate} />
              </div>
            )}
            {step === 2 && (
              <DeliveryStep
                draft={draft}
                chosen={chosen}
                campaigns={campaigns}
                allowCampaign={subjectType === 'lead'}
                preflight={preflight}
                chain={{ waves: waves.length, subject: letter.subject }}
                onEdit={goTo}
              />
            )}

            {/* ONE PREVIEW COLUMN FOR ALL THREE STEPS: it used to stand down
                while the composer drew its own, and a letter leaving the frame
                between two neighbouring steps read as a layout bug. */}
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

      <MailGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        section={GUIDE_SECTION[step] ?? 'content'}
      />
    </>
  )
}

/** The chain's live wave as the preview reads it — the button only travels when
 *  the pair is complete, exactly as the composer's own preview gates it. */
function chainCta(chain: ComposerState): MasSendRequest['cta'] {
  const label = chain.ctaLabel.trim()
  const url = chain.ctaUrl.trim()
  return label !== '' && isHttpUrl(url) ? { label, url } : undefined
}

/** What the toast says — "queued", never "sent": rows are written and a worker
 *  posts them seconds later. A chain reports its length, because the number of
 *  letters is not what the person just decided. */
function sendReport(waves: number, queued: number, latest: readonly MasSendResponse[]): string {
  if (waves > 1) return `Đã xếp hàng ${waves} đợt · ${queued} email`
  return latest.every((result) => result.state === 'SCHEDULED')
    ? `Đã đặt lịch ${queued} email`
    : `Đã xếp hàng ${queued} email`
}
