import { useEffect, useMemo, useState } from 'react'
import { PenLine, TriangleAlert, X } from '@pv/ui'
import { Button, Chip, Drawer, Icon, Input, MetaPill, Select, billions, cn, vnd } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  CURRENCIES,
  ContractKind,
  ContractSign,
  toMoneyVnd,
  type CurrencyCode,
  type InstallmentDraft,
  type OpportunityMoneyNegotiation,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { peopleIdOptions, useSalesPeople } from '@/data/directory'
import { useSignContract } from '@/data/opportunities-write'
import { NO_AMOUNT, compactMoney, kindLabel } from '@/components/deal-money/money'
import { ScheduleEditor } from '@/components/deal-pay'
import { scheduleIssue, scheduleSummary } from '@/components/deal-pay/schedule-math'
import { Field } from './ops-fields'
import { dmy } from '@/lib/date'

/** A request to sign a contract on a deal — a panel over the deal's profile.
 *
 *  Every request names its own kind, amount and currency (ADR 0069 §5): a won
 *  deal may sign again (licence beside deployment), so the deal's own value
 *  cannot stand in for the paper's. Its stored estimate is never changed by
 *  signing; the profile shows the signed sum beside it (ADR 0077 §1). The
 *  first sign prefills amount and currency from the deal; signing again takes
 *  only the currency, because copying the first paper's figure is how a second
 *  contract gets the wrong number. Kind always starts empty — nobody's default.
 *
 *  A drawer rather than a screen: whoever presses is half way through reading
 *  the deal the figures come from. It never paints "signed" itself — the answer
 *  is a 202 receipt, and the profile's `pendingSign` locks the button until an
 *  approver decides through E3. */

type SignForm = {
  kind: ContractKind | ''
  amount: number | null
  currency: CurrencyCode | ''
  /** `YYYY-MM-DD`, as `<input type="date">` reads. */
  signedDate: string
  /** Seeded from the row's `holder`; `''` = no override is sent. */
  ownerId: string
  /** The pending quotation round this signature wins; `''` = none picked. */
  quotationId: string
  /** The payment schedule proposed with the signature; empty = none. */
  installments: InstallmentDraft[]
}

/** Today on the USER'S calendar — slicing `toISOString()` is a day off for
 *  anybody pressing after 17:00 in Hanoi. */
function localDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** `YYYY-MM-DD` → the `Moment` the contract wants. Today sends the real
 *  instant; any other day sends local noon, the one hour that reads as the
 *  same calendar day in every zone from UTC-11 to UTC+12. */
function signedAtOf(day: string): string {
  const now = new Date()
  if (day === localDay(now)) return now.toISOString()
  const [y = '', m = '', d = ''] = day.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0).toISOString()
}

/** Form → body, or `null` while a required box is empty. Optional boxes left
 *  empty are ABSENT, never `null`. */
function bodyOf(form: SignForm): ContractSign | null {
  const { kind, amount, currency } = form
  if (kind === '' || currency === '' || amount === null || amount <= 0) return null
  return {
    kind,
    amount,
    currency,
    ...(form.signedDate === '' ? {} : { signedAt: signedAtOf(form.signedDate) }),
    ...(form.ownerId === '' ? {} : { ownerId: form.ownerId }),
    ...(form.quotationId === '' ? {} : { quotationId: form.quotationId }),
    ...(form.installments.length === 0 ? {} : { installments: form.installments }),
  }
}

const NO_QUOTATION = { value: '', label: 'Không gắn báo giá' }

/** One option per negotiation still waiting for the customer. */
function waitingOptions(op: OpportunityProfileResponse) {
  return op.money.open.flatMap((n: OpportunityMoneyNegotiation) => {
    if (n.pendingId === null) return []
    const round = n.rounds.find((r) => r.id === n.pendingId)
    const parts = [
      kindLabel(n.kind),
      n.amount === null ? NO_AMOUNT : compactMoney(n.amount, n.currency),
      round && `lần ${round.roundNo}`,
    ]
    return [{ value: n.pendingId, label: parts.filter(Boolean).join(' · ') }]
  })
}

