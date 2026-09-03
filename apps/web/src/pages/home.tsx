import { useNavigate } from 'react-router-dom'
import {
  AiAction,
  AppShell,
  ContextRail,
  EmptyState,
  Inbox,
  ScreenHeader,
  ScreenLayout,
  billions,
} from '@pv/ui'
import { systemClock } from '@pv/engines'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { deskStory, labelsOf, limitsOf, useDesk, useMyWork } from '@/data/home'
import { dmy } from '@/lib/date'
import {
  Alerts,
  DeskSkeleton,
  DeskTiles,
  Funnel,
  MoneyLine,
  PeopleBoard,
  PipelineBoard,
  WorkQueue,
} from './home-parts'

/** Màn 01 · Trang chủ — the desk, then your own work on it.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS SCREEN USED TO BE, AND WHY NONE OF IT SURVIVED
 *  ------------------------------------------------------------------
 *  Until now this was a morning brief for a manufacturing story: a Supply sales
 *  order, a Factory work order, a machine breakdown, an OEE figure. Every one of
 *  those numbers was typed into JSX — the old file said so itself — and none of
 *  them had a table, an endpoint or a screen behind it. `apps/api` has ONE
 *  branch, `sales`; `routes.tsx` has no Supply, Factory or Finance route. Each
 *  tile pointed at a product that does not exist here, and no click on this page
 *  could go anywhere.
 *
 *  What replaced it reads the three books this product actually has. Nothing
 *  here is hand-typed: every number arrives from a server aggregate, or is
 *  derived from returned rows by `@pv/engines`.
 *
 *  ------------------------------------------------------------------
 *  TWO TIERS, AND THE HEADINGS HAVE TO SAY WHICH IS WHICH
 *  ------------------------------------------------------------------
 *  The top half is the department, unscoped — everyone who may see a block reads
 *  the same figure in it. The bottom half is the signed-in person's own late
 *  work. Stacked rather than merged because "pipeline" means two different
 *  things in the two halves, and the only thing stopping a reader conflating
 *  them is that each section says whose numbers it is showing.
 *
 *  Blocks a role may not read are dropped and NAMED, not hidden — the gating
 *  itself is explained at the top of `data/home.ts`. */

