import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AiAction,
  AppShell,
  Chip,
  ChevronRight,
  FileCheck,
  GlassCard,
  Icon,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Skeleton,
  StatCard,
  StatusDot,
  billions,
  cn,
  dong,
  millions,
} from '@pv/ui'
import { daysUntil, needsAttention } from '@pv/engines'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { toast } from '@/app/toast'
import { dm, dmy } from '@/lib/date'
import {
  contractDetailQuery,
  daysPhrase,
  today,
  viewInstallment,
  type Contract,
  type Installment,
  type InstallmentView,
} from '@/data/contracts'
import { ConditionBar, DueBadge, MoneySplit } from '@/components/contract-bits'

/** Level 1 of the drill — one contract: the headline numbers, the shape of the
 *  money, and the four installments as doors into level 2.
 *
 *  What this screen deliberately does NOT draw is a two-rail timeline of money
 *  against obligations. That drawing was built and thrown away: it encoded the
 *  same facts this list carries, but it made the reader decode a graph first.
 *  The obligations did not disappear — they live inside each installment as its
 *  unlock checklist, which is also how the contract itself words them. */

function moneyOf(contract: Contract, now: string) {
  const collected = contract.installments.filter((d) => d.paidAt).reduce((n, d) => n + d.amount, 0)
  const overdue = contract.installments
    .filter((d) => !d.paidAt && daysUntil(d.due, now) <= 0)
    .reduce((n, d) => n + d.amount, 0)
  /* `amount` is nullable on the wire — a contract can be signed before anyone
     has typed the number. Zero keeps the bar drawable; the tile above prints
     the null as it is. */
  return { collected, overdue, remaining: (contract.amount ?? 0) - collected }
}

/** Bars in installment order, not on a time axis.
 *
 *  A real time axis would squeeze the first three installments into two months
 *  and stretch the retention one across half the width — a shape that says
 *  something true about the calendar and nothing about the money. The caption
 *  under the chart says so, so nobody reads spacing as duration. */
function InstallmentChart({ views }: { views: InstallmentView<Installment>[] }) {
  const tallest = Math.max(...views.map((v) => v.installment.amount))
  const fill: Record<string, string> = {
    'đã-xong': 'bg-success',
    'gần-hạn': 'bg-warning',
    'đến-hạn': 'bg-warning',
    'quá-hạn': 'bg-destructive',
    'quá-hạn-lâu': 'bg-destructive',
    'chưa-tới': 'bg-white/14',
  }

  return (
    <GlassCard className="flex flex-col gap-5 p-5">
      <SectionTitle
        kicker="Tiền về theo đợt"
        size="lg"
        hint="Cột xếp theo thứ tự đợt, không theo tỉ lệ thời gian — đợt cuối cách đợt trước nó nhiều tháng."
      >
        Hình của dòng tiền
      </SectionTitle>

      <div className="flex h-[180px] items-end gap-6">
        {views.map((v) => (
          <div key={v.installment.no} className="flex h-full flex-1 flex-col justify-end gap-2">
            <span className="tnum font-num text-center text-[12.5px] font-semibold">
              {millions(v.installment.amount, 0)}
            </span>
            <span
              className={cn('w-full rounded-t-md', fill[v.level])}
              style={{ height: `${Math.round((v.installment.amount / tallest) * 150)}px` }}
              title={`Đợt ${v.installment.no} · ${dong(v.installment.amount)} · hạn ${dmy(v.installment.due)}`}
            />
          </div>
        ))}
      </div>

      <div className="bg-white/8 h-px" />

      <div className="flex gap-6">
        {views.map((v) => (
          <span key={v.installment.no} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11.5px]">
              Đợt {v.installment.no} · {v.installment.share}%
            </span>
            <span className="text-muted-foreground tnum font-mono text-[10.5px]">
              {dm(v.installment.due)}
            </span>
          </span>
        ))}
      </div>
    </GlassCard>
  )
}

