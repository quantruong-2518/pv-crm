import { GlassCard } from '@pv/ui'
import { MotionPickerSection } from './lead-origins-motions'
import { AddStopReason } from './sales-config-add-rows'
import { CommCriteriaConfig, EntryRow, StepKindConfig } from './sales-config-comm'
import { byOrd } from './sales-config-model'
import { MotionSection } from './sales-config-parts'
import { EntryCount, Section, type AreaProps } from './sales-config-section'

/** Intake — how a lead may come in. `MotionPickerSection` is the same list the
 *  lead-origins screen mounts; `bare` leaves the heading to this `Section`. */
export function IntakeArea() {
  return (
    <Section
      at="motions"
      hint="Tên hiện ở ô chọn khi tạo lead, bật/tắt, và form hỏi gì tiếp sau khi chọn phương án."
    >
      <MotionPickerSection bare />
    </Section>
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
  const stops = [...(catalog?.EXIT_REASON ?? [])].sort(byOrd)
  return (
    <>
      {/* 5.4 — counts STOPS, not leads (ADR 0070): one `sales.touch` row per
          stop. Switched-off rows stay listed: off is the only delete there is. */}
      <Section at="stop-reasons" summary={<EntryCount rows={stops} noun="lý do" />}>
        <GlassCard variant="b" className="p-4">
          <ul className="flex flex-col gap-2">
            {stops.map((r) => (
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

      <Section
        at="comm-criteria"
        summary={<EntryCount rows={catalog?.COMM_CRITERION ?? []} noun="câu" />}
      >
        <CommCriteriaConfig />
      </Section>

      <Section at="step-kinds" summary={<EntryCount rows={catalog?.STEP_KIND ?? []} noun="loại" />}>
        <StepKindConfig />
      </Section>
    </>
  )
}
