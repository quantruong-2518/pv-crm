import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Avatar, Button, Icon, Skeleton, UserRoundPlus } from '@pv/ui'
import type { OpportunityOwner, WorkstreamHolder } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { useDirectory } from '@/data/directory'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { RunBlock } from './run-block'

/** Who answers for the object on screen. `focus` is its code: the card then
 *  names only that object's people, never a sibling deal's PIC just because
 *  both share a lead. Without `focus` it lists the whole run (the run page).
 *
 *  A deal has two lanes, so `lanes` swaps its single holder for "BD PIC" and
 *  "Sale PIC" rows. A door sits beside the object it changes, only where the
 *  page can open one; a code shows only when its kind has several objects. */

const SEAT = 'text-muted-foreground m-0 text-[11.5px] italic leading-[1.5]'
const NOTE = 'text-muted-foreground m-0 text-[12.5px] leading-[1.6]'

type Row = {
  key: string
  step: string
  seat: string
  code: string
  who: string | null
  id?: string | null
  hint?: string
}

const name = (holder: WorkstreamHolder | null) => holder?.name ?? null
const idOf = (holder: WorkstreamHolder | null) => holder?.id ?? null
const LANE_SEAT = { BD: 'BD PIC', SALE: 'Sale PIC' } as const

/** Keyed by object code: the one record on screen offers its own assign door. */
export type OwnerDoors = Record<string, { label: string; onClick: () => void }>

export function RunOwners({
  workstreamCode,
  focus,
  lanes,
  doors = {},
}: {
  workstreamCode: string | null
  focus?: string
  lanes?: OpportunityOwner[]
  doors?: OwnerDoors
}) {
  const canSee = useCan('workstream.view')
  const people = useDirectory()
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: canSee && workstreamCode !== null,
  })
  if (workstreamCode === null || !canSee) return null
  if (journey.isLoading) return <Skeleton height={120} />
  const data = journey.data
  if (!data) return null

  const dealRows = (deal: (typeof data.deals)[number]): Row[] => {
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
    const firstSale = lanes.find((o) => o.role === 'SALE')
    const seated = lanes.map((o) => ({
      key: o === firstSale ? deal.code : `${deal.code}-${o.role}-${o.id}`,
      step: 'Cơ hội',
      seat: LANE_SEAT[o.role],
      code: deal.code,
      who: o.name as string | null,
      id: o.id,
    }))
    const noSale: Row[] = lanes.some((o) => o.role === 'SALE')
      ? []
      : [
          {
            key: deal.code,
            step: 'Cơ hội',
            seat: LANE_SEAT.SALE,
            code: deal.code,
            who: null,
            hint: deal.acceptedAt === null ? 'Chờ nhận PIC' : 'Chưa có Sale',
          },
        ]
    return [...seated, ...noSale]
  }

  const all: Row[] = [
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
  const rows = focus === undefined ? all : all.filter((r) => r.code === focus)

  const several = (step: string) => rows.filter((r) => r.step === step).length > 1

  return (
    <RunBlock title="Người phụ trách">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 items-center gap-3">
            {row.who ? (
              <Avatar name={row.who} size="md" />
            ) : (
              <span
                aria-hidden
                className="bg-surface-ink/10 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full"
              >
                <Icon icon={UserRoundPlus} size={16} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={row.who ? 'truncate text-[14px] font-medium leading-[1.5]' : NOTE}
                title={row.who ?? undefined}
              >
                {row.who ?? row.hint}
              </span>
              <span className={SEAT}>
                {people.find((a) => a.id === row.id)?.role ?? row.seat}
                {focus === undefined && several(row.step) && (
                  <span className="font-mono"> {row.code}</span>
                )}
              </span>
            </span>
            {doors[row.key] && (
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12 pointer-coarse:w-12 w-8 shrink-0 px-0"
                title={doors[row.key]?.label}
                aria-label={`${doors[row.key]?.label} · ${row.step}`}
                onClick={doors[row.key]?.onClick}
              >
                <Icon icon={row.who ? ArrowLeftRight : UserRoundPlus} size={16} />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </RunBlock>
  )
}
