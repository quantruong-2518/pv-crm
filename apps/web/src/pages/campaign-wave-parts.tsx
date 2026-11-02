import { useId, useState } from 'react'
import {
  Badge,
  Button,
  ChevronDown,
  Chip,
  GlassCard,
  Icon,
  Modal,
  Octagon,
  Users,
  cn,
} from '@pv/ui'
import type { CampaignProfile, CampaignWaveRow, MailRunRow } from '@pv/contracts'
import { formatNumber, message, translate } from '@/app/i18n'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { type useCampaignStop } from '@/data/campaign-book'
import { MAIL_RUN_STATE_TONE } from '@/data/mail-runs'
import { WaveRecipients } from '@/components/wave-recipients'
import { dayTime, shareOf, timeOnly, wavesInOrder } from './campaign-model'

const tr = (vi: string, en: string, ko: string) => translate(message(vi, en, ko))
const runStateLabel = (state: MailRunRow['state']) =>
  ({
    DRAFT: tr('Nháp', 'Draft', '초안'),
    SCHEDULED: tr('Đã hẹn giờ', 'Scheduled', '예약됨'),
    SENDING: tr('Đang gửi', 'Sending', '발송 중'),
    SENT: tr('Đã gửi', 'Sent', '발송 완료'),
    CANCELLED: tr('Đã huỷ', 'Cancelled', '취소됨'),
  })[state]

/** Module 1 · the campaign WAVES — one card per wave already gone, and
 *  the dialog that stops the rest. The panel that fires a wave is
 *  `WaveModal` in `campaign-wave-modal.tsx`. */

/** STOPPING ASKS FIRST — the only act on this screen with no door back.
 *
 *  `/stop` pulls every unsent wave out of the queue and files the campaign
 *  STOPPED, after which the server refuses `/start` and `/waves` by name. A
 *  `window.confirm` would ask that question in the browser's own voice; this
 *  small Modal asks in ours, names what the press costs, and — like the fire
 *  dialog — keeps the page behind it in view. */
export function StopModal({
  campaign,
  open,
  onClose,
  stop,
}: {
  campaign: CampaignProfile
  open: boolean
  onClose: () => void
  stop: ReturnType<typeof useCampaignStop>
}) {
  const n = formatNumber
  const submit = () =>
    stop.mutate(undefined, {
      onSuccess: (res) => {
        const held = res.cancelled.reduce((n, r) => n + r.held, 0)
        toast(tr('Đã dừng chiến dịch', 'Campaign stopped', '캠페인이 중지되었습니다'), {
          tone: 'success',
          detail:
            res.cancelled.length === 0
              ? tr(
                  'Không còn thư chưa gửi.',
                  'There are no unsent emails.',
                  '미발송 이메일이 없습니다.',
                )
              : tr(
                  `Đã huỷ ${res.cancelled.length} đợt, giữ lại ${held} thư chưa gửi.`,
                  `Cancelled ${res.cancelled.length} waves and kept ${held} unsent emails.`,
                  `${res.cancelled.length}개 차수를 취소하고 미발송 이메일 ${held}개를 보류했습니다.`,
                ),
        })
        onClose()
      },
      onError: (err) =>
        toast(
          tr(
            'Không dừng được chiến dịch',
            'Could not stop campaign',
            '캠페인을 중지할 수 없습니다',
          ),
          {
            tone: 'danger',
            detail: isApiError(err)
              ? userMessage(err)
              : tr('Hãy thử lại.', 'Please try again.', '다시 시도해 주세요.'),
          },
        ),
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr(
        `Dừng chiến dịch ${campaign.code}`,
        `Stop campaign ${campaign.code}`,
        `캠페인 ${campaign.code} 중지`,
      )}
      subtitle={campaign.name}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button size="lg" variant="ghost" onClick={onClose} disabled={stop.isPending}>
            {tr('Để chạy tiếp', 'Keep campaign running', '캠페인 계속 실행')}
          </Button>
          <Button size="lg" variant="destructive" onClick={submit} disabled={stop.isPending}>
            <Icon icon={Octagon} size={16} />
            {stop.isPending
              ? tr('Đang dừng…', 'Stopping…', '중지 중…')
              : tr('Dừng hẳn chiến dịch', 'Stop campaign', '캠페인 중지')}
          </Button>
        </div>
      }
    >
      <div className="flex max-w-[640px] flex-col gap-4 text-[13px] leading-[1.65]">
        <p>
          {tr(
            'Các đợt chưa gửi sẽ bị huỷ; thư chưa gửi được giữ lại. Thư đã gửi không thể thu hồi.',
            'Unsent waves will be cancelled and unsent emails held. Sent emails cannot be recalled.',
            '미발송 차수는 취소되고 미발송 이메일은 보류됩니다. 이미 발송된 이메일은 회수할 수 없습니다.',
          )}
        </p>
        <p className="text-warning">
          {tr(
            'Sau khi dừng, bạn không thể chạy lại chiến dịch này. Hãy tạo chiến dịch mới nếu cần gửi tiếp.',
            'You cannot restart a stopped campaign. Create a new campaign to continue sending.',
            '중지한 캠페인은 다시 시작할 수 없습니다. 계속 발송하려면 새 캠페인을 만드세요.',
          )}
        </p>
        <p className="text-muted-foreground">
          {tr(
            `${n(campaign.waveCount)} đợt đã gửi · ${n(campaign.audienceCount)} người nhận.`,
            `${n(campaign.waveCount)} waves sent · ${n(campaign.audienceCount)} recipients.`,
            `발송 차수 ${n(campaign.waveCount)}개 · 수신자 ${n(campaign.audienceCount)}명.`,
          )}
        </p>
      </div>
    </Modal>
  )
}

