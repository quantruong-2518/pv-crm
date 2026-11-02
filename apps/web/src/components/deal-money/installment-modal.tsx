import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Badge, Modal, Skeleton, cn } from '@pv/ui'
import type { OpportunityMoneyContract, OpportunityMoneyInstallment } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { dm } from '@/lib/date'
import { contractDetailQuery, viewInstallment } from '@/data/contracts'
import { useDoneCondition } from '@/data/contracts-write'
import { MARKED_DONE } from '@/data/installment-copy'
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
  const { t, lang } = useI18n()
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
    done.mutate({ no: i.no, id }, { onSuccess: () => toastDone(t(MARKED_DONE)) })
  const openInstallment = () => {
    onClose()
    navigate(`/sales/contracts/${encodeURIComponent(contract.code)}/installments/${i.no}`)
  }

  const next =
    full && full.paidAt === undefined
      ? nextStep(blocking?.what, hasOpen, collecting, collects)
      : null
  const hint = failure ? userMessage(failure) : next ? t(next) : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[600px]"
      title={`${i.label} · ${compactMoney(i.amount, contract.currency)}`}
      subtitle={
        <>
          <span className="font-mono">{contract.code}</span> ·{' '}
          {kindLabel(contract.kind, resolveKind, lang)} ·{' '}
          {t(message(`hạn ${dm(i.due)}`, `due ${dm(i.due)}`, `기한 ${dm(i.due)}`))} · {i.share}%
        </>
      }
      meta={
        <Badge
          tone={INSTALLMENT_TONE[i.status]}
          className={cn('mt-1 shrink-0', i.status === 'upcoming' && BADGE_INK)}
        >
          {installmentStatusLine(i, lang)}
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
            <Section title={t(message('Thu tiền', 'Collection', '수금'))}>
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
          <Section
            title={t(message('Chứng từ của đợt', 'Installment documents', '납부 회차 증빙 서류'))}
          >
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
          {refusalText(detail.error, t)}
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
/** The one line under the modal: what comes next for an unpaid payment. */
function nextStep(
  blocking: string | undefined,
  hasOpen: boolean,
  collecting: boolean,
  collects: boolean,
): Message | null {
  if (blocking !== undefined) {
    return message(
      `Bước tiếp theo: ${blocking}.`,
      `Next step: ${blocking}.`,
      `다음 단계: ${blocking}.`,
    )
  }
  if (hasOpen) {
    return message('Bước tiếp theo: nghiệm thu.', 'Next step: acceptance.', '다음 단계: 검수.')
  }
  if (collecting) {
    return message('Bước tiếp theo: thu tiền.', 'Next step: collect payment.', '다음 단계: 수금.')
  }
  return collects
    ? message(
        'Ghi thu ở trang đợt.',
        'Record the collection on the installment page.',
        '납부 회차 페이지에서 수금을 기록하세요.',
      )
    : null
}

const refusalText = (error: unknown, t: (copy: Message) => string) =>
  isApiError(error) && (error.kind === 'forbidden' || error.kind === 'not-found')
    ? t(
        message(
          'Bạn không xem được điều kiện và các lần nhắc của đợt này.',
          'You cannot view the conditions and reminders of this installment.',
          '이 납부 회차의 조건과 알림을 볼 수 없습니다.',
        ),
      )
    : `${t(
        message(
          'Không tải được chi tiết đợt.',
          'Could not load the installment details.',
          '납부 회차 상세를 불러오지 못했습니다.',
        ),
      )} ${isApiError(error) ? userMessage(error) : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))}`
