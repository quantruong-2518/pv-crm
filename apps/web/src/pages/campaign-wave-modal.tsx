import { useEffect, useState } from 'react'
import { Button, CalendarClock, Icon, Modal, Send, Stepper, cn } from '@pv/ui'
import type {
  CampaignPreflightResponse,
  CampaignProfile,
  CampaignWaveInput,
  MailTemplateRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { formatNumber, message, translate, useLang } from '@/app/i18n'
import { toast } from '@/app/toast'
import { type useCampaignStart, type useCampaignWaveAdd } from '@/data/campaign-book'
import { mailHints } from '@/data/mail-hints'
import { useMailPreview } from '@/data/mas'
import { isHttpUrl } from '@/data/http-url'
import { MailFloatingAids } from '@/components/mail-compose-bits'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import {
  composerBlocker,
  composerDraftInput,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import { ceilingNote } from './campaign-model'
import { ReachBadge, StepBody } from './campaign-wave-modal-parts'
import { fireLabel, stepSummaries, msg } from './campaign-wave-modal-text'

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
  { key: 'to', label: message('Gửi tới', 'Recipients', '수신자') },
  { key: 'content', label: message('Nội dung', 'Content', '내용') },
  { key: 'review', label: message('Kiểm lại', 'Review', '검토') },
]
const localizedSteps = () => STEPS.map((s) => ({ ...s, label: translate(s.label) }))

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
  const lang = useLang()
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
  const people = formatNumber(preflight?.sendable ?? campaign.audienceCount)

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
  const hints = mailHints(
    {
      subject: composer.subject,
      body: composer.body,
      ctaUrl: composer.ctaUrl,
      missing: preview.letter?.missing,
    },
    lang,
  )

  const goTo = (next: number) => {
    setStep(next)
    setReached((furthest) => Math.max(furthest, next))
  }

  const submit = () => {
    if (!blocker) fire(firstRun, waves, composer)
  }

  const label = fireLabel(busy, waves, scheduled, people)
  const note = stepBlockers[step] ?? (step === 2 ? blocker : null)
  const last = step === STEPS.length - 1
  const summaries = stepSummaries(people, composer.subject, waves.length)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="wide"
        title={msg(
          `Gửi đợt ${campaign.waveCount + 1}`,
          `Send wave ${campaign.waveCount + 1}`,
          `웨이브 ${campaign.waveCount + 1} 발송`,
        )}
        subtitle={`${campaign.code} · ${campaign.name}`}
        meta={<ReachBadge preflight={preflight} failed={preflightFailed} campaign={campaign} />}
        footer={
          <WaveFooter
            note={note ?? stepNote(step, preflight, preflightFailed)}
            warn={Boolean(note) || (preflightFailed && step !== 1)}
            hints={hints}
            onGuide={() => setGuideOpen(true)}
            back={step === 0 ? msg('Huỷ', 'Cancel', '취소') : msg('Quay lại', 'Back', '뒤로')}
            onBack={() => (step === 0 ? onClose() : goTo(step - 1))}
            busy={busy}
            {...(last
              ? {
                  fire: {
                    label,
                    scheduled,
                    disabled: Boolean(blocker) || busy,
                    onClick: submit,
                  },
                }
              : {
                  next: {
                    label: msg(
                      `Tiếp: ${translate(STEPS[step + 1]?.label ?? message('', '', ''))}`,
                      `Next: ${translate(STEPS[step + 1]?.label ?? message('', '', ''))}`,
                      `다음: ${translate(STEPS[step + 1]?.label ?? message('', '', ''))}`,
                    ),
                    disabled: Boolean(note),
                    onClick: () => goTo(step + 1),
                  },
                })}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-8">
          <StepHeader step={step} reached={reached} summaries={summaries} onGo={goTo} />

          <StepBody
            step={step}
            campaign={campaign}
            preflight={preflight}
            preflightFailed={preflightFailed}
            composer={composer}
            setComposer={setComposer}
            templates={templates}
            firstRun={firstRun}
            people={people}
            waves={waves}
            letterReady={letterReady}
            preview={preview}
            onEdit={goTo}
          />
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
    toast(msg('Không gửi được đợt', 'Could not send wave', '웨이브를 보낼 수 없습니다'), {
      tone: 'danger',
      detail: isApiError(err)
        ? userMessage(err)
        : msg('Hãy thử lại.', 'Please try again.', '다시 시도해 주세요.'),
    })
  const skipped = (n: number) =>
    n > 0 ? msg(`, bỏ qua ${n}`, `, ${n} skipped`, `, ${n}개 건너뜀`) : ''

  const fire = (firstRun: boolean, waves: CampaignWaveInput[], composer: ComposerState) => {
    if (busy) return
    if (firstRun) {
      start.mutate(
        { waves },
        {
          onSuccess: (res) => {
            const first = res.waves[0]
            toast(
              msg('Chiến dịch đã bắt đầu chạy', 'Campaign started', '캠페인이 시작되었습니다'),
              {
                tone: 'success',
                detail: first
                  ? msg(
                      `${first.queued} thư đang chờ gửi${skipped(first.skipped)}.`,
                      `${first.queued} emails queued${skipped(first.skipped)}.`,
                      `이메일 ${first.queued}개 대기 중${skipped(first.skipped)}.`,
                    )
                  : undefined,
              },
            )
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
          toast(
            msg(
              `Đã tạo đợt ${campaign.waveCount + 1}`,
              `Wave ${campaign.waveCount + 1} created`,
              `웨이브 ${campaign.waveCount + 1} 생성 완료`,
            ),
            {
              tone: 'success',
              detail: msg(
                `${res.queued} thư đang chờ gửi${skipped(res.skipped)}.`,
                `${res.queued} emails queued${skipped(res.skipped)}.`,
                `이메일 ${res.queued}개 대기 중${skipped(res.skipped)}.`,
              ),
            },
          )
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
      <Stepper steps={localizedSteps()} current={step} reached={reached} onGo={onGo} />
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

/** WHY NOBODY CAN BE WRITTEN TO — in the order somebody can act on it: an
 *  empty or oversized audience is theirs to fix, a dry run that reached nobody
 *  is the server's answer. `null` = the audience step is clean. */
function recipientBlocker(
  campaign: CampaignProfile,
  preflight: CampaignPreflightResponse | undefined,
): string | null {
  if (campaign.audienceCount === 0)
    return msg(
      'Chưa có người nhận. Hãy thêm người ở tab Người nhận trước khi gửi.',
      'There are no recipients. Add people in the Recipients tab before sending.',
      '수신자가 없습니다. 발송 전에 수신자 탭에서 추가하세요.',
    )
  if (campaign.audienceCount > campaign.batchCeiling)
    return ceilingNote(campaign.audienceCount, campaign.batchCeiling)
  if (preflight?.sendable === 0)
    return msg(
      'Không có ai nhận được thư. Hãy kiểm tra địa chỉ bị chặn, email còn thiếu, tên miền không hỗ trợ hoặc địa chỉ trùng trong tab Người nhận.',
      'No one can receive this email. Check blocked addresses, missing emails, unsupported domains, or duplicates in the Recipients tab.',
      '수신 가능한 사람이 없습니다. 수신자 탭에서 차단된 주소, 이메일 누락, 지원되지 않는 도메인 또는 중복 주소를 확인하세요.',
    )
  return null
}

/** What the footer says when nothing is missing — one fact per step. A failed
 *  check never blocks: the server skips whoever it cannot write to. */
function stepNote(
  step: number,
  preflight: CampaignPreflightResponse | undefined,
  failed: boolean,
): string {
  if (step === 1)
    return msg(
      'Xem trước email rồi chuyển sang bước Kiểm lại.',
      'Preview the email, then continue to Review.',
      '이메일을 미리 본 다음 검토 단계로 이동하세요.',
    )
  if (failed)
    return msg(
      'Không thể kiểm tra danh sách người nhận. Bạn vẫn có thể gửi; những người không đủ điều kiện sẽ được bỏ qua.',
      'Could not check recipients. You can still send; recipients who cannot receive the email will be skipped.',
      '수신자 확인에 실패했습니다. 계속 발송할 수 있으며 이메일을 받을 수 없는 수신자는 건너뜁니다.',
    )
  if (!preflight) return msg('Đang kiểm tra người nhận…', 'Checking recipients…', '수신자 확인 중…')
  if (step === 0)
    return msg(
      `${formatNumber(preflight.sendable)} người sẽ nhận đợt này.`,
      `${formatNumber(preflight.sendable)} recipients will receive this wave.`,
      `이번 웨이브의 수신자는 ${formatNumber(preflight.sendable)}명입니다.`,
    )
  return msg(
    'Email đã gửi không thể thu hồi.',
    'Sent emails cannot be recalled.',
    '발송된 이메일은 회수할 수 없습니다.',
  )
}

/** The chain's live wave as the preview reads it — the button only travels
 *  when the pair is complete, exactly as the composer gates it. */
function liveCta(s: ComposerState): CampaignWaveInput['cta'] {
  const label = s.ctaLabel.trim()
  const url = s.ctaUrl.trim()
  return label !== '' && isHttpUrl(url) ? { label, url } : undefined
}
