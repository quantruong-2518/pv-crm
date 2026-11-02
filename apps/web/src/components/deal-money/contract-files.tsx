import { Skeleton } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
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
  canEdit,
}: {
  workstreamCode: string | null
  contractCode: string
  count: number
  /** Only an explicit `false` shuts the drop zone and the remove buttons. */
  canEdit?: boolean
}) {
  const { t } = useI18n()
  const allowed = useCan('workstream.view')

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-label={t(message('Tệp hợp đồng', 'Contract files', '계약 파일'))}
    >
      <span className="text-muted-foreground text-[12px] font-medium">
        {t(message('Tệp hợp đồng', 'Contract files', '계약 파일'))} · {count}
      </span>
      {allowed && workstreamCode ? (
        <Files code={workstreamCode} contractCode={contractCode} writable={canEdit !== false} />
      ) : count === 0 ? (
        <span className="text-warning text-[13px]">
          {t(
            message(
              'Chưa có bản hợp đồng đính kèm.',
              'No contract document attached.',
              '첨부된 계약서가 없습니다.',
            ),
          )}
        </span>
      ) : null}
    </section>
  )
}

function Files({
  code,
  contractCode,
  writable,
}: {
  code: string
  contractCode: string
  writable: boolean
}) {
  const { t } = useI18n()
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
        <span className="text-destructive-foreground text-[12.5px]">
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
        </span>
      ) : rows.length === 0 ? (
        <span className="text-warning text-[13px]">
          {t(
            message(
              'Chưa có bản hợp đồng đính kèm.',
              'No contract document attached.',
              '첨부된 계약서가 없습니다.',
            ),
          )}
        </span>
      ) : (
        <DocList code={code} rows={rows} canRemove={writable} />
      )}
      {writable && <DropZone code={code} step={step} />}
    </>
  )
}
