import { GlassCard } from '@pv/ui'
import { MotionPickerSection } from './lead-origins-motions'
import { AddStopReason } from './sales-config-add-rows'
import { CommCriteriaConfig, EntryRow, StepKindConfig } from './sales-config-comm'
import { byOrd } from './sales-config-model'
import { MotionSection } from './sales-config-parts'
import { SECTION_ANCHOR, Section, type AreaProps } from './sales-config-section'

/** Intake — how a lead may come in. `MotionPickerSection` is the same card the
 *  lead-origins screen mounts and brings its own heading, so it is anchored
 *  here rather than wrapped in a second titled `Section`. */
export function IntakeArea() {
  return (
    <div id="motions" role="group" aria-label="Phương án tiếp cận" className={SECTION_ANCHOR}>
      <MotionPickerSection />
    </div>
  )
}

/** Assignment — what each motion declares about who takes the lead and how
 *  fast. */
export function AssignArea() {
  return (
    <Section at="motion-policy">
      <MotionSection />
    </Section>
  )
}

/** Care and contact — why a lead stops being cared for, and the vocabulary of
 *  the contact confirm form. */
export function CareArea({ catalog }: AreaProps) {
  return (
    <>
      {/* 5.4 — counts STOPS, not leads (ADR 0070): one `sales.touch` row per
          stop. Switched-off rows stay listed: off is the only delete there is. */}
      <Section at="stop-reasons">
        <GlassCard variant="b" className="p-4">
          <ul className="flex flex-col gap-2">
            {[...(catalog?.EXIT_REASON ?? [])].sort(byOrd).map((r) => (
              <li key={r.id}>
                <EntryRow
                  entry={r}
                  list="EXIT_REASON"
                  usage={catalog?.usage.EXIT_REASON[r.id] ?? 0}
                  unit="lượt"
                />
              </li>
            ))}
          </ul>
        </GlassCard>

        <AddStopReason />
      </Section>

      <Section at="comm-criteria">
        <CommCriteriaConfig />
      </Section>

      <Section at="step-kinds">
        <StepKindConfig />
      </Section>
    </>
  )
}