/** THE WAVE LIST — one collapsible card per wave, newest first.
 *
 *  The newest wave opens by itself because it is the one being asked about;
 *  the rest stay one line each so ten waves do not bury it. Which cards are
 *  open is the screen's state. */
export function WaveList({ campaign }: { campaign: CampaignProfile }) {
  const waves = wavesInOrder(campaign).reverse()
  const [open, setOpen] = useState<ReadonlySet<number>>(
    () => new Set(waves.slice(0, 1).map((w) => w.waveNo)),
  )
  const toggle = (waveNo: number) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (!next.delete(waveNo)) next.add(waveNo)
      return next
    })

  return (
    <div className="flex flex-col gap-4">
      {waves.length > 1 && (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={open.size === waves.length}
            onClick={() => setOpen(new Set(waves.map((w) => w.waveNo)))}
          >
            {tr('Mở rộng tất cả', 'Expand all', '모두 펼치기')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={open.size === 0}
            onClick={() => setOpen(new Set())}
          >
            {tr('Thu gọn tất cả', 'Collapse all', '모두 접기')}
          </Button>
        </div>
      )}
      {waves.map((w) => (
        <WaveCard
          key={w.waveNo}
          wave={w}
          open={open.has(w.waveNo)}
          onToggle={() => toggle(w.waveNo)}
        />
      ))}
    </div>
  )
}

/** A thin bar of letters sent over letters owed — drawn only while a wave is
 *  going out. The caller prints the two numbers; the bar never stands alone. */
export function SendProgress({
  run,
  label,
  className,
}: {
  run: MailRunRow
  label: string
  className?: string
}) {
  const share = run.audienceCount > 0 ? Math.min(run.sent / run.audienceCount, 1) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-surface-ink/10 h-1 overflow-hidden rounded-sm', className)}
    >
      <span className="bg-primary block h-full rounded-sm" style={{ width: `${share * 100}%` }} />
    </div>
  )
}

/** When a wave ran, in the fewest words: a start while it is going, a range
 *  once it has ended, the promised hour before either. */
function waveWhen(run: MailRunRow): string {
  if (run.startedAt && run.finishedAt) {
    return `${dayTime(run.startedAt)} – ${timeOnly(run.finishedAt)}`
  }
  if (run.startedAt)
    return tr(
      `Bắt đầu ${dayTime(run.startedAt)}`,
      `Started ${dayTime(run.startedAt)}`,
      `${dayTime(run.startedAt)} 시작`,
    )
  if (run.scheduledAt)
    return tr(
      `Hẹn ${dayTime(run.scheduledAt)}`,
      `Scheduled for ${dayTime(run.scheduledAt)}`,
      `${dayTime(run.scheduledAt)} 예약`,
    )
  return '—'
}

/** `.glass-b`: the open card can hold the recipient list (law 8). That list is
 *  behind its own button — mounting `WaveRecipients` is what fetches it. */
