import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal, Stepper } from '@pv/ui'
import type { CampaignWaveInput, MasAudience, MasSendRequest, MasSendResponse } from '@pv/contracts'
import { MAS_MAX_RECIPIENTS } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { MailGuideDrawer, type MailGuideSection } from '@/components/mail-guide-drawer'
import { MailFloatingAids } from '@/components/mail-compose-bits'
import { MailFooter } from '@/components/mas-mail-footer'
import { WaveComposer } from '@/components/mail-sequence/wave-composer'
import {
  composerBlocker,
  effectiveWaves,
  composerDraftTouched,
  emptyComposerState,
  withTemplate,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import {
  CheckBadge,
  DeliveryOptions,
  LetterColumn,
  MasSendConfirm,
  RecipientsStep,
  SaveTemplateBlock,
} from '@/components/mas-mail-steps'
import { campaignFacetQuery } from '@/data/campaign-book'
import { isHttpUrl } from '@/data/http-url'
import { mailHints, type MailHint } from '@/data/mail-hints'
import { NO_CAMPAIGN, isLater, useMasMailDraft, type MasRecipient } from '@/data/mas-mail-draft'
import {
  doorDefault,
  doorTemplatesQuery,
  useAutoPreflight,
  useMailPreview,
  useMailTemplateCreate,
  useMasSend,
} from '@/data/mas'

/** One mail — or one CHAIN of them — composed in two answers: who · what.
 *
 *  It replaces one long form where Send sat below a recipient grid, a compose
 *  box, a schedule and a checklist. Each step asks one question, the rare send
 *  choices fold under the letter, and Send asks once more with the numbers.
 *
 *  THE PREFLIGHT GATE STAYS: Send is shut until `POST /sales/mail/preflight`
 *  has answered for EXACTLY the list on screen, because suppression and
 *  duplicate addresses are only known to the server. Since G2 nobody presses
 *  a button for it — it re-runs whenever the list settles. */
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
  onQueued: () => void
}

const STEPS = [
  { key: 'to', label: 'Gửi tới' },
  { key: 'content', label: 'Nội dung' },
]

/** The guide opens on the step being stood on; "delivery" is one tab away. */
const GUIDE_SECTION: MailGuideSection[] = ['recipients', 'content']

