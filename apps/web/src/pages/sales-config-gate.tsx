import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus, Send, TriangleAlert, X } from '@pv/ui'
import { Badge, Button, EmptyState, GlassCard, Icon, Input, Kicker, Skeleton, cn } from '@pv/ui'
import { STAGE_CRITERION_LABEL_MAX, StageKey, type StageCriterion } from '@pv/contracts'
import { isApiError, userMessage, type ApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import type { LadderRow } from '@/data/sales-config'
import {
  stageCriteriaQuery,
  useProposeCriterion,
  useProposeCriterionPatch,
} from '@/data/stage-gate'
import { ROLE_LABEL } from '@/data/users'

/** Section 5.2b · exit criteria per stage — the configuration half of the gate.
 *
 *  Grouped under `StageKey.options` rather than under the ladder rows: a ladder
 *  that fails its positional join keys its rows by id, and criteria keyed by
 *  stage would then vanish from the screen instead of sitting under a raw key.
 *
 *  Every write is a proposal, so nothing repaints on success — the same rule as
 *  every other section here. Inactive rows stay listed: switching off is the
 *  only deletion there is. */

const SENT = `Đã gửi đề nghị · chờ ${ROLE_LABEL.director} gật.`

const failureOf = (error: ApiError | null) =>
  isApiError(error) ? (
    <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
      {userMessage(error)}
    </p>
  ) : null

export function StageGateSection({ stages }: { stages: LadderRow[] }) {
  const { data, isPending, error, refetch } = useQuery(stageCriteriaQuery)

  if (isPending) return <Skeleton className="h-64" />

  if (error || !data) {
    return (
      <EmptyState
        icon={TriangleAlert}
        message={`Không đọc được điều kiện qua stage. ${
          isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
        }`}
        action={{ label: 'Thử lại', onClick: () => void refetch() }}
        className="py-12"
      />
    )
  }

  return (
    <GlassCard variant="b" className="p-4">
      <ul className="flex flex-col gap-6">
        {StageKey.options.map((stage) => {
          const name = stages.find((s) => s.key === stage)?.label ?? stage
          return (
            <li key={stage} className="flex flex-col gap-3">
              <Kicker>{name}</Kicker>
              <StageCriteria
                stage={stage}
                name={name}
                rows={data.rows.filter((r) => r.stage === stage)}
              />
            </li>
          )
        })}
      </ul>
    </GlassCard>
  )
}

function StageCriteria({
  stage,
  name,
  rows,
}: {
  stage: StageKey
  name: string
  rows: StageCriterion[]
}) {
  const [label, setLabel] = useState('')
  const canPropose = useCan('config.propose')
  const propose = useProposeCriterion()

  return (
    <>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có điều kiện — đơn qua cột này không bị chặn.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <CriterionRow key={row.id} row={row} canPropose={canPropose} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label={`Thêm điều kiện — ${name}`}
          value={label}
          maxLength={STAGE_CRITERION_LABEL_MAX}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Điều kiện mới"
          className="h-12 min-w-0 flex-1"
        />
        <Button
          size="md"
          className="min-h-12"
          disabled={!canPropose || label.trim() === '' || propose.isPending}
          onClick={() =>
            propose.mutate(
              { stage, label: label.trim() },
              {
                onSuccess: () => {
                  setLabel('')
                  toastDone(SENT)
                },
              },
            )
          }
        >
          <Icon icon={Plus} size={16} />
          Gửi đề nghị
        </Button>
      </div>
      {failureOf(propose.error)}
    </>
  )
}

function CriterionRow({ row, canPropose }: { row: StageCriterion; canPropose: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const patch = useProposeCriterionPatch(row.id)
  const locked = !canPropose || patch.isPending
  const renamed = draft?.trim() ?? ''

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {draft === null ? (
          <span
            className={cn(
              'min-w-0 basis-full text-[11.5px] leading-[1.5] sm:flex-1 sm:basis-0',
              !row.active && 'text-muted-foreground',
            )}
          >
            {row.label}
          </span>
        ) : (
          <Input
            aria-label={`Đổi tên — ${row.label}`}
            value={draft}
            maxLength={STAGE_CRITERION_LABEL_MAX}
            onChange={(e) => setDraft(e.target.value)}
            className="h-12 min-w-0 basis-full sm:flex-1 sm:basis-0"
          />
        )}
        {!row.active && <Badge>Đã tắt</Badge>}

        {draft === null ? (
          <>
            <Button
              size="md"
              variant="ghost"
              className="min-h-12"
              disabled={locked}
              onClick={() => setDraft(row.label)}
            >
              <Icon icon={Pencil} size={16} />
              Đổi tên
            </Button>
            <Button
              size="md"
              variant="ghost"
              className="min-h-12"
              disabled={locked}
              onClick={() =>
                patch.mutate({ active: !row.active }, { onSuccess: () => toastDone(SENT) })
              }
            >
              <Icon icon={row.active ? EyeOff : Eye} size={16} />
              {row.active ? 'Tắt' : 'Bật lại'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="md"
              className="min-h-12"
              disabled={locked || renamed === '' || renamed === row.label}
              onClick={() =>
                patch.mutate(
                  { label: renamed },
                  {
                    onSuccess: () => {
                      setDraft(null)
                      toastDone(SENT)
                    },
                  },
                )
              }
            >
              <Icon icon={Send} size={16} />
              Gửi đề nghị
            </Button>
            <Button size="md" variant="ghost" className="min-h-12" onClick={() => setDraft(null)}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
          </>
        )}
      </div>
      {failureOf(patch.error)}
    </li>
  )
}
