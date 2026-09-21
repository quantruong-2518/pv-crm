import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  EmptyState,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  SectionTitle,
  Send,
  Skeleton,
  TriangleAlert,
} from '@pv/ui'
import {
  LEAD_SIDE_LABEL,
  MOTION_LABEL,
  MOTION_SIDE,
  type MotionPolicy,
  type MotionPolicyPatch,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { motionLabelOf, salesMotionsQuery, useProposeMotion } from '@/data/sales-motions'

/** Level 1 of a lead's origin — the six motions, as the create form offers them.
 *
 *  Same door as §5.9 of the sales config screen (`sales-config-parts.tsx`):
 *  `PATCH /sales/config/motions/:motion` answers with a RECEIPT, and the row
 *  changes only once somebody approves. So the row is never repainted from what
 *  was typed; it re-reads, and still shows the stored value until then. This
 *  section edits the three picker-facing fields only — label, on/off, campaign
 *  requirement — and leaves the four policy fields to §5.9. */
export function MotionPickerSection() {
  const { data: rows, isPending, error, refetch } = useQuery(salesMotionsQuery())

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Phương án tiếp cận">
      <SectionTitle hint="Tên hiện ở ô chọn khi tạo lead, bật/tắt, và phương án nào bắt buộc gắn chiến dịch. Đổi gì cũng thành một đề nghị chờ Giám đốc gật.">
        Phương án tiếp cận
      </SectionTitle>
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : error || !rows ? (
        <EmptyState
          icon={TriangleAlert}
          message={`Không đọc được phương án tiếp cận. ${
            isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
          }`}
          action={{ label: 'Thử lại', onClick: () => void refetch() }}
          className="py-12"
        />
      ) : (
        [...rows]
          .sort((a, b) => a.ord - b.ord)
          .map((row) => <MotionPickerRow key={row.motion} row={row} />)
      )}
    </GlassCard>
  )
}

function MotionPickerRow({ row }: { row: MotionPolicy }) {
  const canPropose = useCan('config.propose')
  const [label, setLabel] = useState(row.label ?? '')
  const [active, setActive] = useState(row.active)
  const [needsCampaign, setNeedsCampaign] = useState(row.requiresCampaign)
  const propose = useProposeMotion(row.motion)

  /* Only what differs travels — the approver reads the request as a claim. */
  const patch: MotionPolicyPatch = {}
  const typed = label.trim() === '' ? null : label.trim()
  if (typed !== row.label) patch.label = typed
  if (active !== row.active) patch.active = active
  if (needsCampaign !== row.requiresCampaign) patch.requiresCampaign = needsCampaign
  const dirty = Object.keys(patch).length > 0
  const failure = isApiError(propose.error) ? userMessage(propose.error) : null

  return (
    <div className="bg-surface-ink/[3%] flex flex-col gap-3 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{motionLabelOf(row)}</span>
        <MetaPill>{LEAD_SIDE_LABEL[MOTION_SIDE[row.motion]]}</MetaPill>
        <MetaPill mono>{row.motion}</MetaPill>
      </div>

      <fieldset
        disabled={!canPropose || propose.isPending}
        className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      >
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={MOTION_LABEL[row.motion]}
          aria-label={`Tên hiện — ${row.motion}`}
        />
        <Checkbox checked={active} onChange={setActive} label="Đang dùng" />
        <Checkbox checked={needsCampaign} onChange={setNeedsCampaign} label="Bắt buộc chiến dịch" />
      </fieldset>

      {failure && (
        <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {failure}
        </p>
      )}

      {canPropose && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="md"
            className="pointer-coarse:h-12"
            disabled={!dirty || propose.isPending}
            onClick={() =>
              propose.mutate(patch, {
                onSuccess: () => toastDone('Đã gửi đề nghị · chờ Giám đốc gật.'),
              })
            }
          >
            <Icon icon={Send} size={16} />
            Gửi đề nghị
          </Button>
          {dirty && (
            <span className="text-muted-foreground text-[11.5px]">
              {Object.keys(patch).length} ô đổi · chưa gửi
            </span>
          )}
        </div>
      )}
    </div>
  )
}