const KIND_OPTIONS = [
  { value: '', label: 'Chọn loại hợp đồng…' },
  ...ContractKind.options.map((k) => ({ value: k, label: CONTRACT_KIND_LABEL[k] })),
]

type Props = {
  op: OpportunityProfileResponse
  open: boolean
  onClose: () => void
}

export function SignDrawer({ op, open, onClose }: Props) {
  const people = useSalesPeople()
  const sign = useSignContract(op.code)
  const direct = op.signsDirect
  const again = op.state === 'won'

  /* `op` keeps its reference between react-query renders, so the seed does too
     and the effect below never reseeds over a box being typed into. */
  const seed = useMemo<SignForm>(
    () => ({
      kind: '',
      amount: again ? null : op.amount,
      currency: op.currency ?? '',
      signedDate: localDay(new Date()),
      ownerId: op.holder?.id ?? '',
      quotationId: '',
      installments: [],
    }),
    [op, again],
  )

  const [form, setForm] = useState<SignForm>(seed)

  /* Every open is a fresh start: on a door with no undo, a half-edited figure
     left over from the last open is the costliest kind of mistake. */
  useEffect(() => {
    if (open) setForm(seed)
  }, [open, seed])

  const set = <K extends keyof SignForm>(key: K, value: SignForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const body = bodyOf(form)
  const check = body ? ContractSign.safeParse(body) : null
  const blocked = check !== null && !check.success
  const waiting = waitingOptions(op)
  /* Picking a round lends its kind, value and currency; all stay editable. */
  const pick = (pendingId: string) => {
    const round = op.money.open.find((n) => n.pendingId === pendingId)
    setForm((f) => ({
      ...f,
      quotationId: pendingId,
      ...(round && {
        kind: round.kind ?? f.kind,
        amount: round.amount ?? f.amount,
        currency: round.currency ?? f.currency,
      }),
    }))
  }
  const currency = form.currency === '' ? null : form.currency
  /* Sums that do not add up are said by the editor's own line, so the footer
     keeps to a row's fault and never repeats the balance. */
  const unbalanced =
    form.installments.length > 0 &&
    !scheduleSummary(form.installments, form.amount, currency).balanced
  const issue = blocked && !unbalanced ? scheduleIssue(check.error) : ''
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''
  const owner = people.find((a) => a.id === form.ownerId)
  const busy = sign.isPending
  const currencyOptions = [
    ...(currency === null ? [{ value: '', label: 'Chọn đồng tiền…' }] : []),
    ...CURRENCIES.map((c) => ({ value: c.code as string, label: c.label })),
  ]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={again ? 'Ký thêm hợp đồng' : direct ? 'Ký hợp đồng' : 'Đề nghị ký'}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}.{' '}
          {direct
            ? 'Bấm ký là hợp đồng được tạo ngay.'
            : again
              ? 'Một hợp đồng mới bên cạnh hợp đồng đã ký, được duyệt thì cộng vào giá trị đơn.'
              : 'Được duyệt thì đơn thành hợp đồng.'}
        </>
      }
      meta={<Chip>{op.code}</Chip>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* `min-w-0 flex-1`: at its natural width the sentence pushes the
              buttons onto a second row. */}
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              sign.error ? 'text-destructive-foreground' : 'text-foreground',
            )}
            aria-live="polite"
          >
            {sign.error
              ? userMessage(sign.error)
              : busy
                ? direct
                  ? 'Đang ký…'
                  : 'Đang gửi đề nghị ký…'
                : blocked
                  ? issue
                  : body
                    ? direct
                      ? 'Ký xong là hợp đồng được tạo, không gỡ được.'
                      : 'Gửi xong, đề nghị chờ duyệt.'
                    : 'Chọn loại hợp đồng, nhập số tiền và đồng tiền.'}
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
              disabled={busy || body === null || blocked}
              onClick={() => {
                if (!body) return
                sign.mutate(body, {
                  onSuccess: (answer) => {
                    toastDone(
                      'contractCode' in answer
                        ? `Đã ký hợp đồng ${answer.contractCode}.`
                        : 'Đã gửi đề nghị ký, chờ duyệt.',
                    )
                    onClose()
                  },
                })
              }}
            >
              <Icon icon={PenLine} size={16} />
              {direct ? (busy ? 'Đang ký…' : 'Ký hợp đồng') : busy ? 'Đang gửi…' : 'Gửi đề nghị ký'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {waiting.length > 0 && (
          <Field label="Báo giá được ký" plain>
            <Select
              label="Báo giá được ký"
              hideLabel
              size="lg"
              value={form.quotationId}
              neutralValue=""
              onChange={pick}
              options={[NO_QUOTATION, ...waiting]}
              className="w-full"
            />
          </Field>
        )}

        <Field label="Loại hợp đồng" required plain>
          <Select
            label="Loại hợp đồng"
            hideLabel
            size="lg"
            value={form.kind}
            onChange={(v) => set('kind', v as ContractKind | '')}
            options={KIND_OPTIONS}
            className="w-full"
          />
        </Field>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Số tiền ký"
            required
            hint={
              again ? 'Số của riêng hợp đồng này.' : 'Lấy sẵn từ giá trị dự kiến, sửa nếu khác.'
            }
          >
            <span className="relative flex items-center">
              <Input
                inputMode="numeric"
                aria-label="Số tiền ký"
                className="tnum font-num pointer-coarse:h-12 pr-8"
                value={form.amount === null ? '' : form.amount.toLocaleString('vi-VN')}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '')
                  set('amount', digits === '' ? null : Number(digits))
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
              value={form.currency}
              neutralValue={form.currency}
              onChange={(v) => set('currency', v as CurrencyCode | '')}
              options={currencyOptions}
              className="w-full"
            />
          </Field>

          {form.amount !== null && form.amount > 0 && currency !== null && (
            <span className="text-muted-foreground text-[11.5px] leading-[1.5] sm:col-span-2">
              {currency === 'VND'
                ? `${vnd(form.amount)} · ${billions(form.amount)}`
                : `${form.amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toMoneyVnd(form.amount, currency))} quy ra đồng`}
            </span>
          )}
        </section>

        <Field label="Lịch thanh toán" plain>
          <ScheduleEditor
            amount={form.amount}
            currency={currency}
            value={form.installments}
            onChange={(next) => set('installments', next)}
          />
        </Field>

        <Field
          label="Ngày ký"
          hint={
            form.signedDate !== ''
              ? `Ngày ${dmy(form.signedDate)}. Sửa nếu ký ngày khác.`
              : 'Bỏ trống là lấy lúc bấm gửi.'
          }
        >
          <Input
            type="date"
            aria-label="Ngày ký"
            className="pointer-coarse:h-12"
            value={form.signedDate}
            onChange={(e) => set('signedDate', e.target.value)}
          />
        </Field>

        <Field
          label="Hoa hồng về"
          plain
          hint="Mặc định là Sale đang giữ đơn. Đổi ở đây chỉ đổi người nhận hoa hồng."
        >
          <Select
            label="Hoa hồng về"
            hideLabel
            size="lg"
            value={form.ownerId}
            neutralValue={form.ownerId}
            onChange={(v) => set('ownerId', v)}
            options={peopleIdOptions(people)}
            className="w-full"
          />
        </Field>

        {/* The warning is the point of this panel, not decoration: the sign
            door has no way back. */}
        <div className="bg-surface-ink/5 flex items-start gap-3 rounded-md p-4">
          <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
          <p className="text-[11.5px] leading-[1.5]">
            {direct
              ? 'Hợp đồng được tạo ngay khi bấm ký, không qua Hộp duyệt, và không gỡ được.'
              : 'Đề nghị đi qua Hộp duyệt. Hợp đồng chỉ được tạo khi được duyệt, và không gỡ được.'}
            {owner && (
              <>
                {' '}
                Hoa hồng ghi cho <span className="font-semibold">{owner.name}</span>.
              </>
            )}
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
      </div>
    </Drawer>
  )
}
