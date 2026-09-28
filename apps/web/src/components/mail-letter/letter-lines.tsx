import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleX, Pencil } from '@pv/ui'
import { Badge, Button, Icon, MetaPill, Skeleton, Timeline } from '@pv/ui'
import { MAIL_LETTER_STATE_LABEL, type MailSubjectKind } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { MailRunEditModal } from '@/components/mail-run-edit-modal'
import { subjectLettersQuery, useOwnLetterCancel } from '@/data/mail-letters'
import { dmhm } from '@/lib/date'
import { LETTER_TONE, addresseeLine } from './letter-model'

/** The letters filed on one subject, each one line of its activity (G8):
 *  subject, To/CC, state pill, time — and Edit · Stop on a scheduled letter
 *  the reader created. Edit is the run book's editor, which takes `/own` for
 *  the creator's run; recipients stay frozen (ADR 0065 §8).
 *
 *  Draws no surface of its own; the caller's card is the surface (law 12). */
export function LetterLines({ door, code }: { door: MailSubjectKind; code: string }) {
  const { data, isPending, error } = useQuery(subjectLettersQuery(door, code))
  const stop = useOwnLetterCancel()
  const client = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)

  if (isPending) return <Skeleton className="h-16 w-full" />
  if (error) {
    /* A failed read says so: an empty list would read as "no letter yet" and
       send somebody off to write one more to a customer who has had three. */
    return (
      <p className="text-warning m-0 text-[12px] leading-5">
        Không đọc được các email của hồ sơ này.{' '}
        {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
    )
  }
  if (data.rows.length === 0) {
    return (
      <p className="text-muted-foreground m-0 text-[12px] leading-5">
        Chưa gửi email nào từ hồ sơ này.
      </p>
    )
  }

  const onStop = (runId: string) =>
    stop.mutate(runId, {
      onSuccess: () => toastDone('Đã dừng thư', 'Thư sẽ không được gửi đi.'),
      onError: (cause) => toastFail('Không dừng được thư', userMessage(cause)),
    })

  /* The editor sweeps the run book's keys, not this line's: refetch it on
     close so a new subject or hour shows here too. */
  const closeEditor = () => {
    setEditing(null)
    void client.invalidateQueries({ queryKey: subjectLettersQuery(door, code).queryKey })
  }

  return (
    <>
      <Timeline
        items={data.rows.map((row) => {
          const moment = row.sentAt ?? row.scheduledAt
          return {
            id: row.runId,
            state: LETTER_TONE[row.state].dot,
            title: row.subject,
            meta: (
              <>
                <Badge
                  tone={LETTER_TONE[row.state].badge}
                  className={row.state === 'CANCELLED' ? 'text-foreground' : undefined}
                >
                  {MAIL_LETTER_STATE_LABEL[row.state]}
                </Badge>
                {moment && <MetaPill mono>{dmhm(moment)}</MetaPill>}
                <MetaPill avatar={row.createdBy.name}>{row.createdBy.name}</MetaPill>
              </>
            ),
            children: (
              <span className="text-muted-foreground">
                {`Tới ${addresseeLine(row.to) || '—'}`}
                {row.cc.length > 0 && ` · CC ${addresseeLine(row.cc)}`}
              </span>
            ),
            actions: row.canEdit ? (
              <>
                <Button size="lg" variant="ghost" onClick={() => setEditing(row.runId)}>
                  <Icon icon={Pencil} size={16} />
                  Sửa
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  disabled={stop.isPending}
                  onClick={() => onStop(row.runId)}
                >
                  <Icon icon={CircleX} size={16} />
                  Dừng
                </Button>
              </>
            ) : undefined,
          }
        })}
      />
      <MailRunEditModal runId={editing} onClose={closeEditor} />
    </>
  )
}
