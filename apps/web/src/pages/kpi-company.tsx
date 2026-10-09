import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell, ScreenHeader, ScreenLayout, SectionTitle } from '@pv/ui'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { kpiCompanyQuery, kpiPeopleQuery, kpiTargetsQuery } from '@/data/kpi'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { AttentionBlock, PeopleBlock } from './kpi-company-people'
import { RoleTargets } from './kpi-company-targets'
import { DESCRIPTION, monthPick } from './kpi-model'
import { MonthPicker, QueryBlock, Scoreboard } from './kpi-parts'

/** The company KPI screen, read live from `/sales/kpi/:period/…`. No fixture
 *  and no scenario.
 *
 *  Exceptions come first because that is what a manager opens the screen for;
 *  then the room's scorecard, the targets per role, and everyone's readings.
 *  The route asks for `performance.view` only, so each block that needs more
 *  is gated on its own permission and a block the reader may not open is
 *  dropped and named, never drawn as a failure.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

export function KpiCompanyPage() {
  const chrome = useAppChrome()
  const canTargets = useCan('kpi.view')
  const canAll = useCan('kpi.view-all')
  const canSet = useCan('kpi.set-target')
  const me = useSession((s) => s.actor?.id)

  const [pick, setPick] = useState(monthPick)
  const period = keyOf(pick)

  const company = useQuery(kpiCompanyQuery(period))
  const targets = useQuery({ ...kpiTargetsQuery(period), enabled: canTargets })
  const people = useQuery({ ...kpiPeopleQuery(period), enabled: canAll })

  const hidden = [!canTargets && 'chỉ tiêu theo vai trò', !canAll && 'KPI từng người'].filter(
    Boolean,
  )

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="KPI công ty"
          description={DESCRIPTION}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        {canAll && (
          <section className="flex flex-col gap-3">
            <SectionTitle
              size="lg"
              hint="Chỉ số chậm nhịp hoặc không đạt, và người chưa nhận chỉ tiêu."
            >
              Cần chú ý
            </SectionTitle>
            <QueryBlock query={people} what="danh sách cần chú ý" variant="b">
              {(data) => <AttentionBlock people={data.people} />}
            </QueryBlock>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <SectionTitle size="lg">Chỉ số phòng Kinh doanh</SectionTitle>
          <QueryBlock query={company} what="chỉ số phòng Kinh doanh">
            {(data) => <Scoreboard role={data.scorecard.role} readings={data.scorecard.readings} />}
          </QueryBlock>
        </section>

        {canTargets && (
          <section className="flex flex-col gap-3">
            <SectionTitle
              size="lg"
              hint="Một người gửi đề nghị, một người khác duyệt. Chỉ tiêu đã duyệt muốn đổi thì gửi đề nghị mới; hệ thống lưu thành phiên bản mới."
            >
              Chỉ tiêu theo vai trò
            </SectionTitle>
            <QueryBlock query={targets} what="chỉ tiêu theo vai trò" variant="b">
              {(data) => (
                <>
                  {data.closed && (
                    <p className={NOTE}>
                      Tháng đã kết thúc nên chỉ tiêu của tháng không còn thay đổi.
                    </p>
                  )}
                  {data.roles.map((entry) => (
                    <RoleTargets
                      key={`${data.period}/${entry.role}`}
                      period={data.period}
                      entry={entry}
                      canSet={canSet && !data.closed}
                      me={me}
                    />
                  ))}
                </>
              )}
            </QueryBlock>
          </section>
        )}

        {canAll && (
          <section className="flex flex-col gap-3">
            <SectionTitle size="lg">KPI từng người</SectionTitle>
            <QueryBlock query={people} what="KPI từng người" variant="b" quiet>
              {(data) => <PeopleBlock people={data.people} onRetry={() => void people.refetch()} />}
            </QueryBlock>
          </section>
        )}

        {hidden.length > 0 && (
          <p className={NOTE}>Bị ẩn theo quyền của bạn: {hidden.join(' · ')}.</p>
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiCompanyPage
