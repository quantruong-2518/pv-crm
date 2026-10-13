import type { WorkstreamDocumentStep } from '@pv/contracts'
import { Skeleton } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { stepKey, useWorkstreamDocuments } from '@/data/workstream-documents'
import { DocList, DropZone } from './run-documents'

/** The files of ONE step of a run — a quotation round, a signed contract or one
 *  instalment. Same drop zone, guards and list as `RunDocuments`; every upload
 *  carries `step`, and the list keeps only the files tagged with it. What is
 *  already there reads first; the drop zone follows it. */
export function StepDocuments({
  workstreamCode,
  step,
}: {
  workstreamCode: string | null
  step: WorkstreamDocumentStep
}) {
  const allowed = useCan('workstream.view')
  return allowed && workstreamCode ? <StepFiles code={workstreamCode} step={step} /> : null
}

function StepFiles({ code, step }: { code: string; step: WorkstreamDocumentStep }) {
  const { data, isPending, error } = useWorkstreamDocuments(code)
  const mine = stepKey(step)
  const rows = (data?.rows ?? [])
    .filter((file) => file.step !== undefined && stepKey(file.step) === mine)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="flex flex-col gap-4">
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Không đọc được tài liệu. {isApiError(error) ? userMessage(error) : 'Thử lại.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          Chưa có tài liệu nào.
        </p>
      ) : (
        <DocList code={code} rows={rows} />
      )}
      <DropZone code={code} step={step} />
    </div>
  )
}
