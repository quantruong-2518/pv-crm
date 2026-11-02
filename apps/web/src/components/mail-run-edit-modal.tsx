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
import { message, useI18n, type Lang, type Message } from '@/app/i18n'
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
  MAIL_RUN_STATE_TONE,
  mailRunRoute,
  mailRunStateLabel,
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

const PREVIEW_CAPTION = message(
  'Tên và công ty là dữ liệu mẫu. Người nhận đã chốt lúc tạo lô.',
  'The name and company are sample data. The recipients were fixed when the run was created.',
  '이름과 회사는 예시 데이터입니다. 수신자는 발송 건을 만들 때 확정되었습니다.',
)
/** `/sales/mail/preview` always renders a sample unsubscribe footer — it has no
 *  `delivery_id` to sign yet and cannot know the letter is bound for a GROUP
 *  door. A group letter never carries that footer when it actually sends
 *  (`mas-letter.ts`), so the note replaces the caption rather than letting the
 *  preview promise a link the real letter will not have. */
const GROUP_PREVIEW_CAPTION = message(
  `${PREVIEW_CAPTION.vi} Dòng huỷ đăng ký chỉ có ở bản xem trước, thư gộp gửi đi không có.`,
  `${PREVIEW_CAPTION.en} The unsubscribe line appears only in the preview; the combined letter that is sent does not have it.`,
  `${PREVIEW_CAPTION.ko} 수신 거부 문구는 미리보기에만 표시되며, 실제로 발송되는 합본 메일에는 없습니다.`,
)

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
  const i18n = useI18n()
  const { t, lang } = i18n
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
  const hints = mailHints(
    {
      subject: form.subject,
      body: form.body,
      ctaUrl: form.ctaUrl,
      missing: preview.letter?.missing,
    },
    lang,
  )

  const submit = () => {
    if (inFlight.current || !base || !route || changed === 0 || blocker || save.isPending) return
    inFlight.current = true
    setFailure('')
    save.mutate(
      { id: base.id, edit: patch, route },
      {
        onSuccess: (result) => {
          toastSaved(result.rescheduled, t)
          onClose()
        },
        onError: (error) => {
          inFlight.current = false
          setFailure(toastRefused(error, t))
        },
      },
    )
  }

  const locked = base && (!base.editable || !route)
  /* Nothing was read: no edit title and no loading line beside the refusal. */
  const refused = !base && Boolean(detail.error)
  /* A refetch that fails AFTER the form is seeded must not replace it: the
     letter on screen is the one being typed, and the read already succeeded. */
  const body = !base ? (
    detail.error ? (
      <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
        {isApiError(detail.error) ? userMessage(detail.error) : t(READ_FAILED)}
      </p>
    ) : (
      <Skeleton height={320} />
    )
  ) : locked ? (
    <LockedView run={base} letter={letterReady ? preview : null} />
  ) : null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="wide"
        title={modalTitle(refused, Boolean(locked), t)}
        subtitle={modalSubtitle(base, refused, i18n)}
        meta={base ? runBadge(base, lang) : null}
        footer={
          <EditFooter
            ready={Boolean(base) && !locked}
            blocker={failure || blocker}
            tone={failure ? 'danger' : blocker ? 'warning' : 'muted'}
            note={refused ? '' : footerNote(Boolean(locked), changed, t)}
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

type Say = (copy: Message) => string

const READ_FAILED = message(
  'Không đọc được lô này.',
  'Could not read this run.',
  '이 발송 건을 불러오지 못했습니다.',
)

const modalTitle = (refused: boolean, locked: boolean, t: Say) =>
  t(
    refused
      ? message('Không mở được lô thư', 'Could not open the mail run', '발송 건을 열 수 없습니다')
      : locked
        ? message('Chi tiết thư', 'Letter details', '메일 상세')
        : message('Sửa lô thư chưa gửi', 'Edit unsent mail run', '발송 전 메일 수정'),
  )

const modalSubtitle = (
  base: MailRunDetail | undefined,
  refused: boolean,
  i18n: ReturnType<typeof useI18n>,
) =>
  base
    ? runLine(base, i18n)
    : refused
      ? undefined
      : i18n.t(message('Đang mở lô…', 'Opening the run…', '발송 건을 여는 중…'))

function toastSaved(rescheduled: number | undefined, t: Say) {
  toast(t(message('Đã lưu thay đổi', 'Changes saved', '변경 사항을 저장했습니다')), {
    tone: 'success',
    /* The one doubt worth answering: whether the QUEUE moved with the
       column, or the batch still goes out at the old hour. */
    ...(rescheduled === undefined
      ? {}
      : {
          detail: t(
            message(
              `${rescheduled} thư chưa gửi đã dời sang giờ mới.`,
              `${rescheduled} unsent letters moved to the new time.`,
              `보내지 않은 메일 ${rescheduled}통을 새 시각으로 옮겼습니다.`,
            ),
          ),
        }),
  })
}

/** Toasts the refusal and returns its text for the footer. */
function toastRefused(error: unknown, t: Say): string {
  const reason = isApiError(error)
    ? userMessage(error)
    : t(
        message(
          'Không lưu được thay đổi.',
          'Could not save the changes.',
          '변경 사항을 저장하지 못했습니다.',
        ),
      )
  toast(
    t(
      message(
        'Không sửa được lô này',
        'Could not edit this run',
        '이 발송 건을 수정하지 못했습니다',
      ),
    ),
    { tone: 'danger', detail: reason },
  )
  return reason
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
  const { t } = useI18n()
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
            owner="letter"
            url={run.bookingUrl}
            dropped={dropBooking}
            onDrop={onDropBooking}
          />
        )}
        <SendOptions
          forceOpen={timeGap}
          summary={
            at
              ? t(message(`Lúc ${dmhm(at)}`, `At ${dmhm(at)}`, `${dmhm(at)}에`))
              : t(message('Gửi ngay khi lưu', 'Sent as soon as saved', '저장하면 바로 발송'))
          }
        >
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
            caption={t(run.kind === 'group' ? GROUP_PREVIEW_CAPTION : PREVIEW_CAPTION)}
          />
        ) : (
          <p className="text-muted-foreground m-0 px-1 text-[11.5px] leading-[1.6]">
            {t(
              message(
                'Bản xem trước hiện khi thư có tiêu đề và nội dung.',
                'The preview appears once the letter has a subject and a body.',
                '메일에 제목과 내용이 있으면 미리보기가 표시됩니다.',
              ),
            )}
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
  const { t, number } = useI18n()
  if (!run) return null
  const letters = number(run.audienceCount)
  return (
    <MailSendConfirm
      open={open}
      title={t(message('Xác nhận lưu', 'Confirm save', '저장 확인'))}
      subtitle={t(
        message(
          'Chỉ lưu những ô bạn sửa. Người nhận giữ nguyên.',
          'Only the fields you changed are saved. The recipients stay the same.',
          '수정한 항목만 저장됩니다. 수신자는 그대로입니다.',
        ),
      )}
      rows={[
        {
          label: t(message('Người nhận', 'Recipients', '수신자')),
          value:
            run.kind === 'group'
              ? t(
                  message(
                    'Một thư chung · người nhận đã chốt',
                    'One shared letter · recipients fixed',
                    '공용 메일 한 통 · 수신자 확정',
                  ),
                )
              : t(
                  message(
                    `${letters} người · đã chốt`,
                    `${letters} people · fixed`,
                    `${letters}명 · 확정`,
                  ),
                ),
        },
        {
          label: t(message('Tổng số thư', 'Total letters', '총 메일 수')),
          value: t(message(`${letters} thư`, `${letters} letters`, `${letters}통`)),
        },
        {
          label: t(message('Thời điểm', 'Time', '시점')),
          value: at
            ? t(message(`Lúc ${dmhm(at)}`, `At ${dmhm(at)}`, `${dmhm(at)}에`))
            : t(message('Gửi ngay khi lưu', 'Sent as soon as saved', '저장하면 바로 발송')),
        },
        {
          label: t(message('Thay đổi', 'Changes', '변경')),
          value: t(message(`${changed} mục`, `${changed} items`, `${changed}개 항목`)),
        },
      ]}
      action={t(
        at
          ? message(
              `Lưu và lên lịch ${letters} thư`,
              `Save and schedule ${letters} letters`,
              `메일 ${letters}통 저장 및 예약`,
            )
          : message(
              `Lưu và gửi ${letters} thư`,
              `Save and send ${letters} letters`,
              `메일 ${letters}통 저장 및 발송`,
            ),
      )}
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
  tone,
  note,
  saveBlocked,
  saving,
  aids,
  onClose,
  onSave,
}: {
  ready: boolean
  blocker: string | null
  /** A failed save is danger red; a blocker stays warning yellow. */
  tone: 'muted' | 'warning' | 'danger'
  note: string
  saveBlocked: boolean
  saving: boolean
  /** Floats above the strip's right edge, as in the send panel. */
  aids: ReactNode
  onClose: () => void
  /** Opens the confirm box — the save itself happens there. */
  onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-4">
      <div className="absolute bottom-full right-0 mb-8">{aids}</div>
      <span
        aria-live="polite"
        className={
          tone === 'danger'
            ? 'text-destructive-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
            : tone === 'warning'
              ? 'text-warning min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
              : 'text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]'
        }
      >
        {blocker || note}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" onClick={onClose}>
          {t(message('Đóng', 'Close', '닫기'))}
        </Button>
        {ready && (
          <Button size="lg" type="button" disabled={saveBlocked || saving} onClick={onSave}>
            <Icon icon={Save} size={16} />
            {saving
              ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
              : t(message('Lưu thay đổi', 'Save changes', '변경 사항 저장'))}
          </Button>
        )}
      </div>
    </div>
  )
}

