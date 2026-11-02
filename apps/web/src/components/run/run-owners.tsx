import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Skeleton, UserRoundPlus } from '@pv/ui'
import type { OpportunityOwner, WorkstreamHolder } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { useDirectory } from '@/data/directory'
import { SALE_PRIMARY_COPY, marksPrimary } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { collectorDoorKey } from './owner-doors'
import { RunBlock } from './run-block'
import { PersonList, PersonRow } from './run-person'

/** Who answers for the object on screen. `focus` is its code: the card then
 *  names only that object's people, never a sibling deal's PIC just because
 *  both share a lead. Without `focus` it lists the whole run (the run page).
 *
 *  A deal has two lanes, so `lanes` swaps its single holder for "BD PIC" and
 *  "Sale PIC" rows. A door sits beside the object it changes, only where the
 *  page can open one; a code shows only when its kind has several objects. */

type Step = 'lead' | 'deal' | 'contract' | 'implement'

const STEP: Record<Step, Message> = {
  lead: message('Lead', 'Lead', '리드'),
  deal: message('Cơ hội', 'Opportunity', '기회'),
  contract: message('Hợp đồng', 'Contract', '계약'),
  implement: message('Triển khai', 'Delivery', '이행'),
}

type Say = (copy: Message) => string

type Row = {
  key: string
  step: Step
  seat: string
  code: string
  who: string | null
  id?: string | null
  hint?: string
  /** The SALE lane's primary, said only when the lane has several people. */
  primary?: boolean
  /** A pill beside the name, for a seat the same person also holds. */
  tag?: string
  /** Keeps `seat` as the line even for a person the directory knows: the
   *  closer's seat IS the role here, and their job title would hide it. */
  keepSeat?: boolean
  /** Which `doors` entry sits on this row, when it is not the row's own key. */
  doorKey?: string
}

const COLLECTOR_LABEL = message('Người thu tiền', 'Payment collector', '수금 담당')
const ACCEPT_WAIT = message('Chờ nhận PIC', 'Awaiting owner acceptance', '담당자 수락 대기')
/** The closer is also the collector: one row says both. */
const sameHand = (c: { holder: WorkstreamHolder | null; collector?: WorkstreamHolder | null }) =>
  c.collector?.id !== undefined && c.collector.id === c.holder?.id
const name = (holder: WorkstreamHolder | null) => holder?.name ?? null
const idOf = (holder: WorkstreamHolder | null) => holder?.id ?? null
const LANE_SEAT = {
  BD: message('BD PIC', 'BD in charge', '담당 BD'),
  SALE: message('Sale PIC', 'Salesperson in charge', '담당 영업'),
}

/** Keyed by object code: the one record on screen offers its own assign door.
 *  `bare` prints the label as given, without the step it sits under. */
export type OwnerDoors = Record<string, { label: string; onClick: () => void; bare?: boolean }>

/** The deal's own people as rows, off the deal's `owners` — no journey read
 *  needed. `acceptedAt` is `undefined` when the journey is unavailable. */
function laneRows(
  code: string,
  lanes: OpportunityOwner[],
  hasSeller: boolean,
  acceptedAt: string | null | undefined,
  t: Say,
): Row[] {
  const sale = lanes.filter((o) => o.role === 'SALE')
  const firstSale = sale.find((o) => o.primary) ?? sale[0]
  const seated = lanes.map((o) => ({
    key: o === firstSale ? code : `${code}-${o.role}-${o.id}`,
    step: 'deal' as const,
    seat: t(LANE_SEAT[o.role]),
    code,
    who: o.name as string | null,
    id: o.id,
    primary: marksPrimary(o, sale),
  }))
  const noSale: Row[] = hasSeller
    ? []
    : [
        {
          key: code,
          step: 'deal',
          seat: t(LANE_SEAT.SALE),
          code,
          who: null,
          hint: t(
            acceptedAt === null
              ? ACCEPT_WAIT
              : message('Chưa có Sale', 'No Sale yet', '영업 담당자 없음'),
          ),
        },
      ]
  return [...seated, ...noSale]
}

