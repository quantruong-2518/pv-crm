import { useQuery } from '@tanstack/react-query'
import { Checkbox, GlassCard, SectionTitle } from '@pv/ui'
import { StageKey, type GateCriterionState, type OpportunityRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'
import { opportunityGateQuery, useTickCriterion } from '@/data/stage-gate'
import { STAGE_LABEL } from './ops-fields'

/** Stage-gate checklist — ticked on the workstream step panel and on the deal
 *  profile, so a deal owner who does not hold the lead still has a place to tick.
 *
 *  Ticks are the gate (full rule in `stage-gate.ts` of `@pv/contracts`): moving
 *  forward needs the current stage and every stage skipped, signing needs every
 *  stage through awaiting-signature. Every box stays shut while one tick is in
 *  flight, so two clicks cannot race over the same list. */

export function GateChecklist({
  opportunityCode,
  criteria,
  title,
  editable,
  note,
}: {
  opportunityCode: string
  criteria: GateCriterionState[]
  title: string
  editable: boolean
  /** Why the boxes are shut; printed only when `editable` is false. */
  note?: string
}) {
  const tick = useTickCriterion()
  const flying = tick.isPending ? tick.variables : undefined
  const ticked = (c: GateCriterionState) =>
    flying?.criterionId === c.id ? flying.ticked : c.tickedAt !== null
  const done = criteria.filter(ticked).length

  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="font-semibold">{title}</span>
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
            hint={c.tickedAt && [c.tickedBy, dm(c.tickedAt)].filter(Boolean).join(' · ')}
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

/** The deal profile's card: stages from the deal's current one onward, current
 *  first. A closed deal draws nothing — no move is left to gate — and neither
 *  does a reader outside the deal's scope, whom the door answers 403/404. */
export function OpportunityGateCard({ op }: { op: Pick<OpportunityRow, 'code' | 'stage'> }) {
  const canEdit = useCan('opportunity.edit')
  const gate = useQuery({ ...opportunityGateQuery(op.code), enabled: op.stage !== null })
  if (op.stage === null) return null

  const from = StageKey.options.indexOf(op.stage)
  const stages = (gate.data?.stages ?? []).filter(
    (s) => StageKey.options.indexOf(s.stage) >= from && s.criteria.length > 0,
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
        hint={`Đi tiếp, ký hợp đồng, và tạo hoặc import một cơ hội thẳng vào một stage đều cần đủ điều kiện của mọi stage đã qua — ký cần đủ tới "${STAGE_LABEL.get('awaiting-signature')}". Mở lại một đơn đã thua bị kiểm lại đúng từ stage nó thua; đánh thua không bao giờ bị chặn.`}
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
          title={STAGE_LABEL.get(s.stage) ?? s.stage}
          editable={canEdit}
          note="Vai của bạn không sửa được cơ hội."
        />
      ))}
    </GlassCard>
  )
}
