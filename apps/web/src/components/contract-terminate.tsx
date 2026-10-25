import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  Button,
  Drawer,
  GlassCard,
  Icon,
  Input,
  Pencil,
  SectionTitle,
  Select,
  Textarea,
  X,
  cn,
} from '@pv/ui'
import {
  OPPORTUNITY_STATE_LABEL,
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  CONTRACT_PENALTY_DIRECTION_LABEL,
  type ContractPenalty,
  type ContractTermination,
  type CurrencyCode,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { contractTerminationReasonsQuery, rowOf, type Contract } from '@/data/contracts'
import {
  PENALTY_STATE_WORD,
  penaltyDayWrong,
  penaltyDraftOf,
  penaltyInputOf,
  penaltyProblem,
} from '@/data/contract-penalty'
import { useTerminateContract } from '@/data/contracts-write'
import { dmy } from '@/lib/date'
import { moneyIn, symbolOf } from './deal-money/money'
import { PenaltyDrawer, PenaltyFields } from './contract-penalty'
import { Field } from './ops-fields'

/** Ending a signed contract for good (ADR 0107), and what an ended one shows.
 *
 *  A direct door, no approval: head of sales and director only. The drawer
 *  copies the deal stop's gating — a catalogue key travels, `other` needs a
 *  note — and adds the refund, capped by what was collected. The server takes
 *  its own snapshot of the collected money; the figure here is only the hint.
 *  Amounts are in the contract's currency. */

const REFUND_OVER = 'Số tiền hoàn cho khách không được lớn hơn số đã thu.'
const NOTE = 'min-w-0 flex-1 text-[11.5px] leading-[1.5]'

export function TerminateDrawer({
  contract,
  open,
  onClose,
}: {
  contract: Contract
  open: boolean
  onClose: () => void
}) {
  const [reasonKey, setReasonKey] = useState('')
  const [note, setNote] = useState('')
  const [refund, setRefund] = useState<number | null>(0)
  const [penalty, setPenalty] = useState(() => penaltyDraftOf(null))
  const terminate = useTerminateContract(contract.code)
  const { data: catalog } = useQuery({ ...contractTerminationReasonsQuery, enabled: open })
  const collected = rowOf(contract).collected
  const refunded = refund ?? 0
  const busy = terminate.isPending
  const noteNeeded = reasonKey === OPPORTUNITY_STOP_REASON_OTHER
  const overRefund = refunded > collected
  const penaltyWrong = penaltyProblem(penalty)
  const penaltyBody = penaltyInputOf(penalty)
  const ready =
    reasonKey !== '' && (!noteNeeded || note.trim() !== '') && !overRefund && !penaltyWrong && !busy

  const submit = () =>
    terminate.mutate(
      {
        reasonKey,
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        refundedAmount: refunded,
        ...(penaltyBody && { penalty: penaltyBody }),
      },
      {
        /* Closes only once the server accepted, so a refusal cannot vanish. */
        onSuccess: () => {
          toastDone(`Đã chấm dứt ${contract.code}.`)
          setReasonKey('')
          setNote('')
          setRefund(0)
          setPenalty(penaltyDraftOf(null))
          onClose()
        },
      },
    )

  const options = [
    { value: '', label: 'Chọn lý do…' },
    ...(catalog?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: OPPORTUNITY_STOP_REASON_OTHER_LABEL },
  ]

  const status = terminate.error
    ? userMessage(terminate.error)
    : busy
      ? null
      : reasonKey === ''
        ? 'Chọn một lý do.'
        : noteNeeded && note.trim() === ''
          ? `Chọn "${OPPORTUNITY_STOP_REASON_OTHER_LABEL}" thì phải nhập ghi chú.`
          : overRefund
            ? REFUND_OVER
            : penaltyWrong

  /* Red only for the line on show: a plain prompt stays grey. */
  const wrong =
    Boolean(terminate.error) ||
    (status !== null &&
      ((overRefund && status === REFUND_OVER) ||
        (penaltyDayWrong(penalty) && status === penaltyWrong)))

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Chấm dứt hợp đồng"
      subtitle={
        <>
          <span className="font-mono">{contract.code}</span> · {contract.customer}
        </>
      }
      footer={
        <TerminateFooter
          status={status}
          wrong={wrong}
          busy={busy}
          ready={ready}
          onClose={onClose}
          onSubmit={submit}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <div className="bg-destructive/10 text-on-tint-destructive flex flex-col gap-1 rounded-md p-4 text-[12.5px] leading-[1.6]">
          <p className="m-0">Hợp đồng thôi tính vào doanh số.</p>
          <p className="m-0">Công ty giữ số tiền đã thu, trừ phần hoàn cho khách.</p>
          <p className="m-0 font-semibold">Chấm dứt rồi không mở lại được.</p>
        </div>

        <Field label="Lý do" required plain>
          <Select
            label="Lý do chấm dứt"
            hideLabel
            value={reasonKey}
            onChange={setReasonKey}
            options={options}
            size="lg"
            className="w-full"
          />
        </Field>

        <Field label="Ghi chú" required={noteNeeded}>
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label="Ghi chú khi chấm dứt hợp đồng"
            aria-required={noteNeeded}
            maxLength={OPPORTUNITY_STOP_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        <RefundField
          value={refund}
          onChange={setRefund}
          collected={collected}
          currency={contract.currency}
          invalid={overRefund}
        />

        <PenaltyFields draft={penalty} onChange={setPenalty} currency={contract.currency} />
      </div>
    </Drawer>
  )
}

/** Status line on the left, cancel and the final button on the right. */
function TerminateFooter({
  status,
  wrong,
  busy,
  ready,
  onClose,
  onSubmit,
}: {
  status: string | null
  wrong: boolean
  busy: boolean
  ready: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(NOTE, wrong ? 'text-destructive-foreground' : 'text-muted-foreground')}
        aria-live="polite"
      >
        {status}
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
          variant="destructive"
          className="pointer-coarse:h-12"
          disabled={!ready}
          onClick={onSubmit}
        >
          <Icon icon={Ban} size={16} />
          {busy ? 'Đang chấm dứt…' : 'Chấm dứt hợp đồng'}
        </Button>
      </div>
    </div>
  )
}

/** The refund box, with what was collected and what stays beside it. */
function RefundField({
  value,
  onChange,
  collected,
  currency,
  invalid,
}: {
  value: number | null
  onChange: (next: number | null) => void
  collected: number
  currency: CurrencyCode | null
  invalid: boolean
}) {
  const money = moneyIn(currency)
  const kept = Math.max(collected - (value ?? 0), 0)
  return (
    <Field
      label="Số tiền hoàn cho khách"
      hint={`Đã thu ${money(collected)} · giữ lại ${money(kept)}.`}
    >
      <span className="relative flex items-center">
        <Input
          inputMode="numeric"
          aria-label="Số tiền hoàn cho khách"
          aria-invalid={invalid}
          className="tnum font-num pointer-coarse:h-12 pr-8"
          value={value === null ? '' : value.toLocaleString('vi-VN')}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            onChange(digits === '' ? null : Number(digits))
          }}
        />
        <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
          {symbolOf(currency)}
        </span>
      </span>
    </Field>
  )
}

