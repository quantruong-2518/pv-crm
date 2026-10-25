import { useState } from 'react'
import { Button, Drawer, Icon, Input, Save, SegmentedControl, Trash2, X, cn } from '@pv/ui'
import {
  CONTRACT_PENALTY_DIRECTION_LABEL,
  type ContractPenaltyDirection,
  type CurrencyCode,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import type { Contract } from '@/data/contracts'
import { useSavePenalty } from '@/data/contracts-write'
import {
  penaltyDayWrong,
  penaltyDraftOf,
  penaltyInputOf,
  penaltyProblem,
  type PenaltyDraft,
} from '@/data/contract-penalty'
import { vnToday } from '@/data/opportunities'
import { symbolOf } from './deal-money/money'
import { Field } from './ops-fields'

/** The penalty of an ended contract (ADR 0124): one amount, one direction, and
 *  the day the money moved. Shared by the terminate drawer and the card's own
 *  drawer, so both read the same form and the same refusals.
 *
 *  A company-level report, never a KPI: nothing here touches "kept" money.
 *  The draft and its checks are in `data/contract-penalty.ts`. */

const NONE = 'none'

const DAY_LABEL: Record<ContractPenaltyDirection, { label: string; hint: string }> = {
  'customer-pays': { label: 'Ngày nhận tiền phạt', hint: 'Để trống nếu chưa nhận.' },
  'company-pays': { label: 'Ngày trả tiền phạt', hint: 'Để trống nếu chưa trả.' },
}

export function PenaltyFields({
  draft,
  onChange,
  currency,
}: {
  draft: PenaltyDraft
  onChange: (next: PenaltyDraft) => void
  currency: CurrencyCode | null
}) {
  const { direction } = draft
  const day = direction ? DAY_LABEL[direction] : null
  const wrongDay = penaltyDayWrong(draft)

  return (
    <div className="flex flex-col gap-6">
      <Field label="Tiền phạt" plain>
        <SegmentedControl
          label="Tiền phạt"
          hideLabel
          tone="quiet"
          value={direction ?? NONE}
          onChange={(v) =>
            onChange({ ...draft, direction: v === NONE ? null : (v as ContractPenaltyDirection) })
          }
          options={[
            { value: NONE, label: 'Không phạt' },
            { value: 'customer-pays', label: CONTRACT_PENALTY_DIRECTION_LABEL['customer-pays'] },
            { value: 'company-pays', label: CONTRACT_PENALTY_DIRECTION_LABEL['company-pays'] },
          ]}
        />
      </Field>

      {direction && day && (
        <>
          <Field label="Số tiền phạt" required>
            <span className="relative flex items-center">
              <Input
                inputMode="numeric"
                aria-label="Số tiền phạt"
                className="tnum font-num pointer-coarse:h-12 pr-8"
                value={draft.amount === null ? '' : draft.amount.toLocaleString('vi-VN')}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  onChange({ ...draft, amount: digits === '' ? null : Number(digits) })
                }}
              />
              <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
                {symbolOf(currency)}
              </span>
            </span>
          </Field>

          <Field label={day.label} hint={day.hint}>
            <Input
              type="date"
              aria-label={day.label}
              invalid={wrongDay}
              className="pointer-coarse:h-12 max-w-[200px]"
              value={draft.settledOn}
              max={vnToday()}
              onChange={(e) => onChange({ ...draft, settledOn: e.target.value })}
            />
          </Field>
        </>
      )}
    </div>
  )
}

/** Add, change or clear the penalty of an ended contract. Closes only once the
 *  server accepted, so a refusal cannot vanish with the drawer. */
export function PenaltyDrawer({
  contract,
  open,
  onClose,
}: {
  contract: Contract
  open: boolean
  onClose: () => void
}) {
  const current = contract.termination?.penalty
  const [draft, setDraft] = useState(() => penaltyDraftOf(current))
  const save = useSavePenalty(contract.code)
  const busy = save.isPending
  const problem = penaltyProblem(draft)
  const saved = penaltyDraftOf(current)
  const unchanged =
    draft.direction === saved.direction &&
    draft.amount === saved.amount &&
    draft.settledOn === saved.settledOn
  const clearing = Boolean(current) && draft.direction === null
  const ready = !busy && !problem && !unchanged

  const close = () => {
    setDraft(penaltyDraftOf(current))
    save.reset()
    onClose()
  }

  const submit = () =>
    save.mutate(
      { penalty: penaltyInputOf(draft) ?? null },
      {
        onSuccess: () => {
          toastDone(clearing ? 'Đã bỏ tiền phạt.' : 'Đã lưu tiền phạt.')
          onClose()
        },
      },
    )

  const status = save.error ? userMessage(save.error) : busy ? null : problem

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Tiền phạt"
      subtitle={
        <>
          <span className="font-mono">{contract.code}</span> · {contract.customer}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              save.error || penaltyDayWrong(draft)
                ? 'text-destructive-foreground'
                : 'text-muted-foreground',
            )}
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
              onClick={close}
            >
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button size="md" className="pointer-coarse:h-12" disabled={!ready} onClick={submit}>
              <Icon icon={clearing ? Trash2 : Save} size={16} />
              {clearing ? 'Bỏ tiền phạt' : 'Lưu tiền phạt'}
            </Button>
          </div>
        </div>
      }
    >
      <PenaltyFields draft={draft} onChange={setDraft} currency={contract.currency} />
    </Drawer>
  )
}
