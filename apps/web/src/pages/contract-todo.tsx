import { Skeleton, cn, vnd } from '@pv/ui'
import {
  CONTRACT_RUNG_LABEL,
  type JourneyContract,
  type JourneyContractRung,
  type JourneyRungState,
} from '@pv/contracts'
import { needsAttention } from '@pv/engines'
import { dm, dmy } from '@/lib/date'
import { daysPhrase, type Installment, type InstallmentView } from '@/data/contracts'
import type { RunRead } from '@/components/contract-run'
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

const rungOf = (rung: JourneyContractRung): TodoRung => ({
  key: rung.key,
  label: CONTRACT_RUNG_LABEL[rung.key],
  mark: MARK[rung.state],
  caption:
    rung.state === 'skipped'
      ? 'bỏ qua'
      : rung.state === 'current' && rung.days !== null
        ? `đã ${rung.days} ngày`
        : rung.at && dm(rung.at),
})

/* Both muted: neither is something the reader can act on. */
const NO_RUNGS: Partial<Record<RunRead, string>> = {
  denied: 'Vai của bạn không có quyền xem hành trình của hợp đồng này.',
  unread: 'Không đọc được các bậc của hợp đồng từ lượt của nó.',
}

export function ContractTodo({
  inside,
  read,
  next,
}: {
  /** The contract as the run's journey reads it; `null` until `read` is `ready`. */
  inside: JourneyContract | null
  read: RunRead
  next: InstallmentView<Installment> | undefined
}) {
  const note = NO_RUNGS[read]
  return (
    <TodoCard
      rungs={inside?.rungs.map(rungOf) ?? []}
      rungsLabel="Các bậc của hợp đồng"
      next={
        (read === 'pending' || note || next) && (
          <div className="flex flex-col gap-3">
            {read === 'pending' && <Skeleton height={56} />}
            {note && (
              <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">{note}</p>
            )}
            {next && <NextInstallment view={next} />}
          </div>
        )
      }
    />
  )
}

function NextInstallment({ view }: { view: InstallmentView<Installment> }) {
  const { installment } = view
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[12px] leading-[1.5]">Đợt thu sắp tới</span>
      <span className="tnum text-[14px] font-semibold leading-[1.5]">
        Đợt {installment.no} · {vnd(installment.amount)}
      </span>
      <span
        className={cn(
          'tnum text-[12px] leading-[1.5]',
          needsAttention(view.level) ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        Hạn {dmy(installment.due)} · {daysPhrase(view.daysLeft)}
      </span>
    </div>
  )
}