function InstallmentRow({
  view,
  onOpen,
}: {
  view: InstallmentView<Installment>
  onOpen: () => void
}) {
  const { installment: d } = view
  const lateIds = useMemo(
    () =>
      new Set(
        d.conditions.filter((c) => !c.doneAt && daysUntil(c.due, today()) <= 0).map((c) => c.id),
      ),
    [d.conditions],
  )

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'motion-std grid min-h-[76px] w-full items-center gap-4 rounded-md px-4 py-3 text-left',
        'grid-cols-[132px_180px_140px_minmax(0,1fr)_150px_24px]',
        needsAttention(view.level) || view.blocking
          ? 'bg-warning/10 hover:bg-warning/16 shadow-[inset_0_1px_0_rgba(255,233,163,.2)]'
          : 'hover:bg-white/6',
      )}
    >
      <span className="flex flex-col items-start gap-1">
        <span className="text-[12.5px] font-semibold">
          Đợt {d.no} · {d.share}%
        </span>
        <DueBadge level={view.level} />
      </span>

      <span className="tnum font-num text-[14px] font-semibold">{dong(d.amount)}</span>

      <span className="flex flex-col gap-1">
        <span className="tnum font-mono text-[11.5px]">{dmy(d.due)}</span>
        <span className="text-muted-foreground tnum font-mono text-[10.5px]">
          {d.paidAt ? `về ${dm(d.paidAt)}` : daysPhrase(view.daysLeft)}
        </span>
      </span>

      <span className="flex min-w-0 items-center gap-3">
        <ConditionBar installment={d} lateIds={lateIds} />
        <span className="min-w-0 truncate text-[11.5px]">
          {view.doneConditions}/{view.totalConditions}
          {view.blocking ? (
            <span className="text-on-tint-destructive">
              {' '}
              · còn {view.blocking.what.toLowerCase()}
            </span>
          ) : view.doneConditions === view.totalConditions ? (
            <span className="text-on-tint-success"> · xong cả hai bên</span>
          ) : (
            <span className="text-muted-foreground"> điều kiện</span>
          )}
        </span>
      </span>

      <span className="text-muted-foreground tnum font-mono text-[10.5px]">
        {d.docs.length} giấy tờ · {d.records.length} bản ghi
      </span>

      <span className="text-muted-foreground flex justify-end">
        <Icon icon={ChevronRight} size={16} />
      </span>
    </button>
  )
}

