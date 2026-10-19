import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Skeleton, Textarea } from '@pv/ui'
import {
  OVERDUE_REASON_STATE_LABEL,
  OverdueReasonBody,
  OverdueReasonDecideBody,
  type OverdueReasonRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toastDone, toastFail } from '@/app/toast'
import { dm, dmhm } from '@/lib/date'
import type { Contract, Installment } from '@/data/contracts'
import {
  OVERDUE_REASON_MAX,
  overdueReasonsQuery,
  useDecideOverdueReason,
  useWriteOverdueReason,
} from '@/data/overdue-reasons'
import { Field } from '@/components/field-bits'
import { RecordCard } from '@/components/record/record-card'

/** The overdue-reason card of the installment page (ADR 0100).
 *
 *  Who sees what: the contract's owner writes, a holder of
 *  `contract.approve-overdue-reason` other than the writer decides, everyone
 *  else reads. `current` comes from the server, which judges the newest reason
 *  against the present due date, so a `stale` reason reads as no reason.
 *
 *  Hidden when the installment is not overdue and nothing was ever written. */

const LINE = 'm-0 text-[12.5px] leading-[1.6]'
const TAP = 'pointer-coarse:h-12'

type Props = { contract: Contract; installment: Installment; overdue: boolean }

export function OverdueReasonCard({ contract, installment, overdue }: Props) {
  const { code } = contract
  const { no } = installment
  const query = useQuery(overdueReasonsQuery(code, no))
  const me = useSession((s) => s.actor?.id)
  const canDecide = useCan('contract.approve-overdue-reason')
  const data = query.data
  const latest =
    data && data.current !== 'none' && data.current !== 'stale' ? data.reasons[0] : null
  const mayWrite = overdue && me !== undefined && me === contract.ownerId

  if (query.isPending) return overdue ? <Skeleton className="h-24 w-full" /> : null
  if (!data)
    return overdue ? (
      <Frame>
        <p className={LINE}>Chưa tải được lý do.</p>
      </Frame>
    ) : null
  if (!overdue && !latest) return null

  return (
    <Frame>
      {latest && <Reason row={latest} />}
      {latest?.state === 'waiting' && canDecide && latest.writtenBy.id !== me && (
        <Decide code={code} no={no} row={latest} />
      )}
      {(!latest || latest.state === 'rejected') && mayWrite && <Write code={code} no={no} />}
      {!latest && !mayWrite && <p className={`${LINE} text-muted-foreground`}>Chưa có lý do.</p>}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return <RecordCard title="Lý do quá hạn">{children}</RecordCard>
}

function Reason({ row }: { row: OverdueReasonRow }) {
  const tone = { waiting: 'warning', approved: 'success', rejected: 'danger' } as const
  const decided = row.decidedBy && row.decidedAt
  return (
    <div className="bg-surface-ink/6 flex flex-col gap-2 rounded-md p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone[row.state]}>{OVERDUE_REASON_STATE_LABEL[row.state]}</Badge>
        <span className="text-muted-foreground tnum text-[12px]">
          {row.writtenBy.name} · {dmhm(row.writtenAt)}
        </span>
      </div>
      <p className={`${LINE} whitespace-pre-wrap`}>{row.reason}</p>
      {row.state === 'approved' && decided && (
        <p className={`${LINE} text-muted-foreground`}>
          Đã duyệt bởi {row.decidedBy?.name} · {dm(row.decidedAt ?? '')}
        </p>
      )}
      {row.state === 'rejected' && decided && (
        <p className={`${LINE} text-muted-foreground`}>
          {row.decidedBy?.name} từ chối · {dm(row.decidedAt ?? '')}
          {row.decisionNote ? `: ${row.decisionNote}` : ''}
        </p>
      )}
    </div>
  )
}

function Write({ code, no }: { code: string; no: number }) {
  const [text, setText] = useState('')
  const write = useWriteOverdueReason(code, no)
  const parsed = OverdueReasonBody.safeParse({ reason: text })

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!parsed.success) return
        write.mutate(parsed.data, {
          onSuccess: () => {
            setText('')
            toastDone('Đã gửi lý do.')
          },
          onError: (err) => toastFail('Chưa gửi được lý do.', userMessage(err)),
        })
      }}
    >
      <Field label="Ghi lý do" note={`${text.length}/${OVERDUE_REASON_MAX}`}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OVERDUE_REASON_MAX}
          rows={3}
          aria-label="Lý do quá hạn"
        />
      </Field>
      <Button
        type="submit"
        className={`${TAP} self-start`}
        disabled={!parsed.success || write.isPending}
      >
        Gửi lý do
      </Button>
    </form>
  )
}

function Decide({ code, no, row }: { code: string; no: number; row: OverdueReasonRow }) {
  const [refusing, setRefusing] = useState(false)
  const [note, setNote] = useState('')
  const decide = useDecideOverdueReason(code, no, row.id)

  const send = (body: OverdueReasonDecideBody, done: string) =>
    decide.mutate(body, {
      onSuccess: () => toastDone(done),
      onError: (err) => toastFail('Chưa xử lý được lý do.', userMessage(err)),
    })

  if (!refusing) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          className={TAP}
          disabled={decide.isPending}
          onClick={() => send({ decision: 'approve' }, 'Đã duyệt lý do.')}
        >
          Duyệt
        </Button>
        <Button
          variant="ghost"
          className={TAP}
          disabled={decide.isPending}
          onClick={() => setRefusing(true)}
        >
          Từ chối
        </Button>
      </div>
    )
  }

  const rejection = OverdueReasonDecideBody.safeParse({ decision: 'reject', note })
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={OVERDUE_REASON_MAX}
        placeholder="Ghi lý do từ chối"
        aria-label="Lý do từ chối"
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          className={TAP}
          disabled={!rejection.success || decide.isPending}
          onClick={() => rejection.success && send(rejection.data, 'Đã từ chối lý do.')}
        >
          Xác nhận từ chối
        </Button>
        <Button variant="ghost" className={TAP} onClick={() => setRefusing(false)}>
          Huỷ
        </Button>
      </div>
    </div>
  )
}
