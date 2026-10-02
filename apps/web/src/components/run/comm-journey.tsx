import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircleX, Pencil } from '@pv/ui'
import {
  Badge,
  Button,
  Icon,
  SegmentedControl,
  Select,
  Skeleton,
  Timeline,
  cn,
  type StatusDotState,
  type TimelineItem,
} from '@pv/ui'
import {
  MAIL_LETTER_STATE_LABEL,
  type CommRecordState,
  type MailSubjectTimelineRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { ChannelPill, CommLateMark, CommStateBadge } from '@/components/comm-bits'
import { MailRunEditModal } from '@/components/mail-run-edit-modal'
import { LETTER_TONE } from '@/components/mail-letter/letter-model'
import { COMM_FOCUS, subjectKindLabel } from '@/data/comm-record-detail'
import { commRecordPath } from '@/data/comm-records'
import { COMMS_CHANNEL_LABEL } from '@/data/comms'
import { useOwnLetterCancel } from '@/data/mail-letters'
import { LETTERS_KEY } from '@/data/mas'
import { dm, dmhm } from '@/lib/date'
import { useJourneyRows, type JourneyRow, type JourneySubject } from './comm-journey-rows'
import { RunBlock } from './run-block'

/** The comm block of the run rail — the one comm list of the lead, deal,
 *  contract and run screens (ADR 0078 §1), replacing `DealComms`,
 *  `ContractComms` and the comm and mail tabs of `LeadHistoryPanel`.
 *
 *  Scope: the whole run, or the subject alone; with no subject (the run's own
 *  screen) only the whole run. Letters ride in as Email rows (ADR 0078 §3), so
 *  the channel filter covers mail. A comm opens its record screen; a letter has
 *  no screen, so the creator's scheduled one keeps Edit · Stop. A long list,
 *  so `.glass-b` (law 8). */

type Scope = 'run' | 'self'
const ALL_CHANNELS = 'all'
const NOTE = 'm-0 text-[12.5px] leading-[1.6]'

const COMM_DOT: Record<CommRecordState, StatusDotState> = {
  done: 'ok',
  unconfirmed: 'warning',
  empty: 'next',
}

export function CommJourney({
  workstreamCode,
  subject,
}: {
  /** `null` = the subject has no run yet: only its own letters can be listed. */
  workstreamCode: string | null
  /** The record the block stands on; absent on the run's own screen. */
  subject?: JourneySubject
}) {
  const { rows, canComms, isLoading, error, lettersError } = useJourneyRows(workstreamCode, subject)
  const [scope, setScope] = useState<Scope>('run')
  const [channel, setChannel] = useState(ALL_CHANNELS)
  const [editing, setEditing] = useState<string | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()

  const own = subject ? rows.filter((row) => row.code === subject.code) : rows
  const inScope = scope === 'run' ? rows : own
  const shown = channel === ALL_CHANNELS ? inScope : inScope.filter((r) => r.channel === channel)
  const channels = [...new Set(rows.map((row) => row.channel))]
  const unconfirmed = inScope.filter((row) => row.commState === 'unconfirmed').length

  /* The editor sweeps the run book's keys, not these: refetch on close so a
     new subject or hour shows here too. */
  const closeEditor = () => {
    setEditing(null)
    void client.invalidateQueries({ queryKey: LETTERS_KEY })
  }

  return (
    <RunBlock
      title="Liên hệ"
      aside={
        unconfirmed > 0 && (
          <span className="text-warning tnum text-[12px] font-medium">
            {unconfirmed} chưa xác nhận
          </span>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {subject && workstreamCode !== null && (
          <SegmentedControl
            label="Phạm vi"
            hideLabel
            tone="quiet"
            value={scope}
            onChange={(value) => setScope(value as Scope)}
            options={[
              { value: 'run', label: 'Cả lượt', count: rows.length },
              { value: 'self', label: `${subjectKindLabel(subject.code)} này`, count: own.length },
            ]}
          />
        )}
        {channels.length > 1 && (
          <Select
            label="Kênh"
            size="lg"
            value={channel}
            neutralValue={ALL_CHANNELS}
            onChange={setChannel}
            options={[
              { value: ALL_CHANNELS, label: 'Mọi kênh' },
              ...channels.map((c) => ({ value: c, label: COMMS_CHANNEL_LABEL[c] })),
            ]}
          />
        )}
      </div>

      {lettersError !== null && (
        <p className={cn(NOTE, 'text-muted-foreground')}>
          Không đọc được các email.{' '}
          {isApiError(lettersError) ? userMessage(lettersError) : 'Vui lòng thử lại.'}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className={cn(NOTE, 'text-muted-foreground')}>
          Không đọc được các lượt liên hệ.{' '}
          {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
        </p>
      ) : shown.length > 0 ? (
        <Timeline
          items={shown.map((row) =>
            itemOf(row, {
              open: (id) => navigate(commRecordPath(id)),
              letterActions: row.letter?.canEdit ? (
                <LetterActions letter={row.letter} onEdit={setEditing} />
              ) : undefined,
            }),
          )}
        />
      ) : rows.length > 0 ? (
        <p className={cn(NOTE, 'text-muted-foreground')}>Không có lượt liên hệ nào khớp bộ lọc.</p>
      ) : (
        canComms && <p className={cn(NOTE, 'text-muted-foreground')}>Chưa có lượt liên hệ nào.</p>
      )}

      {!canComms && (
        <p className={cn(NOTE, 'text-muted-foreground')}>
          Vai của bạn không có quyền xem các lượt liên hệ.
        </p>
      )}
      <MailRunEditModal runId={editing} onClose={closeEditor} />
    </RunBlock>
  )
}

/** One moment: the title (a comm's opens its screen), then channel · object ·
 *  when · who, and the pill of a row that still says something. A scheduled
 *  letter carries its hour: it has not left yet. */
function itemOf(
  row: JourneyRow,
  { open, letterActions }: { open: (id: string) => void; letterActions: TimelineItem['actions'] },
): TimelineItem {
  const commId = row.commId
  const when = row.at && (row.letter?.state === 'SCHEDULED' ? dmhm(row.at) : dm(row.at))
  const title = (
    <span className={cn(row.titleMuted ? 'text-muted-foreground' : 'text-foreground')}>
      {row.title}
    </span>
  )

  return {
    id: row.key,
    state: row.letter
      ? LETTER_TONE[row.letter.state].dot
      : row.commState
        ? COMM_DOT[row.commState]
        : 'next',
    title: commId ? (
      <button
        type="button"
        onClick={() => open(commId)}
        className={cn('pointer-coarse:min-h-12 rounded-sm text-left hover:underline', COMM_FOCUS)}
      >
        {title}
      </button>
    ) : (
      title
    ),
    meta: (
      <>
        <ChannelPill channel={row.channel} />
        <span className="text-muted-foreground font-mono text-[12px]">{row.code}</span>
        {when && <span className="text-muted-foreground tnum text-[12px]">{when}</span>}
        {row.owner && <span className="text-muted-foreground text-[12px]">{row.owner}</span>}
        <RowPill row={row} />
        <CommLateMark late={row.late} />
      </>
    ),
    actions: letterActions,
  }
}

/** A comm's pill only while unfinished; a letter's for every state but SENT,
 *  the plain outcome — opened, replied, bounced, held back, stopped all tell. */
function RowPill({ row }: { row: JourneyRow }) {
  if (row.commState && row.commState !== 'done') return <CommStateBadge state={row.commState} />
  const state = row.letter?.state
  if (!state || state === 'SENT') return null
  return <Badge tone={LETTER_TONE[state].badge}>{MAIL_LETTER_STATE_LABEL[state]}</Badge>
}

/** Edit · Stop on a scheduled letter the reader created, as the old per-object letter list had them. */
function LetterActions({
  letter,
  onEdit,
}: {
  letter: MailSubjectTimelineRow
  onEdit: (runId: string) => void
}) {
  const stop = useOwnLetterCancel()
  const onStop = () =>
    stop.mutate(letter.runId, {
      onSuccess: () => toastDone('Đã dừng thư', 'Thư sẽ không được gửi đi.'),
      onError: (cause) => toastFail('Không dừng được thư', userMessage(cause)),
    })

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="pointer-coarse:h-12"
        onClick={() => onEdit(letter.runId)}
      >
        <Icon icon={Pencil} size={16} />
        Sửa
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="pointer-coarse:h-12"
        disabled={stop.isPending}
        onClick={onStop}
      >
        <Icon icon={CircleX} size={16} />
        Dừng
      </Button>
    </>
  )
}
