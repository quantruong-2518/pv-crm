import { useEffect, useState } from 'react'
import {
  Badge,
  Button,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Chip,
  DataTable,
  Drawer,
  GlassCard,
  Icon,
  Inbox,
  Octagon,
  Send,
  Skeleton,
  cn,
  type TableColumn,
} from '@pv/ui'
import { MAS_RECIPIENT_BLOCK_LABEL, MasRecipientBlock } from '@pv/contracts'
import type {
  CampaignPreflightResponse,
  CampaignProfile,
  MailTemplateRow,
  MasRecipient,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import {
  type useCampaignStart,
  type useCampaignStop,
  type useCampaignWaveAdd,
} from '@/data/campaign-book'
import { MAIL_RUN_STATE_LABEL, MAIL_RUN_STATE_TONE } from '@/data/mail-runs'
import { dmhm } from '@/lib/date'
import { RunWhen } from '@/components/run-when'
import { WaveRecipients } from '@/components/wave-recipients'
import { WaveComposer } from '@/components/mail-sequence/wave-composer'
import {
  composerBlocker,
  composerDraftInput,
  composerDraftValid,
  effectiveWaves,
  emptyComposerState,
  type ComposerState,
} from '@/components/mail-sequence/wave-draft'
import { ceilingNote } from './campaign-model'

/** Module 1 · the campaign WAVES — the one panel that fires them, and the
 *  table of the ones already gone.
 *
 *  ONE drawer for both doors. Firing wave 1 (`/start`) and firing wave n
 *  (`/waves`) differed by an endpoint and nothing else, yet lived as two
 *  inline steps of a wizard with two send buttons — and both send real,
 *  unrecallable mail. An act with no way back does not sit inline on a page:
 *  that is the precedent `SignDrawer` set on the deal profile. */

/** WAVE 1 AND WAVE n, ONE PANEL — the only door in the module that sends mail.
 *
 *  `firstRun` picks the endpoint and nothing else: a DRAFT carrying no wave is
 *  the only shape `/start` accepts, every later wave goes to `/waves`, and the
 *  server refuses both once the campaign is STOPPED. ONE wave per press after
 *  the first, because a browser-side loop dying halfway could not say which
 *  waves went out — the server's own loop can, which is what `/start` is.
 *
 *  The button names the act and the real count instead of a neutral verb: what
 *  is about to happen is mail leaving the machine for N people. */
export function WaveDrawer({
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
  /** The server's own answer to "who would this wave reach". `undefined` while
   *  `POST /sales/campaigns/:code/preflight` is in the air. */
  preflight?: CampaignPreflightResponse
  preflightFailed?: boolean
}) {
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState)

  /* A fresh sheet on every opening, never on closing: the panel stays mounted
     while it slides out, and clearing there empties it mid-animation. */
  useEffect(() => {
    if (open) setComposer(emptyComposerState())
  }, [open])

  const firstRun = campaign.state === 'DRAFT' && campaign.waveCount === 0
  const waves = effectiveWaves(composer)
  const ready = firstRun ? waves.length > 0 : composerDraftValid(composer)
  const overCeiling = campaign.audienceCount > campaign.batchCeiling
  const noAudience = campaign.audienceCount === 0
  const busy = start.isPending || waveAdd.isPending
  /* The one refusal that is the SERVER's count, not the screen's. An overlap
     never lands here: those letters do go out. */
  const noneReachable = preflight?.sendable === 0
  const blocked = !ready || overCeiling || noAudience || noneReachable || busy

  const scheduled =
    composer.timing === 'later' && composer.at !== '' && !Number.isNaN(Date.parse(composer.at))
  /* The real count the moment there is one — the whole audience is what WOULD
     be written to, the preflight is what will be. */
  const people = (preflight?.sendable ?? campaign.audienceCount).toLocaleString('vi-VN')
  const fireLabel =
    waves.length > 1
      ? `Bắn ${waves.length} đợt cho ${people} người`
      : scheduled
        ? `Hẹn ${dmhm(new Date(composer.at).toISOString())} cho ${people} người`
        : `Bắn cho ${people} người`

  const note = fireNote(campaign, composer, preflight, preflightFailed)

  const submit = () => {
    if (blocked) return
    const failed = (err: unknown) =>
      toast('Không bắn được đợt', {
        tone: 'danger',
        detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
      })

    if (firstRun) {
      start.mutate(
        { waves },
        {
          onSuccess: (res) => {
            const first = res.waves[0]
            toast('Chiến dịch đã bắt đầu chạy', {
              tone: 'success',
              detail: first
                ? `${first.queued} thư vào hàng đợi${first.skipped > 0 ? `, ${first.skipped} bị bỏ qua` : ''}.`
                : undefined,
            })
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
          toast(`Đã bắn đợt ${campaign.waveCount + 1}`, {
            tone: 'success',
            detail: `${res.queued} thư vào hàng đợi${res.skipped > 0 ? `, ${res.skipped} bị bỏ qua` : ''}.`,
          })
          onClose()
        },
        onError: failed,
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={`Bắn đợt ${campaign.waveCount + 1}`}
      subtitle={`${campaign.code} · ${campaign.name}`}
      meta={
        /* The WHOLE audience here, the reachable part on the button: a chip
           repeating the button's number would say nothing the button did not. */
        <Chip>{campaign.audienceCount.toLocaleString('vi-VN')} trong tệp nhận</Chip>
      }
      footer={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <span
            aria-live="polite"
            className={cn(
              'min-w-0 max-w-[420px] text-[11.5px] leading-[1.5]',
              note.warn ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {note.text}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" onClick={onClose} disabled={busy}>
              Huỷ
            </Button>
            <Button size="lg" onClick={submit} disabled={blocked}>
              <Icon icon={scheduled ? CalendarClock : Send} size={16} />
              {busy ? 'Đang bắn…' : fireLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <WaveComposer
          state={composer}
          setState={setComposer}
          templates={templates}
          showAdd={firstRun}
          alreadyFired={campaign.waveCount}
        />
        {/* The recipient check, between the composed wave and the button that
            sends it. A failed dry run draws nothing: the sentence beside the
            button already says the count there is the whole audience. */}
        {preflight && <WavePreflight report={preflight} />}
        {!preflight && !preflightFailed && <Skeleton className="h-28 w-full" />}
      </div>
    </Drawer>
  )
}

/** WHY THE BUTTON SAYS WHAT IT SAYS — one line beside it, never a `title`.
 *
 *  The order is the order somebody can act in: an empty or oversized audience
 *  is theirs to fix, a dry run that reached nobody is the server's answer, then
 *  the composer's own blocker, and only then the state of the check itself.
 *  `warn` rides along so the caller does not weigh the same conditions twice
 *  to colour the line. */
function fireNote(
  campaign: CampaignProfile,
  composer: ComposerState,
  preflight: CampaignPreflightResponse | undefined,
  failed: boolean,
): { text: string; warn: boolean } {
  if (campaign.audienceCount === 0)
    return { text: 'Tệp nhận còn rỗng — thêm người nhận ở tab Tệp nhận trước khi bắn.', warn: true }

  if (campaign.audienceCount > campaign.batchCeiling)
    return { text: ceilingNote(campaign.audienceCount, campaign.batchCeiling), warn: true }

  if (preflight?.sendable === 0)
    return {
      text: 'Không ai trong tệp nhận được thư: tất cả đều đã rơi khỏi phễu, đã chặn, thiếu email hoặc trùng địa chỉ. Sửa ở tab Tệp nhận rồi quay lại.',
      warn: true,
    }

  const blocker = composerBlocker(composer)
  if (blocker) return { text: blocker, warn: false }

  if (failed)
    return {
      text: 'Không kiểm được người nhận nên số trên nút là cả tệp — bắn vẫn chạy, máy chủ tự bỏ qua những người không gửi được.',
      warn: true,
    }

  if (!preflight)
    return {
      text: 'Đang kiểm người nhận — số trên nút còn là cả tệp nhận, chưa trừ ai.',
      warn: false,
    }

  return { text: 'Bấm là thư vào hàng đợi thật — đợt đã đi không gọi về được.', warn: false }
}

/** WHO THIS WAVE REALLY REACHES — the last look before an unrecallable act.
 *
 *  Sendable first, then one group per refusal, because the first question is
 *  whether the number on the button is the number somebody meant, and only the
 *  second is who fell out. Reason labels come from `MAS_RECIPIENT_BLOCK_LABEL`,
 *  the table the MAS panel and the server's send report already print — a
 *  second wording here would be a second vocabulary for one set of reasons. */
function WavePreflight({ report }: { report: CampaignPreflightResponse }) {
  const sendable = report.recipients.filter((r) => !r.block)
  const groups = MasRecipientBlock.options
    .map((reason) => ({ reason, rows: report.recipients.filter((r) => r.block === reason) }))
    .filter((g) => g.rows.length > 0)

  return (
    <GlassCard variant="b" className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12.5px] font-semibold">Người nhận sau kiểm tra</span>
        <span className="text-muted-foreground text-[11.5px]">
          <span className="tnum text-card-foreground font-semibold">{report.sendable}</span> gửi
          được · <span className="tnum">{report.blocked}</span> bị bỏ qua
        </span>
      </div>
      <div className="flex max-h-72 min-w-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <RecipientGroup title={`Sẽ nhận thư (${sendable.length})`} rows={sendable} />
        {groups.map((g) => (
          <RecipientGroup
            key={g.reason}
            title={`${MAS_RECIPIENT_BLOCK_LABEL[g.reason]} (${g.rows.length})`}
            rows={g.rows}
            blocked
          />
        ))}
      </div>
    </GlassCard>
  )
}

/** One reason and the people it applies to, NAMED rather than counted: a row
 *  nobody can name is a row nobody can go and fix. */
function RecipientGroup({
  title,
  rows,
  blocked = false,
}: {
  title: string
  rows: readonly MasRecipient[]
  blocked?: boolean
}) {
  if (rows.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span
        className={cn(
          'text-[11.5px] font-semibold',
          blocked ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {title}
      </span>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((r) => (
          <li
            key={r.subjectCode}
            className="bg-surface-ink/5 flex min-w-0 items-center justify-between gap-3 rounded-sm p-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{r.contactName}</span>
              <span className="text-muted-foreground truncate text-[11px]">{r.company}</span>
            </span>
            <span className="text-glass-foreground min-w-0 truncate font-mono text-[10.5px]">
              {r.email ?? 'Chưa có email'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** STOPPING ASKS FIRST — the only act on this screen with no door back.
 *
 *  `/stop` pulls every unsent wave out of the queue and files the campaign
 *  STOPPED, after which the server refuses `/start` and `/waves` by name. A
 *  `window.confirm` would ask that question in the browser's own voice, out of
 *  the app's language and typography; the panel asks in ours and names what
 *  the press costs. */
export function StopDrawer({
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
    <Drawer
      open={open}
      onClose={onClose}
      title={`Dừng chiến dịch ${campaign.code}`}
      subtitle={campaign.name}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
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
      <div className="flex flex-col gap-3 text-[12.5px] leading-[1.65]">
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
          trong tệp nhận.
        </p>
      </div>
    </Drawer>
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

/** THE WAVE LIST — and, one click down, the letters behind each of its numbers.
 *
 *  A row here sums a whole batch. WHICH of the three recipients bounced, who
 *  never opened it, which address is wrong — none of that had a door before
 *  30/08. `WaveRecipients` is the panel, `GET /sales/mail/runs/:id/recipients`
 *  is the data, and the row itself is the handle.
 *
 *  ONE wave open at a time, and that is not a limitation to apologise for: two
 *  open panels push the third wave off the screen, and the question this
 *  answers — what happened to THIS wave — is asked one wave at a time. Which
 *  one is open is the SCREEN's state; `DataTable` draws what it is handed,
 *  exactly as it does with the sort order. */
export function WaveTable({ campaign }: { campaign: CampaignProfile }) {
  const [openWave, setOpenWave] = useState<number | null>(null)

  return (
    <GlassCard variant="b" className="overflow-hidden px-4 py-3 lg:px-5">
      <div className="overflow-x-auto">
        {campaign.waves.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon icon={Inbox} size={26} className="text-muted-foreground" />
            <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">
              {campaign.audienceCount === 0
                ? 'Chưa có đợt nào, và tệp nhận cũng còn rỗng.'
                : 'Chưa có đợt nào — chiến dịch còn ở trạng thái NHÁP.'}
            </p>
          </div>
        ) : (
          <DataTable
            className="min-w-[1008px]"
            columns={WAVE_COLUMNS}
            rows={campaign.waves.map((w) => {
              const open = openWave === w.waveNo
              const toggle = () => setOpenWave(open ? null : w.waveNo)

              return {
                id: String(w.waveNo),
                onOpen: toggle,
                ...(open
                  ? { details: <WaveRecipients runId={w.run.id} template={WAVE_TEMPLATE} /> }
                  : {}),
                cells: [
                  <span key="n" className="flex items-center gap-1">
                    {/* BESIDE the row's click target, not instead of it: the
                        row is what a reader aims at, `aria-expanded` needs a
                        real element. `stopPropagation` stops a double toggle. */}
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`Người nhận đợt ${w.waveNo}`}
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
                    <span
                      className="text-muted-foreground block truncate text-[11px]"
                      title={w.run.subject}
                    >
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
                  /* Which LETTER worked. `accent-foreground`, not `primary`:
                     brand blue is a background (law 3) and reads 4.12:1 as text
                     on `--card`, under law 13's floor. */
                  <span
                    key="cl"
                    className={cn(
                      'tnum',
                      w.run.clicked > 0 && 'text-accent-foreground font-semibold',
                    )}
                  >
                    {w.run.clicked.toLocaleString('vi-VN')}
                  </span>,
                  <span
                    key="b"
                    className={cn('tnum', w.run.bounced > 0 && 'text-warning font-semibold')}
                  >
                    {w.run.bounced.toLocaleString('vi-VN')}
                  </span>,
                ],
              }
            })}
          />
        )}
      </div>
    </GlassCard>
  )
}
