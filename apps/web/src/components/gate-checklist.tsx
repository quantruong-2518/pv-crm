import { useQuery } from '@tanstack/react-query'
import { Badge, Checkbox, GlassCard, SectionTitle } from '@pv/ui'
import { StageKey, type GateCriterionState, type OpportunityRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'
import { ladderRows, salesCatalogQuery } from '@/data/sales-config'
import { opportunityGateQuery, useTickCriterion } from '@/data/stage-gate'

/** Stage-gate checklist — ticked on the workstream step panel and on the deal
 *  profile, so a deal owner who does not hold the lead still has a place to tick.
 *
 *  Ticks gate only a forward move (every criterion of every earlier stage) and
 *  signing (all of them) — ADR 0057, decision 6. A stage already passed that
 *  still has unticked boxes marks them missing. Every box stays shut while one
 *  tick is in flight, so two clicks cannot race over the same list. */

export function GateChecklist({
  opportunityCode,
  criteria,
  title,
  editable,
  note,
  passed = false,
}: {
  opportunityCode: string
  criteria: GateCriterionState[]
  title: string
  editable: boolean
  /** Why the boxes are shut; printed only when `editable` is false. */
  note?: string
  /** The deal is already past this stage, so an unticked box is missing. */
  passed?: boolean
}) {
  const tick = useTickCriterion()
  const flying = tick.isPending ? tick.variables : undefined
  const ticked = (c: GateCriterionState) =>
    flying?.criterionId === c.id ? flying.ticked : c.tickedAt !== null
  const done = criteria.filter(ticked).length

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="flex items-center gap-2 font-semibold">
          {title}
          {passed && done < criteria.length && <Badge tone="warning">Còn thiếu</Badge>}
        </span>
        <span className="tnum font-mono">
          {done}/{criteria.length}
        </span>
      </div>
      <div className="-mx-3 flex flex-col">
        {criteria.map((c) => (
          <Checkbox
            key={c.id}
            wrap
            className="min-h-12"
            checked={ticked(c)}
            disabled={!editable || tick.isPending}
            label={c.label}
            hint={
              ticked(c)
                ? c.tickedAt && [c.tickedBy, dm(c.tickedAt)].filter(Boolean).join(' · ')
                : passed && 'Còn thiếu'
            }
            onChange={(next) => tick.mutate({ opportunityCode, criterionId: c.id, ticked: next })}
          />
        ))}
      </div>
      {!editable && note && <p className="text-muted-foreground m-0 text-[11px]">{note}</p>}
      {tick.isError && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11px]">
          {userMessage(tick.error)}
        </p>
      )}
    </section>
  )
}

/** The deal profile's card: earlier stages that still miss a tick, then the
 *  current stage onward. A closed deal draws nothing — no move is left to gate
 *  — and neither does a reader outside the deal's scope (403/404). Stage names
 *  come from config, the same rows the settings screen renames. */
export function OpportunityGateCard({ op }: { op: Pick<OpportunityRow, 'code' | 'stage'> }) {
  const canEdit = useCan('opportunity.edit')
  const gate = useQuery({ ...opportunityGateQuery(op.code), enabled: op.stage !== null })
  const { data: catalog } = useQuery(salesCatalogQuery)
  if (op.stage === null) return null

  const names = new Map(ladderRows(catalog, 'STAGE').map((r) => [r.key, r.label]))
  const from = StageKey.options.indexOf(op.stage)
  const passedStage = (stage: StageKey) => StageKey.options.indexOf(stage) < from
  const stages = (gate.data?.stages ?? []).filter(
    (s) =>
      s.criteria.length > 0 &&
      (!passedStage(s.stage) || s.criteria.some((c) => c.tickedAt === null)),
  )
  const unseen = isApiError(gate.error) && ['forbidden', 'not-found'].includes(gate.error.kind)
  if (unseen || (gate.isSuccess && stages.length === 0) || gate.isPending) return null

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-5 lg:p-6"
      aria-label="Điều kiện qua stage"
    >
      <SectionTitle
        size="sm"
        hint="Chỉ hai việc bị chặn: đi tiếp sang stage sau cần đủ điều kiện của mọi stage trước nó, ký hợp đồng cần đủ tất cả. Tạo, import, mở lại một đơn đã thua, lùi stage và đánh thua không bao giờ bị chặn."
      >
        Điều kiện qua stage
      </SectionTitle>
      {gate.isError && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px] leading-[1.5]">
          {isApiError(gate.error) ? userMessage(gate.error) : 'Không đọc được điều kiện qua stage.'}
        </p>
      )}
      {stages.map((s) => (
        <GateChecklist
          key={s.stage}
          opportunityCode={op.code}
          criteria={s.criteria}
          title={names.get(s.stage) ?? s.stage}
          editable={canEdit}
          passed={passedStage(s.stage)}
          note="Vai của bạn không sửa được cơ hội."
        />
      ))}
    </GlassCard>
  )
}
