import { useEffect, useMemo, useState } from 'react'
import { Chip, Drawer, Select } from '@pv/ui'
import {
  ContractSign,
  isSellerRole,
  type ContractKind,
  type CurrencyCode,
  type InstallmentDraft,
  type OpportunityMoneyNegotiation,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { useDirectory, useSalesPeople } from '@/data/directory'
import { localDay } from '@/data/local-day'
import { useSignContract } from '@/data/opportunities-write'
import { useContractKindLabel, useContractKindOptions } from '@/data/sales-config'
import { ContractKindField } from '@/components/contract-kind-field'
import { NO_AMOUNT, compactMoney, kindLabel } from '@/components/deal-money/money'
import { ScheduleEditor } from '@/components/deal-pay'
import { scheduleIssue, scheduleSummary } from '@/components/deal-pay/schedule-math'
import { Field } from './ops-fields'
import { SignAmount, SignFooter, SignNotice, SignWhenWho } from './sign-drawer-parts'

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
  /** The closer: the signed-in seller, else the row's `holder`; `''` = no override is sent. */
  ownerId: string
  /** The pending quotation round this signature wins; `''` = none picked. */
  quotationId: string
  /** The payment schedule proposed with the signature; empty = none. */
  installments: InstallmentDraft[]
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
function waitingOptions(op: OpportunityProfileResponse, resolveKind: (code: string) => string) {
  return op.money.open.flatMap((n: OpportunityMoneyNegotiation) => {
    if (n.pendingId === null) return []
    const round = n.rounds.find((r) => r.id === n.pendingId)
    /* Short parts first: the box truncates from the right, so it cuts the name. */
    const parts = [
      round && `Lần ${round.roundNo}`,
      n.amount === null ? NO_AMOUNT : compactMoney(n.amount, n.currency),
      kindLabel(n.kind, resolveKind),
    ]
    return [{ value: n.pendingId, label: parts.filter(Boolean).join(' · ') }]
  })
}

/** Picking a round lends its kind, value and currency; all stay editable. */
function lend(form: SignForm, op: OpportunityProfileResponse, pendingId: string): SignForm {
  const round = op.money.open.find((n) => n.pendingId === pendingId)
  return {
    ...form,
    quotationId: pendingId,
    ...(round && {
      kind: round.kind ?? form.kind,
      amount: round.amount ?? form.amount,
      currency: round.currency ?? form.currency,
    }),
  }
}

type Props = {
  op: OpportunityProfileResponse
  open: boolean
  onClose: () => void
  /** The waiting round to sign on, when the press came from its card. */
  quotationId?: string | undefined
}

export function SignDrawer({ op, open, onClose, quotationId }: Props) {
  const salesPeople = useSalesPeople()
  const directory = useDirectory()
  const resolveKind = useContractKindLabel()
  const sign = useSignContract(op.code)
  const direct = op.signsDirect
  const again = op.state === 'won'
  /* Primitives, not the actor: a renewed ticket hands over a new object, and
     that must not reseed a form someone is typing into. */
  const meId = useSession((s) => s.actor?.id)
  const meSells = useSession((s) => isSellerRole(s.actor?.roleIds))

  /* `op` keeps its reference between react-query renders, so the seed does too
     and the effect below never reseeds over a box being typed into. */
  const seed = useMemo<SignForm>(
    () => ({
      kind: '',
      amount: again ? null : op.amount,
      currency: op.currency ?? '',
      signedDate: localDay(new Date()),
      ownerId: (meSells && meId) || (op.holder?.id ?? ''),
      quotationId: '',
      installments: [],
    }),
    [op, again, meId, meSells],
  )

  const [form, setForm] = useState<SignForm>(seed)

  /* Every open is a fresh start: on a door with no undo, a half-edited figure
     left over from the last open is the costliest kind of mistake. */
  useEffect(() => {
    if (!open) return
    setForm(quotationId ? lend(seed, op, quotationId) : seed)
  }, [open, seed, op, quotationId])

  /* Only sellers may close; the current value stays so the select never shows blank. */
  const people = [
    ...salesPeople.filter((a) => isSellerRole(a.roleIds)),
    ...directory.filter((a) => a.id === form.ownerId && !isSellerRole(a.roleIds)),
  ]

  const set = <K extends keyof SignForm>(key: K, value: SignForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const body = bodyOf(form)
  const check = body ? ContractSign.safeParse(body) : null
  const blocked = check !== null && !check.success
  const waiting = waitingOptions(op, resolveKind)
  const noKind = useContractKindOptions(form.kind).length === 0
  const pick = (pendingId: string) => setForm((f) => lend(f, op, pendingId))
  const currency = form.currency === '' ? null : form.currency
  /* Sums that do not add up are said by the editor's own line, so the footer
     keeps to a row's fault and never repeats the balance. */
  const unbalanced =
    form.installments.length > 0 &&
    !scheduleSummary(form.installments, form.amount, currency).balanced
  const issue = blocked && !unbalanced ? scheduleIssue(check.error) : ''
  const busy = sign.isPending
  const note = sign.error
    ? userMessage(sign.error)
    : busy
      ? direct
        ? 'Đang ký…'
        : 'Đang gửi đề nghị ký…'
      : blocked
        ? issue
        : body
          ? direct
            ? 'Ký xong là có hợp đồng.'
            : 'Gửi xong, đề nghị chờ duyệt.'
          : noKind
            ? ''
            : 'Chọn loại hợp đồng, nhập số tiền và đồng tiền.'

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
        <SignFooter
          note={note}
          failed={sign.error !== null}
          busy={busy}
          canSend={body !== null && !blocked}
          direct={direct}
          onClose={onClose}
          onSend={() => {
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
        />
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

        <ContractKindField value={form.kind} onChange={(v) => set('kind', v)} />

        <SignAmount
          amount={form.amount}
          currency={form.currency}
          again={again}
          onAmount={(next) => set('amount', next)}
          onCurrency={(next) => set('currency', next)}
        />

        <Field label="Lịch thanh toán" plain>
          <ScheduleEditor
            amount={form.amount}
            currency={currency}
            value={form.installments}
            onChange={(next) => set('installments', next)}
          />
        </Field>

        <SignWhenWho
          signedDate={form.signedDate}
          ownerId={form.ownerId}
          people={people}
          direct={direct}
          onDate={(day) => set('signedDate', day)}
          onOwner={(id) => set('ownerId', id)}
        />

        <SignNotice op={op} direct={direct} />
      </div>
    </Drawer>
  )
}