/** The same pill the run book draws for this batch — one batch must not change
 *  colour between the table and the panel opened from it. */
const runBadge = (run: MailRunDetail, lang: Lang) => (
  <Badge tone={MAIL_RUN_STATE_TONE[run.state]}>{mailRunStateLabel(run.state, lang)}</Badge>
)

const footerNote = (locked: boolean, changed: number, t: (copy: Message) => string) =>
  locked
    ? t(
        message(
          'Lô này chỉ còn xem được.',
          'This run can only be viewed now.',
          '이 발송 건은 이제 조회만 가능합니다.',
        ),
      )
    : changed === 0
      ? t(message('Chưa đổi gì.', 'Nothing changed.', '변경 사항이 없습니다.'))
      : t(
          message(
            `${changed} mục sẽ được lưu. Người nhận giữ nguyên.`,
            `${changed} items will be saved. The recipients stay the same.`,
            `${changed}개 항목이 저장됩니다. 수신자는 그대로입니다.`,
          ),
        )

/** Which batch is open, in one line. `waveNo` first because a chain is the case
 *  where "the label" names several things. */
function runLine(run: MailRunDetail, { t, number }: ReturnType<typeof useI18n>): string {
  const chain = run.sequenceName ?? run.campaignName
  return [
    run.waveNo
      ? t(message(`Đợt ${run.waveNo}`, `Wave ${run.waveNo}`, `웨이브 ${run.waveNo}`))
      : null,
    chain,
    run.phase ?? run.label,
    t(
      message(
        `${number(run.audienceCount)} người nhận`,
        `${number(run.audienceCount)} recipients`,
        `수신자 ${number(run.audienceCount)}명`,
      ),
    ),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** A run past editing still reads: the note, then the letter as it left. */
function LockedView({
  run,
  letter,
}: {
  run: MailRunDetail
  letter: ReturnType<typeof useMailPreview> | null
}) {
  const { t } = useI18n()
  return (
    <>
      <LockedNote run={run} />
      {letter && (
        <MailPreviewCard
          letter={letter.letter}
          pending={letter.pending}
          error={letter.error}
          caption={t(run.kind === 'group' ? GROUP_PREVIEW_CAPTION : PREVIEW_CAPTION)}
        />
      )}
    </>
  )
}

/** Why the form is not there. The server knows something the run book cannot:
 *  `state` may still read `SCHEDULED` while the first letter is already gone. */
function LockedNote({ run }: { run: MailRunDetail }) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-2 p-4">
      <span className="text-[12.5px] font-semibold">
        {t(
          message(
            'Lô này không sửa được nữa',
            'This run can no longer be edited',
            '이 발송 건은 더 이상 수정할 수 없습니다',
          ),
        )}
      </span>
      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.6]">
        {t(
          run.editable
            ? message(
                'Chỉ người tạo lô hoặc người có quyền phát chiến dịch mới sửa được lô này.',
                'Only the run creator or someone allowed to broadcast campaigns can edit this run.',
                '발송 건 작성자 또는 캠페인 발송 권한이 있는 사람만 이 발송 건을 수정할 수 있습니다.',
              )
            : run.state === 'SCHEDULED'
              ? message(
                  'Lô đã bắt đầu gửi nên không sửa được. Muốn dừng phần chưa gửi, bấm Dừng ở sổ lô gửi.',
                  'The run has started sending, so it cannot be edited. To stop the part not yet sent, press Stop in the mail runs book.',
                  '발송이 시작되어 수정할 수 없습니다. 아직 보내지 않은 부분을 멈추려면 발송 건 목록에서 중단을 누르세요.',
                )
              : message(
                  `Lô đang ở trạng thái "${mailRunStateLabel(run.state, 'vi')}". Chỉ lô còn hẹn giờ và chưa gửi thư nào mới sửa được.`,
                  `The run is "${mailRunStateLabel(run.state, 'en')}". Only a scheduled run with no letters sent yet can be edited.`,
                  `이 발송 건은 "${mailRunStateLabel(run.state, 'ko')}" 상태입니다. 예약 상태이고 아직 메일이 한 통도 나가지 않은 발송 건만 수정할 수 있습니다.`,
                ),
        )}
      </p>
    </GlassCard>
  )
}

