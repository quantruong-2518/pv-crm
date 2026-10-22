import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Plus,
  ScreenHeader,
  SectionTitle,
} from '@pv/ui'
import type { AiPrice } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { SettingsShell } from '@/components/settings-shell'
import {
  aiCostsQuery,
  aiPricesQuery,
  firstDayOf,
  knownModelsOf,
  unpricedModelsOf,
} from '@/data/ai-costs'
import { localDay } from '@/data/local-day'
import { currentPick, keyOf, stepPick, type PeriodPick } from './home-model'
import { QueryBlock } from './kpi-parts'
import {
  CostBreakdown,
  CostByDay,
  CostMonthPicker,
  CostTotals,
  PriceTable,
  UnpricedNotice,
} from './admin-costs-parts'
import { PriceDrawer, type PriceSeed } from './admin-costs-price'

/** One Core · Admin · AI cost — what AI cost in a month, and the unit prices it
 *  is costed at (ADR 0102). Live only, no scenario.
 *
 *  No ContextRail (law 10): a cost line sums many calls and opens no object
 *  with a code, the same exception `users.tsx` argues for the people book.
 *
 *  `useCan('cost.view')` gates the price buttons although the route already
 *  asks for it: the write door and the screen share one permission today, and
 *  the gate keeps the buttons right if they are ever split. */

const seedOf = (row: AiPrice): PriceSeed => ({
  model: row.model,
  input: String(row.inputUsdPerMTok).replace('.', ','),
  output: String(row.outputUsdPerMTok).replace('.', ','),
  from: row.effectiveFrom,
})

export function AdminCostsPage() {
  const canSet = useCan('cost.view')

  const [pick, setPick] = useState<PeriodPick>(() => ({ ...currentPick(), grain: 'month' }))
  const month = keyOf(pick)
  const report = useQuery(aiCostsQuery(month))
  const prices = useQuery(aiPricesQuery)

  /* Open and seed are kept apart: the drawer keeps its content through the
     exit slide, and `key` remounts it fresh on the next opening. */
  const [drawer, setDrawer] = useState<{ seed: PriceSeed; key: number } | null>(null)
  const [open, setOpen] = useState(false)
  const openWith = (seed: PriceSeed) => {
    setDrawer((d) => ({ seed, key: (d?.key ?? 0) + 1 }))
    setOpen(true)
  }
  const blank = (model = '', from = localDay(new Date())): PriceSeed => ({
    model,
    input: '',
    output: '',
    from,
  })
  const earlier = stepPick(pick, -1)

  return (
    <SettingsShell>
      <ScreenHeader
        title="Chi phí"
        description="Tính theo bảng giá bên dưới, có thể khác hoá đơn của nhà cung cấp."
        actions={<CostMonthPicker pick={pick} onPick={setPick} />}
      />

      <QueryBlock query={report} what="chi phí của tháng">
        {(data) =>
          data.totals.calls === 0 ? (
            <GlassCard>
              <EmptyState
                icon={Inbox}
                message="Tháng này chưa dùng AI lần nào."
                action={{
                  label: 'Xem tháng trước',
                  onClick: earlier ? () => setPick(earlier) : undefined,
                }}
                className="py-12"
              />
            </GlassCard>
          ) : (
            <>
              {/* A price from the month's first day is what clears its warning. */}
              <UnpricedNotice
                models={unpricedModelsOf(data)}
                canSet={canSet}
                onPrice={(model) => openWith(blank(model, firstDayOf(month)))}
              />
              <CostTotals line={data.totals} />
              <section className="flex flex-col gap-3">
                <SectionTitle size="md">Chi phí theo ngày</SectionTitle>
                <CostByDay days={data.byDay} />
              </section>
              <CostBreakdown report={data} />
            </>
          )
        }
      </QueryBlock>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="md"
          actions={
            canSet && (
              <Button size="md" className="pointer-coarse:h-12" onClick={() => openWith(blank())}>
                <Icon icon={Plus} size={16} />
                Đặt giá
              </Button>
            )
          }
        >
          Bảng giá
        </SectionTitle>
        <QueryBlock query={prices} what="bảng giá" variant="b">
          {(data) => (
            <PriceTable
              rows={data.rows}
              canSet={canSet}
              onAdd={() => openWith(blank())}
              onEdit={(row) => openWith(seedOf(row))}
            />
          )}
        </QueryBlock>
      </section>

      {drawer && (
        <PriceDrawer
          key={drawer.key}
          open={open}
          seed={drawer.seed}
          models={knownModelsOf(report.data, prices.data)}
          onClose={() => setOpen(false)}
        />
      )}
    </SettingsShell>
  )
}

export default AdminCostsPage
