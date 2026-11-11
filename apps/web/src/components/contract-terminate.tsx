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
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
  OPPORTUNITY_STOP_REASON_OTHER_LABEL,
  type ContractPenalty,
  type ContractTermination,
  type CurrencyCode,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { contractTerminationReasonsQuery, rowOf, type Contract } from '@/data/contracts'
import { penaltyDirectionText, penaltyStatusText } from '@/data/contract-copy'
import { opportunityStatusLabel } from '@/data/sales-labels-i18n'
import {
  penaltyDayWrong,
  penaltyDraftOf,
  penaltyInputOf,
  penaltyProblem,
} from '@/data/contract-penalty'
import { useTerminateContract } from '@/data/contracts-write'
import { moneyIn, symbolOf } from './deal-money/money'
import { FxLine } from './fx-line'
import { PenaltyDrawer, PenaltyFields } from './contract-penalty'
import { Field } from './ops-fields'

/** Ending a signed contract for good (ADR 0107), and what an ended one shows.
 *
 *  A direct door, no approval: head of sales and director only. The drawer
 *  copies the deal stop's gating — a catalogue key travels, `other` needs a
 *  note — and adds the refund, capped by what was collected. The server takes
 *  its own snapshot of the collected money; the figure here is only the hint.
 *  Amounts are in the contract's currency. */

const REFUND_OVER = message(
  'Số tiền hoàn cho khách không được lớn hơn số đã thu.',
  'The refund to the customer cannot exceed the amount collected.',
  '고객 환불액은 수금액을 초과할 수 없습니다.',
)
const NOTE = 'min-w-0 flex-1 text-[11.5px] leading-[1.5]'

/** What ending a contract does to the money, said before the button. */
function TerminateNotice() {
  const { t } = useI18n()
  return (
    <div className="bg-destructive/10 text-on-tint-destructive flex flex-col gap-1 rounded-md p-4 text-[12.5px] leading-[1.6]">
      <p className="m-0">
        {t(
          message(
            'Hợp đồng thôi tính vào doanh số.',
            'The contract no longer counts toward sales.',
            '이 계약은 더 이상 매출에 포함되지 않습니다.',
          ),
        )}
      </p>
      <p className="m-0">
        {t(
          message(
            'Công ty giữ số tiền đã thu, trừ phần hoàn cho khách.',
            'The company keeps the money collected, minus the refund to the customer.',
            '회사는 수금한 금액에서 고객 환불액을 뺀 금액을 보유합니다.',
          ),
        )}
      </p>
      <p className="m-0 font-semibold">
        {t(
          message(
            'Chấm dứt rồi không mở lại được.',
            'A terminated contract cannot be reopened.',
            '종료한 계약은 다시 열 수 없습니다.',
          ),
        )}
      </p>
    </div>
  )
}

