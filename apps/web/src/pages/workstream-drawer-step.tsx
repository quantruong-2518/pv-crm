import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Check, Icon, Pencil, Plus, TriangleAlert } from '@pv/ui'
import type { JourneyDeal, StageKey } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { dealStepSubject } from '@/data/deal-next-step'
import { noSellerSentence } from '@/data/deal-sale'
import { opportunityProfileQuery } from '@/data/opportunities'
import { AssignSaleButton } from '@/components/opportunity-assign'
import { NextStepForm } from './lead-next-action'
import { DuePill, Section } from './workstream-drawer-bits'
import { TEXT } from './workstream-drawer-text'

/** The next step on the CURRENT rung of an open deal, inside the journey drawer.
 *
 *  Reads the journey's own `nextAction` (it IS `NextStep`) and edits through the
 *  profile's form and doors — same subject, same chips, same `@Need` — so a step
 *  set here and one set on the profile cannot differ. The write re-reads the
 *  journeys (`data/next-step.ts`), which is what redraws this block. */
export function DealStepSection({
  deal,
  stage,
  canEdit,
}: {
  deal: JourneyDeal
  stage: StageKey
  canEdit: boolean
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'finish'>('view')
  const action = deal.nextAction

  if (canEdit && mode !== 'view') {
    return (
      <Section title={TEXT.nextAction}>
        <NextStepForm
          subject={dealStepSubject(deal.code, deal.holder, stage)}
          step={action}
          finishing={mode === 'finish'}
          onClose={() => setMode('view')}
        />
      </Section>
    )
  }

  return (
    <Section title={TEXT.nextAction}>
      <div className="bg-muted flex flex-wrap items-center gap-2 rounded-md px-4 py-3 text-[14px]">
        {action ? (
          <>
            <span className="min-w-0 grow break-words font-semibold">{action.text}</span>
            <span className="text-muted-foreground tnum text-[12px]">
              {dmy(action.due)} · {action.doer.name}
            </span>
            <DuePill level={action.dueLevel} />
          </>
        ) : (
          <span className="text-muted-foreground min-w-0 grow">{TEXT.noNextAction}</span>
        )}
        {canEdit && (
          <span className="flex basis-full flex-wrap justify-end gap-2">
            {action ? (
              <>
                <Button size="lg" variant="ghost" onClick={() => setMode('edit')}>
                  <Icon icon={Pencil} size={16} />
                  {TEXT.editNextAction}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setMode('finish')}>
                  <Icon icon={Check} size={16} />
                  {TEXT.finishNextAction}
                </Button>
              </>
            ) : (
              <Button size="lg" variant="secondary" onClick={() => setMode('edit')}>
                <Icon icon={Plus} size={16} />
                {TEXT.setNextAction}
              </Button>
            )}
          </span>
        )}
      </div>
    </Section>
  )
}

/** The SALE lane on the current rung of an accepted open deal, for assigners
 *  only — the same assign act as the profile, never a milestone or a stop. The
 *  journey carries no lane, so the deal's own profile is read for it. */
export function DealAssignSection({ code }: { code: string }) {
  const { data: op } = useQuery(opportunityProfileQuery(code))
  if (!op) return null
  const hasSeller = op.hasSeller
  const lane = op.owners.filter((o) => o.role === 'SALE')

  return (
    <Section title={TEXT.saleLane}>
      <div className="bg-muted flex flex-wrap items-center gap-2 rounded-md px-4 py-3 text-[14px]">
        {hasSeller ? (
          <span className="min-w-0 grow break-words">{lane.map((o) => o.name).join(', ')}</span>
        ) : (
          <span className="flex min-w-0 grow items-start gap-2">
            <Icon icon={TriangleAlert} size={16} className="text-warning mt-1 shrink-0" />
            <span className="break-words">{noSellerSentence(false, true)}</span>
          </span>
        )}
        {/* `acts.assign` shuts it while a signature waits: the lane is what that request names. */}
        {op.acts.assign.ok && <AssignSaleButton op={op} hasSeller={hasSeller} size="lg" />}
      </div>
    </Section>
  )
}
