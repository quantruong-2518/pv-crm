import { useEffect, useMemo, useState } from 'react'
import { Chip, Drawer, Select } from '@pv/ui'
import {
  ContractSign,
  type ContractKind,
  type CurrencyCode,
  type InstallmentDraft,
  type OpportunityMoneyNegotiation,
  type OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useI18n, type Message } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { collectorNote, useCollectorCandidates } from '@/data/contract-collector'
import { localDay } from '@/data/local-day'
import { useSignContract } from '@/data/opportunities-write'
import { useContractKindLabel, useContractKindOptions } from '@/data/sales-config'
import { ContractKindField } from '@/components/contract-kind-field'
import { NO_AMOUNT_COPY, compactMoney, kindLabel } from '@/components/deal-money/money'
import { ScheduleEditor } from '@/components/deal-pay'
import { scheduleIssue, scheduleSummary } from '@/components/deal-pay/schedule-math'
import { Field } from './ops-fields'
import { SIGN_COPY } from './sign-drawer-copy'
import { SignAmount, SignCollector, SignFooter, SignNotice, SignDay } from './sign-drawer-parts'

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
  /** The payment PIC the reader picked; `''` = not picked yet, and the press stays shut. */
  collectorId: string
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
 *  empty are ABSENT, never `null`. The collector is added by the caller, so the
 *  footer can tell "the rest is filled" from "the collector is missing". */
function bodyOf(form: SignForm): Omit<ContractSign, 'collectorId'> | null {
  const { kind, amount, currency } = form
  if (kind === '' || currency === '' || amount === null || amount <= 0) return null
  return {
    kind,
    amount,
    currency,
    ...(form.signedDate === '' ? {} : { signedAt: signedAtOf(form.signedDate) }),
    ...(form.quotationId === '' ? {} : { quotationId: form.quotationId }),
    ...(form.installments.length === 0 ? {} : { installments: form.installments }),
  }
}

/** One option per negotiation still waiting for the customer. */
function waitingOptions(
  op: OpportunityProfileResponse,
  resolveKind: (code: string) => string,
  t: (copy: Message) => string,
) {
  return op.money.open.flatMap((n: OpportunityMoneyNegotiation) => {
    if (n.pendingId === null) return []
    const round = n.rounds.find((r) => r.id === n.pendingId)
    /* Short parts first: the box truncates from the right, so it cuts the name. */
    const parts = [
      round && t(SIGN_COPY.round(round.roundNo)),
      n.amount === null ? t(NO_AMOUNT_COPY) : compactMoney(n.amount, n.currency),
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

/** What the footer says while nothing is under way: the press, or what is missing. */
function idleNote(
  direct: boolean,
  ready: boolean,
  noKind: boolean,
  restFilled: boolean,
  collector: string,
  t: (copy: Message) => string,
): string {
  if (ready) return direct ? '' : t(SIGN_COPY.sendDone)
  if (restFilled || collector !== '') return collector
  return noKind ? '' : t(SIGN_COPY.fillIn)
}

type Props = {
  op: OpportunityProfileResponse
  open: boolean
  onClose: () => void
  /** The waiting round to sign on, when the press came from its card. */
  quotationId?: string | undefined
}

export function SignDrawer({ op, open, onClose, quotationId }: Props) {
  const { t } = useI18n()
  const resolveKind = useContractKindLabel()
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
      collectorId: '',
      quotationId: '',
      installments: [],
    }),
    [op, again],
  )

  const [form, setForm] = useState<SignForm>(seed)

  /* Every open is a fresh start: on a door with no undo, a half-edited figure
     left over from the last open is the costliest kind of mistake. */
  useEffect(() => {
    if (!open) return
    setForm(quotationId ? lend(seed, op, quotationId) : seed)
  }, [open, seed, op, quotationId])

  const set = <K extends keyof SignForm>(key: K, value: SignForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const collectors = useCollectorCandidates(open)
  const base = bodyOf(form)
  const body = base && form.collectorId !== '' ? { ...base, collectorId: form.collectorId } : null
  const check = body ? ContractSign.safeParse(body) : null
  const blocked = check !== null && !check.success
  const waiting = waitingOptions(op, resolveKind, t)
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
  const collectorFault = collectorNote(collectors.isError, collectors.data, base !== null)
  const note = sign.error
    ? userMessage(sign.error)
    : busy
      ? t(direct ? SIGN_COPY.signing : SIGN_COPY.sending)
      : blocked
        ? issue
        : idleNote(direct, body !== null, noKind, base !== null, collectorFault, t)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t(
        again ? SIGN_COPY.titleAgain : direct ? SIGN_COPY.titleDirect : SIGN_COPY.titleProposal,
      )}
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
          {!direct && t(again ? SIGN_COPY.subtitleAgain : SIGN_COPY.subtitleProposal)}
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
                  t(
                    'contractCode' in answer
                      ? SIGN_COPY.signed(answer.contractCode)
                      : SIGN_COPY.proposalSent,
                  ),
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
          <Field label={t(SIGN_COPY.quotationToSign)} plain>
            <Select
              label={t(SIGN_COPY.quotationToSign)}
              hideLabel
              size="lg"
              value={form.quotationId}
              neutralValue=""
              onChange={pick}
              options={[{ value: '', label: t(SIGN_COPY.noQuotation) }, ...waiting]}
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

        <Field label={t(SIGN_COPY.paymentSchedule)} plain>
          <ScheduleEditor
            amount={form.amount}
            currency={currency}
            value={form.installments}
            onChange={(next) => set('installments', next)}
          />
        </Field>

        <SignCollector
          value={form.collectorId}
          candidates={collectors.data}
          onChange={(id) => set('collectorId', id)}
        />

        <SignDay
          signedDate={form.signedDate}
          direct={direct}
          onDate={(day) => set('signedDate', day)}
        />

        <SignNotice op={op} direct={direct} />
      </div>
    </Drawer>
  )
}
