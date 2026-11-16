import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppShell, ScreenHeader, ScreenLayout } from '@pv/ui'
import { isTieredPeriod, stepSalesPeriod, type KpiCloseGateResponse } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n, type Message } from '@/app/i18n'
import { useAppChrome } from '@/app/chrome'
import { KpiTabs } from '@/components/kpi-tabs'
import { kpiCompanyQuery } from '@/data/kpi'
import { kpiAssignmentTreeQuery } from '@/data/kpi-assignment'
import { kpiCatalogFor, withCatalog } from '@/data/kpi-catalog'
import { kpiCloseGateQuery } from '@/data/kpi-close'
import { kpiCompanyDeskQuery } from '@/data/kpi-desk'
import { dm } from '@/lib/date'
import { scrollToId } from '@/lib/scroll'
import { keyOf, num } from './home-model'
import { TARGETS_PATH, monthQuery } from './kpi-allocate-model'
import { assignHref, statusHref } from './kpi-assign-model'
import { UnitCards } from './kpi-company-cards'
import { CompareCard, LeaderboardCard } from './kpi-company-compare'
import { paceShare } from './kpi-company-model'
import { AssignTile, CommittedTile, LinkButton } from './kpi-company-parts'
import { SlippingCard } from './kpi-company-slipping'
import { CompanyTodo, type CompanyTodoItem } from './kpi-company-todo'
import { MonthCloseBar } from './kpi-month-close'
import { boardOf, dayOfMonth, monthEnded, monthPick, monthText, useMonthParam } from './kpi-model'
import { CompanyStrip, MonthPicker, QueryBlock, ReadingTile } from './kpi-parts'

/** The company tab, read live from `/sales/kpi/:period/…` (ADR 0159 §2, §5).
 *
 *  What the caller can do today first, then the main metric with the heads'
 *  committed forecast, the other room metrics, one row per unit and the people
 *  who are slipping. The per-person table lives on the unit tab. The scorecard
 *  read needs `kpi.view-all`; a company seat without it keeps the desk cards.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

const CLOSE_ID = 'month-close'

/** The close line of the todo strip, from what the gate counts for this reader. */
function closeSentence(
  period: string,
  gate: KpiCloseGateResponse | undefined,
  t: (copy: Message) => string,
): string {
  const month = monthText(period)
  const reasons = gate?.counts.overdueReasons ?? 0
  const big = gate?.flags.bigContracts.length ?? 0
  const parts = [
    reasons > 0 &&
      message(
        `${num(reasons)} lý do quá hạn chờ duyệt`,
        `${num(reasons)} overdue reasons awaiting approval`,
        `승인 대기 연체 사유 ${num(reasons)}건`,
      ),
    big > 0 &&
      message(
        `${num(big)} hợp đồng lớn cần xem`,
        `${num(big)} large contracts to review`,
        `확인할 대형 계약 ${num(big)}건`,
      ),
  ].flatMap((p) => (p ? [t(p)] : []))
  const and = t(message(' và ', ' and ', ' 및 '))
  return t(
    parts.length === 0
      ? message(`Tháng ${month} chưa chốt.`, `Month ${month} is not closed.`, `${month}월 미마감.`)
      : message(
          `Chốt tháng ${month}: còn ${parts.join(and)}.`,
          `Closing month ${month}: ${parts.join(and)} left.`,
          `${month}월 마감: ${parts.join(and)} 남음.`,
        ),
  )
}