export function TerminateDrawer({
  contract,
  open,
  onClose,
}: {
  contract: Contract
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
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
          toastDone(
            t(
              message(
                `Đã chấm dứt ${contract.code}.`,
                `Terminated ${contract.code}.`,
                `${contract.code}을(를) 종료했습니다.`,
              ),
            ),
          )
          setReasonKey('')
          setNote('')
          setRefund(0)
          setPenalty(penaltyDraftOf(null))
          onClose()
        },
      },
    )

  const otherLabel = t(message(OPPORTUNITY_STOP_REASON_OTHER_LABEL, 'Other', '기타'))
  const refundOver = t(REFUND_OVER)
  const options = [
    { value: '', label: t(message('Chọn lý do…', 'Choose a reason…', '사유 선택…')) },
    ...(catalog?.rows ?? []).map((r) => ({ value: r.id, label: r.name })),
    { value: OPPORTUNITY_STOP_REASON_OTHER, label: otherLabel },
  ]

  const status = terminate.error
    ? userMessage(terminate.error)
    : busy
      ? null
      : reasonKey === ''
        ? t(message('Chọn một lý do.', 'Choose a reason.', '사유를 선택하세요.'))
        : noteNeeded && note.trim() === ''
          ? t(
              message(
                `Chọn "${OPPORTUNITY_STOP_REASON_OTHER_LABEL}" thì phải nhập ghi chú.`,
                `A note is required when you choose "${otherLabel}".`,
                `"${otherLabel}"을(를) 선택하면 메모를 입력해야 합니다.`,
              ),
            )
          : overRefund
            ? refundOver
            : penaltyWrong

  /* Red only for the line on show: a plain prompt stays grey. */
  const wrong =
    Boolean(terminate.error) ||
    (status !== null &&
      ((overRefund && status === refundOver) ||
        (penaltyDayWrong(penalty) && status === penaltyWrong)))

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(message('Chấm dứt hợp đồng', 'Terminate contract', '계약 종료'))}
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
        <TerminateNotice />

        <Field label={t(message('Lý do', 'Reason', '사유'))} required plain>
          <Select
            label={t(message('Lý do chấm dứt', 'Reason for termination', '종료 사유'))}
            hideLabel
            value={reasonKey}
            onChange={setReasonKey}
            options={options}
            size="lg"
            className="w-full"
          />
        </Field>

        <Field label={t(message('Ghi chú', 'Note', '메모'))} required={noteNeeded}>
          <Textarea
            autoGrow
            rows={3}
            value={note}
            aria-label={t(
              message(
                'Ghi chú khi chấm dứt hợp đồng',
                'Note on terminating the contract',
                '계약 종료 메모',
              ),
            )}
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
  const { t } = useI18n()
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
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <Button
          size="md"
          variant="destructive"
          className="pointer-coarse:h-12"
          disabled={!ready}
          onClick={onSubmit}
        >
          <Icon icon={Ban} size={16} />
          {busy
            ? t(message('Đang chấm dứt…', 'Terminating…', '종료하는 중…'))
            : t(message('Chấm dứt hợp đồng', 'Terminate contract', '계약 종료'))}
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
  const { t, number } = useI18n()
  const money = moneyIn(currency)
  const kept = Math.max(collected - (value ?? 0), 0)
  return (
    <Field
      label={t(message('Số tiền hoàn cho khách', 'Refund to customer', '고객 환불액'))}
      hint={t(
        message(
          `Đã thu ${money(collected)} · giữ lại ${money(kept)}.`,
          `Collected ${money(collected)} · kept ${money(kept)}.`,
          `수금 ${money(collected)} · 보유 ${money(kept)}.`,
        ),
      )}
    >
      <span className="relative flex items-center">
        <Input
          inputMode="numeric"
          aria-label={t(message('Số tiền hoàn cho khách', 'Refund to customer', '고객 환불액'))}
          aria-invalid={invalid}
          className="tnum font-num pointer-coarse:h-12 pr-8"
          value={value === null ? '' : number(value)}
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
  const { t, lang, date } = useI18n()
  if (!penalty && !onEdit) return null
  return (
    <div className="bg-surface-ink/5 flex flex-wrap items-center gap-4 rounded-md p-4">
      {penalty ? (
        <>
          <div className="flex min-w-0 flex-col gap-1">
            <Figure
              label={penaltyDirectionText(penalty.direction, lang)}
              value={money(penalty.amount)}
              strong
            />
            {penalty.amountVnd !== null && (
              <FxLine vnd={penalty.amountVnd} fx={penalty.fx} className="text-left" />
            )}
          </div>
          <Badge tone={penalty.settledOn ? 'success' : 'warning'}>
            {penalty.settledOn
              ? t(
                  message(
                    `${penaltyStatusText(penalty.direction, true, 'vi')} ngày ${date(penalty.settledOn)}`,
                    `${penaltyStatusText(penalty.direction, true, 'en')} on ${date(penalty.settledOn)}`,
                    `${date(penalty.settledOn)} ${penaltyStatusText(penalty.direction, true, 'ko')}`,
                  ),
                )
              : penaltyStatusText(penalty.direction, false, lang)}
          </Badge>
        </>
      ) : (
        <span className="text-muted-foreground text-[12.5px]">
          {t(message('Không có tiền phạt', 'No penalty', '위약금 없음'))}
        </span>
      )}
      {onEdit && (
        <Button variant="ghost" size="sm" className="pointer-coarse:h-12 ml-auto" onClick={onEdit}>
          {penalty
            ? t(message('Sửa', 'Edit', '수정'))
            : t(message('Ghi tiền phạt', 'Record penalty', '위약금 기록'))}
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
  const { t: say, date } = useI18n()
  const [editing, setEditing] = useState(false)
  const money = moneyIn(contract.currency)

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label={say(
        message(
          `Hợp đồng ${opportunityStatusLabel('terminated', 'vi').toLowerCase()}`,
          `Contract ${opportunityStatusLabel('terminated', 'en').toLowerCase()}`,
          `계약 ${opportunityStatusLabel('terminated', 'ko')}`,
        ),
      )}
    >
      <div className="flex flex-col gap-1">
        <SectionTitle size="detail">{t.reasonLabel}</SectionTitle>
        <span className="text-muted-foreground text-[12px]">
          {say(
            message(
              `${t.byName} chấm dứt ngày ${date(t.terminatedAt)}`,
              `Terminated by ${t.byName} on ${date(t.terminatedAt)}`,
              `${t.byName}이(가) ${date(t.terminatedAt)}에 종료`,
            ),
          )}
        </span>
      </div>
      {t.note && (
        <p className="bg-surface-ink/5 m-0 whitespace-pre-line break-words rounded-md px-4 py-3 text-[12.5px] leading-[1.6]">
          {t.note}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:gap-6">
        <Figure
          label={say(message('Đã thu', 'Collected', '수금액'))}
          value={money(t.collectedAmount)}
        />
        <Operator sign="−" />
        <Figure
          label={say(message('Hoàn cho khách', 'Refunded to customer', '고객 환불'))}
          value={money(t.refundedAmount)}
        />
        <Operator sign="=" />
        <Figure
          label={say(message('Giữ lại', 'Kept', '보유액'))}
          value={money(t.collectedAmount - t.refundedAmount)}
          strong
        />
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
