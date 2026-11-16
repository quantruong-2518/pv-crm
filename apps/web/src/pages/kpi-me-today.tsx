import type { ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, GlassCard, SectionTitle } from '@pv/ui'
import { isTieredPeriod, type KpiMyAction, type RoleId } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastFail } from '@/app/toast'
import { kpiAssignmentMineQuery } from '@/data/kpi-assignment'
import { kpiForecastCommitMeQuery } from '@/data/kpi-forecast-commit'
import { kpiMyActionsQuery, kpiOneOnOneQuery, useDoneKpiOneOnOneAction } from '@/data/kpi-score'
import { dm } from '@/lib/date'
import { oneOnOneHref } from '@/lib/kpi-paths'
import { scrollToId } from '@/lib/scroll'
import { currentPick } from './home-model'
import { leftText } from './kpi-assign-model'
import { FORECAST_ANCHOR, confirmAnchor } from './kpi-me-model'
import { monthWord } from './kpi-model'

/** The "to do today" strip (ADR 0159 §2): only what the reader can do today, each with
 *  its button, and nothing drawn when there is none. The reads are the ones the
 *  cards below use, so they share one cache entry and cost no second request.
 *
 *  The forecast and confirm rows scroll to their card; the 1:1 rows act in place. */

function Row({ text, children }: { text: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12.5px] leading-5">
      <span className="min-w-0 flex-1">{text}</span>
      {children}
    </li>
  )
}

function ActionRow({ action }: { action: KpiMyAction }) {
  const { t } = useI18n()
  const done = useDoneKpiOneOnOneAction()
  const month = monthWord(action.period)
  const due = dm(action.due)
  return (
    <Row
      text={t(
        message(
          `Việc từ buổi 1:1 ${month}: ${action.text}, hạn ${due}.`,
          `Task from the ${month} 1:1: ${action.text}, due ${due}.`,
          `${month} 1:1 업무: ${action.text}, 기한 ${due}.`,
        ),
      )}
    >
      <Button
        variant="ghost"
        className="pointer-coarse:h-12"
        disabled={done.isPending}
        onClick={() => done.mutate(action.id, { onError: (e) => toastFail(userMessage(e)) })}
      >
        {t(message('Đánh dấu xong', 'Mark done', '완료 표시'))}
      </Button>
    </Row>
  )
}

export function TodayStrip({
  period,
  lastClosed,
  actorId,
  holder,
  roles,
  closed,
}: {
  period: string
  /** The month whose 1:1 may wait for the reader to read. */
  lastClosed: string
  actorId: string | undefined
  /** The reader holds `signed-value`: the weekly forecast is theirs. */
  holder: boolean
  roles: readonly RoleId[]
  closed: boolean
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const tiered = isTieredPeriod(period)
  const commit = useQuery({ ...kpiForecastCommitMeQuery(period), enabled: tiered && holder })
  /* An action belongs to a 1:1 month, so it waits on today's month, not the viewed one. */
  const actions = useQuery({
    ...kpiMyActionsQuery,
    enabled: isTieredPeriod(currentPick().month),
  })
  const oneOnOne = useQuery({
    ...kpiOneOnOneQuery(lastClosed, actorId ?? ''),
    enabled: isTieredPeriod(lastClosed) && actorId !== undefined,
  })
  const mine = useQueries({
    queries: roles.map((role) => ({
      ...kpiAssignmentMineQuery(period, role),
      enabled: tiered && !closed,
    })),
  })

  const needsForecast = commit.data?.editable === true && commit.data.savedAt === null
  const toConfirm = roles.filter((_, i) => {
    const m = mine[i]?.data
    return (
      m !== undefined &&
      !m.confirmedAt &&
      !m.acceptedByDefault &&
      m.lines.some((l) => l.kind === 'person' && !l.confirmedAt) &&
      leftText(m.deadline) !== null
    )
  })
  const open = actions.data?.actions ?? []
  const toRead = oneOnOne.data?.canAcknowledge === true
  if (!needsForecast && toConfirm.length === 0 && open.length === 0 && !toRead) return null

  return (
    <GlassCard className="flex flex-col gap-3 p-5">
      <SectionTitle size="lg">
        {t(message('Cần làm hôm nay', 'To do today', '오늘 할 일'))}
      </SectionTitle>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {needsForecast && (
          <Row
            text={t(
              message(
                'Ghi dự báo tuần này: chọn cơ hội chắc chắn ký trong tháng.',
                'Save this week’s forecast: pick the opportunities you are sure to sign this month.',
                '이번 주 예측 기록: 이번 달 확실히 체결할 기회를 선택하세요.',
              ),
            )}
          >
            <Button className="pointer-coarse:h-12" onClick={() => scrollToId(FORECAST_ANCHOR)}>
              {t(message('Ghi dự báo', 'Save forecast', '예측 기록'))}
            </Button>
          </Row>
        )}
        {toConfirm.map((role) => (
          <Row
            key={role}
            text={t(
              message(
                'Xác nhận chỉ tiêu được giao cho bạn.',
                'Confirm the targets assigned to you.',
                '배정된 목표를 확인하세요.',
              ),
            )}
          >
            <Button className="pointer-coarse:h-12" onClick={() => scrollToId(confirmAnchor(role))}>
              {t(message('Xem và xác nhận', 'Review and confirm', '확인하러 가기'))}
            </Button>
          </Row>
        ))}
        {toRead && actorId && (
          <Row
            text={t(
              message(
                `Người phụ trách đơn vị đã ghi buổi 1:1 ${monthWord(lastClosed)}. Hãy đọc và xác nhận.`,
                `Your unit head wrote the ${monthWord(lastClosed)} 1:1. Read and confirm it.`,
                `조직 책임자가 ${monthWord(lastClosed)} 1:1을 작성했습니다. 읽고 확인하세요.`,
              ),
            )}
          >
            <Button
              className="pointer-coarse:h-12"
              onClick={() => void navigate(oneOnOneHref(lastClosed, actorId))}
            >
              {t(message('Đọc buổi 1:1', 'Read the 1:1', '1:1 읽기'))}
            </Button>
          </Row>
        )}
        {open.map((action) => (
          <ActionRow key={action.id} action={action} />
        ))}
      </ul>
    </GlassCard>
  )
}