/** Everything about this batch the edit door does NOT accept, as text. Here
 *  because which batch is open is a fair question, and as text because a
 *  control that cannot be saved is a control that lies. */
function RunFacts({ run }: { run: MailRunDetail }) {
  const { t, number } = useI18n()
  const people = number(run.audienceCount)
  const rows = [
    {
      label: t(message('Người nhận', 'Recipients', '수신자')),
      value: t(
        message(`${people} người · đã chốt`, `${people} people · fixed`, `${people}명 · 확정`),
      ),
    },
    { label: t(message('Chuỗi gửi', 'Sequence', '발송 시퀀스')), value: run.sequenceName ?? '—' },
    {
      label: t(message('Chiến dịch', 'Campaign', '캠페인')),
      value: run.campaignName ? `${run.campaignCode ?? ''} ${run.campaignName}`.trim() : '—',
    },
    {
      label: t(message('Theo dõi', 'Tracking', '추적')),
      value: run.trackEngagement
        ? t(message('Có ghi nhận mở và bấm', 'Opens and clicks recorded', '열람·클릭 기록함'))
        : t(message('Không ghi nhận', 'Not recorded', '기록 안 함')),
    },
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
        {t(
          message(
            `${rows.length} mục trên không sửa được từ đây. Cần đổi thì dừng lô rồi gửi lại.`,
            `${rows.length} items above cannot be edited from here. To change them, stop the run and send again.`,
            `위의 ${rows.length}개 항목은 여기서 수정할 수 없습니다. 바꾸려면 발송 건을 중단한 뒤 다시 보내세요.`,
          ),
        )}
      </p>
    </div>
  )
}
