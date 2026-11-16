import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell, ArrowLeft, Button, Icon, ScreenHeader, ScreenLayout } from '@pv/ui'
import { TIERED_FROM, isTieredPeriod, type KpiOneOnOneResponse } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { message, useI18n } from '@/app/i18n'
import { kpiCatalogQuery, withCatalog } from '@/data/kpi-catalog'
import { kpiPersonQuery } from '@/data/kpi'
import { kpiOneOnOneQuery } from '@/data/kpi-score'
import { KpiTabs } from '@/components/kpi-tabs'
import { ME_PATH, MONTH_PARAM, UNIT_PATH } from '@/lib/kpi-paths'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { monthWord, useMonthParam } from './kpi-model'
import { QueryBlock } from './kpi-parts'
import { Facts, ScoreTable } from './kpi-one-on-one-parts'
import { ReadNote, WriteForm } from './kpi-one-on-one-write'

/** One person's monthly 1:1 — `/sales/kpi/one-on-one?month=&person=` (ADR 0158 §3–4).
 *  Read from `GET /sales/kpi/:period/one-on-ones/:actorId`; the server says who
 *  may write or acknowledge. The name is a label: a failed read of it leaves
 *  the title without it.
 *
 *  No ContextRail (law 10 debt, as on the other KPI screens): a month's score
 *  is a sum over many records and opens no single object. */

const PERSON_PARAM = 'person'

function Body({
  period,
  actorId,
  one,
}: {
  period: string
  actorId: string
  one: UseQueryResult<KpiOneOnOneResponse>
}) {
  const { t } = useI18n()
  const catalog = useQuery(kpiCatalogQuery)
  const name = useQuery(kpiPersonQuery(period, actorId)).data?.person.name ?? actorId
  return (
    <QueryBlock
      query={withCatalog<KpiOneOnOneResponse>(one, catalog)}
      what={message('1:1', '1:1', '1:1')}
      variant="b"
    >
      {([data, defs]) => {
        if (!data.canWrite && data.note === null && data.score === null) {
          return (
            <p className={NOTE}>
              {t(
                message(
                  'Buổi 1:1 mở sau khi tháng được chốt.',
                  'The 1:1 opens after the month is closed.',
                  '1:1은 월이 마감된 후에 열립니다.',
                ),
              )}
            </p>
          )
        }
        return (
          <>
            {data.score && (
              <>
                <Facts score={data.score} accuracy={data.accuracy} />
                <ScoreTable score={data.score} catalog={defs} />
              </>
            )}
            {data.canWrite ? (
              <WriteForm period={period} actorId={actorId} name={name} data={data} />
            ) : (
              <ReadNote period={period} actorId={actorId} data={data} />
            )}
          </>
        )
      }}
    </QueryBlock>
  )
}

export function KpiOneOnOnePage() {
  const { t } = useI18n()
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [pick] = useMonthParam()
  const period = keyOf(pick)
  const actorId = params.get(PERSON_PARAM) ?? ''
  const name = useQuery({ ...kpiPersonQuery(period, actorId), enabled: actorId !== '' }).data
    ?.person.name
  const me = useSession((s) => s.actor?.id)
  const tiered = isTieredPeriod(period)
  const one = useQuery({
    ...kpiOneOnOneQuery(period, actorId),
    enabled: tiered && actorId !== '',
  })
  /* The person reads their own 1:1 from their tab; a writer comes from the unit tab. */
  const own = one.data?.canAcknowledge === true || (actorId !== '' && actorId === me)
  const [yyyy, mm] = period.split('-')
  const from = monthWord(TIERED_FROM)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={t(
            message(
              `1:1${name ? ` · ${name}` : ''} · Tháng ${mm}/${yyyy}`,
              `1:1${name ? ` · ${name}` : ''} · ${mm}/${yyyy}`,
              `1:1${name ? ` · ${name}` : ''} · ${yyyy}.${mm}`,
            ),
          )}
          actions={
            <Button
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => void navigate(`${own ? ME_PATH : UNIT_PATH}?${MONTH_PARAM}=${period}`)}
            >
              <Icon icon={ArrowLeft} size={16} />
              {own
                ? t(message('Về KPI của tôi', 'Back to My KPIs', '내 KPI로'))
                : t(message('Về Đơn vị của tôi', 'Back to My unit', '내 조직으로'))}
            </Button>
          }
        />
        <KpiTabs period={period} active={own ? 'me' : 'unit'} />
        {actorId === '' ? null : tiered ? (
          <Body key={`${period}/${actorId}`} period={period} actorId={actorId} one={one} />
        ) : (
          <p className={NOTE}>
            {t(
              message(
                `Buổi 1:1 mở từ ${from}, sau khi tháng được chốt.`,
                `The 1:1 opens from ${from}, after the month is closed.`,
                `1:1은 ${from}부터, 월 마감 후에 열립니다.`,
              ),
            )}
          </p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiOneOnOnePage
