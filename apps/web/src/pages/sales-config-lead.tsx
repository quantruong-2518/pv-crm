import { GlassCard } from '@pv/ui'
import { useMyConfigProposals } from '@/data/sales-config'
import { MotionPickerSection } from './lead-origins-motions'
import { AddStopReason } from './sales-config-add-rows'
import { AddEntry, CommCriteriaConfig, EntryRow, FlatListConfig } from './sales-config-comm'
import { byOrd, motionPickerWaiting } from './sales-config-model'
import { MotionSection } from './sales-config-parts'
import { RecareCyclesConfig } from './sales-config-recare'
import { EntryCount, Section, WaitingCount, type AreaProps } from './sales-config-section'

/** Intake — how a lead may come in. `MotionPickerSection` is the same list the
 *  lead-origins screen mounts; `bare` leaves the heading to this `Section`. */
export function IntakeArea() {
  const waiting = motionPickerWaiting(useMyConfigProposals())
  return (
    <Section at="motions" hint="Tên, bật/tắt và form hỏi tiếp của mỗi phương án.">
      <WaitingCount count={waiting} />
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

/** Care and contact — why a lead stops being cared for, the labels of the
 *  waiting group, the vocabulary of the contact confirm form, and the care
 *  cycle of a bought customer. */
export function CareArea({ catalog }: AreaProps) {
  const stops = [...(catalog?.EXIT_REASON ?? [])].sort(byOrd)
  const labels = [...(catalog?.WAITING_LABEL ?? [])].sort(byOrd)
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

      {/* 5.4e — ADR 0097 §5: the lead book and the campaign picker filter by these. */}
      <Section
        at="waiting-labels"
        hint="Gắn cho lead ở Nhóm chờ chăm sóc để lọc và chọn vào chiến dịch."
        summary={<EntryCount rows={labels} noun="nhãn" />}
      >
        {labels.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">Chưa có nhãn nào.</p>
        ) : (
          <GlassCard variant="b" className="p-4">
            <ul className="flex flex-col gap-2">
              {labels.map((r) => (
                <li key={r.id}>
                  <EntryRow
                    entry={r}
                    list="WAITING_LABEL"
                    usage={catalog?.usage.WAITING_LABEL[r.id] ?? 0}
                    unit="lead"
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        <AddEntry list="WAITING_LABEL" placeholder="Thêm nhãn nhóm chờ" />
      </Section>

      <Section
        at="comm-criteria"
        summary={<EntryCount rows={catalog?.COMM_CRITERION ?? []} noun="câu" />}
      >
        <CommCriteriaConfig />
      </Section>

      <Section at="step-kinds" summary={<EntryCount rows={catalog?.STEP_KIND ?? []} noun="loại" />}>
        <FlatListConfig list="STEP_KIND" unit="bước" addLabel="Thêm loại bước tiếp theo" />
      </Section>

      <Section at="recare-cycles" hint="Số ngày không liên hệ trước khi nhắc chăm sóc.">
        <RecareCyclesConfig />
      </Section>
    </>
  )
}
