import { useEffect, useMemo, useState } from 'react'
import { PenLine, TriangleAlert, X } from '@pv/ui'
import { Button, Chip, Drawer, Icon, Input, MetaPill, Select, billions, cn, vnd } from '@pv/ui'
import {
  CONTRACT_KIND_LABEL,
  CURRENCIES,
  ContractKind,
  toMoneyVnd,
  type ContractSign,
  type CurrencyCode,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { peopleIdOptions, useSalesPeople } from '@/data/directory'
import { useSignContract } from '@/data/opportunities-write'
import { Field } from './ops-fields'
import { dmy } from '@/lib/date'

/** A request to sign a contract on a deal — a panel over the deal's profile.
 *
 *  Every request names its own kind, amount and currency (ADR 0069 §5): a won
 *  deal may sign again (licence beside deployment), so the deal's own value
 *  cannot stand in for the paper's, and it is never changed by signing. The
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
  }
}

const KIND_OPTIONS = [
  { value: '', label: 'Chọn loại hợp đồng…' },
  ...ContractKind.options.map((k) => ({ value: k, label: CONTRACT_KIND_LABEL[k] })),
]

type Props = {
  op: OpportunityRow
  open: boolean
  onClose: () => void
}

export function SignDrawer({ op, open, onClose }: Props) {
  const people = useSalesPeople()
  const sign = useSignContract(op.code)
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
  const currency = form.currency === '' ? null : form.currency
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
      title={again ? 'Ký thêm hợp đồng' : 'Đề nghị ký'}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account} —{' '}
          {again
            ? 'một hợp đồng mới bên cạnh hợp đồng đã ký; giá trị cơ hội giữ nguyên.'
            : 'được duyệt thì đơn rời năm cột và thành hợp đồng.'}
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
                ? 'Đang gửi đề nghị ký…'
                : body
                  ? 'Gửi xong là một đề nghị chờ duyệt. Hợp đồng và số hợp đồng chỉ có khi người duyệt gật.'
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
              disabled={busy || body === null}
              onClick={() => {
                if (!body) return
                sign.mutate(body, {
                  onSuccess: () => {
                    toastDone('Đã gửi đề nghị ký, chờ duyệt.')
                    onClose()
                  },
                })
              }}
            >
              <Icon icon={PenLine} size={16} />
              {busy ? 'Đang gửi…' : 'Gửi đề nghị ký'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
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
              again
                ? 'Số của riêng hợp đồng này. Giá trị cơ hội không đổi, không cộng dồn.'
                : 'Mồi bằng giá trị đơn. Số chốt thường không phải số đã chào — sửa ở đây, đơn giữ nguyên số cũ.'
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

        <Field
          label="Ngày ký"
          hint={
            form.signedDate !== ''
              ? `Đọc là ${dmy(form.signedDate)}. Giấy tờ hay vào sổ sau khi bút đã ký — lùi lại đúng ngày đó.`
              : 'Bỏ trống thì lấy đúng lúc bấm.'
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
          hint="Mồi bằng Sale đang giữ đơn. Phần chốt của hoa hồng ghi cho đúng một người — đổi ở đây không đổi ai đứng đơn."
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
            Đề nghị này đi qua Hộp duyệt; được gật thì hợp đồng mới được tạo, và từ đó không gỡ được
            từ giao diện.
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
