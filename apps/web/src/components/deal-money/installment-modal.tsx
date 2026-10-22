import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Modal, Skeleton, cn } from '@pv/ui'
import type { OpportunityMoneyContract, OpportunityMoneyInstallment } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { dm } from '@/lib/date'
import { contractDetailQuery, viewInstallment } from '@/data/contracts'
import { useDoneCondition } from '@/data/contracts-write'
import { BADGE_INK } from '@/data/opportunities'
import { useContractKindLabel } from '@/data/sales-config'
import { CollectBody, ConditionDialog, installmentDoorsOf } from '@/components/deal-pay'
import { StepDocuments } from '@/components/run/step-documents'
import { InstallmentFooter } from './installment-footer'
import { INSTALLMENT_TONE, compactMoney, installmentStatusLine, kindLabel } from './money'
import { AcceptSection, ReminderSection, Section } from './installment-sections'

/** One installment, opened from its tile: acceptance, reminders and papers,
 *  with ONE primary in the footer chosen by the step the installment is at.
 *  Money is recorded only from the contract (ADR 0111): its screen passes
 *  `collect`, the deal's does not and points to the installment screen. The two facts in the header are the profile's own row, so
 *  they stand even when the contract's detail is refused (that door is scoped
 *  to the contract's owner, who may not be this reader); the sections and the
 *  buttons need the detail. Every press goes through the contract's own doors
 *  (done condition, reminder) and the server judges each. */

/** What the modal reads: the deal's money row, or the same facts built from the contract. */
export type ModalContract = Pick<OpportunityMoneyContract, 'code' | 'kind' | 'currency' | 'can'>
export type ModalInstallment = Pick<
  OpportunityMoneyInstallment,
  'no' | 'label' | 'amount' | 'due' | 'share' | 'status' | 'days' | 'paidAt'
>

export function InstallmentModal({
  contract,
  installment: i,
  workstreamCode,
  collect = false,
  open,
  onClose,
}: {
  contract: ModalContract
  installment: ModalInstallment
  workstreamCode: string | null
  collect?: boolean
  open: boolean
  onClose: () => void
}) {
  const me = useSession((st) => st.actor?.id)
  const resolveKind = useContractKindLabel()
  const detail = useQuery({ ...contractDetailQuery(contract.code), enabled: open })
  const full = detail.data?.installments.find((row) => row.no === i.no)
  /* The contract's own flag when the API sends it, the deal's verdict before. */
  const collects = detail.data?.canCollect ?? contract.can.recordPayment
  const doors =
    full &&
    installmentDoorsOf(
      full,
      { editSchedule: contract.can.editSchedule, recordPayment: collects },
      me,
    )
  const navigate = useNavigate()
  const done = useDoneCondition(contract.code)
  const [adding, setAdding] = useState(false)

  /* The same line the installment screen ticks: the one holding it up. */
  const blocking = full ? viewInstallment(full).blocking : null
  const hasOpen = full?.conditions.some((c) => !c.doneAt) === true
  const canTick = doors?.condition === true && blocking !== null
  const paid = full?.paidAt !== undefined
  const collecting = collect && doors?.pay === true
  const failure = done.error
  const busy = done.isPending

  const tick = (id: string) =>
    done.mutate({ no: i.no, id }, { onSuccess: () => toastDone('Đã đánh dấu xong.') })
  const openInstallment = () => {
    onClose()
    navigate(`/sales/contracts/${encodeURIComponent(contract.code)}/installments/${i.no}`)
  }

  const hint = failure
    ? userMessage(failure)
    : !full
      ? ''
      : full.paidAt !== undefined
        ? ''
        : blocking
          ? `Bước tiếp theo: ${blocking.what}.`
          : hasOpen
            ? 'Bước tiếp theo: nghiệm thu.'
            : collecting
              ? 'Bước tiếp theo: thu tiền.'
              : collects
                ? 'Ghi thu ở trang đợt.'
                : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[600px]"
      title={`${i.label} · ${compactMoney(i.amount, contract.currency)}`}
      subtitle={
        <>
          <span className="font-mono">{contract.code}</span> ·{' '}
          {kindLabel(contract.kind, resolveKind)} · hạn {dm(i.due)} · {i.share}%
        </>
      }
      meta={
        <Badge
          tone={INSTALLMENT_TONE[i.status]}
          className={cn('mt-1 shrink-0', i.status === 'upcoming' && BADGE_INK)}
        >
          {installmentStatusLine(i)}
        </Badge>
      }
      footer={
        <InstallmentFooter
          hint={hint}
          failed={failure !== null}
          busy={busy}
          canTick={canTick}
          collecting={collecting}
          onClose={onClose}
          onOpen={openInstallment}
          onTick={() => blocking && tick(blocking.id)}
        />
      }
    >
      {full && doors ? (
        <div className="flex flex-col">
          <AcceptSection
            installment={full}
            canTick={doors.condition}
            blockingId={blocking?.id}
            ticking={busy}
            onTick={tick}
            onAdd={doors.condition ? () => setAdding(true) : undefined}
          />
          {detail.data && (collecting || (collect && paid)) && (
            <Section title="Thu tiền">
              <CollectBody
                contract={detail.data}
                installment={full}
                canPay={doors.pay}
                canUndo={doors.undo}
                leads={canTick}
                late={i.status === 'overdue'}
                onPaid={onClose}
              />
            </Section>
          )}
          <ReminderSection code={contract.code} installment={full} canRemind={doors.remind} />
          <Section title="Chứng từ của đợt">
            <StepDocuments
              workstreamCode={workstreamCode}
              step={{ kind: 'installment', contractCode: contract.code, installmentNo: i.no }}
              canEdit={contract.can.editSchedule || collects}
            />
          </Section>
        </div>
      ) : detail.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
          {refusalText(detail.error)}
        </p>
      )}
      {detail.data && full && (
        <>
          <ConditionDialog
            contract={detail.data}
            installment={full}
            open={adding}
            onClose={() => setAdding(false)}
          />
        </>
      )}
    </Modal>
  )
}

/** A contract outside the reader's scope answers 404, not 403: the door does
 *  not confirm that it exists. Both mean "not yours to read". */
const refusalText = (error: unknown) =>
  isApiError(error) && (error.kind === 'forbidden' || error.kind === 'not-found')
    ? 'Bạn không xem được điều kiện và các lần nhắc của đợt này.'
    : `Không tải được chi tiết đợt. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`
