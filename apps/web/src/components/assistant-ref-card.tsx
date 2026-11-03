import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, ChevronRight, DataTable, GlassCard, Icon, cn } from '@pv/ui'
import type { AssistantRef } from '@pv/contracts'
import { useSession, access } from '@/app/auth'
import { formatDate, message, useI18n } from '@/app/i18n'
import { refPath } from '@/data/assistant'
import { ASSISTANT_COPY as C } from '@/data/assistant-copy'
import { compactMoney } from '@/components/deal-money/money'
import {
  OVERDUE_COPY,
  isLateClose,
  opportunityProfileQuery,
  standingLabel,
} from '@/data/opportunities'
import { salesLabel } from '@/data/sales-labels-i18n'
import { SEARCH_KIND_FACTS } from '@/data/search-rows'
import { CodeChip, HAIRLINE } from './assistant-bits'

/** The records an answer names (owner, 03/11 design): one or two become cards
 *  inside the bubble, three or more a table under it on its own `.glass-b` (law 8).
 *
 *  A card reads facts only for an opportunity, only for a viewer holding
 *  `opportunity.view`, and only in the newest answer of the thread (`facts`): one
 *  live read per card, at most two, so reopening a long chat fires none for the
 *  older answers. Every other card shows its label alone.
 *  The labels are the opportunity book's own: stage, overdue, expected close. */

const STAGE = message('Giai đoạn', 'Stage', '단계')
const CLOSE = message('Ngày dự kiến chốt', 'Expected close date', '예상 마감일')
const VIEW_DEAL = { branch: 'Sales', permission: 'opportunity.view' } as const
/** The book keeps its overdue word lower case in running text; a badge starts a capital. */
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

export function RefCard({
  refItem,
  openPath,
  facts,
}: {
  refItem: AssistantRef
  openPath: (path: string) => void
  facts: boolean
}) {
  const { t, lang } = useI18n()
  const [name, ...rest] = refItem.label.split(' · ')
  const actor = useSession((s) => s.actor)
  const deal = useQuery({
    ...opportunityProfileQuery(refItem.code),
    enabled: facts && refItem.kind === 'opportunity' && access.check(actor, VIEW_DEAL).ok,
  }).data
  const late = deal ? isLateClose(deal) : false

  return (
    <button
      type="button"
      className={cn(
        HAIRLINE,
        'motion-std bg-card hover:bg-muted pointer-coarse:min-h-12 flex w-full min-w-0 flex-wrap items-center gap-4 rounded-lg px-4 py-3 text-left',
      )}
      onClick={() => openPath(refPath(refItem))}
    >
      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
        <span className="flex items-center gap-2">
          <CodeChip code={refItem.code} />
          <Badge tone="draft" className="text-[12px]">
            {t(SEARCH_KIND_FACTS[refItem.kind].label)}
          </Badge>
        </span>
        <span className="text-foreground truncate text-[14px] font-semibold">{name}</span>
        {rest.length > 0 && (
          <span className="text-muted-foreground truncate text-[13px]">{rest.join(' · ')}</span>
        )}
      </span>
      {deal && (
        <span className="grid min-w-0 flex-[1_1_320px] grid-cols-3 gap-4">
          <Fact label={t(STAGE)}>
            <span className="text-[14px] font-semibold">
              {salesLabel(standingLabel(deal), lang)}
            </span>
          </Fact>
          {deal.amount !== null && (
            <Fact label={t(C.value)}>
              <span className="tnum text-accent-foreground text-[15px] font-semibold">
                {compactMoney(deal.amount, deal.currency)}
              </span>
            </Fact>
          )}
          {deal.expectedClose !== null && (
            <Fact label={t(CLOSE)}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="tnum text-[14px] font-semibold">
                  {formatDate(deal.expectedClose, lang)}
                </span>
                {late && (
                  <Badge tone="warning" className="text-[12px]">
                    {capital(t(OVERDUE_COPY))}
                  </Badge>
                )}
              </span>
            </Fact>
          )}
        </span>
      )}
      <Icon icon={ChevronRight} size={16} className="text-glass-foreground shrink-0" />
    </button>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-glass-foreground text-[12px]">{label}</span>
      {children}
    </span>
  )
}

export function RefTable({
  refs,
  openPath,
}: {
  refs: AssistantRef[]
  openPath: (path: string) => void
}) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="overflow-hidden" aria-label={t(C.related)}>
      <DataTable
        flush
        columns={[
          { header: t(C.code), width: '128px' },
          { header: t(C.name), width: 'minmax(0,1fr)' },
        ]}
        rows={refs.map((ref) => {
          const [name, ...rest] = ref.label.split(' · ')
          return {
            id: `${ref.kind}:${ref.code}`,
            cells: [
              /* Not interactive: the whole row already opens the record. */
              <CodeChip key="code" code={ref.code} />,
              <span key="label" className="min-w-0 truncate text-[12.5px]">
                <span className="text-foreground font-semibold">{name}</span>
                {rest.length > 0 && (
                  <span className="text-muted-foreground"> · {rest.join(' · ')}</span>
                )}
              </span>,
            ],
            onOpen: () => openPath(refPath(ref)),
          }
        })}
      />
    </GlassCard>
  )
}
