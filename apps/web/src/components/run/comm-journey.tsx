import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircleX, Mail, Pencil } from '@pv/ui'
import { Button, Icon, SegmentedControl, Select, Skeleton, buttonVariants, cn } from '@pv/ui'
import type { MailSubjectTimelineRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { MailRunEditModal } from '@/components/mail-run-edit-modal'
import { COMM_FOCUS, subjectKindLabel } from '@/data/comm-record-detail'
import { commRecordPath, workstreamCommsPath } from '@/data/comm-records'
import { COMMS_CHANNEL_LABEL } from '@/data/comms'
import { useOwnLetterCancel } from '@/data/mail-letters'
import { LETTERS_KEY } from '@/data/mas'
import { JourneyList } from './comm-journey-list'
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
      title="Lịch sử liên hệ"
      aside={
        <>
          {unconfirmed > 0 && (
            <span className="text-warning tnum text-[12px] font-medium">
              {unconfirmed} chưa xác nhận
            </span>
          )}
          {canComms && workstreamCode !== null && (
            <button
              type="button"
              aria-label="Xem cả luồng liên hệ"
              onClick={() => navigate(workstreamCommsPath(workstreamCode))}
              className={cn(
                'text-muted-foreground hover:text-foreground pointer-coarse:min-h-12 rounded-sm text-[13px] font-medium hover:underline',
                COMM_FOCUS,
              )}
            >
              Xem thêm
            </button>
          )}
        </>
      }
    >
      {rows.length > RECENT && (hasScopes || channels.length > 1) && (
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
        <JourneyList
          rows={cut ? shown.slice(0, RECENT) : shown}
          showCode={showCode}
          openOf={openOf}
          actionsOf={(row) =>
            row.letter &&
            (row.letter.canEdit || row.letter.threadUrl) && (
              <LetterActions
                letter={row.letter}
                onEdit={(id) => setEditing({ id, viaContent: false })}
              />
            )
          }
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
      <MailRunEditModal
        runId={editing?.id ?? null}
        viaContent={editing?.viaContent ?? false}
        onClose={closeEditor}
      />
    </RunBlock>
  )
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

  /* A thread exists only once the letter left, and Edit · Stop only before it
     does (`canEdit`), so the two sets of actions never share a row. */
  if (letter.threadUrl) {
    return (
      <a
        href={letter.threadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'pointer-coarse:h-12',
          COMM_FOCUS,
        )}
      >
        <Icon icon={Mail} size={16} />
        Mở trong Gmail
      </a>
    )
  }

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
