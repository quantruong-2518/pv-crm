import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, CalendarDays, GlassCard, Icon, Pencil, Plus, cn } from '@pv/ui'
import { vnDayOf, type KpiAbsence } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { message, useI18n } from '@/app/i18n'
import { kpiAbsencesQuery, useKpiAbsenceWrite } from '@/data/kpi-absence'
import { dm } from '@/lib/date'
import { TILE } from './home-tiles'
import { AbsenceForm } from './kpi-absence-form'

/** The absence block (ADR 0117): one person's absences still to come or
 *  running, each with its end-day edit and cancel, and the declare button.
 *  On the reader's own screen it also says whom the reader stands in for.
 *
 *  `actorId` set = a target setter acting on someone else's, from the person page.
 *  A failed list read leaves the block out: the KPI board does not depend on it. */

const ROW = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2'
const TOUCH = 'pointer-coarse:h-12'

const live = (a: KpiAbsence, today: string) => a.cancelledAt === null && a.toDay >= today

export function AbsenceBlock({ me, actorId, who }: { me: string; actorId?: string; who?: string }) {
  const { t } = useI18n()
  const list = useQuery(kpiAbsencesQuery)
  const cancel = useKpiAbsenceWrite()
  const [form, setForm] = useState<{ editing: KpiAbsence | null } | null>(null)
  if (!list.data) return null

  const today = vnDayOf(new Date())
  const subject = actorId ?? me
  const absences = list.data.absences
    .filter((a) => live(a, today))
    .sort((a, b) => a.fromDay.localeCompare(b.fromDay))
  const own = absences.filter((a) => a.actor.actorId === subject)
  const covering = actorId
    ? []
    : absences.filter((a) => a.standIn.actorId === me && a.actor.actorId !== me)
  const drop = (a: KpiAbsence) =>
    cancel.mutate(
      { kind: 'cancel', absenceId: a.id },
      {
        onSuccess: () =>
          toastDone(t(message('Đã huỷ kỳ vắng.', 'Absence cancelled.', '부재를 취소했습니다.'))),
        onError: (e) => toastFail(userMessage(e)),
      },
    )

  return (
    <GlassCard className={cn(TILE, 'gap-2')}>
      <div className={ROW}>
        <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold leading-5">
          <Icon icon={CalendarDays} size={16} className="shrink-0" />
          {t(message('Vắng mặt', 'Absence', '부재'))}
        </h3>
        <Button
          variant="secondary"
          size="sm"
          className={TOUCH}
          onClick={() => setForm({ editing: null })}
        >
          <Icon icon={Plus} size={16} />
          {t(message('Khai vắng', 'Declare absence', '부재 등록'))}
        </Button>
      </div>
      {own.map((a) => (
        <div key={a.id} className={ROW}>
          <span className="tnum font-num text-[12.5px] leading-5">
            {a.fromDay <= today && (
              <span className="font-semibold">
                {t(message('Đang vắng · ', 'Away · ', '부재 중 · '))}
              </span>
            )}
            {dm(a.fromDay)} – {dm(a.toDay)} · {t(message('Người làm thay:', 'Cover:', '대행자:'))}{' '}
            {a.standIn.name}
          </span>
          <span className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={TOUCH}
              onClick={() => setForm({ editing: a })}
            >
              <Icon icon={Pencil} size={16} />
              {t(message('Sửa ngày kết thúc', 'Edit end date', '종료일 수정'))}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={TOUCH}
              disabled={cancel.isPending}
              onClick={() => drop(a)}
            >
              {t(message('Huỷ vắng', 'Cancel absence', '부재 취소'))}
            </Button>
          </span>
        </div>
      ))}
      {covering.map((a) => (
        <p key={a.id} className="tnum font-num m-0 text-[12.5px] leading-5">
          {a.fromDay <= today
            ? t(
                message(
                  `Bạn đang làm thay ${a.actor.name} đến ${dm(a.toDay)}`,
                  `You are covering for ${a.actor.name} through ${dm(a.toDay)}`,
                  `${a.actor.name}님을 ${dm(a.toDay)}까지 대행 중입니다`,
                ),
              )
            : t(
                message(
                  `Bạn sẽ làm thay ${a.actor.name} từ ${dm(a.fromDay)} đến ${dm(a.toDay)}`,
                  `You will cover for ${a.actor.name} from ${dm(a.fromDay)} through ${dm(a.toDay)}`,
                  `${dm(a.fromDay)}부터 ${dm(a.toDay)}까지 ${a.actor.name}님을 대행합니다`,
                ),
              )}
        </p>
      ))}
      <AbsenceForm
        open={form !== null}
        onClose={() => setForm(null)}
        actorId={actorId}
        who={actorId ? who : undefined}
        editing={form?.editing ?? null}
      />
    </GlassCard>
  )
}