export function KpiCompanyPage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const canSet = useCan('kpi.set-target')
  const seesAll = useCan('kpi.view-all')
  const [pick, setPick] = useMonthParam()
  const period = keyOf(pick)
  const day = dayOfMonth(period)

  const catalog = useQuery(kpiCatalogFor(period))
  const company = useQuery({ ...kpiCompanyQuery(period), enabled: seesAll })
  const desk = useQuery(kpiCompanyDeskQuery(period))
  const role = company.data?.scorecard.role

  const unclosed = company.data !== undefined && company.data.monthClose === null
  const closable = canSet && monthEnded(period) && unclosed
  const gate = useQuery(kpiCloseGateQuery(period, closable))
  const showClose = company.data !== undefined && (!unclosed || closable)

  /* The company's own set for the month after: only while it is still running. */
  const next = stepSalesPeriod(period, 1)
  const tree = useQuery({
    ...kpiAssignmentTreeQuery(next, role ?? 'director'),
    enabled: role !== undefined && isTieredPeriod(next) && period === monthPick().month,
  })
  const companyStep = tree.data?.steps.find((s) => s.level === 'company')
  const unsent = (companyStep?.units?.notSent ?? 0) > 0
  const pace = paceShare(period)

  const todo: CompanyTodoItem[] = []
  if (closable) {
    todo.push({
      id: 'close',
      text: closeSentence(period, gate.data, t),
      action: t(message('Xem trước khi chốt', 'Review before closing', '마감 전 확인')),
      onAct: () => scrollToId(CLOSE_ID),
    })
  }
  if (role && companyStep && unsent) {
    todo.push({
      id: 'assign',
      text: t(
        message(
          `Giao chỉ tiêu tháng ${monthText(next)} cho công ty: hạn ${dm(companyStep.due)}.`,
          `Assign targets for month ${monthText(next)} to the company: due ${dm(companyStep.due)}.`,
          `${monthText(next)}월 회사 목표 배정: 기한 ${dm(companyStep.due)}.`,
        ),
      ),
      action: t(message('Giao chỉ tiêu', 'Assign targets', '목표 배정')),
      onAct: () => void navigate(assignHref(next, role)),
    })
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(message('KPI công ty', 'Company KPIs', '회사 KPI'))}
          description={day && <span className="tnum font-num">{day}</span>}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />
        <KpiTabs period={period} active="company" counts={{ company: todo.length }} />

        <CompanyTodo items={todo} />

        {seesAll ? (
          <QueryBlock
            query={withCatalog(company, catalog)}
            what={message('chỉ số công ty', 'company metrics', '회사 지표')}
          >
            {([data, defs]) => {
              const { hero } = boardOf(defs, data.scorecard.role, data.scorecard.readings)
              const rest = data.scorecard.readings.filter((r) => r.key !== hero?.def.key)
              return (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {hero && <ReadingTile item={hero} hero />}
                    <CommittedTile
                      desk={desk}
                      signed={hero?.def.unit === 'money' ? hero.reading.value : null}
                      target={hero?.def.unit === 'money' ? hero.reading.target : null}
                    />
                  </div>
                  <CompanyStrip catalog={defs} role={data.scorecard.role} readings={rest} />
                </div>
              )
            }}
          </QueryBlock>
        ) : (
          <CommittedTile desk={desk} />
        )}

        {showClose && (
          <div id={CLOSE_ID}>
            <MonthCloseBar period={period} monthClose={company.data?.monthClose} />
          </div>
        )}

        {companyStep?.units && (
          <AssignTile
            units={companyStep.units}
            monthLabel={monthText(next)}
            to={statusHref(next)}
          />
        )}

        <QueryBlock
          query={desk}
          what={message('danh sách đơn vị', 'the list of units', '조직 목록')}
        >
          {(data) => (
            <div className="flex flex-col gap-4">
              <CompareCard period={period} pace={pace} units={data.units} />
              <UnitCards period={period} units={data.units}>
                <SlippingCard period={period} pace={pace} desk={data} />
              </UnitCards>
              <LeaderboardCard period={period} pace={pace} rows={data.leaderboard} />
            </div>
          )}
        </QueryBlock>

        <div className="flex flex-wrap gap-4">
          <LinkButton
            label={t(message('Tình trạng giao', 'Assignment status', '배정 현황'))}
            to={statusHref(period)}
          />
          {!isTieredPeriod(period) && (
            <LinkButton
              label={t(message('Chỉ tiêu tháng', 'Monthly targets', '월간 목표'))}
              to={`${TARGETS_PATH}${monthQuery(period)}`}
            />
          )}
        </div>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiCompanyPage
