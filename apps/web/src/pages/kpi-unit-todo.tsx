import { Link } from 'react-router-dom'
import { Button, GlassCard, SectionTitle } from '@pv/ui'
import {
  type KpiDeskMember,
  type KpiDeskUnitView,
  type KpiUnitForecastResponse,
} from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { scrollToId } from '@/lib/scroll'
import { PILL_LINK } from './home-tiles'
import { assignHref } from './kpi-assign-model'
import { monthWord, personHref } from './kpi-model'
import { FORECAST_CARD_ID, ONE_CARD_ID } from './kpi-unit-model'

/** The "to do today" strip: only what the caller can do today, each with its
 *  button. Not drawn when empty (ADR 0159 §2). */

type Item = { key: string; text: string; action: React.ReactNode }

export function TodoStrip({
  period,
  view,
  members,
  forecast,
  assignMonth,
  oneMonth,
}: {
  period: string
  view: KpiDeskUnitView
  members: readonly KpiDeskMember[]
  forecast: KpiUnitForecastResponse | undefined
  assignMonth: string | null
  /** The closed month the 1:1 counts belong to. */
  oneMonth: string
}) {
  const { t } = useI18n()
  const items: Item[] = []
  if (forecast && forecast.canCommit && forecast.committed === null) {
    const saved = forecast.people.filter((p) => p.savedAt !== null).length
    const total = forecast.people.length
    items.push({
      key: 'commit',
      text: t(
        message(
          `Chốt dự báo tuần của đơn vị: ${saved}/${total} người đã ghi.`,
          `Commit the unit’s weekly forecast: ${saved}/${total} people have saved.`,
          `조직 주간 예측 확정: ${total}명 중 ${saved}명이 기록했습니다.`,
        ),
      ),
      action: (
        <Button
          size="sm"
          className="pointer-coarse:h-12"
          onClick={() => scrollToId(FORECAST_CARD_ID)}
        >
          {t(message('Xem và chốt', 'Review and commit', '확인 후 확정'))}
        </Button>
      ),
    })
  }
  for (const p of forecast?.canCommit ? forecast.people.filter((x) => x.savedAt === null) : []) {
    items.push({
      key: `late-${p.actorId}`,
      text: t(
        message(
          `${p.name} chưa ghi dự báo tuần này.`,
          `${p.name} has not saved a forecast this week.`,
          `${p.name}님이 이번 주 예측을 아직 기록하지 않았습니다.`,
        ),
      ),
      action: (
        <Link to={personHref(p.actorId, period)} className={PILL_LINK}>
          {t(message('Mở KPI', 'Open KPIs', 'KPI 열기'))}
        </Link>
      ),
    })
  }
  const one = view.oneOnOnes
  if (one && one.written < one.total && members.length > 0) {
    items.push({
      key: 'one',
      text: t(
        message(
          `1:1 ${monthWord(oneMonth)}: còn ${one.total - one.written} người chưa viết.`,
          `1:1 for ${monthWord(oneMonth)}: ${one.total - one.written} still to write.`,
          `${monthWord(oneMonth)} 1:1: ${one.total - one.written}명 작성 필요.`,
        ),
      ),
      action: (
        <Button size="sm" className="pointer-coarse:h-12" onClick={() => scrollToId(ONE_CARD_ID)}>
          {t(message('Viết 1:1', 'Write 1:1', '1:1 작성'))}
        </Button>
      ),
    })
  }
  if (assignMonth) {
    items.push({
      key: 'assign',
      text: t(
        message(
          `Chỉ tiêu ${monthWord(assignMonth)} của đơn vị chưa giao.`,
          `The unit’s targets for ${monthWord(assignMonth)} are not sent yet.`,
          `${monthWord(assignMonth)} 조직 목표가 아직 배정되지 않았습니다.`,
        ),
      ),
      action: (
        <Link to={assignHref(assignMonth)} className={PILL_LINK}>
          {t(message('Giao chỉ tiêu', 'Assign targets', '목표 배정'))}
        </Link>
      ),
    })
  }
  if (items.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle size="lg">
        {t(message('Cần làm hôm nay', 'To do today', '오늘 할 일'))}
      </SectionTitle>
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] leading-5">{item.text}</span>
              {item.action}
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  )
}
