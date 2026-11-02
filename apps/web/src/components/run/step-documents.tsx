import type { WorkstreamDocumentStep } from '@pv/contracts'
import { Skeleton } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { stepKey, useWorkstreamDocuments } from '@/data/workstream-documents'
import { DocList, DropZone } from './run-documents'

/** The files of ONE step of a run — a quotation round, a signed contract or one
 *  instalment. Same drop zone, guards and list as `RunDocuments`; every upload
 *  carries `step`, and the list keeps only the files tagged with it. What is
 *  already there reads first; the drop zone follows it. */
export function StepDocuments({
  workstreamCode,
  step,
  canEdit,
}: {
  workstreamCode: string | null
  step: WorkstreamDocumentStep
  /** Only an explicit `false` shuts the drop zone and the remove buttons. */
  canEdit?: boolean
}) {
  const allowed = useCan('workstream.view')
  return allowed && workstreamCode ? (
    <StepFiles code={workstreamCode} step={step} writable={canEdit !== false} />
  ) : null
}

function StepFiles({
  code,
  step,
  writable,
}: {
  code: string
  step: WorkstreamDocumentStep
  writable: boolean
}) {
  const { t } = useI18n()
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
        <p className="text-destructive-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(
            message(
              'Không đọc được tài liệu.',
              'Could not load the documents.',
              '문서를 불러오지 못했습니다.',
            ),
          )}{' '}
          {isApiError(error)
            ? userMessage(error)
            : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(message('Chưa có tài liệu nào.', 'No documents yet.', '문서가 없습니다.'))}
        </p>
      ) : (
        <DocList code={code} rows={rows} canRemove={writable} />
      )}
      {writable && <DropZone code={code} step={step} />}
    </div>
  )
}
