import { Link } from 'react-router-dom'
import { GlassCard, SectionTitle } from '@pv/ui'
import type { KpiDeskMember, KpiDeskUnitView } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { oneOnOneHref } from '@/lib/kpi-paths'
import { PILL_LINK } from './home-tiles'
import { monthWord } from './kpi-model'
import { ONE_CARD_ID } from './kpi-unit-model'

/** The unit's 1:1 for the month just closed (ADR 0159 §4). The desk only
 *  sends the counts; each name opens the 1:1 page, which says who wrote what. */

export function OneOnOneCard({
  counts,
  members,
  month,
}: {
  counts: NonNullable<KpiDeskUnitView['oneOnOnes']>
  members: readonly KpiDeskMember[]
  month: string
}) {
  const { t } = useI18n()
  const word = monthWord(month)
  const { written, acknowledged, total } = counts
  return (
    <section id={ONE_CARD_ID} className="flex flex-col gap-3">
      <SectionTitle size="lg">
        {t(message(`1:1 ${word}`, `1:1 ${word}`, `${word} 1:1`))}
      </SectionTitle>
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <p className="tnum text-[12.5px] leading-5">
          {t(
            message(
              `Đã viết ${written}/${total}, người nhận đã xác nhận ${acknowledged}.`,
              `Written ${written}/${total}, acknowledged by the person ${acknowledged}.`,
              `작성 ${written}/${total}, 본인 확인 ${acknowledged}.`,
            ),
          )}
        </p>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.actorId} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] font-semibold">{m.name}</span>
              <Link to={oneOnOneHref(month, m.actorId)} className={PILL_LINK}>
                {t(message('Mở 1:1', 'Open 1:1', '1:1 열기'))}
              </Link>
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  )
}
