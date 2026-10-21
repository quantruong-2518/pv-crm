import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Skeleton, Textarea, cn } from '@pv/ui'
import {
  OVERDUE_REASON_STATE_LABEL,
  OVERDUE_REASON_TEXT_MAX,
  OverdueReasonBody,
  OverdueReasonDecideBody,
  type OverdueReasonRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { toastDone, toastFail } from '@/app/toast'
import { dm, dmhm } from '@/lib/date'
import type { Contract, Installment } from '@/data/contracts'
import { BADGE_INK } from '@/data/opportunities'
import {
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
 *  else reads. The server judges "overdue" (`canWrite`) and "no longer applies"
 *  (`stale`); this card only draws what it is told.
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
  const latest = data?.reasons[0] ?? null
  const live = latest !== null && !latest.stale
  /* A terminated contract answers 409 to both doors (ADR 0107): read only. */
  const open = contract.termination === null
  const mayWrite = open && data?.canWrite === true && me !== undefined && me === contract.ownerId

  if (query.isPending) return overdue ? <Skeleton className="h-24 w-full" /> : null
  if (!data)
    return overdue ? (
      <Frame>
        <div className="flex flex-wrap items-center gap-3">
          <p className={LINE}>Chưa tải được lý do.</p>
          <Button variant="ghost" size="sm" className={TAP} onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      </Frame>
    ) : null
  /* `canWrite` too: the page's badge reads UTC days, the server Vietnam days. */
  if (!overdue && !latest && !data.canWrite) return null

  return (
    <Frame>
      {latest && <Reason row={latest} ended={!open} />}
      {open && live && latest.state === 'waiting' && canDecide && latest.writtenBy.id !== me && (
        <Decide code={code} no={no} row={latest} />
      )}
      {(!live || latest.state === 'rejected') && mayWrite && <Write code={code} no={no} />}
      {!latest && !mayWrite && <p className={`${LINE} text-muted-foreground`}>Chưa có lý do.</p>}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return <RecordCard title="Lý do quá hạn">{children}</RecordCard>
}

function Reason({ row, ended }: { row: OverdueReasonRow; ended: boolean }) {
  const tone = { waiting: 'warning', approved: 'success', rejected: 'danger' } as const
  /* Nobody can decide on a terminated contract, so a waiting reason stops looking pending. */
  const parked = ended && row.state === 'waiting'
  const decided = row.decidedBy && row.decidedAt
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {row.stale ? (
          <Badge tone="draft">Hết hiệu lực</Badge>
        ) : (
          <Badge tone={parked ? 'draft' : tone[row.state]} className={cn(parked && BADGE_INK)}>
            {OVERDUE_REASON_STATE_LABEL[row.state]}
          </Badge>
        )}
        <span className="text-muted-foreground tnum text-[12px]">
          {row.writtenBy.name} · {dmhm(row.writtenAt)}
        </span>
      </div>
      <p className={`${LINE} whitespace-pre-wrap`}>{row.reason}</p>
      {row.state === 'approved' && decided && (
        <p className={`${LINE} text-muted-foreground`}>
          {row.decidedBy?.name} đã duyệt · {dm(row.decidedAt ?? '')}
        </p>
      )}
      {row.state === 'rejected' && decided && (
        <p className={`${LINE} text-muted-foreground`}>
          {row.decidedBy?.name} từ chối · {dm(row.decidedAt ?? '')}
          {row.decisionNote ? ` · Lý do: ${row.decisionNote}` : ''}
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
      <Field label="Ghi lý do" note={`${text.length}/${OVERDUE_REASON_TEXT_MAX}`}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OVERDUE_REASON_TEXT_MAX}
          rows={3}
          aria-label="Ghi lý do"
        />
      </Field>
      <Button
        type="submit"
        className={`${TAP} self-start`}
        disabled={!parsed.success || write.isPending}
      >
        Gửi duyệt
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
      onError: (err) => toastFail('Chưa lưu được quyết định.', userMessage(err)),
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
      <label className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">Lý do từ chối</span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={OVERDUE_REASON_TEXT_MAX}
          aria-label="Lý do từ chối"
          rows={3}
        />
      </label>
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