/** Time of day, from the same clock the work queue measures lateness with. */
function greeting(iso: string): string {
  const hour = new Date(iso).getHours()
  if (hour < 11) return 'Chào buổi sáng'
  if (hour < 14) return 'Chào buổi trưa'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

/** The books this actor may not open, named. Empty = they see everything. */
function closedDoors(can: {
  ops: boolean
  lead: boolean
  contract: boolean
  people: boolean
}): string[] {
  const out: string[] = []
  if (!can.ops) out.push('cơ hội')
  if (!can.contract) out.push('hợp đồng')
  if (!can.lead) out.push('lead')
  if (!can.people) out.push('nhân sự')
  return out
}

export function HomePage() {
  const chrome = useAppChrome({
    searchPlaceholder: 'Tìm khách hàng, lead, cơ hội, hợp đồng…',
  })
  const navigate = useNavigate()
  const actor = useSession((s) => s.actor)

  const desk = useDesk()
  const limits = limitsOf(desk.histogram?.buckets)
  const labelOf = labelsOf(desk.histogram?.buckets)
  const work = useMyWork(limits, labelOf)

  const today = systemClock()
  const name = actor?.name ?? 'bạn'
  const top = work.items[0]

  /* Luật 10 · the rail is built by E1 from rows the server just sent, never from
     a hand-written chip list. Anchored on the most urgent thing on this desk,
     because that is the story the person opened the screen to find. */
  const rail = deskStory(top, work.contractRows)

  const overdueCount = desk.contracts?.overdueCount ?? 0
  const overdueAmount = desk.contracts?.overdueVnd ?? 0
  const rotting = (desk.histogram?.buckets ?? []).reduce((n, b) => n + b.rotting, 0)
  const attention = overdueCount + rotting
  const hidden = closedDoors(desk.can)

  const quiet = !desk.isPending && attention === 0 && work.items.length === 0

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core · Tổng quan"
          title={`${greeting(today)}, ${name}`}
          description={
            <>
              {dmy(today)} · Kinh doanh ·{' '}
              {desk.isPending
                ? 'đang đọc sổ…'
                : attention === 0
                  ? 'không có việc nào quá hạn'
                  : `${attention} việc quá hạn cần nhìn`}
            </>
          }
          context={rail.length === 0 ? undefined : <ContextRail objects={rail} />}
        />

        {desk.error === null ? null : (
          <EmptyState
            icon={Inbox}
            message="Không đọc được số liệu của phòng. Thử tải lại trang."
            action={{ label: 'Tải lại', onClick: () => navigate(0) }}
          />
        )}

        {/* ---------------- TẦNG 1 · PHÒNG ---------------- */}

        {desk.isPending ? (
          <DeskSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:auto-rows-[150px] lg:grid-cols-4 lg:gap-4">
            <MoneyLine scorecard={desk.scorecard} contracts={desk.contracts} />
            <DeskTiles scorecard={desk.scorecard} contracts={desk.contracts} />
            <Alerts histogram={desk.histogram} contracts={desk.contracts} />
          </div>
        )}

        {desk.can.ops || desk.can.lead ? (
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            {desk.can.ops ? <PipelineBoard histogram={desk.histogram} /> : null}
            {desk.can.lead ? <Funnel funnel={desk.funnel} /> : null}
          </div>
        ) : null}

        {desk.can.people ? <PeopleBoard rows={desk.people} /> : null}

        {/* ---------------- TẦNG 2 · VIỆC CỦA TÔI ---------------- */}

        <WorkQueue items={work.items} isPending={work.isPending} name={name} />

        {/* Luật 9 · the assistant proposes and waits for a button. It creates
            nothing — it points at work that already exists — so it deliberately
            does NOT go through `E3.proposeFromAi`: that door mints an approval
            request, and minting one for "go and read this row" would drop a
            phantom into the approval box that nobody can ever approve. The
            `basis` line still names every figure it read. */}
        {quiet ? (
          <EmptyState
            icon={Inbox}
            message="Không có gì quá hạn trên bàn của bạn hay của phòng hôm nay."
            action={{ label: 'Mở sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
          />
        ) : top === undefined ? null : (
          <AiAction
            suggestion={
              overdueCount > 0
                ? `Trợ lý đề xuất: gọi thu ${billions(overdueAmount, 1)} đang quá hạn trước khi mở việc mới — bắt đầu ở ${top.code}, trễ ${top.daysLate} ngày.`
                : `Trợ lý đề xuất: mở ${top.code} trước — đây là việc trễ lâu nhất trên bàn của bạn, ${top.daysLate} ngày quá hạn.`
            }
            basis={`${overdueCount} đợt thanh toán quá hạn · ${rotting} đơn quá hạn cột · hạn mỗi cột đọc từ Thiết lập · ${work.items.length} việc trên bàn của bạn.`}
            empty={`Chưa mở gì cả. Chưa bấm thì ${top.code} đứng nguyên ở mức trễ ${top.daysLate} ngày, và ${overdueCount} đợt thu quá hạn vẫn chưa ai gọi.`}
            confirmLabel="Mở việc này"
            onConfirm={() => navigate(top.href)}
          />
        )}

        {hidden.length === 0 ? null : (
          <p className="text-muted-foreground text-[11px] leading-[1.5]">
            Bị ẩn theo quyền của bạn: {hidden.join(' · ')}. Vai của bạn không mở những sổ này, nên
            màn bỏ hẳn khối của chúng thay vì vẽ một khối rỗng.
          </p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default HomePage
