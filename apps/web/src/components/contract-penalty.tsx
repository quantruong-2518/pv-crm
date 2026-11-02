import { useState } from 'react'
import { Button, Drawer, Icon, Input, Save, SegmentedControl, Trash2, X, cn } from '@pv/ui'
import type { ContractPenaltyDirection, CurrencyCode } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import type { Contract } from '@/data/contracts'
import { penaltyDirectionText } from '@/data/contract-copy'
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

const DAY_LABEL: Record<ContractPenaltyDirection, { label: Message; hint: Message }> = {
  'customer-pays': {
    label: message('Ngày nhận tiền phạt', 'Penalty received on', '위약금 수령일'),
    hint: message(
      'Để trống nếu chưa nhận.',
      'Leave empty if not received yet.',
      '아직 받지 않았다면 비워 두세요.',
    ),
  },
  'company-pays': {
    label: message('Ngày trả tiền phạt', 'Penalty paid on', '위약금 지급일'),
    hint: message(
      'Để trống nếu chưa trả.',
      'Leave empty if not paid yet.',
      '아직 지급하지 않았다면 비워 두세요.',
    ),
  },
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
  const { t, lang, number } = useI18n()
  const { direction } = draft
  const day = direction
    ? { label: t(DAY_LABEL[direction].label), hint: t(DAY_LABEL[direction].hint) }
    : null
  const wrongDay = penaltyDayWrong(draft)

  return (
    <div className="flex flex-col gap-6">
      <Field label={t(message('Tiền phạt', 'Penalty', '위약금'))} plain>
        <SegmentedControl
          label={t(message('Tiền phạt', 'Penalty', '위약금'))}
          hideLabel
          tone="quiet"
          value={direction ?? NONE}
          onChange={(v) =>
            onChange({ ...draft, direction: v === NONE ? null : (v as ContractPenaltyDirection) })
          }
          options={[
            { value: NONE, label: t(message('Không phạt', 'No penalty', '위약금 없음')) },
            { value: 'customer-pays', label: penaltyDirectionText('customer-pays', lang) },
            { value: 'company-pays', label: penaltyDirectionText('company-pays', lang) },
          ]}
        />
      </Field>

      {direction && day && (
        <>
          <Field label={t(message('Số tiền phạt', 'Penalty amount', '위약금 금액'))} required>
            <span className="relative flex items-center">
              <Input
                inputMode="numeric"
                aria-label={t(message('Số tiền phạt', 'Penalty amount', '위약금 금액'))}
                className="tnum font-num pointer-coarse:h-12 pr-8"
                value={draft.amount === null ? '' : number(draft.amount)}
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
  const { t } = useI18n()
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
          toastDone(
            clearing
              ? t(message('Đã bỏ tiền phạt.', 'Penalty removed.', '위약금을 삭제했습니다.'))
              : t(message('Đã lưu tiền phạt.', 'Penalty saved.', '위약금을 저장했습니다.')),
          )
          onClose()
        },
      },
    )

  const status = save.error ? userMessage(save.error) : busy ? null : problem

  return (
    <Drawer
      open={open}
      onClose={close}
      title={t(message('Tiền phạt', 'Penalty', '위약금'))}
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
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
            <Button size="md" className="pointer-coarse:h-12" disabled={!ready} onClick={submit}>
              <Icon icon={clearing ? Trash2 : Save} size={16} />
              {clearing
                ? t(message('Bỏ tiền phạt', 'Remove penalty', '위약금 삭제'))
                : t(message('Lưu tiền phạt', 'Save penalty', '위약금 저장'))}
            </Button>
          </div>
        </div>
      }
    >
      <PenaltyFields draft={draft} onChange={setDraft} currency={contract.currency} />
    </Drawer>
  )
}
