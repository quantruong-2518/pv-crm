import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Save } from '@pv/ui'
import { Badge, Button, GlassCard, Icon, Modal, Skeleton } from '@pv/ui'
import type { MailRunDetail } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { MailFloatingAids, MailPreviewCard, OldBookingLink } from '@/components/mail-compose-bits'
import { MailGuideDrawer, type MailGuideSection } from '@/components/mail-guide-drawer'
import { composerFromRun, mailRunEditFrom } from '@/components/mail-run-edit-draft'
import { MailSendConfirm, SendOptions } from '@/components/mail-send-confirm'
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
  mailRunRoute,
  useMailRunDetail,
  useMailRunEdit,
} from '@/data/mail-runs'
import { useMailPreview } from '@/data/mas'
import { dmhm } from '@/lib/date'

/** FIX A BATCH BEFORE IT LEAVES — one letter, no audience, no new run.
 *
 *  A sibling of `MasMailModal` rather than a mode inside it: that panel walks
 *  an AUDIENCE — pick it, preflight it, post one run per wave — and none of
 *  that exists here; the shared letter is shared as `WaveComposer`. Recipients
 *  were frozen into `email_delivery` rows when the batch opened, so only the
 *  fields of `MailRunEdit` change. Saving still decides what leaves and when,
 *  so it asks first (`SaveConfirm`). Saves go through `/own` for the run's
 *  creator (G8), else the broadcast door — see `mailRunRoute`.
 *
 *  Only the content part of the guide applies: campaign, sequence, CC and
 *  tracking are exactly what `RunFacts` says cannot be touched here. */
const GUIDE_PARTS: MailGuideSection[] = ['content']

const PREVIEW_CAPTION =
  'Tên và công ty là dữ liệu mẫu. Người nhận của lô này đã chốt lúc tạo lô và không đổi được.'
/** `/sales/mail/preview` always renders a sample unsubscribe footer — it has no
 *  `delivery_id` to sign yet and cannot know the letter is bound for a GROUP
 *  door. A group letter never carries that footer when it actually sends
 *  (`mas-letter.ts`), so the note replaces the caption rather than letting the
 *  preview promise a link the real letter will not have. */
const GROUP_PREVIEW_CAPTION = `${PREVIEW_CAPTION} Dòng huỷ đăng ký dưới thư chỉ hiện ở bản xem trước — thư gộp gửi thật không có dòng đó.`

export function MailRunEditModal({
  runId,
  viaContent = false,
  onClose,
}: {
  /** The batch being rewritten, or `null` when the panel is shut. The panel
   *  stays mounted either way so it can animate out with its content. */
  runId: string | null
  /** Someone else's group letter: its body is read through the audited door. */
  viaContent?: boolean
  onClose: () => void
}) {
  const open = runId !== null
  const detail = useMailRunDetail(runId, viaContent)
  const save = useMailRunEdit()
  const can = { send: useCan('lead.send-email'), broadcast: useCan('campaign.broadcast') }

  const [confirming, setConfirming] = useState(false)
  /* Cleared by a refusal or a new opening only — see the send panel's twin. */
  const inFlight = useRef(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [failure, setFailure] = useState('')
  /* The batch AS IT WAS READ. It is both the seed of the form and the thing
     every field is compared against when the patch is built. */
  const [base, setBase] = useState<MailRunDetail>()
  const [form, setForm] = useState<ComposerState>(emptyComposerState)
  const [dropBooking, setDropBooking] = useState(false)

  useEffect(() => {
    if (open) return
    setBase(undefined)
    setConfirming(false)
    inFlight.current = false
    setGuideOpen(false)
    setFailure('')
    setDropBooking(false)
  }, [open])

  /* Seeded ONCE per opening: this query refetches on window focus, and a second
     seed would throw away whatever has been typed since the first. */
  useEffect(() => {
    if (!detail.data || base) return
    setBase(detail.data)
    setForm(composerFromRun(detail.data))
  }, [detail.data, base])

  const patch = base ? mailRunEditFrom(base, form, dropBooking) : {}
  const route = base ? mailRunRoute(base, can) : null
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
    },
    open && letterReady,
  )
  const hints = mailHints({
    subject: form.subject,
    body: form.body,
    ctaUrl: form.ctaUrl,
    missing: preview.letter?.missing,
  })

  const submit = () => {
    if (inFlight.current || !base || !route || changed === 0 || blocker || save.isPending) return
    inFlight.current = true
    setFailure('')
    save.mutate(
      { id: base.id, edit: patch, route },
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
          inFlight.current = false
          const reason = isApiError(error) ? userMessage(error) : 'Không lưu được thay đổi.'
          setFailure(reason)
          toast('Máy chủ từ chối sửa lô này', { tone: 'danger', detail: reason })
        },
      },
    )
  }

  const locked = base && (!base.editable || !route)
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
        width="wide"
        title="Sửa lô thư chưa gửi"
        subtitle={base ? runLine(base) : 'Đang mở lô…'}
        meta={base ? runBadge(base) : null}
        footer={
          <EditFooter
            ready={Boolean(base) && !locked}
            blocker={failure || blocker}
            warn={Boolean(failure || blocker)}
            note={footerNote(Boolean(locked), changed)}
            saveBlocked={changed === 0 || Boolean(blocker)}
            saving={save.isPending}
            aids={<MailFloatingAids hints={hints} onGuide={() => setGuideOpen(true)} />}
            onClose={onClose}
            onSave={() => setConfirming(true)}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-6">
          {body ??
            (base && (
              <EditBody
                run={base}
                blocked={blocker !== null}
                form={form}
                setForm={setForm}
                letter={letterReady ? preview : null}
                dropBooking={dropBooking}
                onDropBooking={setDropBooking}
              />
            ))}
        </div>
      </Modal>

      <SaveConfirm
        run={base}
        open={confirming}
        at={scheduledSlot(form)}
        changed={changed}
        onBack={() => setConfirming(false)}
        onConfirm={submit}
      />

      <MailGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        section="content"
        parts={GUIDE_PARTS}
      />
    </>
  )
}

