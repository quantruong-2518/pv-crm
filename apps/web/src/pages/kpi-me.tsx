import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, ScreenHeader, ScreenLayout, SectionTitle } from '@pv/ui'
import type { KpiScorecard } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { toastDone, toastFail } from '@/app/toast'
import { kpiMeQuery, useAcknowledgeKpi } from '@/data/kpi'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { NOTE } from './home-tiles'
import { DESCRIPTION, acknowledgementOf, monthPick, needsAcknowledgement } from './kpi-model'
import { MonthPicker, QueryBlock, Scoreboard } from './kpi-parts'

/** The personal KPI screen — what the reader is short of, per role they hold,
 *  read live from `GET /sales/kpi/:period/me`. No fixture and no scenario.
 *
 *  Every figure and every verdict is the server's. The acknowledgement button
 *  shows only while an agreed target is unreceived or has changed since, and
 *  never on a closed month, which takes no more writes.
 *
 *  No ContextRail (law 10 debt, as on the overview): a scorecard is a sum over
 *  many records and opens no single object a chain could be anchored on. */

function RoleBoard({
  period,
  closed,
  card,
}: {
  period: string
  closed: boolean
  card: KpiScorecard
}) {
  const acknowledge = useAcknowledgeKpi(period, card.role)
  const ack = acknowledgementOf(card)

  return (
    <section className="flex flex-col gap-4">
      {/* The button is a sibling, not `actions`: below `sm` it takes its own row. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle size="lg" hint={<span className="tnum font-num">{ack.text}</span>}>
          {ROLE_LABEL[card.role]}
        </SectionTitle>
        {!closed && needsAcknowledgement(ack) && (
          <Button
            className="pointer-coarse:h-12 shrink-0 self-start"
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(undefined, {
                onSuccess: () => toastDone('Đã nhận chỉ tiêu'),
                onError: (e) => toastFail(userMessage(e)),
              })
            }
          >
            Xác nhận đã nhận chỉ tiêu
          </Button>
        )}
      </div>
      <Scoreboard role={card.role} readings={card.readings} />
    </section>
  )
}

export function KpiMePage() {
  const chrome = useAppChrome()
  const [pick, setPick] = useState(monthPick)
  const me = useQuery(kpiMeQuery(keyOf(pick)))

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="KPI của tôi"
          description={DESCRIPTION}
          actions={<MonthPicker pick={pick} onPick={setPick} />}
        />

        <QueryBlock query={me} what="KPI của bạn">
          {(data) => (
            <>
              {data.closed && (
                <p className={NOTE}>Tháng đã kết thúc nên chỉ tiêu của tháng không còn thay đổi.</p>
              )}
              {data.scorecards.map((card) => (
                <RoleBoard key={card.role} period={data.period} closed={data.closed} card={card} />
              ))}
            </>
          )}
        </QueryBlock>
      </ScreenLayout>
    </AppShell>
  )
}

export default KpiMePage
