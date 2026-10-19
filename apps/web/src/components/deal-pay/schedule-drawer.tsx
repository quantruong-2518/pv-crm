import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, X } from '@pv/ui'
import { Button, Drawer, Icon, SectionTitle, Skeleton, cn } from '@pv/ui'
import {
  ContractInstallmentsBody,
  type ContractDetailRow,
  type InstallmentEdit,
  type OpportunityMoneyContract,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy } from '@/lib/date'
import { contractDetailQuery } from '@/data/contracts'
import { useReplaceSchedule } from '@/data/contracts-write'
import { compactMoney } from '@/components/deal-money/money'
import { ScheduleEditor } from './schedule-editor'
import { scheduleIssue, scheduleSummary } from './schedule-math'

/** `no` rides along: it tells the server which instalment a line still is. */
const unpaidLinesOf = (contract: ContractDetailRow): InstallmentEdit[] =>
  contract.installments
    .filter((i) => i.paidAt === undefined)
    .map(({ no, label, share, amount, due }) => ({ no, label, share, amount, due }))

/** Edits the unpaid part of a contract's payment schedule (or gives an old
 *  contract its first one). Instalments already collected are listed and stay. */
export function ScheduleDrawer({
  contract: { code, amount, currency },
  open,
  onClose,
}: {
  contract: Pick<OpportunityMoneyContract, 'code' | 'amount' | 'currency'>
  open: boolean
  onClose: () => void
}) {
  const { data, isPending, error } = useQuery({ ...contractDetailQuery(code), enabled: open })
  const save = useReplaceSchedule(code)
  const [value, setValue] = useState<InstallmentEdit[]>([])
  const seeded = useRef(false)

  /* Seeded once per opening: a background re-read must not wipe a typed row. */
  useEffect(() => {
    if (!open) {
      seeded.current = false
      return
    }
    if (data && !seeded.current) {
      seeded.current = true
      setValue(unpaidLinesOf(data))
    }
  }, [open, data])

  const paid = (data?.installments ?? []).filter((i) => i.paidAt !== undefined)
  const settled = {
    share: paid.reduce((n, i) => n + i.share, 0),
    amount: paid.reduce((n, i) => n + i.amount, 0),
  }
  const summary = scheduleSummary(value, amount, currency, settled)
  const parsed = ContractInstallmentsBody.safeParse({ installments: value })
  const issue = parsed.success ? '' : scheduleIssue(parsed.error)
  const ready = data !== undefined && value.length > 0 && issue === '' && summary.balanced
  const busy = save.isPending

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Lịch thanh toán"
      subtitle={
        <>
          <span className="font-mono">{code}</span>
          {amount !== null && <> · {compactMoney(amount, currency)}</>}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              save.error ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {save.error ? userMessage(save.error) : busy ? 'Đang lưu…' : issue}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={busy}
              onClick={onClose}
            >
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              className="pointer-coarse:h-12"
              disabled={!ready || busy}
              onClick={() =>
                save.mutate(
                  { installments: value },
                  {
                    onSuccess: () => {
                      toastDone('Đã lưu lịch thanh toán.')
                      onClose()
                    },
                  },
                )
              }
            >
              <Icon icon={Check} size={16} />
              {busy ? 'Đang lưu…' : 'Lưu lịch'}
            </Button>
          </div>
        </div>
      }
    >
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : error || !data ? (
        <p role="alert" className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
          Không đọc được hợp đồng. {isApiError(error) ? userMessage(error) : 'Thử lại.'}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {paid.length > 0 && (
            <section className="flex flex-col gap-3">
              <SectionTitle size="sm">Đã thu</SectionTitle>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {paid.map((i) => (
                  <li
                    key={i.no}
                    className="text-muted-foreground tnum flex flex-wrap justify-between gap-2 text-[12.5px]"
                  >
                    <span className="text-foreground">
                      {i.label} · {i.share}%
                    </span>
                    <span>
                      {compactMoney(i.amount, currency)} · thu {i.paidAt ? dmy(i.paidAt) : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="flex flex-col gap-3">
            <SectionTitle size="sm">Chưa thu</SectionTitle>
            <ScheduleEditor
              amount={amount}
              currency={currency}
              value={value}
              onChange={setValue}
              settled={settled}
            />
          </section>
        </div>
      )}
    </Drawer>
  )
}
