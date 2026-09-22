import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Save } from '@pv/ui'
import { Badge, Button, GlassCard, Icon, Modal, SectionTitle, Skeleton, Stepper } from '@pv/ui'
import type { MailRunDetail } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import {
  MailGuideButton,
  MailGuideDrawer,
  type MailGuideSection,
} from '@/components/mail-guide-drawer'
import { composerFromRun, mailRunEditFrom } from '@/components/mail-run-edit-draft'
import { SendWhen, WaveComposer } from '@/components/mail-sequence/wave-composer'
import {
  composerBlocker,
  emptyComposerState,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import { mailHints } from '@/data/mail-hints'
import {
  MAIL_RUN_STATE_LABEL,
  MAIL_RUN_STATE_TONE,
  useMailRunDetail,
  useMailRunEdit,
} from '@/data/mail-runs'
import { useMailPreview } from '@/data/mas'

/** FIX A BATCH BEFORE IT LEAVES — two steps, no audience, no send.
 *
 *  A sibling of `MasMailModal` rather than a mode inside it: that panel is a
 *  three-step walk around an AUDIENCE — pick it, preflight it, post one run per
 *  wave — and none of those four things exist here. The letter itself is the
 *  same `WaveComposer` in both, so what is shared is shared as components and
 *  what differs does not have to be branched inside the door that sends real
 *  mail to hundreds of people.
 *
 *  The recipients are NOT a question here. They were frozen into
 *  `email_delivery` rows when the batch opened, so the only things this panel
 *  may change are the six fields of `MailRunEdit`. */
const STEPS = [
  { key: 'content', label: 'Nội dung' },
  { key: 'how', label: 'Cách gửi' },
]

/** The only part of the guide this panel has a use for. Its audience is frozen
 *  and its second step holds one control, so the other two would explain
 *  campaign, sequence, CC and tracking — the four things `RunFacts` has just
 *  said cannot be touched from here. */
const GUIDE_PARTS: MailGuideSection[] = ['content']

const PREVIEW_CAPTION =
  'Tên và công ty là dữ liệu mẫu. Người nhận của lô này đã chốt lúc tạo lô và không đổi được.'

export function MailRunEditModal({
  runId,
  onClose,
}: {
  /** The batch being rewritten, or `null` when the panel is shut. The panel
   *  stays mounted either way so it can animate out with its content. */
  runId: string | null
  onClose: () => void
}) {
  const open = runId !== null
  const detail = useMailRunDetail(runId)
  const save = useMailRunEdit()

  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [guideOpen, setGuideOpen] = useState(false)
  const [failure, setFailure] = useState('')
  /* The batch AS IT WAS READ. It is both the seed of the form and the thing
     every field is compared against when the patch is built. */
  const [base, setBase] = useState<MailRunDetail>()
  const [form, setForm] = useState<ComposerState>(emptyComposerState)

  useEffect(() => {
    if (open) return
    setBase(undefined)
    setStep(0)
    setReached(0)
    setGuideOpen(false)
    setFailure('')
  }, [open])

  /* Seeded ONCE per opening: this query refetches on window focus, and a second
     seed would throw away whatever has been typed since the first. */
  useEffect(() => {
    if (!detail.data || base) return
    setBase(detail.data)
    setForm(composerFromRun(detail.data))
  }, [detail.data, base])

  const patch = base ? mailRunEditFrom(base, form) : {}
  const changed = Object.keys(patch).length

  /* The hour is re-checked only when somebody MOVED it. A batch whose time has
     passed while the sweeper lags is still `SCHEDULED`, and a typo fix on it
     must not be refused over a field nobody touched. */
  const blocker = composerBlocker(
    patch.scheduledAt === undefined ? { ...form, timing: 'now' } : form,
  )

  const letterReady = form.subject.trim() !== '' && form.body.trim() !== ''
  const preview = useMailPreview(
    {
      subject: form.subject,
      body: form.body,
      ...(form.ctaLabel.trim() !== '' && form.ctaUrl.trim() !== ''
        ? { cta: { label: form.ctaLabel.trim(), url: form.ctaUrl.trim() } }
        : {}),
      ...(form.bookingUrl.trim() !== '' ? { bookingUrl: form.bookingUrl.trim() } : {}),
    },
    open && letterReady,
  )
  const hints = mailHints({
    subject: form.subject,
    body: form.body,
    ctaUrl: form.ctaUrl,
    bookingUrl: form.bookingUrl,
    missing: preview.letter?.missing,
  })

  const submit = () => {
    if (!base || changed === 0 || blocker || save.isPending) return
    setFailure('')
    save.mutate(
      { id: base.id, edit: patch },
      {
        onSuccess: (result) => {
          toast('Đã lưu thay đổi', {
            tone: 'success',
            /* The one doubt worth answering: whether the QUEUE moved with the
               column, or the batch still goes out at the old hour. */
            ...(result.rescheduled === undefined
              ? {}
              : { detail: `${result.rescheduled} thư chưa gửi đã dời sang giờ mới.` }),
          })
          onClose()
        },
        onError: (error) => {
          const reason = isApiError(error) ? userMessage(error) : 'Không lưu được thay đổi.'
          setFailure(reason)
          toast('Máy chủ từ chối sửa lô này', { tone: 'danger', detail: reason })
        },
      },
    )
  }

  const locked = base && !base.editable
  /* A refetch that fails AFTER the form is seeded must not replace it: the
     letter on screen is the one being typed, and the read already succeeded. */
  const body = !base ? (
    detail.error ? (
      <p className="text-warning m-0 text-[12.5px] leading-[1.6]">
        {isApiError(detail.error) ? userMessage(detail.error) : 'Không đọc được lô này.'}
      </p>
    ) : (
      <Skeleton height={320} />
    )
  ) : locked ? (
    <LockedNote run={base} />
  ) : null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="xl"
        title="Sửa lô thư chưa gửi"
        subtitle={base ? runLine(base) : 'Đang mở lô…'}
        meta={base ? runBadge(base) : null}
        headerAction={<MailGuideButton onOpen={() => setGuideOpen(true)} />}
        footer={
          <EditFooter
            step={step}
            ready={Boolean(base) && !locked}
            blocker={failure || blocker}
            warn={Boolean(failure || blocker)}
            note={footerNote(Boolean(locked), changed)}
            saveBlocked={changed === 0 || Boolean(blocker)}
            saving={save.isPending}
            onBack={() => (step === 0 ? onClose() : setStep(0))}
            onNext={() => {
              setStep(1)
              setReached(1)
            }}
            onSave={submit}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          {body ??
            (base && (
              <EditSteps
                run={base}
                step={step}
                reached={reached}
                onGo={(next) => {
                  setStep(next)
                  setReached((furthest) => Math.max(furthest, next))
                }}
                form={form}
                setForm={setForm}
                letter={letterReady ? preview : null}
                hints={hints}
              />
            ))}
        </div>
      </Modal>

      <MailGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        section="content"
        parts={GUIDE_PARTS}
      />
    </>
  )
}

/** The two steps and the letter beside them — the same split as the send
 *  panel, and for the same reason: see the `wide:` note there. `letter` is
 *  `null` until the thing has a subject and a body, because there is nothing to
 *  render before that. */
function EditSteps({
  run,
  step,
  reached,
  onGo,
  form,
  setForm,
  letter,
  hints,
}: {
  run: MailRunDetail
  step: number
  reached: number
  onGo: (next: number) => void
  form: ComposerState
  setForm: Dispatch<SetStateAction<ComposerState>>
  letter: ReturnType<typeof useMailPreview> | null
  hints: ReturnType<typeof mailHints>
}) {
  return (
    <>
      <Stepper steps={STEPS} current={step} reached={reached} onGo={onGo} />

      <div className="wide:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] grid min-w-0 items-start gap-6">
        {step === 0 ? (
          <WaveComposer state={form} setState={setForm} templates={[]} frame="letter" />
        ) : (
          <section className="flex min-w-0 flex-col gap-4">
            <SectionTitle size="md">Gửi khi nào?</SectionTitle>
            <SendWhen state={form} setState={setForm} />
            <RunFacts run={run} />
          </section>
        )}

        <section className="flex min-w-0 flex-col gap-4">
          {letter ? (
            <MailPreviewCard
              letter={letter.letter}
              pending={letter.pending}
              error={letter.error}
              caption={PREVIEW_CAPTION}
            />
          ) : (
            <p className="text-muted-foreground m-0 px-1 text-[11.5px] leading-[1.6]">
              Bản xem trước hiện ở đây khi thư có tiêu đề và nội dung.
            </p>
          )}
          <MailHintList hints={hints} />
        </section>
      </div>
    </>
  )
}

/** The strip under the panel: what is missing or what will be saved, and the
 *  one button that moves. `ready` is false while the batch is still loading and
 *  on a batch that can no longer be edited — both cases leave only the way
 *  out. */
function EditFooter({
  step,
  ready,
  blocker,
  warn,
  note,
  saveBlocked,
  saving,
  onBack,
  onNext,
  onSave,
}: {
  step: number
  ready: boolean
  blocker: string | null
  warn: boolean
  note: string
  saveBlocked: boolean
  saving: boolean
  onBack: () => void
  onNext: () => void
  onSave: () => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <span
        aria-live="polite"
        className={
          warn
            ? 'text-warning min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
            : 'text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
        }
      >
        {blocker || note}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" onClick={onBack}>
          {step === 0 ? 'Đóng' : 'Quay lại'}
        </Button>
        {ready && step === 0 && (
          <Button size="lg" type="button" disabled={warn} onClick={onNext}>
            Tiếp: {STEPS[1]?.label}
          </Button>
        )}
        {ready && step === 1 && (
          <Button size="lg" type="button" disabled={saveBlocked || saving} onClick={onSave}>
            <Icon icon={Save} size={16} />
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        )}
      </div>
    </div>
  )
}

/** The same pill the run book draws for this batch — one batch must not change
 *  colour between the table and the panel opened from it. */
const runBadge = (run: MailRunDetail) => (
  <Badge tone={MAIL_RUN_STATE_TONE[run.state]}>{MAIL_RUN_STATE_LABEL[run.state]}</Badge>
)

const footerNote = (locked: boolean, changed: number) =>
  locked
    ? 'Lô này chỉ còn xem được.'
    : changed === 0
      ? 'Chưa đổi gì. Chỉ những ô bạn sửa mới được gửi đi.'
      : `${changed} mục sẽ được lưu. Người nhận giữ nguyên.`

/** Which batch is open, in one line. `waveNo` first because a chain is the case
 *  where "the label" names several things. */
function runLine(run: MailRunDetail): string {
  const chain = run.sequenceName ?? run.campaignName
  return [
    run.waveNo ? `Đợt ${run.waveNo}` : null,
    chain,
    run.phase ?? run.label,
    `${run.audienceCount.toLocaleString('vi-VN')} người nhận`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Why the form is not there. The server knows something the run book cannot:
 *  `state` may still read `SCHEDULED` while the first letter is already gone. */
function LockedNote({ run }: { run: MailRunDetail }) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-2 p-4">
      <span className="text-[12.5px] font-semibold">Lô này không sửa được nữa</span>
      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.6]">
        {run.state === 'SCHEDULED'
          ? 'Thư của lô đã bắt đầu rời máy, nên nội dung chốt từ lúc đó. Muốn dừng phần chưa gửi thì dùng nút Dừng ở sổ lô gửi.'
          : `Lô đang ở trạng thái "${MAIL_RUN_STATE_LABEL[run.state]}" — chỉ lô còn hẹn giờ và chưa gửi thư nào mới sửa được.`}
      </p>
    </GlassCard>
  )
}

/** Everything about this batch the edit door does NOT accept, as text. Here
 *  because which batch is open is a fair question, and as text because a
 *  control that cannot be saved is a control that lies. */
function RunFacts({ run }: { run: MailRunDetail }) {
  const rows = [
    { label: 'Người nhận', value: `${run.audienceCount.toLocaleString('vi-VN')} người · đã chốt` },
    { label: 'Chuỗi gửi', value: run.sequenceName ?? '—' },
    {
      label: 'Chiến dịch',
      value: run.campaignName ? `${run.campaignCode ?? ''} ${run.campaignName}`.trim() : '—',
    },
    { label: 'Theo dõi', value: run.trackEngagement ? 'Có ghi nhận mở và bấm' : 'Không ghi nhận' },
  ]

  return (
    <GlassCard variant="b" className="min-w-0 p-4">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li
            key={row.label}
            className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-sm px-3 py-2"
          >
            <span className="text-muted-foreground w-24 shrink-0 text-[11px]">{row.label}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground m-0 mt-3 text-[11px] leading-[1.5]">
        {rows.length} mục trên không sửa được từ đây. Cần đổi thì dừng lô rồi gửi lại.
      </p>
    </GlassCard>
  )
}
