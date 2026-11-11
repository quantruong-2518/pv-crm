import { Skeleton, cn } from '@pv/ui'
import {
  type CurrencyCode,
  type JourneyContract,
  type JourneyContractRung,
  type JourneyRungState,
} from '@pv/contracts'
import { needsAttention } from '@pv/engines'
import { formatDate, useI18n, type Lang, type Message } from '@/app/i18n'
import {
  CONTRACT_DETAIL_COPY as COPY,
  contractRungText,
  elapsedDaysText,
  installmentNoText,
  paymentDueText,
} from '@/data/contract-detail-copy'
import { type Installment, type InstallmentView } from '@/data/contracts'
import type { RunRead } from '@/components/contract-run'
import { FxLine } from '@/components/fx-line'
import { TodoCard, type RungMark, type TodoRung } from '@/components/record/todo-card'

/** The contract's todo card (ADR 0078 §1): its rungs off the run's journey —
 *  the contract row carries none, and a kind that skips a rung gets it as
 *  `skipped` from the server — then the next installment due.
 *
 *  No next step (contracts take none, ADR 0075) and no primary button: the
 *  per-rung actions are not decided (ADR 0078, Open). */

const MARK: Record<JourneyRungState, RungMark> = {
  done: 'done',
  current: 'current',
  skipped: 'skipped',
  upcoming: 'future',
  stopped: 'stopped',
}

const rungOf = (rung: JourneyContractRung, lang: Lang): TodoRung => ({
  key: rung.key,
  label: contractRungText(rung.key, lang),
  mark: MARK[rung.state],
  caption:
    rung.state === 'skipped'
      ? COPY.skipped[lang]
      : rung.state === 'current' && rung.days !== null
        ? elapsedDaysText(rung.days, lang)
        : rung.at && formatDate(rung.at, lang, { day: '2-digit', month: '2-digit' }),
})

/* Both muted: neither is something the reader can act on. */
const NO_RUNGS: Partial<Record<RunRead, Message>> = {
  denied: COPY.runDenied,
  unread: COPY.runUnread,
}

export function ContractTodo({
  inside,
  read,
  next,
  currency,
}: {
  /** The contract as the run's journey reads it; `null` until `read` is `ready`. */
  inside: JourneyContract | null
  read: RunRead
  next: InstallmentView<Installment> | undefined
  /** The contract's own currency; the installment's figure is in it, not in dong. */
  currency: CurrencyCode | null
}) {
  const { lang, t } = useI18n()
  const note = NO_RUNGS[read]
  return (
    <TodoCard
      rungs={inside?.rungs.map((rung) => rungOf(rung, lang)) ?? []}
      rungsLabel={t(COPY.rungs)}
      next={
        (read === 'pending' || note || next) && (
          <div className="flex flex-col gap-3">
            {read === 'pending' && <Skeleton height={56} />}
            {note && (
              <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">{t(note)}</p>
            )}
            {next && <NextInstallment view={next} code={currency} />}
          </div>
        )
      }
    />
  )
}

function NextInstallment({
  view,
  code,
}: {
  view: InstallmentView<Installment>
  code: CurrencyCode | null
}) {
  const { lang, t, currency } = useI18n()
  const { installment } = view
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[12px] leading-[1.5]">{t(COPY.nextPayment)}</span>
      <span className="tnum text-[14px] font-semibold leading-[1.5]">
        {installmentNoText(installment.no, lang)} · {currency(installment.amount, code ?? 'VND')}
      </span>
      {installment.amountVnd !== null && (
        <FxLine vnd={installment.amountVnd} fx={installment.fx} className="text-left" />
      )}
      <span
        className={cn(
          'tnum text-[12px] leading-[1.5]',
          needsAttention(view.level) ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {paymentDueText(installment.due, view.daysLeft, lang)}
      </span>
    </div>
  )
}