/** The penalty as the card prints it: what it is, then where the money stands. */
function penaltyRows(
  penalty: ContractPenalty | null | undefined,
  money: (n: number) => string,
): { term: string; value: ReactNode; num?: true }[] {
  if (!penalty) return [{ term: 'Tiền phạt', value: 'Không có' }]
  const word = PENALTY_STATE_WORD[penalty.direction]
  const settled = penalty.settledOn ? `${word.done} ngày ${dmy(penalty.settledOn)}` : word.wait
  return [
    {
      term: 'Tiền phạt',
      value: `${CONTRACT_PENALTY_DIRECTION_LABEL[penalty.direction]} · ${money(penalty.amount)}`,
      num: true,
    },
    { term: 'Tình trạng', value: settled },
  ]
}

/** What an ended contract remembers, at the top of its page. Kept money is
 *  derived here, never stored: collected minus refunded. The penalty sits
 *  beside it, never inside it (ADR 0124). */
export function TerminationCard({
  contract,
  termination: t,
}: {
  contract: Contract
  termination: ContractTermination
}) {
  const [editing, setEditing] = useState(false)
  const money = moneyIn(contract.currency)
  const rows: { term: string; value: ReactNode; num?: true }[] = [
    { term: 'Ngày chấm dứt', value: dmy(t.terminatedAt) },
    { term: 'Người chấm dứt', value: t.byName },
    { term: 'Lý do', value: t.reasonLabel },
    { term: 'Ghi chú', value: t.note ?? 'Không có ghi chú' },
    { term: 'Đã thu', value: money(t.collectedAmount), num: true },
    { term: 'Đã hoàn cho khách', value: money(t.refundedAmount), num: true },
    { term: 'Giữ lại', value: money(t.collectedAmount - t.refundedAmount), num: true },
    ...penaltyRows(t.penalty, money),
  ]

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label={`Hợp đồng ${OPPORTUNITY_STATE_LABEL.terminated.toLowerCase()}`}
    >
      <SectionTitle size="detail">
        Hợp đồng {OPPORTUNITY_STATE_LABEL.terminated.toLowerCase()}
      </SectionTitle>
      <dl className="grid gap-x-6 gap-y-3 text-[12.5px] leading-[1.6] sm:grid-cols-[auto_1fr]">
        {rows.map((row) => (
          <div key={row.term} className="contents">
            <dt className="text-muted-foreground">{row.term}</dt>
            <dd
              className={cn('text-foreground tnum m-0 min-w-0 break-words', row.num && 'font-num')}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {contract.canEditPenalty && (
        <>
          <Button
            variant="secondary"
            className="pointer-coarse:h-12 self-start"
            onClick={() => setEditing(true)}
          >
            <Icon icon={Pencil} size={16} />
            {t.penalty ? 'Sửa tiền phạt' : 'Ghi tiền phạt'}
          </Button>
          {/* Keyed on the saved penalty: a colleague's change re-seeds the draft instead of being overwritten. */}
          <PenaltyDrawer
            key={JSON.stringify(t.penalty ?? null)}
            contract={contract}
            open={editing}
            onClose={() => setEditing(false)}
          />
        </>
      )}
    </GlassCard>
  )
}
