import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Skeleton, Textarea, cn } from '@pv/ui'
import {
  OVERDUE_REASON_TEXT_MAX,
  OverdueReasonBody,
  OverdueReasonDecideBody,
  type OverdueReasonRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { useCan, useSession } from '@/app/auth'
import { toastDone, toastFail } from '@/app/toast'
import { dm, dmhm } from '@/lib/date'
import type { Contract, Installment } from '@/data/contracts'
import { overdueReasonStateText } from '@/data/installment-copy'
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
 *  Who sees what: whoever the server lets write (`canWrite`: the closer, the
 *  payment PIC, the head of sales, the director) writes, a holder of
 *  `contract.approve-overdue-reason` other than the writer decides, everyone
 *  else reads. The server judges "overdue" and "no longer applies" (`stale`);
 *  this card only draws what it is told.
 *
 *  Hidden when the installment is not overdue and nothing was ever written. */

const LINE = 'm-0 text-[12.5px] leading-[1.6]'
const TAP = 'pointer-coarse:h-12'

type Props = { contract: Contract; installment: Installment; overdue: boolean }

export function OverdueReasonCard({ contract, installment, overdue }: Props) {
  const { t } = useI18n()
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
  const mayWrite = open && data?.canWrite === true

  if (query.isPending) return overdue ? <Skeleton className="h-24 w-full" /> : null
  if (!data)
    return overdue ? (
      <Frame>
        <div className="flex flex-wrap items-center gap-3">
          <p className={LINE}>
            {t(
              message(
                'Chưa tải được lý do.',
                'Could not load the reason.',
                '사유를 불러오지 못했습니다.',
              ),
            )}
          </p>
          <Button variant="ghost" size="sm" className={TAP} onClick={() => void query.refetch()}>
            {t(message('Thử lại', 'Try again', '다시 시도'))}
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
      {!latest && !mayWrite && (
        <p className={`${LINE} text-muted-foreground`}>
          {t(message('Chưa có lý do.', 'No reason yet.', '아직 사유가 없습니다.'))}
        </p>
      )}
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  return (
    <RecordCard title={t(message('Lý do quá hạn', 'Overdue reason', '기한 초과 사유'))}>
      {children}
    </RecordCard>
  )
}

function Reason({ row, ended }: { row: OverdueReasonRow; ended: boolean }) {
  const { t, lang } = useI18n()
  const tone = { waiting: 'warning', approved: 'success', rejected: 'danger' } as const
  /* Nobody can decide on a terminated contract, so a waiting reason stops looking pending. */
  const parked = ended && row.state === 'waiting'
  const decided = row.decidedBy && row.decidedAt
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {row.stale ? (
          <Badge tone="draft">{t(message('Hết hiệu lực', 'Expired', '만료됨'))}</Badge>
        ) : (
          <Badge tone={parked ? 'draft' : tone[row.state]} className={cn(parked && BADGE_INK)}>
            {overdueReasonStateText(row.state, lang)}
          </Badge>
        )}
        <span className="text-muted-foreground tnum text-[12px]">
          {row.writtenBy.name} · {dmhm(row.writtenAt)}
        </span>
      </div>
      <p className={`${LINE} whitespace-pre-wrap`}>{row.reason}</p>
      {row.state === 'approved' && decided && (
        <p className={`${LINE} text-muted-foreground`}>
          {t(
            message(
              `${row.decidedBy?.name} đã duyệt · ${dm(row.decidedAt ?? '')}`,
              `Approved by ${row.decidedBy?.name} · ${dm(row.decidedAt ?? '')}`,
              `${row.decidedBy?.name}님이 승인 · ${dm(row.decidedAt ?? '')}`,
            ),
          )}
        </p>
      )}
      {row.state === 'rejected' && decided && (
        <p className={`${LINE} text-muted-foreground`}>
          {t(
            message(
              `${row.decidedBy?.name} từ chối · ${dm(row.decidedAt ?? '')}`,
              `Rejected by ${row.decidedBy?.name} · ${dm(row.decidedAt ?? '')}`,
              `${row.decidedBy?.name}님이 반려 · ${dm(row.decidedAt ?? '')}`,
            ),
          )}
          {row.decisionNote
            ? t(
                message(
                  ` · Lý do: ${row.decisionNote}`,
                  ` · Reason: ${row.decisionNote}`,
                  ` · 사유: ${row.decisionNote}`,
                ),
              )
            : ''}
        </p>
      )}
    </div>
  )
}

function Write({ code, no }: { code: string; no: number }) {
  const { t } = useI18n()
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
            toastDone(t(message('Đã gửi lý do.', 'Reason sent.', '사유를 보냈습니다.')))
          },
          onError: (err) =>
            toastFail(
              t(
                message(
                  'Chưa gửi được lý do.',
                  'Could not send the reason.',
                  '사유를 보내지 못했습니다.',
                ),
              ),
              userMessage(err),
            ),
        })
      }}
    >
      <Field
        label={t(message('Ghi lý do', 'Write the reason', '사유 입력'))}
        note={`${text.length}/${OVERDUE_REASON_TEXT_MAX}`}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={OVERDUE_REASON_TEXT_MAX}
          rows={3}
          aria-label={t(message('Ghi lý do', 'Write the reason', '사유 입력'))}
        />
      </Field>
      <Button
        type="submit"
        className={`${TAP} self-start`}
        disabled={!parsed.success || write.isPending}
      >
        {t(message('Gửi duyệt', 'Submit for approval', '승인 요청'))}
      </Button>
    </form>
  )
}

function Decide({ code, no, row }: { code: string; no: number; row: OverdueReasonRow }) {
  const { t } = useI18n()
  const [refusing, setRefusing] = useState(false)
  const [note, setNote] = useState('')
  const decide = useDecideOverdueReason(code, no, row.id)

  const send = (body: OverdueReasonDecideBody, done: string) =>
    decide.mutate(body, {
      onSuccess: () => toastDone(done),
      onError: (err) =>
        toastFail(
          t(
            message(
              'Chưa lưu được quyết định.',
              'Could not save the decision.',
              '결정을 저장하지 못했습니다.',
            ),
          ),
          userMessage(err),
        ),
    })

  if (!refusing) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          className={TAP}
          disabled={decide.isPending}
          onClick={() =>
            send(
              { decision: 'approve' },
              t(message('Đã duyệt lý do.', 'Reason approved.', '사유를 승인했습니다.')),
            )
          }
        >
          {t(message('Duyệt', 'Approve', '승인'))}
        </Button>
        <Button
          variant="ghost"
          className={TAP}
          disabled={decide.isPending}
          onClick={() => setRefusing(true)}
        >
          {t(message('Từ chối', 'Reject', '반려'))}
        </Button>
      </div>
    )
  }

  const rejection = OverdueReasonDecideBody.safeParse({ decision: 'reject', note })
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">
          {t(message('Lý do từ chối', 'Rejection reason', '반려 사유'))}
        </span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={OVERDUE_REASON_TEXT_MAX}
          aria-label={t(message('Lý do từ chối', 'Rejection reason', '반려 사유'))}
          rows={3}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          className={TAP}
          disabled={!rejection.success || decide.isPending}
          onClick={() =>
            rejection.success &&
            send(
              rejection.data,
              t(message('Đã từ chối lý do.', 'Reason rejected.', '사유를 반려했습니다.')),
            )
          }
        >
          {t(message('Xác nhận từ chối', 'Confirm rejection', '반려 확정'))}
        </Button>
        <Button variant="ghost" className={TAP} onClick={() => setRefusing(false)}>
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
      </div>
    </div>
  )
}