export function MasMailModal({
  open,
  onClose,
  recipients,
  initialCode,
  initialCodes,
  subjectType = 'lead',
  onQueued,
}: MasMailModalProps) {
  const draft = useMasMailDraft(open, initialCode, initialCodes)
  const [chain, setChain] = useState<ComposerState>(emptyComposerState)
  const [sequenceId, setSequenceId] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [failure, setFailure] = useState('')
  const [submittedWaves, setSubmittedWaves] = useState(0)
  const [queuedEmails, setQueuedEmails] = useState(0)

  /* The book IS the door (G4, decision 9): a lead window picks from — and
     opens on the default of — the lead detail door; likewise opportunity. */
  const { data: catalogue } = useQuery({ ...doorTemplatesQuery(subjectType), enabled: open })
  const seeded = useRef(false)
  /* Set before the first POST, cleared only by a failure or a new opening: a
     stale second call would re-post every wave (no idempotency server-side). */
  const inFlight = useRef(false)
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
    setConfirming(false)
    inFlight.current = false
    setChain(emptyComposerState())
    setSequenceId(crypto.randomUUID())
    seeded.current = false
    setFailure('')
    setSubmittedWaves(0)
    setQueuedEmails(0)
  }, [open])

  const templates = useMemo(
    () => (catalogue?.rows ?? []).filter((item) => item.active),
    [catalogue],
  )
  const preset = catalogue ? doorDefault(catalogue.rows, subjectType) : undefined

  /* Once per opening, and never over a letter already begun: the default is
     where a blank panel starts, not something that overwrites typing. */
  useEffect(() => {
    if (!open || !preset || seeded.current) return
    seeded.current = true
    setChain((s) =>
      composerDraftTouched(s) ? s : { ...withTemplate(s, preset.code, preset), label: preset.name },
    )
  }, [open, preset])
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
  const preflight = useAutoPreflight(
    audience,
    open && chosen.length > 0 && chosen.length <= MAS_MAX_RECIPIENTS,
  )
  const report = preflight.report
  const cta = chainCta(chain)

  /* EVERY DOOR SENDS A LIST OF WAVES, and the single letter is a list of one.
     Two code paths into `POST /sales/mail/runs` would be two places for the
     campaign field or the tracking flag to be forgotten. */
  const waves = effectiveWaves(chain)
  const pending = waves.slice(submittedWaves)
  const letter = { subject: chain.subject, body: chain.body, cta }
  /* A typed name counts only while its field is on screen (a chain); a lone
     wave always carries the derived one, so no hidden field can block Send. */
  const sequenceName =
    waves.length > 1 && draft.sequenceName !== null
      ? draft.sequenceName
      : autoSequenceName(chosen, subjectType, chain.committed[0]?.label ?? chain.label)

  const templateNameGap =
    draft.saveAsTemplate && canSaveTemplate && draft.templateName.trim() === ''
      ? 'Đặt tên cho mẫu sắp lưu.'
      : null
  const chainNameGap =
    draft.campaignCode === NO_CAMPAIGN && !sequenceName.trim() ? 'Đặt tên cho chuỗi gửi này.' : null

  const stepBlockers: (string | null)[] = [
    chosen.length > MAS_MAX_RECIPIENTS
      ? `Một lượt tối đa ${MAS_MAX_RECIPIENTS} người nhận — đang chọn ${chosen.length}.`
      : chosen.length === 0
        ? 'Chưa chọn người nhận.'
        : null,
    composerBlocker(chain) ?? templateNameGap ?? chainNameGap,
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
      ...(previewLead ? { leadCode: previewLead.leadCode ?? previewLead.code } : {}),
    },
    letterReady,
  )
  const hints = withApollo(
    mailHints({
      subject: letter.subject,
      body: letter.body,
      ctaUrl: letter.cta?.url,
      missing: preview.letter?.missing,
    }),
    report?.apolloCount ?? 0,
  )

  const goTo = (next: number) => {
    /* Once any wave is queued, changing recipients or earlier phases would
       turn retry into a different sequence. The only safe action is resume. */
    if (submittedWaves > 0 && next < STEPS.length - 1) return
    setStep(next)
    setReached((furthest) => Math.max(furthest, next))
    setFailure('')
  }

  /* ONE POST PER WAVE, IN ORDER, AND THE FAILURE IS NAMED. There is no door
     that opens several runs at once outside a campaign, and a wave already
     queued cannot be recalled — so a chain that dies at wave 3 says so. */
  const submit = async () => {
    if (inFlight.current || blocker || !report || report.sendable === 0 || send.isPending) return
    if (waves.length <= submittedWaves) return
    inFlight.current = true
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
            ? { sequence: { id: sequenceId, name: sequenceName.trim(), waveNo } }
            : {}),
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
      inFlight.current = false
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
        /* G4: a template saved from a panel serves the door it was written at. */
        doors: [subjectType],
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

  /* A step not yet walked has nothing to summarise: two lines saying
     "nothing picked, nothing written" under a panel somebody just opened only
     report back what they already know. */
  const summaries = [
    chosen.length === 0
      ? ''
      : chosen.length === 1
        ? (chosen[0]?.contactName ?? '')
        : `${chosen.length} người nhận`,
    waves.length > 1 ? `${letter.subject.trim()} · ${waves.length} đợt` : letter.subject.trim(),
  ].map((summary, index) => (index <= reached ? summary : ''))

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="wide"
        title={oneSubject ? 'Gửi email' : 'Gửi email hàng loạt'}
        subtitle="Hai bước: chọn người nhận, rồi viết nội dung và gửi."
        meta={<CheckBadge checking={preflight.checking} report={report} picked={chosen.length} />}
        footer={
          <MailFooter
            failure={failure || preflight.error}
            stepBlocker={stepBlockers[step] ?? null}
            picked={chosen.length}
            step={step}
            sendBlocked={Boolean(blocker)}
            checking={preflight.checking}
            sending={send.isPending}
            verdict={report ? report.sendable : null}
            backBlocked={submittedWaves > 0}
            waves={pending.length}
            timing={isLater(pending) ? 'later' : 'now'}
            aids={<MailFloatingAids hints={hints} onGuide={() => setGuideOpen(true)} />}
            onBack={() => (step === 0 ? onClose() : goTo(step - 1))}
            onNext={() => goTo(step + 1)}
            {...(preflight.error ? { onRetryCheck: preflight.retry } : {})}
            onSend={() => setConfirming(true)}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <Stepper steps={STEPS} current={step} reached={reached} onGo={goTo} />
            <div className="grid min-w-0 grid-cols-2 gap-2">
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

          {step === 0 ? (
            <RecipientsStep
              draft={draft}
              recipients={recipients}
              chosen={chosen}
              verdicts={{ report, checking: preflight.checking }}
            />
          ) : (
            /* Two equal columns, form | letter (G-Bulk). `wide:` (1440px), NOT
               `lg:` — 1024 IS the tablet frame, and half of it crops a ~600px
               letter; below 1440 the letter stacks under the form. */
            <div className="wide:grid-cols-2 grid min-w-0 items-start gap-6">
              <div className="flex min-w-0 flex-col gap-4">
                {/* Once a wave is queued the chain is frozen: editing it now would
                    make "resume" send a different chain (see `goTo`). */}
                {submittedWaves > 0 ? (
                  <p className="text-warning m-0 text-[12.5px] leading-[1.6]">
                    {`Đợt 1–${submittedWaves} đã vào hàng đợi và không rút lại được. Thư và tuỳ chọn gửi đã khoá — bấm gửi để tiếp tục từ đợt ${submittedWaves + 1}.`}
                  </p>
                ) : (
                  <>
                    <WaveComposer
                      state={chain}
                      setState={setChain}
                      templates={templates}
                      frame="host"
                      door={subjectType}
                      {...(previewLead
                        ? { previewLeadCode: previewLead.leadCode ?? previewLead.code }
                        : {})}
                    />
                    <SaveTemplateBlock draft={draft} allowed={canSaveTemplate} />
                    <DeliveryOptions
                      draft={draft}
                      campaigns={campaigns}
                      allowCampaign={subjectType === 'lead'}
                      waves={waves.length}
                      sequenceName={sequenceName}
                      forceOpen={chainNameGap !== null}
                    />
                  </>
                )}
              </div>
              <LetterColumn
                ready={letterReady}
                preview={preview}
                chosen={chosen}
                previewLead={previewLead}
                onRecipient={draft.setPreviewCode}
              />
            </div>
          )}
        </div>
      </Modal>

      <MasSendConfirm
        open={confirming}
        chosen={chosen}
        report={report}
        waves={pending}
        queued={submittedWaves}
        onBack={() => setConfirming(false)}
        onConfirm={() => void submit()}
      />

      <MailGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        section={GUIDE_SECTION[step] ?? 'content'}
      />
    </>
  )
}

/** G3 · what an unnamed chain is called: the one subject's code, or the size of
 *  the list, then the first wave's name — which is its template's by default. */
function autoSequenceName(
  chosen: readonly MasRecipient[],
  subjectType: MasAudience['subjectType'],
  firstWave: string,
): string {
  const only = chosen.length === 1 ? chosen[0] : undefined
  const who = only
    ? only.code
    : `${chosen.length} ${subjectType === 'opportunity' ? 'cơ hội' : 'lead'}`
  return [who, firstWave.trim() || 'Tự soạn'].join(' · ')
}

/** The Apollo warning rides with the hints: advice for whoever is about to
 *  press send (ADR 0041), reachable from every step, never a block. */
function withApollo(hints: MailHint[] | null, apollo: number): MailHint[] | null {
  if (!hints || apollo === 0) return hints
  return [
    ...hints,
    {
      id: 'apollo',
      tone: 'warn',
      text: `Có ${apollo} liên hệ từ Apollo`,
      detail: 'Chỉ gửi khi đã xác nhận họ đồng ý nhận email.',
    },
  ]
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
