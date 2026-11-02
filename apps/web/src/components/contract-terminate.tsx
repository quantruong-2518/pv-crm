import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Ban,
  Button,
  Drawer,
  GlassCard,
  Icon,
  Input,
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

const FIGURE = 'tnum font-num text-[20px] font-semibold leading-none tracking-[-.5px]'

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-muted-foreground text-[12px]">{label}</span>
      <span className={cn(FIGURE, !strong && 'text-muted-foreground')}>{value}</span>
    </div>
  )
}

/** The operators are decoration once the cells stack on a phone. */
function Operator({ sign }: { sign: string }) {
  return (
    <span aria-hidden className={cn(FIGURE, 'text-muted-foreground hidden self-end sm:block')}>
      {sign}
    </span>
  )
}

/** Its own tinted block so the penalty never reads as part of the kept sum. */
function PenaltyBlock({
  penalty,
  money,
  onEdit,
}: {
  penalty: ContractPenalty | null | undefined
  money: (n: number) => string
  onEdit?: () => void
}) {
  if (!penalty && !onEdit) return null
  const word = penalty && PENALTY_STATE_WORD[penalty.direction]
  return (
    <div className="bg-surface-ink/5 flex flex-wrap items-center gap-4 rounded-md p-4">
      {penalty && word ? (
        <>
          <Figure
            label={CONTRACT_PENALTY_DIRECTION_LABEL[penalty.direction]}
            value={money(penalty.amount)}
            strong
          />
          <Badge tone={penalty.settledOn ? 'success' : 'warning'}>
            {penalty.settledOn ? `${word.done} ngày ${dmy(penalty.settledOn)}` : word.wait}
          </Badge>
        </>
      ) : (
        <span className="text-muted-foreground text-[12.5px]">Không có tiền phạt</span>
      )}
      {onEdit && (
        <Button variant="ghost" size="sm" className="pointer-coarse:h-12 ml-auto" onClick={onEdit}>
          {penalty ? 'Sửa' : 'Ghi tiền phạt'}
        </Button>
      )}
    </div>
  )
}

/** What an ended contract remembers, at the top of its page. Kept money is
 *  derived here, never stored: collected minus refunded. The penalty sits
 *  beside it, never inside it (ADR 0124). The page badge already says the
 *  contract ended, so the card leads with why. */
export function TerminationCard({
  contract,
  termination: t,
}: {
  contract: Contract
  termination: ContractTermination
}) {
  const [editing, setEditing] = useState(false)
  const money = moneyIn(contract.currency)

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label={`Hợp đồng ${OPPORTUNITY_STATE_LABEL.terminated.toLowerCase()}`}
    >
      <div className="flex flex-col gap-1">
        <SectionTitle size="detail">{t.reasonLabel}</SectionTitle>
        <span className="text-muted-foreground text-[12px]">
          {t.byName} chấm dứt ngày {dmy(t.terminatedAt)}
        </span>
      </div>
      {t.note && (
        <p className="bg-surface-ink/5 m-0 whitespace-pre-line break-words rounded-md px-4 py-3 text-[12.5px] leading-[1.6]">
          {t.note}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:gap-6">
        <Figure label="Đã thu" value={money(t.collectedAmount)} />
        <Operator sign="−" />
        <Figure label="Hoàn cho khách" value={money(t.refundedAmount)} />
        <Operator sign="=" />
        <Figure label="Giữ lại" value={money(t.collectedAmount - t.refundedAmount)} strong />
      </div>
      <PenaltyBlock
        penalty={t.penalty}
        money={money}
        onEdit={contract.canEditPenalty ? () => setEditing(true) : undefined}
      />
      {contract.canEditPenalty && (
        // Keyed on the saved penalty: a colleague's change re-seeds the draft instead of being overwritten.
        <PenaltyDrawer
          key={JSON.stringify(t.penalty ?? null)}
          contract={contract}
          open={editing}
          onClose={() => setEditing(false)}
        />
      )}
    </GlassCard>
  )
}