export function ContractDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm hợp đồng, khách hàng, số hoá đơn…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()

  const { data: contract, isPending, error } = useQuery(contractDetailQuery(code))

  /* One clock read for the whole screen. Two reads either side of midnight give
     two levels for one contract, on one render. */
  const now = useMemo(() => today(), [])
  const views = useMemo(
    () => contract?.installments.map((d) => viewInstallment(d, now)) ?? [],
    [contract, now],
  )

  if (isPending) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </ScreenLayout>
      </AppShell>
    )
  }

  if (!contract) {
    /* Missing and out-of-scope collapse into ONE answer, and the server picked
       that on purpose: telling a caller a contract exists but is not theirs
       leaks the customer list. */
    const failure = isApiError(error) ? error : null
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <ScreenHeader
            title="Không mở được hợp đồng này"
            description={
              failure?.kind === 'không-thấy' || failure === null
                ? 'Có thể mã sai, hoặc hợp đồng không đứng tên bạn — hỏi người giữ nó, hoặc mở lại từ sổ.'
                : userMessage(failure)
            }
            back={{ label: 'Về sổ hợp đồng', onClick: () => navigate('/sales/contracts') }}
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  const money = moneyOf(contract, now)
  const next = views.find((v) => !v.installment.paidAt)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Sales · hợp đồng"
          title={contract.customer}
          description={`${contract.code} · ký ${dmy(contract.signedAt)}`}
          back={{ label: 'Hợp đồng', onClick: () => navigate('/sales/contracts') }}
          meta={
            <div className="flex flex-wrap gap-2">
              <MetaPill icon={FileCheck}>{contract.installments.length} đợt thanh toán</MetaPill>
              {/* Id and name arrive together or not at all — an unassigned
                  contract has neither, so there is no pill to draw. */}
              {contract.ownerName && (
                <MetaPill avatar={contract.ownerName}>{contract.ownerName}</MetaPill>
              )}
              <MetaPill>
                {contract.contact} · {contract.contactRole}
              </MetaPill>
              {next && (
                <MetaPill tone={needsAttention(next.level) ? 'warning' : 'muted'}>
                  Đợt {next.installment.no} {daysPhrase(next.daysLeft)}
                </MetaPill>
              )}
            </div>
          }
          context={<Chip variant="source">{contract.code}</Chip>}
        />

        <GlassCard className="flex flex-col gap-5 p-5">
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              size="compact"
              label="Giá trị hợp đồng"
              value={contract.amount === null ? '—' : billions(contract.amount)}
              source={contract.amount === null ? 'chưa có số tiền' : dong(contract.amount)}
            />
            <StatCard
              size="compact"
              label="Đã thu"
              value={millions(money.collected, 0)}
              source={
                contract.amount
                  ? `${Math.round((money.collected / contract.amount) * 100)}% giá trị`
                  : 'chưa có số tiền để so'
              }
            />
            <StatCard
              size="compact"
              label="Còn phải thu"
              value={millions(money.remaining, 0)}
              source={`${contract.installments.filter((d) => !d.paidAt).length} đợt còn lại`}
            />
            <StatCard
              size="compact"
              label="Quá hạn thu"
              value={money.overdue > 0 ? millions(money.overdue, 0) : '0 ₫'}
              source={money.overdue > 0 ? 'phải gọi hôm nay' : 'chưa đợt nào trễ hạn tiền'}
            />
          </div>

          <MoneySplit
            collected={money.collected}
            atRisk={next && needsAttention(next.level) ? next.installment.amount : 0}
            ahead={
              money.remaining - (next && needsAttention(next.level) ? next.installment.amount : 0)
            }
          />

          <div className="flex flex-wrap gap-6">
            <span className="text-muted-foreground flex items-center gap-2 text-[10.5px]">
              <StatusDot state="ok" /> Đã thu
            </span>
            <span className="text-muted-foreground flex items-center gap-2 text-[10.5px]">
              <StatusDot state="warning" /> Đang cần chú ý
            </span>
            <span className="text-muted-foreground flex items-center gap-2 text-[10.5px]">
              <StatusDot state="next" /> Chưa tới hạn
            </span>
          </div>
        </GlassCard>

        <InstallmentChart views={views} />

        <GlassCard variant="b" className="flex flex-col gap-4 p-5">
          <SectionTitle
            kicker="Các đợt thanh toán"
            size="lg"
            hint="Mở một đợt để thấy điều kiện mở khoá, giấy tờ, bản ghi và ghi chú của riêng nó."
          >
            {contract.installments.length} đợt
          </SectionTitle>

          <div className="text-muted-foreground grid grid-cols-[132px_180px_140px_minmax(0,1fr)_150px_24px] items-center gap-4 px-4 pb-2 text-[11.5px] font-medium shadow-[inset_0_-1px_0_rgb(255_255_255/.06)]">
            <span>Đợt</span>
            <span>Số tiền</span>
            <span>Hạn</span>
            <span>Điều kiện mở khoá</span>
            <span>Hồ sơ bên trong</span>
            <span />
          </div>

          <div className="flex flex-col gap-1">
            {views.map((v) => (
              <InstallmentRow
                key={v.installment.no}
                view={v}
                onOpen={() => navigate(`/sales/contracts/${contract.code}/dot/${v.installment.no}`)}
              />
            ))}
          </div>
        </GlassCard>

        {next?.blocking && (
          <AiAction
            suggestion={
              <>
                Soạn thư nhắc {contract.contact} làm nốt {next.blocking.what.toLowerCase()}, gộp
                luôn câu xin ngày chuyển tiền đợt {next.installment.no}?
              </>
            }
            basis={`đợt ${next.installment.no} ${daysPhrase(next.daysLeft)} · điều kiện "${next.blocking.what}" trễ ${-daysUntil(next.blocking.due, now)} ngày · lượt nhắc gần nhất chưa có trả lời`}
            empty="Chưa tạo gì cả — trợ lý chờ bạn bấm."
            confirmLabel="Soạn thư"
            onConfirm={() => toast('Bản nháp thư nhắc sẽ mở khi thư viện mail nối vào màn này.')}
            onInspect={() =>
              navigate(`/sales/contracts/${contract.code}/dot/${next.installment.no}`)
            }
            inspectLabel="Mở đợt"
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default ContractDetailPage