/** The letter, its folded send options, and the preview beside them — the
 *  same split as the send panel, and for the same reason: see the `wide:` note
 *  there. `letter` is `null` until the thing has a subject and a body, because
 *  there is nothing to render before that. */
function EditBody({
  run,
  blocked,
  form,
  setForm,
  letter,
  dropBooking,
  onDropBooking,
}: {
  run: MailRunDetail
  /** Save is locked — by the letter, or by the hour in the folded block. */
  blocked: boolean
  form: ComposerState
  setForm: Dispatch<SetStateAction<ComposerState>>
  letter: ReturnType<typeof useMailPreview> | null
  dropBooking: boolean
  onDropBooking: (drop: boolean) => void
}) {
  const at = scheduledSlot(form)
  /* Only the hour lives in the folded block, so an error the letter alone does
     not cause is the one that block would hide. */
  const timeGap = blocked && composerBlocker({ ...form, timing: 'now' }) === null
  return (
    <div className="wide:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] grid min-w-0 items-start gap-6">
      <div className="flex min-w-0 flex-col gap-4">
        <WaveComposer state={form} setState={setForm} templates={[]} frame="letter" />
        {run.bookingUrl && (
          <OldBookingLink
            owner="Thư"
            url={run.bookingUrl}
            dropped={dropBooking}
            onDrop={onDropBooking}
          />
        )}
        <SendOptions forceOpen={timeGap} summary={at ? `Lúc ${dmhm(at)}` : 'Gửi ngay khi lưu'}>
          <SendWhen state={form} setState={setForm} />
          <RunFacts run={run} />
        </SendOptions>
      </div>

      <section className="flex min-w-0 flex-col gap-4">
        {letter ? (
          <MailPreviewCard
            letter={letter.letter}
            pending={letter.pending}
            error={letter.error}
            caption={run.kind === 'group' ? GROUP_PREVIEW_CAPTION : PREVIEW_CAPTION}
          />
        ) : (
          <p className="text-muted-foreground m-0 px-1 text-[11.5px] leading-[1.6]">
            Bản xem trước hiện ở đây khi thư có tiêu đề và nội dung.
          </p>
        )}
      </section>
    </div>
  )
}

/** Saving IS sending for this batch — it leaves at the hour below — so the
 *  save asks with the same box as the send panel. A group run's
 *  `audienceCount` is 1: one shared letter, not one per person. */
function SaveConfirm({
  run,
  open,
  at,
  changed,
  onBack,
  onConfirm,
}: {
  /** Absent while the batch loads — nothing to confirm yet. */
  run?: MailRunDetail
  open: boolean
  /** The local slot the batch will hold, or `null` for "on the next sweep". */
  at: string | null
  changed: number
  onBack: () => void
  onConfirm: () => void
}) {
  if (!run) return null
  const letters = run.audienceCount.toLocaleString('vi-VN')
  return (
    <MailSendConfirm
      open={open}
      title="Xác nhận lưu"
      subtitle="Chỉ những ô bạn sửa được lưu. Người nhận giữ nguyên."
      rows={[
        {
          label: 'Người nhận',
          value:
            run.kind === 'group'
              ? 'Một thư chung · người nhận đã chốt'
              : `${letters} người · đã chốt`,
        },
        { label: 'Tổng số thư', value: `${letters} thư` },
        { label: 'Thời điểm', value: at ? `Lúc ${dmhm(at)}` : 'Gửi ngay khi lưu' },
        { label: 'Thay đổi', value: `${changed} mục` },
      ]}
      action={`${at ? 'Lưu và lên lịch' : 'Lưu và gửi'} ${letters} thư`}
      later={at !== null}
      onBack={onBack}
      onConfirm={onConfirm}
    />
  )
}

/** The local slot the batch will be held to, or `null` for the next sweep. */
const scheduledSlot = (form: ComposerState) =>
  form.timing === 'later' && form.at !== '' ? form.at : null

/** The strip under the panel: what is missing or what will be saved, and the
 *  one button that moves. `ready` is false while the batch is still loading and
 *  on a batch that can no longer be edited — both cases leave only the way
 *  out. */
function EditFooter({
  ready,
  blocker,
  warn,
  note,
  saveBlocked,
  saving,
  aids,
  onClose,
  onSave,
}: {
  ready: boolean
  blocker: string | null
  warn: boolean
  note: string
  saveBlocked: boolean
  saving: boolean
  /** Floats above the strip's right edge, as in the send panel. */
  aids: ReactNode
  onClose: () => void
  /** Opens the confirm box — the save itself happens there. */
  onSave: () => void
}) {
  return (
    <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-4">
      <div className="absolute bottom-full right-0 mb-8">{aids}</div>
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
        <Button size="lg" variant="ghost" type="button" onClick={onClose}>
          Đóng
        </Button>
        {ready && (
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
        {run.editable
          ? 'Chỉ người tạo lô hoặc người có quyền phát chiến dịch mới sửa được lô này.'
          : run.state === 'SCHEDULED'
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
    <div className="min-w-0">
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
    </div>
  )
}
