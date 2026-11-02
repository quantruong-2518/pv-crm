import { GlassCard } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { useMyConfigProposals } from '@/data/sales-config'
import { MotionPickerSection } from './lead-origins-motions'
import { AddStopReason } from './sales-config-add-rows'
import { AddEntry, CommCriteriaConfig, EntryRow, FlatListConfig } from './sales-config-comm'
import { byOrd, motionPickerWaiting } from './sales-config-model'
import { MotionSection } from './sales-config-parts'
import { IndustriesSection } from './sales-config-industries'
import { RecareCyclesConfig } from './sales-config-recare'
import { EntryCount, Section, WaitingCount, type AreaProps } from './sales-config-section'

/** Intake — how a lead may come in. `MotionPickerSection` is the same list the
 *  lead-origins screen mounts; `bare` leaves the heading to this `Section`. */
export function IntakeArea() {
  const { t } = useI18n()
  const waiting = motionPickerWaiting(useMyConfigProposals())
  return (
    <Section
      at="motions"
      hint={t(
        message(
          'Tên, bật/tắt và form hỏi tiếp của mỗi phương án.',
          'Edit each option’s name, availability, and follow-up form.',
          '각 옵션의 이름, 사용 여부, 후속 질문 양식을 관리합니다.',
        ),
      )}
    >
      <WaitingCount count={waiting} />
      <MotionPickerSection bare />
    </Section>
  )
}

/** Assignment — what each motion declares about who takes the lead and how
 *  fast, and the categories whose Sale a new lead is offered to. */
export function AssignArea({ catalog }: Pick<AreaProps, 'catalog'>) {
  return (
    <>
      <Section at="motion-policy">
        <MotionSection />
      </Section>
      <IndustriesSection catalog={catalog} />
    </>
  )
}

/** Care and contact — why a lead stops being cared for, the labels of the
 *  waiting group, the vocabulary of the contact confirm form, and the care
 *  cycle of a bought customer. */
export function CareArea({ catalog }: AreaProps) {
  const { t } = useI18n()
  const stops = [...(catalog?.EXIT_REASON ?? [])].sort(byOrd)
  const labels = [...(catalog?.WAITING_LABEL ?? [])].sort(byOrd)
  return (
    <>
      {/* 5.4 — counts STOPS, not leads (ADR 0070): one `sales.touch` row per
          stop. Switched-off rows stay listed: off is the only delete there is. */}
      <Section
        at="stop-reasons"
        summary={<EntryCount rows={stops} noun="lý do" />} // i18n-ignore
      >
        <GlassCard variant="b" className="p-4">
          <ul className="flex flex-col gap-2">
            {stops.map((r) => (
              <li key={r.id}>
                <EntryRow
                  entry={r}
                  list="EXIT_REASON"
                  usage={catalog?.usage.EXIT_REASON[r.id] ?? 0}
                  unit={message('lượt', 'times', '회')}
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
        hint={t(
          message(
            'Gắn cho lead ở Khách đã dừng để lọc và chọn vào chiến dịch.',
            'Apply labels to stopped leads so you can filter them and add them to campaigns.',
            '중단된 리드에 라벨을 지정해 필터링하고 캠페인에 추가할 수 있습니다.',
          ),
        )}
        summary={<EntryCount rows={labels} noun="nhãn" />} // i18n-ignore
      >
        {labels.length === 0 ? (
          <p className="text-muted-foreground text-[11.5px]">
            {t(message('Chưa có nhãn nào.', 'No labels yet.', '라벨이 없습니다.'))}
          </p>
        ) : (
          <GlassCard variant="b" className="p-4">
            <ul className="flex flex-col gap-2">
              {labels.map((r) => (
                <li key={r.id}>
                  <EntryRow
                    entry={r}
                    list="WAITING_LABEL"
                    usage={catalog?.usage.WAITING_LABEL[r.id] ?? 0}
                    unit={message('lead', 'leads', '리드')}
                  />
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
        <AddEntry
          list="WAITING_LABEL"
          placeholder={t(
            message('Thêm nhãn nhóm chờ', 'Add a waiting-group label', '대기 그룹 라벨 추가'),
          )}
        />
      </Section>

      <Section
        at="comm-criteria"
        summary={<EntryCount rows={catalog?.COMM_CRITERION ?? []} noun="câu" />} // i18n-ignore
      >
        <CommCriteriaConfig />
      </Section>

      <Section
        at="step-kinds"
        summary={<EntryCount rows={catalog?.STEP_KIND ?? []} noun="loại" />} // i18n-ignore
      >
        <FlatListConfig
          list="STEP_KIND"
          unit={message('bước', 'steps', '단계')}
          addLabel={message(
            'Thêm loại bước tiếp theo',
            'Add a next-step type',
            '다음 단계 유형 추가',
          )}
        />
      </Section>

      <Section
        at="recare-cycles"
        hint={t(
          message(
            'Số ngày không liên hệ trước khi nhắc chăm sóc.',
            'Days without contact before a care reminder.',
            '연락이 없을 때 후속 관리를 알릴 기준 일수입니다.',
          ),
        )}
      >
        <RecareCyclesConfig />
      </Section>
    </>
  )
}
