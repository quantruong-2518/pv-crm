import { useNavigate } from 'react-router-dom'
import {
  AiAction,
  AppShell,
  ContextRail,
  EmptyState,
  Inbox,
  Kicker,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
} from '@pv/ui'
import { systemClock } from '@pv/engines'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { DeskBento, DeskSkeleton } from '@/components/home-bento'
import { deskStory, labelsOf, limitsOf, money, useDesk, useMyWork } from '@/data/home'
import { dmy } from '@/lib/date'
import { PeopleBoard, WorkQueue } from './home-parts'

/** Màn 01 · Trang chủ — the desk, then your own work on it.
 *
 *  Nothing here is hand-typed: every number arrives from a server aggregate, or
 *  is derived from returned rows by `@pv/engines`.
 *
 *  TWO TIERS, AND THE HEADINGS HAVE TO SAY WHICH IS WHICH. The top half is the
 *  department, unscoped — a bento, because its blocks are not equal in weight.
 *  The bottom half is the signed-in person's own late work, and it is a plain
 *  column: a queue is read top to bottom, not scanned. Stacked rather than
 *  merged because "pipeline" means two different things in the two halves.
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
  const rail = deskStory(top, work.contractRows, navigate)

  /* `can.X` on but the query's data still undefined (permission aside) means
     the request failed — that is not the same fact as "this book reads 0",
     so the sum below may only be called complete when both sources answered. */
  const contractsKnown = !desk.can.contract || desk.contracts !== undefined
  const opsKnown = !desk.can.ops || desk.histogram !== undefined
  const attentionKnown = contractsKnown && opsKnown

  const overdueCount = desk.contracts?.overdueCount ?? 0
  const overdueAmount = desk.contracts?.overdueVnd ?? 0
  const rotting = (desk.histogram?.buckets ?? []).reduce((n, b) => n + b.rotting, 0)
  const attention = overdueCount + rotting
  const hidden = closedDoors(desk.can)

  const quiet =
    !desk.isPending &&
    desk.error === null &&
    attentionKnown &&
    attention === 0 &&
    work.items.length === 0

  /* Each clause names its own book, and a book that never answered drops out
     of the sentence instead of contributing a false "0" to it. */
  const basis = [
    contractsKnown ? `${overdueCount} đợt thu quá hạn` : null,
    opsKnown ? `${rotting} đơn quá hạn cột` : null,
    `${work.items.length} việc trên bàn của bạn`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

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
                : desk.error !== null
                  ? 'không đọc được số liệu của phòng'
                  : !attentionKnown
                    ? `ít nhất ${attention} việc quá hạn · còn sổ chưa đọc được`
                    : attention === 0
                      ? 'không có việc quá hạn'
                      : `${attention} việc quá hạn`}
            </>
          }
          context={rail.length === 0 ? undefined : <ContextRail objects={rail} />}
        />

        {/* ---------------- TẦNG 1 · PHÒNG ---------------- */}

        {desk.error !== null ? (
          <EmptyState
            icon={Inbox}
            message="Không đọc được số liệu của phòng. Thử tải lại trang."
            action={{ label: 'Tải lại', onClick: () => navigate(0) }}
          />
        ) : desk.isPending ? (
          <DeskSkeleton />
        ) : (
          <DeskBento desk={desk} />
        )}

        {desk.can.people ? <PeopleBoard rows={desk.people} /> : null}

        {/* ---------------- TẦNG 2 · VIỆC CỦA TÔI ---------------- */}

        <section className="flex flex-col gap-3">
          <SectionTitle
            kicker="Chỉ của bạn · đã cắt theo người đang đăng nhập"
            hint="hợp đồng và cơ hội chung một hàng, xếp theo mức trễ"
            actions={
              work.items.length === 0 ? undefined : <Kicker>{work.items.length} việc</Kicker>
            }
          >
            Việc của {name}
          </SectionTitle>

          {/* Luật 9 · the assistant proposes and waits for a button. It creates
              nothing — it points at work that already exists — so it deliberately
              does NOT go through `E3.proposeFromAi`: that door mints an approval
              request, and minting one for "go and read this row" would drop a
              phantom into the approval box that nobody can ever approve. It sits
              above the queue because its whole proposal is which row to open
              first. */}
          {quiet ? (
            <EmptyState
              icon={Inbox}
              message="Không có gì quá hạn trên bàn của bạn hay của phòng hôm nay."
              action={{ label: 'Mở sổ cơ hội', onClick: () => navigate('/sales/opportunities') }}
            />
          ) : top === undefined ? null : (
            <AiAction
              suggestion={
                contractsKnown && overdueCount > 0
                  ? `Gọi thu ${money(overdueAmount)} quá hạn trước khi mở việc mới — bắt đầu ở ${top.code}, trễ ${top.daysLate} ngày.`
                  : `Mở ${top.code} trước — trễ ${top.daysLate} ngày, lâu nhất trên bàn của bạn.`
              }
              basis={`${basis}.`}
              empty={
                contractsKnown
                  ? `Chưa bấm thì ${top.code} vẫn trễ ${top.daysLate} ngày và ${overdueCount} đợt thu quá hạn chưa ai gọi.`
                  : `Chưa bấm thì ${top.code} vẫn trễ ${top.daysLate} ngày.`
              }
              confirmLabel="Mở việc này"
              onConfirm={() => navigate(top.href)}
            />
          )}

          <WorkQueue items={work.items} isPending={work.isPending} />
        </section>

        {hidden.length === 0 ? null : (
          <p className="text-muted-foreground text-[11px] leading-[1.5]">
            Bị ẩn theo quyền của bạn: {hidden.join(' · ')}.
          </p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default HomePage
