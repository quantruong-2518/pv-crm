import { useState } from 'react'
import {
  Badge,
  Button,
  ChevronDown,
  ChevronRight,
  Chip,
  DataTable,
  GlassCard,
  Icon,
  Modal,
  Octagon,
  cn,
  type TableColumn,
  type TableRowModel,
} from '@pv/ui'
import type { CampaignProfile, CampaignWaveRow, MailRunRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { type useCampaignStop } from '@/data/campaign-book'
import { MAIL_RUN_STATE_LABEL, MAIL_RUN_STATE_TONE } from '@/data/mail-runs'
import { RunWhen } from '@/components/run-when'
import { WaveRecipients } from '@/components/wave-recipients'
import { shareOf } from './campaign-model'

/** Module 1 · the campaign WAVES — the table of the ones already gone, and
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
          Mọi đợt CHƯA GỬI bị rút khỏi hàng đợi, những lá thư còn trong đó được giữ lại. Đợt đã gửi
          xong thì không gọi về được.
        </p>
        <p className="text-warning">
          Dừng là vĩnh viễn: chiến dịch đã dừng không bắt đầu chạy lại được và cũng không nối thêm
          đợt được — muốn gửi tiếp thì phải mở chiến dịch mới.
        </p>
        <p className="text-muted-foreground">
          {campaign.waveCount} đợt đã bắn · {campaign.audienceCount.toLocaleString('vi-VN')} người
          nhận.
        </p>
      </div>
    </Modal>
  )
}

/** THE FOUR COUNTERS ARE A BLOCK, NOT FOUR STRETCHY COLUMNS.
 *
 *  They were `0.8fr · 0.8fr · 0.7fr · 0.8fr`, so on a wide screen four
 *  one-digit numbers drifted a couple of hundred pixels apart from each other
 *  and from the headers naming them — right-aligned inside columns wide enough
 *  that being right-aligned had stopped meaning anything. Fixed widths keep
 *  them a readable block at the right edge and hand the slack to the one
 *  column that can use it, the label. */
const WAVE_COLUMNS: TableColumn[] = [
  { header: 'Đợt', width: '104px' },
  { header: 'Tên · tiêu đề', width: 'minmax(220px,1.8fr)' },
  { header: 'Trạng thái', width: '124px' },
  { header: 'Lúc', width: 'minmax(140px,1fr)' },
  { header: 'Đã gửi', width: '84px', align: 'right' },
  { header: 'Tới nơi', width: '84px', align: 'right' },
  { header: 'Mở', width: '68px', align: 'right' },
  { header: 'Bấm', width: '68px', align: 'right' },
  { header: 'Bounce', width: '84px', align: 'right' },
]

/** The same track list the rows are drawn on, handed to the panel that opens
 *  UNDER a row so its cells land under the headers that name them — see
 *  `WaveRecipients`. Derived, never retyped: two column lists claiming to be
 *  one is the drift this string exists to prevent. */
const WAVE_TEMPLATE = WAVE_COLUMNS.map((c) => c.width).join(' ')

/** THE WAVE LIST — and, one click down, that wave's five numbers and the
 *  letters behind each of them.
 *
 *  A row here sums a whole batch. WHICH recipient bounced, who never opened
 *  it — `WaveRecipients` is the panel, `GET /sales/mail/runs/:id/recipients`
 *  the data, and the row itself is the handle.
 *
 *  ONE wave open at a time: two open panels push the third wave off the
 *  screen, and the question — what happened to THIS wave — is asked one wave
 *  at a time. Which one is open is the SCREEN's state; `DataTable` only draws. */
export function WaveTable({ campaign }: { campaign: CampaignProfile }) {
  const [openWave, setOpenWave] = useState<number | null>(null)

  return (
    <GlassCard variant="b" className="overflow-hidden px-4 py-3 lg:px-5">
      <div className="overflow-x-auto">
        <DataTable
          className="min-w-[1008px]"
          columns={WAVE_COLUMNS}
          rows={campaign.waves.map((w) => {
            const open = openWave === w.waveNo
            return waveRow(w, open, () => setOpenWave(open ? null : w.waveNo), campaign)
          })}
        />
      </div>
    </GlassCard>
  )
}

function waveRow(
  w: CampaignWaveRow,
  open: boolean,
  toggle: () => void,
  campaign: CampaignProfile,
): TableRowModel {
  return {
    id: String(w.waveNo),
    onOpen: toggle,
    ...(open
      ? {
          details: (
            <div className="flex flex-col gap-3">
              <WaveNumbers run={w.run} ceilingPercent={campaign.bounceCeilingPercent} />
              <WaveRecipients runId={w.run.id} template={WAVE_TEMPLATE} />
            </div>
          ),
        }
      : {}),
    cells: [
      <span key="n" className="flex items-center gap-1">
        {/* BESIDE the row's click target, not instead of it: the row is what a
            reader aims at, `aria-expanded` needs a real element.
            `stopPropagation` stops a double toggle. */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Thông số và người nhận đợt ${w.waveNo}`}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          className="motion-std text-muted-foreground hover:text-foreground pointer-coarse:size-12 -m-1 rounded-md p-1"
        >
          <Icon icon={open ? ChevronDown : ChevronRight} size={14} />
        </button>
        <Chip>#{w.waveNo}</Chip>
      </span>,
      <div key="l" className="min-w-0">
        <span className="block truncate" title={w.run.label}>
          {w.run.label}
        </span>
        <span className="text-muted-foreground block truncate text-[11px]" title={w.run.subject}>
          {w.run.subject}
        </span>
      </div>,
      <Badge key="s" tone={MAIL_RUN_STATE_TONE[w.run.state]}>
        {MAIL_RUN_STATE_LABEL[w.run.state]}
      </Badge>,
      <RunWhen key="w" run={w.run} />,
      <span key="sent" className="tnum">
        {w.run.sent.toLocaleString('vi-VN')}
      </span>,
      <span key="d" className="tnum">
        {w.run.delivered.toLocaleString('vi-VN')}
      </span>,
      <span key="o" className="tnum">
        {w.run.opened.toLocaleString('vi-VN')}
      </span>,
      /* Which LETTER worked. `accent-foreground`, not `primary`: brand blue is
         a background (law 3) and reads 4.12:1 as text on `--card`. */
      <span
        key="cl"
        className={cn('tnum', w.run.clicked > 0 && 'text-accent-foreground font-semibold')}
      >
        {w.run.clicked.toLocaleString('vi-VN')}
      </span>,
      <span
        key="b"
        className={cn('tnum', w.run.bounced > 0 && 'text-destructive-foreground font-semibold')}
      >
        {w.run.bounced.toLocaleString('vi-VN')}
      </span>,
    ],
  }
}

/** ONE WAVE'S FIVE NUMBERS, each with the share that gives it meaning.
 *
 *  Tinted tiles, not glass: this sits inside the table's `.glass-b`, and a
 *  second pane would stack two translucent surfaces. The two negatives wear the
 *  `Badge` danger pairing so their contrast is the one already measured. */
function WaveNumbers({ run, ceilingPercent }: { run: MailRunRow; ceilingPercent: number }) {
  /* Opens carry no share: `opened` is a noisy lower bound (proxies trip the
     pixel, blockers hide it), and a percentage would read it as truth. */
  const tiles: { key: string; label: string; value: number; note?: string; bad?: boolean }[] = [
    {
      key: 'd',
      label: 'Tới nơi',
      value: run.delivered,
      note: `${shareOf(run.delivered, run.sent)} số đã gửi`,
    },
    { key: 'o', label: 'Có người mở', value: run.opened },
    {
      key: 'c',
      label: 'Đã bấm liên kết',
      value: run.clicked,
      note: `${shareOf(run.clicked, run.delivered)} số tới nơi`,
    },
    {
      key: 'u',
      label: 'Hủy đăng ký',
      value: run.unsubscribed,
      note: `${shareOf(run.unsubscribed, run.delivered, 1)} số tới nơi`,
      bad: run.unsubscribed > 0,
    },
    {
      key: 'b',
      label: 'Bounce',
      value: run.bounced,
      note: `${shareOf(run.bounced, run.sent, 1)} số đã gửi · trần ${ceilingPercent}%`,
      bad: run.bounced > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 px-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.key}
          className={cn(
            'flex flex-col gap-1 rounded-md p-3',
            t.bad ? 'bg-destructive/20 text-on-tint-destructive' : 'bg-surface-ink/5',
          )}
        >
          <span className={cn('text-[11.5px]', !t.bad && 'text-muted-foreground')}>{t.label}</span>
          <span className="tnum font-num text-[20px] font-semibold leading-none">
            {t.value.toLocaleString('vi-VN')}
          </span>
          {t.note && (
            <span className={cn('text-[11px]', !t.bad && 'text-muted-foreground')}>{t.note}</span>
          )}
        </div>
      ))}
    </div>
  )
}
