import { useQuery } from '@tanstack/react-query'
import { Button, Skeleton } from '@pv/ui'
import type { WorkstreamHolder } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { workstreamJourneyQuery } from '@/data/workstream-journey'
import { RunBlock } from './run-block'

/** Who answers for each step the run has reached — one row per object, so a
 *  run with two deals names both. Lives in the rail, not the strip: the strip
 *  says where the run stands, this says whose hands it is in.
 *
 *  Same words the books use: a lead outside every desk waits for the head to
 *  place it; a deal nobody accepted waits for the head's accept (ADR 0071).
 *
 *  A door sits beside the object it changes, only where the page can open one;
 *  a code shows only when its kind has more than one object to tell apart. */

const NOTE = 'text-muted-foreground m-0 text-[12.5px] leading-[1.6]'

type Row = { key: string; step: string; code: string; who: string | null; hint?: string }

const name = (holder: WorkstreamHolder | null) => holder?.name ?? null

/** Keyed by object code: the one record on screen offers its own assign door. */
export type OwnerDoors = Record<string, { label: string; onClick: () => void }>

export function RunOwners({
  workstreamCode,
  doors = {},
}: {
  workstreamCode: string | null
  doors?: OwnerDoors
}) {
  const canSee = useCan('workstream.view')
  const journey = useQuery({
    ...workstreamJourneyQuery(workstreamCode ?? ''),
    enabled: canSee && workstreamCode !== null,
  })
  if (workstreamCode === null || !canSee) return null
  if (journey.isLoading) return <Skeleton height={120} />
  const data = journey.data
  if (!data) return null

  const rows: Row[] = [
    {
      key: data.lead.code,
      step: 'Lead',
      code: data.lead.code,
      who: name(data.lead.holder),
      hint: 'Chưa phân công',
    },
    ...data.deals.map((deal) => ({
      key: deal.code,
      step: 'Cơ hội',
      code: deal.code,
      who: name(deal.holder),
      hint: deal.acceptedAt === null ? 'Chờ nhận PIC' : 'Chưa có người giữ',
    })),
    ...data.contracts.flatMap((contract) => [
      {
        key: contract.code,
        step: 'Hợp đồng',
        code: contract.code,
        who: name(contract.holder),
        hint: 'Chưa có người giữ',
      },
      ...(contract.implementer
        ? [
            {
              key: `${contract.code}-impl`,
              step: 'Triển khai',
              code: contract.code,
              who: contract.implementer.name,
            },
          ]
        : []),
    ]),
  ]

  const several = (step: string) => rows.filter((r) => r.step === step).length > 1

  return (
    <RunBlock title="Người phụ trách">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] font-medium leading-[1.5]">{row.step}</span>
              {several(row.step) && <span className={`${NOTE} font-mono`}>{row.code}</span>}
            </span>
            <span className="flex min-w-0 items-center justify-end gap-2">
              <span
                className={
                  row.who ? 'min-w-0 text-right text-[14px] leading-[1.5]' : `${NOTE} text-right`
                }
              >
                {row.who ?? row.hint}
              </span>
              {doors[row.key] && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="pointer-coarse:h-12 shrink-0"
                  onClick={doors[row.key]?.onClick}
                >
                  {doors[row.key]?.label}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </RunBlock>
  )
}
