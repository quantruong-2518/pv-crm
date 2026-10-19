import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Skeleton, UserRoundPlus } from '@pv/ui'
import type { OpportunityOwner, WorkstreamHolder } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useDirectory } from '@/data/directory'
import { SALE_PRIMARY_LABEL, marksPrimary } from '@/data/opportunities'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { RunBlock } from './run-block'
import { PersonList, PersonRow } from './run-person'

/** Who answers for the object on screen. `focus` is its code: the card then
 *  names only that object's people, never a sibling deal's PIC just because
 *  both share a lead. Without `focus` it lists the whole run (the run page).
 *
 *  A deal has two lanes, so `lanes` swaps its single holder for "BD PIC" and
 *  "Sale PIC" rows. A door sits beside the object it changes, only where the
 *  page can open one; a code shows only when its kind has several objects. */

type Row = {
  key: string
  step: string
  seat: string
  code: string
  who: string | null
  id?: string | null
  hint?: string
  /** The SALE lane's primary, said only when the lane has several people. */
  primary?: boolean
}

const name = (holder: WorkstreamHolder | null) => holder?.name ?? null
const idOf = (holder: WorkstreamHolder | null) => holder?.id ?? null
export const LANE_SEAT = { BD: 'BD PIC', SALE: 'Sale PIC' } as const

/** Keyed by object code: the one record on screen offers its own assign door. */
export type OwnerDoors = Record<string, { label: string; onClick: () => void }>

/** The deal's own people as rows, off the deal's `owners` — no journey read
 *  needed. `acceptedAt` is `undefined` when the journey is unavailable. */
function laneRows(
  code: string,
  lanes: OpportunityOwner[],
  hasSeller: boolean,
  acceptedAt: string | null | undefined,
): Row[] {
  const sale = lanes.filter((o) => o.role === 'SALE')
  const firstSale = sale.find((o) => o.primary) ?? sale[0]
  const seated = lanes.map((o) => ({
    key: o === firstSale ? code : `${code}-${o.role}-${o.id}`,
    step: 'Cơ hội',
    seat: LANE_SEAT[o.role],
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
          step: 'Cơ hội',
          seat: LANE_SEAT.SALE,
          code,
          who: null,
          hint: acceptedAt === null ? 'Chờ nhận PIC' : 'Chưa có Sale',
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
  const canSee = useCan('workstream.view')
  const people = useDirectory()
  const live = canSee && workstreamCode !== null
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: live,
  })
  const alone = lanes && focus !== undefined ? laneRows(focus, lanes, hasSeller, undefined) : null
  if (live && journey.isLoading) return <Skeleton height={120} />
  const data = journey.data
  if (!data && !alone) return null

  const dealRows = (deal: NonNullable<typeof data>['deals'][number]): Row[] => {
    if (!lanes || deal.code !== focus) {
      return [
        {
          key: deal.code,
          step: 'Cơ hội',
          seat: 'PIC cơ hội',
          code: deal.code,
          who: name(deal.holder),
          id: idOf(deal.holder),
          hint: deal.acceptedAt === null ? 'Chờ nhận PIC' : 'Chưa có người giữ',
        },
      ]
    }
    return laneRows(deal.code, lanes, hasSeller, deal.acceptedAt)
  }

  const all: Row[] = !data
    ? []
    : [
        {
          key: data.lead.code,
          step: 'Lead',
          seat: 'PIC lead',
          code: data.lead.code,
          who: name(data.lead.holder),
          id: idOf(data.lead.holder),
          hint: 'Chưa phân công',
        },
        ...data.deals.flatMap(dealRows),
        ...data.contracts.flatMap((contract) => [
          {
            key: contract.code,
            step: 'Hợp đồng',
            seat: 'Giữ hợp đồng',
            code: contract.code,
            who: name(contract.holder),
            id: idOf(contract.holder),
            hint: 'Chưa có người giữ',
          },
          ...(contract.implementer
            ? [
                {
                  key: `${contract.code}-impl`,
                  step: 'Triển khai',
                  seat: 'Người triển khai',
                  code: contract.code,
                  who: contract.implementer.name,
                  id: contract.implementer.id,
                },
              ]
            : []),
        ]),
      ]
  const rows =
    !data && alone ? alone : focus === undefined ? all : all.filter((r) => r.code === focus)

  const several = (step: string) => rows.filter((r) => r.step === step).length > 1

  return (
    <RunBlock title="Người phụ trách">
      <PersonList>
        {rows.map((row) => {
          const door = doors[row.key]
          const seat = people.find((a) => a.id === row.id)?.role ?? row.seat
          return (
            <PersonRow
              key={row.key}
              name={row.who}
              empty={row.hint}
              tag={row.primary && SALE_PRIMARY_LABEL}
              lines={[focus === undefined && several(row.step) ? `${seat} · ${row.code}` : seat]}
              door={
                door && {
                  label: `${door.label} · ${row.step}`,
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
