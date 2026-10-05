import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CircleX, Pencil } from '@pv/ui'
import {
  Badge,
  Button,
  Icon,
  SegmentedControl,
  Select,
  Skeleton,
  Timeline,
  cn,
  type TimelineItem,
} from '@pv/ui'
import { MAIL_LETTER_STATE_LABEL, type MailSubjectTimelineRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { ChannelPill, CommLateMark, CommStateBadge } from '@/components/comm-bits'
import { MailRunEditModal } from '@/components/mail-run-edit-modal'
import { LETTER_TONE } from '@/components/mail-letter/letter-model'
import { COMM_FOCUS, COMM_STATE_DOT, subjectKindLabel } from '@/data/comm-record-detail'
import { commRecordPath, workstreamCommsPath } from '@/data/comm-records'
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
 *  no screen, so it opens the run modal, and the creator's scheduled one keeps
 *  Edit · Stop. A long list, so `.glass-b` (law 8). */

type Scope = 'run' | 'self'
const ALL_CHANNELS = 'all'
/** The card is a glance; the whole run reads on its own screen. */
const RECENT = 5
const NOTE = 'm-0 text-[12.5px] leading-[1.6]'

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
  const [editing, setEditing] = useState<{ id: string; viaContent: boolean } | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()

  const own = subject ? rows.filter((row) => row.code === subject.code) : rows
  const inScope = scope === 'run' ? rows : own
  const shown = channel === ALL_CHANNELS ? inScope : inScope.filter((r) => r.channel === channel)
  const channels = [...new Set(rows.map((row) => row.channel))]
  const unconfirmed = inScope.filter((row) => row.commState === 'unconfirmed').length
  /* A switch between two equal lists, or a code every row shares, says nothing. */
  const hasScopes = Boolean(subject) && workstreamCode !== null && own.length !== rows.length
  const showCode = new Set(inScope.map((row) => row.code)).size > 1
  /* Cut to the newest only where the full screen can be reached; with no run
     or no comm permission the card is the only place the rows are listed. */
  const cut = canComms && workstreamCode !== null && shown.length > RECENT

  /* Somebody else's letter is customer mail: it is read through the audited door. */
  const openOf = ({ commId, letter }: JourneyRow) =>
    commId
      ? () => navigate(commRecordPath(commId))
      : letter && (() => setEditing({ id: letter.runId, viaContent: !letter.mine }))

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
        <>
          {unconfirmed > 0 && (
            <span className="text-warning tnum text-[12px] font-medium">
              {unconfirmed} chưa xác nhận
            </span>
          )}
          {canComms && workstreamCode !== null && (
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              aria-label="Xem cả luồng liên hệ"
              onClick={() => navigate(workstreamCommsPath(workstreamCode))}
            >
              Xem thêm
              <Icon icon={ArrowRight} size={16} />
            </Button>
          )}
        </>
      }
    >
      {(hasScopes || channels.length > 1) && (
        <div className="flex flex-wrap items-center gap-2">
          {hasScopes && subject && (
            <SegmentedControl
              label="Phạm vi"
              hideLabel
              tone="quiet"
              value={scope}
              onChange={(value) => setScope(value as Scope)}
              options={[
                { value: 'run', label: 'Cả lượt', count: rows.length },
                {
                  value: 'self',
                  label: `${subjectKindLabel(subject.code)} này`,
                  count: own.length,
                },
              ]}
            />
          )}
          {channels.length > 1 && (
            <Select
              label="Kênh"
              hideLabel
              size="sm"
              className="pointer-coarse:[&>button]:h-12"
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
      )}

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
          items={(cut ? shown.slice(0, RECENT) : shown).map((row) =>
            itemOf(row, {
              open: openOf(row),
              showCode,
              letterActions: row.letter?.canEdit ? (
                <LetterActions
                  letter={row.letter}
                  onEdit={(id) => setEditing({ id, viaContent: false })}
                />
              ) : undefined,
            }),
          )}
        />
      ) : rows.length > 0 ? (
        <p className={cn(NOTE, 'text-muted-foreground')}>Không có lượt liên hệ nào khớp bộ lọc.</p>
      ) : (
        canComms && <p className={cn(NOTE, 'text-muted-foreground')}>Chưa có lượt liên hệ nào.</p>
      )}

      {cut && (
        <span className="text-muted-foreground tnum text-[12px]">
          {RECENT} gần nhất trong {shown.length}
        </span>
      )}

      {!canComms && (
        <p className={cn(NOTE, 'text-muted-foreground')}>
          Vai của bạn không có quyền xem các lượt liên hệ.
        </p>
      )}
      <MailRunEditModal
        runId={editing?.id ?? null}
        viaContent={editing?.viaContent ?? false}
        onClose={closeEditor}
      />
    </RunBlock>
  )
}

/** One moment: when · channel · who and the pill of a row that still says
 *  something, then the content beneath (it opens the comm's screen or the letter). A
 *  scheduled letter carries its hour: it has not left yet. */
function itemOf(
  row: JourneyRow,
  {
    open,
    showCode,
    letterActions,
  }: {
    open: (() => void) | null
    showCode: boolean
    letterActions: TimelineItem['actions']
  },
): TimelineItem {
  const when = row.at && (row.letter?.state === 'SCHEDULED' ? dmhm(row.at) : dm(row.at))
  const content = (
    <span
      className={cn(
        'text-[13px] leading-[1.5]',
        row.titleMuted ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {row.title}
    </span>
  )

  return {
    id: row.key,
    state: row.letter
      ? LETTER_TONE[row.letter.state].dot
      : row.commState
        ? COMM_STATE_DOT[row.commState]
        : 'next',
    title: (
      <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-[12px] font-normal">
        {when && <span className="tnum">{when}</span>}
        <ChannelPill channel={row.channel} />
        <span>{[row.owner, showCode && row.code].filter(Boolean).join(' · ')}</span>
        <RowPill row={row} />
        <CommLateMark late={row.late} />
      </span>
    ),
    children: open ? (
      <button
        type="button"
        onClick={open}
        className={cn(
          'pointer-coarse:min-h-12 flex w-full items-center rounded-sm text-left hover:underline',
          COMM_FOCUS,
        )}
      >
        {content}
      </button>
    ) : (
      content
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
