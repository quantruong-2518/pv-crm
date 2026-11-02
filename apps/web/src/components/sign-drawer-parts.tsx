import { useState } from 'react'
import { ChevronDown, PenLine, TriangleAlert, X } from '@pv/ui'
import { Button, Icon, Input, MetaPill, Select, billions, cn } from '@pv/ui'
import {
  CURRENCIES,
  toMoneyVnd,
  type ContractCollectorCandidates,
  type CurrencyCode,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { noCollectorText } from '@/data/contract-collector'
import { localDay } from '@/data/local-day'
import { dmy } from '@/lib/date'
import { Field } from './ops-fields'
import { message, useI18n, type Message } from '@/app/i18n'

/** Pieces of the sign drawer, split out to keep it under the function
 *  ceiling: the footer, the payment PIC, and the one-line fold for the signing
 *  day. */

const CLOSER_IS_YOU = message(
  'Bạn là người chốt: nhận hoa hồng và được sửa hợp đồng.',
  'You are the closer: you earn the commission and can edit the contract.',
  '귀하가 계약 담당자입니다. 수수료를 받고 계약을 수정할 수 있습니다.',
)

const CURRENCY_LABEL: Record<CurrencyCode, Message> = {
  VND: message('VND · Việt Nam đồng', 'VND · Vietnamese dong', 'VND · 베트남 동'),
  USD: message('USD · đô la Mỹ', 'USD · US dollar', 'USD · 미국 달러'),
}

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
  const { t } = useI18n()
  const label = t(message('Người thu tiền', 'Payment collector', '수금 담당자'))
  const options = [
    {
      value: '',
      label: t(message('Chọn người thu tiền…', 'Choose the collector…', '수금 담당자 선택…')),
    },
    ...(candidates ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.role}` })),
  ]

  return (
    <Field
      label={label}
      required
      plain
      hint={candidates?.length === 0 ? noCollectorText() : t(CLOSER_IS_YOU)}
    >
      <Select
        label={label}
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
  const { t } = useI18n()
  const [changing, setChanging] = useState(false)
  const verb = direct ? message('ký', 'Sign', '서명') : message('gửi', 'Send', '전송')
  const dayLabel = t(message('Ngày ký', 'Signing date', '체결일'))
  const taken = signedDate === '' || signedDate === localDay(new Date())

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={changing}
        onClick={() => setChanging((was) => !was)}
        className="bg-surface-ink/9 motion-std hover:bg-surface-ink/14 pointer-coarse:min-h-12 flex min-h-12 items-center gap-3 rounded-md px-3 text-left"
      >
        <span className="text-muted-foreground text-[12px] font-medium">{dayLabel}</span>
        <span className="tnum min-w-0 flex-1 truncate text-[13px]">
          {taken
            ? t(
                message(
                  `Lấy lúc bấm ${verb.vi}`,
                  `Taken when you press ${verb.en}`,
                  `${verb.ko} 버튼을 누른 시점`,
                ),
              )
            : t(message(`Ngày ${dmy(signedDate)}`, dmy(signedDate), dmy(signedDate)))}
        </span>
        <span className="text-accent-foreground text-[12px]">
          {t(message('Đổi', 'Change', '변경'))}
        </span>
        <Icon
          icon={ChevronDown}
          size={16}
          className={cn('text-muted-foreground', changing && 'rotate-180')}
        />
      </button>
      {changing && (
        <Field
          label={dayLabel}
          hint={
            signedDate !== ''
              ? t(
                  message(
                    `Ngày ${dmy(signedDate)}. Sửa nếu ký ngày khác.`,
                    `${dmy(signedDate)}. Change it if it was signed on another day.`,
                    `${dmy(signedDate)}. 다른 날 체결했다면 수정하세요.`,
                  ),
                )
              : t(
                  message(
                    `Bỏ trống là lấy lúc bấm ${verb.vi}.`,
                    `Leave empty to use the moment you press ${verb.en}.`,
                    `비워 두면 ${verb.ko} 버튼을 누른 시점으로 기록됩니다.`,
                  ),
                )
          }
        >
          <Input
            type="date"
            aria-label={dayLabel}
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
  const { t } = useI18n()
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
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <Button
          size="md"
          className="pointer-coarse:h-12"
          disabled={busy || !canSend}
          onClick={onSend}
        >
          <Icon icon={PenLine} size={16} />
          {direct
            ? busy
              ? t(message('Đang ký…', 'Signing…', '체결 중…'))
              : t(message('Ký hợp đồng', 'Sign contract', '계약 체결'))
            : busy
              ? t(message('Đang gửi…', 'Sending…', '전송 중…'))
              : t(message('Gửi đề nghị ký', 'Send sign proposal', '체결 제안 보내기'))}
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
  const { number, currency: formatMoney, t } = useI18n()
  const code = currency === '' ? null : currency
  const symbol = CURRENCIES.find((c) => c.code === code)?.symbol ?? ''
  const options = [
    ...(code === null
      ? [{ value: '', label: t(message('Chọn đồng tiền…', 'Choose a currency…', '통화 선택…')) }]
      : []),
    ...CURRENCIES.map((c) => ({ value: c.code as string, label: t(CURRENCY_LABEL[c.code]) })),
  ]
  const amountLabel = t(message('Số tiền ký', 'Contract amount', '계약 금액'))
  const currencyLabel = t(message('Đồng tiền', 'Currency', '통화'))

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field
        label={amountLabel}
        required
        hint={
          again
            ? t(
                message(
                  'Số của riêng hợp đồng này.',
                  'The figure of this contract alone.',
                  '이 계약만의 금액입니다.',
                ),
              )
            : t(
                message(
                  'Lấy sẵn từ giá trị dự kiến, sửa nếu khác.',
                  'Prefilled from the expected value; change it if different.',
                  '예상 금액으로 미리 입력되어 있습니다. 다르면 수정하세요.',
                ),
              )
        }
      >
        <span className="relative flex items-center">
          <Input
            inputMode="numeric"
            aria-label={amountLabel}
            className="tnum font-num pointer-coarse:h-12 pr-8"
            value={amount === null ? '' : number(amount)}
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

      <Field label={currencyLabel} required plain>
        <Select
          label={currencyLabel}
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
            ? `${formatMoney(amount, 'VND')} · ${billions(amount)}`
            : `${formatMoney(amount, code)} · ${billions(toMoneyVnd(amount, code))} ${t(message('quy ra đồng', 'converted to VND', 'VND 환산'))}`}
        </span>
      )}
    </section>
  )
}

/** The warning (the point of the panel: the sign door has no way back) and the
 *  deal's own facts for reference. */
export function SignNotice({ op, direct }: { op: OpportunityProfileResponse; direct: boolean }) {
  const { t } = useI18n()
  return (
    <>
      <div className="bg-surface-ink/5 flex items-start gap-3 rounded-md p-4">
        <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
        <p className="text-[11.5px] leading-[1.5]">
          {direct
            ? t(
                message(
                  'Hợp đồng được tạo ngay khi bấm ký, không qua Hộp duyệt, và không gỡ được.',
                  'The contract is created the moment you press Sign, without the Approvals inbox, and cannot be undone.',
                  '서명을 누르는 즉시 승인함을 거치지 않고 계약이 생성되며, 되돌릴 수 없습니다.',
                ),
              )
            : t(
                message(
                  'Đề nghị đi qua Hộp duyệt. Hợp đồng chỉ được tạo khi được duyệt, và không gỡ được.',
                  'The proposal goes through the Approvals inbox. The contract is created only once approved, and cannot be undone.',
                  '제안은 승인함을 거칩니다. 승인되어야 계약이 생성되며, 되돌릴 수 없습니다.',
                ),
              )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MetaPill>{op.name}</MetaPill>
        {op.amount !== null && op.currency !== null && (
          <MetaPill className="tnum font-num">
            {t(message('đơn đang ghi', 'deal recorded at', '기회 금액'))}{' '}
            {billions(toMoneyVnd(op.amount, op.currency))}
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
