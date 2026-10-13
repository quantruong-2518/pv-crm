import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Check,
  Drawer,
  Icon,
  MetaPill,
  SectionTitle,
  Skeleton,
  StatusDot,
  cn,
} from '@pv/ui'
import {
  DOC_STATE_LABEL,
  type ContractCode,
  type DocState,
  type InstallmentRow,
  type OpportunityMoneyContract,
  type OpportunityMoneyInstallment,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { toastDone, toastFail } from '@/app/toast'
import { dmhm, dmy } from '@/lib/date'
import { CONDITION_SIDE_LABEL, RECORD_CHANNEL_LABEL, contractDetailQuery } from '@/data/contracts'
import { useDoneCondition } from '@/data/contracts-write'
import { BADGE_INK } from '@/data/opportunities'
import { InstallmentActions, installmentDoorsOf } from '@/components/deal-pay'
import { StepDocuments } from '@/components/run/step-documents'
import { INSTALLMENT_INK, compactMoney, installmentStatusLine, kindLabel } from './money'

/** One installment, opened from its tile. The two facts are the profile's own
 *  row, so they stand even when the contract's detail is refused: that door is
 *  scoped to the contract's owner, who may not be this reader. The checklist,
 *  the document slots, the reminders and the actions need the detail. */

const DOC_TONE: Record<DocState, 'success' | 'warning' | 'draft'> = {
  complete: 'success',
  'awaiting-signature': 'warning',
  missing: 'draft',
}

const LINE = 'text-muted-foreground m-0 text-[12.5px] leading-[1.6]'

export function InstallmentDrawer({
  contract,
  installment: i,
  workstreamCode,
  open,
  onClose,
}: {
  contract: OpportunityMoneyContract
  installment: OpportunityMoneyInstallment
  workstreamCode: string | null
  open: boolean
  onClose: () => void
}) {
  const me = useSession((st) => st.actor?.id)
  const detail = useQuery({ ...contractDetailQuery(contract.code), enabled: open })
  const full = detail.data?.installments.find((row) => row.no === i.no)
  const doors = full && installmentDoorsOf(full, contract.can, me)
  /* No door, no footer: an empty strip would read as a missing button. */
  const acting = doors !== undefined && Object.values(doors).some(Boolean)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={i.label}
      subtitle={`${contract.code} · ${kindLabel(contract.kind)}`}
      footer={
        detail.data && full && acting ? (
          <InstallmentActions contract={detail.data} installment={full} can={contract.can} />
        ) : undefined
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <Fact label="Phải thu" value={compactMoney(i.amount, contract.currency)}>
            <span className="text-muted-foreground">{i.share}% giá trị hợp đồng</span>
          </Fact>
          <Fact label="Hạn thanh toán" value={dmy(i.due)}>
            <span className={INSTALLMENT_INK[i.status]}>
              {installmentStatusLine(i)}
              {full?.paidBy && ` · ${full.paidBy.name} ghi nhận`}
            </span>
          </Fact>
        </div>

        {full ? (
          <Conditions code={contract.code} installment={full} canDone={doors?.condition ?? false} />
        ) : detail.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <p className={LINE}>{refusalText(detail.error)}</p>
        )}

        <Block title="Chứng từ">
          {full && full.docs.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {full.docs.map((doc) => (
                <li key={doc.id} className="flex min-w-0 items-center gap-3 text-[12.5px]">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">{doc.name}</span>
                    <span className="text-muted-foreground text-[12px]">{doc.hint}</span>
                  </span>
                  <Badge
                    tone={DOC_TONE[doc.state]}
                    className={cn('shrink-0', doc.state === 'missing' && BADGE_INK)}
                  >
                    {DOC_STATE_LABEL[doc.state]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <StepDocuments
            workstreamCode={workstreamCode}
            step={{ kind: 'installment', contractCode: contract.code, installmentNo: i.no }}
          />
        </Block>

        {full && (
          <Block title="Đã nhắc">
            <Records installment={full} />
          </Block>
        )}
      </div>
    </Drawer>
  )
}

/** A contract outside the reader's scope answers 404, not 403: the door does
 *  not confirm that it exists. Both mean "not yours to read". */
const refusalText = (error: unknown) =>
  isApiError(error) && (error.kind === 'forbidden' || error.kind === 'not-found')
    ? 'Bạn không xem được điều kiện và các lần nhắc của đợt này.'
    : `Không tải được chi tiết đợt. ${isApiError(error) ? userMessage(error) : 'Thử lại.'}`

/** A figure with no surface of its own — the drawer is already the card. */
function Fact({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-muted-foreground text-[12px] font-medium">{label}</span>
      <span className="tnum font-num text-[30px] font-semibold leading-none tracking-[-1px]">
        {value}
      </span>
      <span className="tnum text-[12px] leading-[1.5]">{children}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionTitle size="sm">{title}</SectionTitle>
      {children}
    </section>
  )
}

/** The unlock checklist, listed once; an open line carries its own done door. */
function Conditions({
  code,
  installment,
  canDone,
}: {
  code: ContractCode
  installment: InstallmentRow
  canDone: boolean
}) {
  const done = useDoneCondition(code)

  return (
    <Block title="Điều kiện thu tiền">
      {installment.conditions.length === 0 ? (
        <p className={LINE}>Chưa ghi điều kiện nào.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {installment.conditions.map((c) => (
            <li
              key={c.id}
              className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 text-[12.5px] leading-[1.5]"
            >
              <StatusDot state={c.doneAt ? 'ok' : 'next'} className="mt-1 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block break-words">{c.what}</span>
                <span className="text-muted-foreground tnum text-[12px]">
                  {[
                    CONDITION_SIDE_LABEL[c.side],
                    c.who,
                    `hạn ${dmy(c.due)}`,
                    c.doneAt ? `xong ${dmy(c.doneAt)}` : 'chưa xong',
                  ].join(' · ')}
                </span>
              </span>
              {canDone && !c.doneAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:h-12 shrink-0"
                  disabled={done.isPending}
                  onClick={() =>
                    done.mutate(
                      { no: installment.no, id: c.id },
                      {
                        onSuccess: () => toastDone('Đã đánh dấu xong.'),
                        onError: (e) => toastFail('Không đánh dấu được.', userMessage(e)),
                      },
                    )
                  }
                >
                  <Icon icon={Check} size={16} />
                  Đánh dấu xong
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}

function Records({ installment }: { installment: InstallmentRow }) {
  if (installment.records.length === 0) return <p className={LINE}>Chưa nhắc lần nào.</p>
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {installment.records.map((r) => (
        <li key={r.id} className="flex min-w-0 flex-col gap-1 text-[12.5px] leading-[1.5]">
          <span className="break-words">{r.what}</span>
          <span className="flex flex-wrap items-center gap-2">
            <MetaPill>{RECORD_CHANNEL_LABEL[r.channel]}</MetaPill>
            <span className="text-muted-foreground tnum text-[12px]">
              {dmhm(r.at)} · {r.detail}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
