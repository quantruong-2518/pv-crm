import { Pencil } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { RecordCard } from '@/components/record/record-card'

/** Module 3 · what the deal is about — the body's reference card (ADR 0077 §6,
 *  ADR 0078 §1). Its people and files live in the run rail. Its drawer edits
 *  the description and the files together, the files' one edit door. */
export function DescriptionPanel({
  op,
  onEdit,
}: {
  op: OpportunityProfileResponse
  onEdit: () => void
}) {
  return (
    <RecordCard
      title="Mô tả"
      tone="reference"
      actions={
        op.acts.editDetails.ok && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            aria-label="Sửa mô tả và tệp"
            onClick={onEdit}
          >
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>
        )
      }
    >
      <p className="text-foreground m-0 whitespace-pre-line break-words text-[13px] leading-[1.6]">
        {op.description?.trim() ? (
          op.description
        ) : (
          <span className="text-muted-foreground">Chưa có mô tả.</span>
        )}
      </p>
    </RecordCard>
  )
}