function WaveCard({
  wave,
  open,
  onToggle,
}: {
  wave: CampaignWaveRow
  open: boolean
  onToggle: () => void
}) {
  const { waveNo, run } = wave
  const bodyId = useId()
  const [recipients, setRecipients] = useState(false)
  const n = formatNumber
  const queued = Math.max(run.audienceCount - run.sent - run.failed, 0)

  return (
    <GlassCard
      variant="b"
      role="article"
      aria-label={tr(`Đợt ${waveNo}`, `Wave ${waveNo}`, `${waveNo}차`)}
      className="flex flex-col gap-4 p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Chip>{tr(`Đợt ${waveNo}`, `Wave ${waveNo}`, `${waveNo}차`)}</Chip>
        <div className="min-w-[220px] flex-1">
          <h3 className="m-0 truncate text-[14px] font-semibold" title={run.label}>
            {run.label}
          </h3>
          <p className="text-muted-foreground m-0 truncate text-[12px]" title={run.subject}>
            {tr('Tiêu đề thư:', 'Email subject:', '이메일 제목:')} {run.subject}
          </p>
        </div>
        {!open && (
          <span className="text-muted-foreground tnum text-[12px]">
            {tr(
              `Đã gửi ${n(run.sent)} · bấm ${n(run.clicked)} · trả lại ${n(run.bounced)}`,
              `${n(run.sent)} sent · ${n(run.clicked)} clicked · ${n(run.bounced)} bounced`,
              `${n(run.sent)}개 발송 · ${n(run.clicked)}개 클릭 · ${n(run.bounced)}개 반송`,
            )}
          </span>
        )}
        <span className="text-muted-foreground tnum text-[12px]">{waveWhen(run)}</span>
        <Badge tone={MAIL_RUN_STATE_TONE[run.state]}>{runStateLabel(run.state)}</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={tr(
            `${open ? 'Thu gọn' : 'Mở rộng'} đợt ${waveNo}`,
            `${open ? 'Collapse' : 'Expand'} wave ${waveNo}`,
            `${waveNo}차 ${open ? '접기' : '펼치기'}`,
          )}
          onClick={onToggle}
        >
          <Icon icon={ChevronDown} size={16} className={cn(open && 'rotate-180')} />
          {open ? tr('Thu gọn', 'Collapse', '접기') : tr('Mở rộng', 'Expand', '펼치기')}
        </Button>
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col gap-4">
          {run.state === 'SENDING' && (
            <div className="flex flex-col gap-2">
              <SendProgress
                run={run}
                label={tr(
                  `Tiến độ gửi đợt ${waveNo}`,
                  `Wave ${waveNo} send progress`,
                  `${waveNo}차 발송 진행률`,
                )}
              />
              <p className="text-muted-foreground tnum m-0 text-[12px]">
                {tr(
                  `Đã gửi ${n(run.sent)} trên ${n(run.audienceCount)} thư, còn ${n(queued)} thư chờ gửi`,
                  `${n(run.sent)} of ${n(run.audienceCount)} emails sent, ${n(queued)} queued`,
                  `이메일 ${n(run.audienceCount)}개 중 ${n(run.sent)}개 발송, ${n(queued)}개 대기 중`,
                )}
              </p>
            </div>
          )}
          <WaveNumbers run={run} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="pointer-coarse:h-12"
              aria-expanded={recipients}
              onClick={() => setRecipients((on) => !on)}
            >
              <Icon icon={Users} size={16} />
              {recipients
                ? tr('Ẩn danh sách người nhận', 'Hide recipient list', '수신자 목록 숨기기')
                : tr('Xem từng người nhận', 'View recipients', '수신자 보기')}
            </Button>
          </div>
          {recipients && <WaveRecipientList runId={run.id} />}
        </div>
      )}
    </GlassCard>
  )
}

/** The recipient panel's tracks, and the names of its columns: code, who,
 *  delivery state, when, then one tick per counter. Fixed tick widths keep the
 *  five a readable block at the right edge; the slack goes to the name. */
const RECIPIENT_COLUMNS: [header: string, width: string, en: string, ko: string][] = [
  ['Mã lead', '104px', 'Lead ID', '리드 ID'],
  ['Người nhận', 'minmax(200px,1.8fr)', 'Recipient', '수신자'],
  ['Trạng thái thư', '124px', 'Email status', '이메일 상태'],
  ['Thời điểm', 'minmax(140px,1fr)', 'Time', '시간'],
  ['Đã gửi', '64px', 'Sent', '발송'],
  ['Tới nơi', '64px', 'Delivered', '도착'],
  ['Mở', '64px', 'Opened', '열람'],
  ['Bấm', '64px', 'Clicked', '클릭'],
  ['Bounce', '64px', 'Bounced', '반송'],
]
const RECIPIENT_TEMPLATE = RECIPIENT_COLUMNS.map(([, width]) => width).join(' ')
/** How many leading columns read left-aligned; the ticks after them end right. */
const RECIPIENT_TEXT_COLUMNS = 4

