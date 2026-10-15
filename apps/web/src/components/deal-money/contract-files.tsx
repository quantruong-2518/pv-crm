import { Skeleton } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { stepKey, useWorkstreamDocuments } from '@/data/workstream-documents'
import { DocList, DropZone } from '@/components/run/run-documents'

/** The signed paper's files: the count the profile sent, the files themselves
 *  and the drop zone. Composed from the run's own parts rather than
 *  `StepDocuments`, which prints its own "no files" line and would double the
 *  warning here. The list and the zone need `workstream.view` and a run, as
 *  there; without them only the count (and the warning when it is zero) shows. */
export function ContractFiles({
  workstreamCode,
  contractCode,
  count,
}: {
  workstreamCode: string | null
  contractCode: string
  count: number
}) {
  const allowed = useCan('workstream.view')

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Tệp hợp đồng">
      <span className="text-muted-foreground text-[12px] font-medium">Tệp hợp đồng · {count}</span>
      {allowed && workstreamCode ? (
        <Files code={workstreamCode} contractCode={contractCode} />
      ) : count === 0 ? (
        <span className="text-warning text-[13px]">Chưa có bản hợp đồng đính kèm.</span>
      ) : null}
    </section>
  )
}

function Files({ code, contractCode }: { code: string; contractCode: string }) {
  const { data, isPending, error } = useWorkstreamDocuments(code)
  const step = { kind: 'contract', contractCode } as const
  const mine = stepKey(step)
  const rows = (data?.rows ?? [])
    .filter((file) => file.step !== undefined && stepKey(file.step) === mine)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : error ? (
        <span className="text-muted-foreground text-[12.5px]">
          Không đọc được tài liệu. {isApiError(error) ? userMessage(error) : 'Thử lại.'}
        </span>
      ) : rows.length === 0 ? (
        <span className="text-warning text-[13px]">Chưa có bản hợp đồng đính kèm.</span>
      ) : (
        <DocList code={code} rows={rows} />
      )}
      <DropZone code={code} step={step} />
    </>
  )
}
