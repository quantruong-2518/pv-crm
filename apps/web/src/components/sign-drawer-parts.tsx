import { useState } from 'react'
import { ChevronDown, PenLine, TriangleAlert, X } from '@pv/ui'
import { Button, Icon, Input, MetaPill, Select, billions, cn, vnd } from '@pv/ui'
import {
  CURRENCIES,
  toMoneyVnd,
  type ContractCollectorCandidates,
  type CurrencyCode,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { NO_COLLECTOR } from '@/data/contract-collector'
import { localDay } from '@/data/local-day'
import { dmy } from '@/lib/date'
import { Field } from './ops-fields'

/** Pieces of the sign drawer, split out to keep it under the function
 *  ceiling: the footer, the payment PIC, and the one-line fold for the signing
 *  day. */

const CLOSER_IS_YOU = 'Bạn là người chốt: nhận hoa hồng và được sửa hợp đồng.'

/** Who collects the money. The closer is not the collector by nature: the box
 *  always starts empty and the press stays shut until someone is picked. */
export function SignCollector({
  value,
  candidates,
  onChange,
}: {
  value: string
  candidates: ContractCollectorCandidates | undefined
  onChange: (id: string) => void
}) {
  const options = [
    { value: '', label: 'Chọn người thu tiền…' },
    ...(candidates ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` })),
  ]

  return (
    <Field
      label="Người thu tiền"
      required
      plain
      hint={candidates?.length === 0 ? NO_COLLECTOR : CLOSER_IS_YOU}
    >
      <Select
        label="Người thu tiền"
        hideLabel
        size="lg"
        value={value}
        neutralValue=""
        onChange={onChange}
        options={options}
        className="w-full"
      />
    </Field>
  )
}

/** The signing day, folded into one row while the default stands; its change
 *  link opens the field. The closer is never picked: whoever creates the
 *  contract closes it (ADR 0113); `SignCollector` says so beside the collector. */
export function SignDay({
  signedDate,
  direct,
  onDate,
}: {
  signedDate: string
  direct: boolean
  onDate: (day: string) => void
}) {
  const [changing, setChanging] = useState(false)
  const verb = direct ? 'ký' : 'gửi'
  const taken = signedDate === '' || signedDate === localDay(new Date())

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={changing}
        onClick={() => setChanging((was) => !was)}
        className="bg-surface-ink/9 motion-std hover:bg-surface-ink/14 pointer-coarse:min-h-12 flex min-h-12 items-center gap-3 rounded-md px-3 text-left"
      >
        <span className="text-muted-foreground text-[12px] font-medium">Ngày ký</span>
        <span className="tnum min-w-0 flex-1 truncate text-[13px]">
          {taken ? `Lấy lúc bấm ${verb}` : `Ngày ${dmy(signedDate)}`}
        </span>
        <span className="text-accent-foreground text-[12px]">Đổi</span>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn('text-muted-foreground', changing && 'rotate-180')}
        />
      </button>
      {changing && (
        <Field
          label="Ngày ký"
          hint={
            signedDate !== ''
              ? `Ngày ${dmy(signedDate)}. Sửa nếu ký ngày khác.`
              : `Bỏ trống là lấy lúc bấm ${verb}.`
          }
        >
          <Input
            type="date"
            aria-label="Ngày ký"
            className="pointer-coarse:h-12"
            value={signedDate}
            onChange={(e) => onDate(e.target.value)}
          />
        </Field>
      )}
    </div>
  )
}

/** One sentence on the left (what blocks the press, what failed, or what the
 *  press does), the two buttons on the right. */
export function SignFooter({
  note,
  failed,
  busy,
  canSend,
  direct,
  onClose,
  onSend,
}: {
  note: string
  failed: boolean
  busy: boolean
  canSend: boolean
  direct: boolean
  onClose: () => void
  onSend: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {/* `min-w-0 flex-1`: at its natural width the sentence pushes the
          buttons onto a second row. */}
      <span
        className={cn(
          'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
          failed ? 'text-destructive-foreground' : 'text-foreground',
        )}
        aria-live="polite"
      >
        {note}
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
          disabled={busy || !canSend}
          onClick={onSend}
        >
          <Icon icon={PenLine} size={16} />
          {direct ? (busy ? 'Đang ký…' : 'Ký hợp đồng') : busy ? 'Đang gửi…' : 'Gửi đề nghị ký'}
        </Button>
      </div>
    </div>
  )
}

/** The signed value and its currency, with the figure said back in words so a
 *  missing zero is seen before the press. */
export function SignAmount({
  amount,
  currency,
  again,
  onAmount,
  onCurrency,
}: {
  amount: number | null
  currency: CurrencyCode | ''
  /** A further contract on a won deal: the figure is its own. */
  again: boolean
  onAmount: (next: number | null) => void
  onCurrency: (next: CurrencyCode | '') => void
}) {
  const code = currency === '' ? null : currency
  const symbol = CURRENCIES.find((c) => c.code === code)?.symbol ?? ''
  const options = [
    ...(code === null ? [{ value: '', label: 'Chọn đồng tiền…' }] : []),
    ...CURRENCIES.map((c) => ({ value: c.code as string, label: c.label })),
  ]

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Số tiền ký"
        required
        hint={again ? 'Số của riêng hợp đồng này.' : 'Lấy sẵn từ giá trị dự kiến, sửa nếu khác.'}
      >
        <span className="relative flex items-center">
          <Input
            inputMode="numeric"
            aria-label="Số tiền ký"
            className="tnum font-num pointer-coarse:h-12 pr-8"
            value={amount === null ? '' : amount.toLocaleString('vi-VN')}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              onAmount(digits === '' ? null : Number(digits))
            }}
          />
          <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
            {symbol}
          </span>
        </span>
      </Field>

      <Field label="Đồng tiền" required plain>
        <Select
          label="Đồng tiền"
          hideLabel
          size="lg"
          value={currency}
          neutralValue={currency}
          onChange={(v) => onCurrency(v as CurrencyCode | '')}
          options={options}
          className="w-full"
        />
      </Field>

      {amount !== null && amount > 0 && code !== null && (
        <span className="text-muted-foreground text-[11.5px] leading-[1.5] sm:col-span-2">
          {code === 'VND'
            ? `${vnd(amount)} · ${billions(amount)}`
            : `${amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toMoneyVnd(amount, code))} quy ra đồng`}
        </span>
      )}
    </section>
  )
}

/** The warning (the point of the panel: the sign door has no way back) and the
 *  deal's own facts for reference. */
export function SignNotice({ op, direct }: { op: OpportunityProfileResponse; direct: boolean }) {
  return (
    <>
      <div className="bg-surface-ink/5 flex items-start gap-3 rounded-md p-4">
        <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
        <p className="text-[11.5px] leading-[1.5]">
          {direct
            ? 'Hợp đồng được tạo ngay khi bấm ký, không qua Hộp duyệt, và không gỡ được.'
            : 'Đề nghị đi qua Hộp duyệt. Hợp đồng chỉ được tạo khi được duyệt, và không gỡ được.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MetaPill>{op.name}</MetaPill>
        {op.amount !== null && op.currency !== null && (
          <MetaPill className="tnum font-num">
            đơn đang ghi {billions(toMoneyVnd(op.amount, op.currency))}
          </MetaPill>
        )}
        {op.contractCodes.map((code) => (
          <MetaPill key={code} mono tone="success">
            {code}
          </MetaPill>
        ))}
      </div>
    </>
  )
}