/** `WaveRecipients` borrows its header from a parent table; here there is
 *  none, so the same tracks are named by a row drawn above it. */
function WaveRecipientList({ runId }: { runId: string }) {
  return (
    <div className="overflow-x-auto">
      {/* `px-1` is the inset `WaveRecipients` cancels with its `-mx-1`. */}
      <div className="min-w-[984px] px-1">
        <div
          aria-hidden="true"
          className="text-muted-foreground -mx-1 grid gap-3 py-1 text-[11px]"
          style={{ gridTemplateColumns: RECIPIENT_TEMPLATE }}
        >
          {RECIPIENT_COLUMNS.map(([header, , en, ko], i) => (
            <span
              key={header}
              className={cn(
                'truncate',
                i === 0 && 'pl-6',
                i >= RECIPIENT_TEXT_COLUMNS && 'text-right',
              )}
            >
              {tr(header, en, ko)}
            </span>
          ))}
        </div>
        <WaveRecipients runId={runId} template={RECIPIENT_TEMPLATE} />
      </div>
    </div>
  )
}

/** ONE WAVE'S NUMBERS in one tinted strip, each with the share that gives it
 *  meaning. A counter still at zero is left out, except the letters sent — the
 *  base of the rest. The NUMBER wears the colour, on text tokens already
 *  measured on this surface; a strip inside `.glass-b` paints no second glass. */
function WaveNumbers({ run }: { run: MailRunRow }) {
  const n = formatNumber
  /* Opens carry no share: `opened` is a noisy lower bound (proxies trip the
     pixel, blockers hide it), and a percentage would read it as truth. */
  const cells: { key: string; label: string; value: number; note?: string; tone?: string }[] = [
    { key: 's', label: tr('Đã gửi', 'Sent', '발송'), value: run.sent },
    {
      key: 'd',
      label: tr('Tới nơi', 'Delivered', '도착'),
      value: run.delivered,
      note: tr(
        `${shareOf(run.delivered, run.sent, 1)} số đã gửi`,
        `${shareOf(run.delivered, run.sent, 1)} of sent`,
        `발송 중 ${shareOf(run.delivered, run.sent, 1)}`,
      ),
    },
    { key: 'o', label: tr('Có người mở', 'Opened', '열람'), value: run.opened },
    {
      key: 'c',
      label: tr('Đã bấm liên kết', 'Clicked a link', '링크 클릭'),
      value: run.clicked,
      note: tr(
        `${shareOf(run.clicked, run.delivered, 1)} số tới nơi`,
        `${shareOf(run.clicked, run.delivered, 1)} of delivered`,
        `도착 이메일 중 ${shareOf(run.clicked, run.delivered, 1)}`,
      ),
      tone: 'text-accent-foreground',
    },
    {
      key: 'u',
      label: tr('Huỷ đăng ký', 'Unsubscribed', '수신 거부'),
      value: run.unsubscribed,
      note: tr(
        `${shareOf(run.unsubscribed, run.delivered, 1)} số tới nơi`,
        `${shareOf(run.unsubscribed, run.delivered, 1)} of delivered`,
        `도착 이메일 중 ${shareOf(run.unsubscribed, run.delivered, 1)}`,
      ),
      tone: 'text-warning',
    },
    {
      key: 'b',
      label: 'Bounce',
      value: run.bounced,
      note: tr(
        `${shareOf(run.bounced, run.sent, 1)} số đã gửi`,
        `${shareOf(run.bounced, run.sent, 1)} of sent`,
        `발송 중 ${shareOf(run.bounced, run.sent, 1)}`,
      ),
      tone: 'text-destructive-foreground',
    },
  ]

  return (
    <dl className="bg-surface-ink/5 m-0 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 rounded-md p-4">
      {cells
        .filter((c) => c.key === 's' || c.value > 0)
        .map((c) => (
          <div key={c.key} className="flex min-w-0 flex-col gap-1">
            <dt className="text-muted-foreground text-[11.5px]">{c.label}</dt>
            <dd className="m-0 flex flex-col gap-1">
              <span className={cn('tnum font-num text-[20px] font-semibold leading-none', c.tone)}>
                {n(c.value)}
              </span>
              {c.note && <span className="text-muted-foreground tnum text-[11px]">{c.note}</span>}
            </dd>
          </div>
        ))}
    </dl>
  )
}