export function RunOwners({
  workstreamCode,
  focus,
  lanes,
  hasSeller = true,
  doors = {},
}: {
  workstreamCode: string | null
  focus?: string
  /** A deal's own people; also what shows when the run cannot be read. */
  lanes?: OpportunityOwner[]
  /** The deal's verdict on having a Sale, not a guess off the lane roles. */
  hasSeller?: boolean
  doors?: OwnerDoors
}) {
  const { t } = useI18n()
  const canSee = useCan('workstream.view')
  const people = useDirectory()
  const live = canSee && workstreamCode !== null
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: live,
  })
  const alone =
    lanes && focus !== undefined ? laneRows(focus, lanes, hasSeller, undefined, t) : null
  if (live && journey.isLoading) return <Skeleton height={120} />
  const data = journey.data
  if (!data && !alone) return null

  const dealRows = (deal: NonNullable<typeof data>['deals'][number]): Row[] => {
    if (!lanes || deal.code !== focus) {
      return [
        {
          key: deal.code,
          step: 'deal',
          seat: t(message('PIC cơ hội', 'Opportunity owner', '기회 담당자')),
          code: deal.code,
          who: name(deal.holder),
          id: idOf(deal.holder),
          hint: t(
            deal.acceptedAt === null
              ? ACCEPT_WAIT
              : message('Chưa có người giữ', 'No holder yet', '담당자 없음'),
          ),
        },
      ]
    }
    return laneRows(deal.code, lanes, hasSeller, deal.acceptedAt, t)
  }

  const all: Row[] = !data
    ? []
    : [
        {
          key: data.lead.code,
          step: 'lead',
          seat: t(message('PIC lead', 'Lead owner', '리드 담당자')),
          code: data.lead.code,
          who: name(data.lead.holder),
          id: idOf(data.lead.holder),
          hint: t(message('Chưa phân công', 'Not assigned', '미배정')),
        },
        ...data.deals.flatMap(dealRows),
        ...data.contracts.flatMap((contract) => [
          {
            key: contract.code,
            step: 'contract' as const,
            seat: t(message('Người chốt', 'Closer', '체결 담당')),
            code: contract.code,
            who: name(contract.holder),
            id: idOf(contract.holder),
            hint: t(message('Chưa có người chốt', 'No closer yet', '체결 담당자 없음')),
            keepSeat: true,
            ...(sameHand(contract) && {
              tag: t(COLLECTOR_LABEL),
              doorKey: collectorDoorKey(contract.code),
            }),
          },
          ...(contract.collector && !sameHand(contract)
            ? [
                {
                  key: collectorDoorKey(contract.code),
                  step: 'contract' as const,
                  seat: t(COLLECTOR_LABEL),
                  code: contract.code,
                  who: contract.collector.name,
                  id: contract.collector.id,
                  keepSeat: true,
                },
              ]
            : []),
          ...(contract.implementer
            ? [
                {
                  key: `${contract.code}-impl`,
                  step: 'implement' as const,
                  seat: t(message('Người triển khai', 'Implementer', '이행 담당')),
                  code: contract.code,
                  who: contract.implementer.name,
                  id: contract.implementer.id,
                  keepSeat: true,
                },
              ]
            : []),
        ]),
      ]
  const rows =
    !data && alone ? alone : focus === undefined ? all : all.filter((r) => r.code === focus)

  const several = (step: Step) => rows.filter((r) => r.step === step).length > 1

  return (
    <RunBlock title={t(message('Người phụ trách', 'Owners', '담당자'))}>
      <PersonList>
        {rows.map((row) => {
          const door = doors[row.doorKey ?? row.key]
          const seat = row.keepSeat
            ? row.seat
            : (people.find((a) => a.id === row.id)?.role ?? row.seat)
          return (
            <PersonRow
              key={row.key}
              name={row.who}
              empty={row.hint}
              tag={row.tag ?? (row.primary && t(SALE_PRIMARY_COPY))}
              lines={[focus === undefined && several(row.step) ? `${seat} · ${row.code}` : seat]}
              door={
                door && {
                  label: door.bare ? door.label : `${door.label} · ${t(STEP[row.step])}`,
                  icon: row.who ? ArrowLeftRight : UserRoundPlus,
                  onClick: door.onClick,
                }
              }
            />
          )
        })}
      </PersonList>
    </RunBlock>
  )
}
