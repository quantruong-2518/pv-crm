import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, SegmentedControl } from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { kpiDeskQuery } from '@/data/kpi-desk'
import { COMPANY_PATH, ME_PATH, MONTH_PARAM, UNIT_PATH } from '@/lib/kpi-paths'

/** The three tabs under the header of every KPI screen (ADR 0159 §1). The desk
 *  read says which tabs the caller holds; the web never probes a role. While it
 *  loads or fails, or when only one tab is held, nothing is drawn: a lone tab
 *  names a place the caller is already in, and a tab bar carries no error banner. */

export type KpiTab = 'me' | 'unit' | 'company'

const PATH: Record<KpiTab, string> = { me: ME_PATH, unit: UNIT_PATH, company: COMPANY_PATH }

const LABEL = {
  me: message('Của tôi', 'Mine', '내 KPI'),
  unit: message('Đơn vị của tôi', 'My unit', '내 조직'),
  company: message('Toàn công ty', 'Company', '전사'),
}

export type KpiTabsProps = {
  period: string
  active: KpiTab
  /** Things to do under a tab, drawn after its name. */
  counts?: Partial<Record<KpiTab, number>>
}

export function KpiTabs({ period, active, counts }: KpiTabsProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const desk = useQuery(kpiDeskQuery(period))
  const held: KpiTab[] = ['me']
  if (desk.data && desk.data.units.length > 0) held.push('unit')
  if (desk.data?.company) held.push('company')

  if (held.length < 2) return null
  return (
    <SegmentedControl
      label={t(message('Màn KPI', 'KPI view', 'KPI 화면'))}
      hideLabel
      tone="quiet"
      value={active}
      options={held.map((tab) => ({ value: tab, label: t(LABEL[tab]), count: counts?.[tab] }))}
      onChange={(tab) => void navigate(`${PATH[tab as KpiTab]}?${MONTH_PARAM}=${period}`)}
    />
  )
}

/** One card's own load error (ADR 0159 §8): the page around it stays. */
export function KpiCardError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-destructive-foreground m-0 text-[12px] leading-5">
        {t(
          message(
            'Không tải được phần này.',
            'Could not load this part.',
            '이 항목을 불러오지 못했습니다.',
          ),
        )}{' '}
        {isApiError(error) ? userMessage(error) : ''}
      </p>
      <Button variant="ghost" size="sm" className="pointer-coarse:h-12" onClick={onRetry}>
        {t(message('Thử lại', 'Try again', '다시 시도'))}
      </Button>
    </div>
  )
}
