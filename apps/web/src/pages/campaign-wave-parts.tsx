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
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { type useCampaignStop } from '@/data/campaign-book'
import { MAIL_RUN_STATE_LABEL, MAIL_RUN_STATE_TONE } from '@/data/mail-runs'
import { WaveRecipients } from '@/components/wave-recipients'
import { dayTime, shareOf, timeOnly, wavesInOrder } from './campaign-model'

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
  const submit = () =>
    stop.mutate(undefined, {
      onSuccess: (res) => {
        const held = res.cancelled.reduce((n, r) => n + r.held, 0)
        toast('Đã dừng chiến dịch', {
          tone: 'success',
          detail:
            res.cancelled.length === 0
              ? 'Không đợt nào còn thư để giữ lại.'
              : `${res.cancelled.length} đợt bị huỷ · ${held} thư chưa gửi đã được giữ lại.`,
        })
        onClose()
      },
      onError: (err) =>
        toast('Không dừng được chiến dịch', {
          tone: 'danger',
          detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
        }),
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Dừng chiến dịch ${campaign.code}`}
      subtitle={campaign.name}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button size="lg" variant="ghost" onClick={onClose} disabled={stop.isPending}>
            Để chạy tiếp
          </Button>
          <Button size="lg" variant="destructive" onClick={submit} disabled={stop.isPending}>
            <Icon icon={Octagon} size={16} />
            {stop.isPending ? 'Đang dừng…' : 'Dừng hẳn chiến dịch'}
          </Button>
        </div>
      }
    >
      <div className="flex max-w-[640px] flex-col gap-4 text-[13px] leading-[1.65]">
        <p>
          Mọi đợt chưa gửi bị rút khỏi hàng đợi, những lá thư còn trong đó được giữ lại. Đợt đã gửi
          xong thì không gọi về được.
        </p>
        <p className="text-warning">
          Dừng là vĩnh viễn: chiến dịch đã dừng không bắt đầu chạy lại được và cũng không nối thêm
          đợt được — muốn gửi tiếp thì phải mở chiến dịch mới.
        </p>
        <p className="text-muted-foreground">
          {campaign.waveCount} đợt đã gửi · {campaign.audienceCount.toLocaleString('vi-VN')} người
          nhận.
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
            Mở rộng tất cả
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={open.size === 0}
            onClick={() => setOpen(new Set())}
          >
            Thu gọn tất cả
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
  if (run.startedAt) return `Bắt đầu ${dayTime(run.startedAt)}`
  if (run.scheduledAt) return `Hẹn ${dayTime(run.scheduledAt)}`
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
  const n = (v: number) => v.toLocaleString('vi-VN')
  const queued = Math.max(run.audienceCount - run.sent - run.failed, 0)

  return (
    <GlassCard
      variant="b"
      role="article"
      aria-label={`Đợt ${waveNo}`}
      className="flex flex-col gap-4 p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Chip>Đợt {waveNo}</Chip>
        <div className="min-w-[220px] flex-1">
          <h3 className="m-0 truncate text-[14px] font-semibold" title={run.label}>
            {run.label}
          </h3>
          <p className="text-muted-foreground m-0 truncate text-[12px]" title={run.subject}>
            Tiêu đề thư: {run.subject}
          </p>
        </div>
        {!open && (
          <span className="text-muted-foreground tnum text-[12px]">
            Đã gửi {n(run.sent)} · bấm {n(run.clicked)} · bounce {n(run.bounced)}
          </span>
        )}
        <span className="text-muted-foreground tnum text-[12px]">{waveWhen(run)}</span>
        <Badge tone={MAIL_RUN_STATE_TONE[run.state]}>{MAIL_RUN_STATE_LABEL[run.state]}</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? 'Thu gọn' : 'Mở rộng'} đợt ${waveNo}`}
          onClick={onToggle}
        >
          <Icon icon={ChevronDown} size={16} className={cn(open && 'rotate-180')} />
          {open ? 'Thu gọn' : 'Mở rộng'}
        </Button>
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col gap-4">
          {run.state === 'SENDING' && (
            <div className="flex flex-col gap-2">
              <SendProgress run={run} label={`Tiến độ gửi đợt ${waveNo}`} />
              <p className="text-muted-foreground tnum m-0 text-[12px]">
                Đã gửi {n(run.sent)} trên {n(run.audienceCount)} thư · còn {n(queued)} thư trong
                hàng đợi
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
              {recipients ? 'Ẩn danh sách người nhận' : 'Xem từng người nhận'}
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
const RECIPIENT_COLUMNS: [header: string, width: string][] = [
  ['Mã lead', '104px'],
  ['Người nhận', 'minmax(200px,1.8fr)'],
  ['Trạng thái thư', '124px'],
  ['Thời điểm', 'minmax(140px,1fr)'],
  ['Đã gửi', '64px'],
  ['Tới nơi', '64px'],
  ['Mở', '64px'],
  ['Bấm', '64px'],
  ['Bounce', '64px'],
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
          {RECIPIENT_COLUMNS.map(([header], i) => (
            <span
              key={header}
              className={cn(
                'truncate',
                i === 0 && 'pl-6',
                i >= RECIPIENT_TEXT_COLUMNS && 'text-right',
              )}
            >
              {header}
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
  /* Opens carry no share: `opened` is a noisy lower bound (proxies trip the
     pixel, blockers hide it), and a percentage would read it as truth. */
  const cells: { key: string; label: string; value: number; note?: string; tone?: string }[] = [
    { key: 's', label: 'Đã gửi', value: run.sent },
    {
      key: 'd',
      label: 'Tới nơi',
      value: run.delivered,
      note: `${shareOf(run.delivered, run.sent, 1)} số đã gửi`,
    },
    { key: 'o', label: 'Có người mở', value: run.opened },
    {
      key: 'c',
      label: 'Đã bấm liên kết',
      value: run.clicked,
      note: `${shareOf(run.clicked, run.delivered, 1)} số tới nơi`,
      tone: 'text-accent-foreground',
    },
    {
      key: 'u',
      label: 'Hủy đăng ký',
      value: run.unsubscribed,
      note: `${shareOf(run.unsubscribed, run.delivered, 1)} số tới nơi`,
      tone: 'text-warning',
    },
    {
      key: 'b',
      label: 'Bounce',
      value: run.bounced,
      note: `${shareOf(run.bounced, run.sent, 1)} số đã gửi`,
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
                {c.value.toLocaleString('vi-VN')}
              </span>
              {c.note && <span className="text-muted-foreground tnum text-[11px]">{c.note}</span>}
            </dd>
          </div>
        ))}
    </dl>
  )
}
