import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CircleX, Mail, Pencil } from '@pv/ui'
import { Button, Icon, Select, Skeleton, buttonVariants, cn } from '@pv/ui'
import type { MailSubjectTimelineRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { MailRunEditModal } from '@/components/mail-run-edit-modal'
import { COMM_FOCUS } from '@/data/comm-record-detail'
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
 *  Always the whole run. Letters ride in as Email rows (ADR 0078 §3), so the
 *  channel filter covers mail. A comm opens its record screen; a letter has
 *  no screen, so it opens the run modal, and the creator's scheduled one keeps
 *  Edit · Stop. A long list, so `.glass-b` (law 8). */

const ALL_CHANNELS = 'all'
/** The card is a glance; the whole run reads on its own screen. */
const RECENT = 5
const NOTE = 'm-0 text-[12.5px] leading-[1.6]'

const JOURNEY = {
  interactionHistory: message('Lịch sử liên hệ', 'Interaction history', '연락 기록'),
  channel: message('Kênh', 'Channel', '채널'),
  allChannels: message('Mọi kênh', 'All channels', '모든 채널'),
  viewTheWholeInteraction: message(
    'Xem cả luồng liên hệ',
    'View the whole interaction flow',
    '전체 연락 흐름 보기',
  ),
  seeMore: message('Xem thêm', 'See more', '더 보기'),
  couldNotReadThe: message(
    'Không đọc được các email.',
    'Could not read the emails.',
    '이메일을 읽지 못했습니다.',
  ),
  tryAgain: message('Thử lại.', 'Try again.', '다시 시도해 주세요.'),
  couldNotReadThe2: message(
    'Không đọc được các lượt liên hệ.',
    'Could not read the interactions.',
    '연락 기록을 읽지 못했습니다.',
  ),
  noInteractionMatchesThe: message(
    'Không có lượt liên hệ nào khớp bộ lọc.',
    'No interaction matches the filter.',
    '필터에 맞는 연락 기록이 없습니다.',
  ),
  noInteractionsYet: message(
    'Chưa có lượt liên hệ nào.',
    'No interactions yet.',
    '연락 기록이 아직 없습니다.',
  ),
  yourRoleCannotView: message(
    'Vai của bạn không có quyền xem các lượt liên hệ.',
    'Your role cannot view interactions.',
    '현재 역할로는 연락 기록을 볼 수 없습니다.',
  ),
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
  const { t } = useI18n()
  const { rows, canComms, isLoading, error, lettersError } = useJourneyRows(workstreamCode, subject)
  const [channel, setChannel] = useState(ALL_CHANNELS)
  const [editing, setEditing] = useState<{ id: string; viaContent: boolean } | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()

  const shown = channel === ALL_CHANNELS ? rows : rows.filter((r) => r.channel === channel)
  const channels = [...new Set(rows.map((row) => row.channel))]
  const unconfirmed = rows.filter((row) => row.commState === 'unconfirmed').length
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
      title={t(JOURNEY.interactionHistory)}
      aside={
        <>
          {unconfirmed > 0 && (
            <span className="text-warning tnum text-[12px] font-medium">
              {t(
                message(
                  `${unconfirmed} chưa xác nhận`,
                  `${unconfirmed} unconfirmed`,
                  `미확인 ${unconfirmed}건`,
                ),
              )}
            </span>
          )}
          {channels.length > 1 && (
            <Select
              label={t(JOURNEY.channel)}
              hideLabel
              size="sm"
              className="pointer-coarse:[&>button]:h-12"
              value={channel}
              neutralValue={ALL_CHANNELS}
              onChange={setChannel}
              options={[
                { value: ALL_CHANNELS, label: t(JOURNEY.allChannels) },
                ...channels.map((c) => ({ value: c, label: COMMS_CHANNEL_LABEL[c] })),
              ]}
            />
          )}
          {canComms && workstreamCode !== null && rows.length > 0 && (
            <button
              type="button"
              aria-label={t(JOURNEY.viewTheWholeInteraction)}
              onClick={() => navigate(workstreamCommsPath(workstreamCode))}
              className={cn(
                'text-muted-foreground hover:text-foreground pointer-coarse:min-h-12 rounded-sm text-[13px] font-medium hover:underline',
                COMM_FOCUS,
              )}
            >
              {t(JOURNEY.seeMore)}
            </button>
          )}
        </>
      }
    >
      {lettersError !== null && (
        <p className={cn(NOTE, 'text-destructive-foreground')}>
          {t(JOURNEY.couldNotReadThe)}{' '}
          {isApiError(lettersError) ? userMessage(lettersError) : t(JOURNEY.tryAgain)}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <p className={cn(NOTE, 'text-destructive-foreground')}>
          {t(JOURNEY.couldNotReadThe2)}{' '}
          {isApiError(error) ? userMessage(error) : t(JOURNEY.tryAgain)}
        </p>
      ) : shown.length > 0 ? (
        <JourneyList
          rows={cut ? shown.slice(0, RECENT) : shown}
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
        <p className={cn(NOTE, 'text-muted-foreground')}>{t(JOURNEY.noInteractionMatchesThe)}</p>
      ) : (
        canComms && (
          <p className={cn(NOTE, 'text-muted-foreground')}>{t(JOURNEY.noInteractionsYet)}</p>
        )
      )}

      {!canComms && (
        <p className={cn(NOTE, 'text-muted-foreground')}>{t(JOURNEY.yourRoleCannotView)}</p>
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
  const { t } = useI18n()
  const stop = useOwnLetterCancel()
  const onStop = () =>
    stop.mutate(letter.runId, {
      onSuccess: () =>
        toastDone(
          t(message('Đã dừng thư', 'Letter stopped', '메일 발송을 중단했습니다')),
          t(
            message(
              'Thư sẽ không gửi đi.',
              'The letter will not be sent.',
              '이 메일은 발송되지 않습니다.',
            ),
          ),
        ),
      onError: (cause) =>
        toastFail(
          t(
            message(
              'Không dừng được thư',
              'Could not stop the letter',
              '메일 발송을 중단하지 못했습니다',
            ),
          ),
          userMessage(cause),
        ),
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
        {t(message('Mở trong Gmail', 'Open in Gmail', 'Gmail에서 열기'))}
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
        {t(message('Sửa', 'Edit', '수정'))}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="pointer-coarse:h-12"
        disabled={stop.isPending}
        onClick={onStop}
      >
        <Icon icon={CircleX} size={16} />
        {t(message('Dừng', 'Stop', '중단'))}
      </Button>
    </>
  )
}
