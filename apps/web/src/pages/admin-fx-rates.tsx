import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, DataTable, GlassCard, Icon, Plus, ScreenHeader } from '@pv/ui'
import { vnDayOf, type FxRateRow, type FxSource } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { formatNumber, message, useI18n } from '@/app/i18n'
import { SettingsShell } from '@/components/settings-shell'
import { FX_RATE_LABEL, FX_SOURCE_LABEL, fxRatesQuery } from '@/data/fx-rate-admin'
import { dmhm, dmy } from '@/lib/date'
import { QueryBlock } from './kpi-parts'
import { RateDrawer, type RateSeed } from './admin-fx-rates-drawer'

/** One Core · Admin · Rates — the exchange rate of each day and who set
 *  it (ADR 0149). Live only, no scenario.
 *
 *  No ContextRail (law 10): a rate row opens no object with a code, the same
 *  exception `users.tsx` argues for the people book.
 *
 *  `useCan('setting.manage')` gates the buttons although the route already
 *  asks for it, so they stay right if the read and the write are ever split. */

const SOURCE_TONE: Record<FxSource, 'success' | 'warning' | 'draft'> = {
  vietcombank: 'success',
  manual: 'warning',
  legacy: 'draft',
}

const seedOf = (row: FxRateRow): RateSeed => ({
  day: row.day,
  rate: String(row.rate).replace('.', ','),
  fixedDay: true,
})

function RateTable({
  rows,
  canSet,
  onEdit,
}: {
  rows: FxRateRow[]
  canSet: boolean
  onEdit: (row: FxRateRow) => void
}) {
  const { t, lang } = useI18n()
  return (
    <GlassCard variant="b" className="overflow-x-auto p-4 lg:p-5">
      {rows.length === 0 ? (
        <p className="text-muted-foreground m-0 py-8 text-center text-[12.5px] leading-[1.6]">
          {t(message('Chưa có tỷ giá nào.', 'No rates yet.', '등록된 환율이 없습니다.'))}
        </p>
      ) : (
        <DataTable
          className="min-w-[720px]"
          rowHeight="min-h-12"
          columns={[
            { header: t(message('Ngày', 'Day', '날짜')), width: '112px' },
            {
              header: t(FX_RATE_LABEL),
              width: '160px',
              align: 'right',
            },
            { header: t(message('Nguồn', 'Source', '출처')), width: '144px' },
            {
              header: t(message('Người sửa', 'Corrected by', '수정자')),
              width: 'minmax(140px,1fr)',
            },
            { header: t(message('Cập nhật lúc', 'Updated at', '갱신 시각')), width: '128px' },
          ]}
          rows={rows.map((row) => ({
            id: `${row.currency}@${row.day}`,
            onOpen: canSet && row.source !== 'legacy' ? () => onEdit(row) : undefined,
            cells: [
              <span key="d" className="tnum">
                {dmy(row.day)}
              </span>,
              <span key="r" className="tnum font-num">
                {formatNumber(row.rate, lang)}
              </span>,
              <Badge key="s" tone={SOURCE_TONE[row.source]}>
                {t(FX_SOURCE_LABEL[row.source])}
              </Badge>,
              <span key="b" className="block truncate">
                {row.setBy?.name ?? '—'}
              </span>,
              <span key="a" className="tnum">
                {dmhm(row.fetchedAt)}
              </span>,
            ],
          }))}
        />
      )}
    </GlassCard>
  )
}

export function AdminFxRatesPage() {
  const { t } = useI18n()
  const canSet = useCan('setting.manage')
  const rates = useQuery(fxRatesQuery)

  /* Open and seed are kept apart: the drawer keeps its content through the
     exit slide, and `key` remounts it fresh on the next opening. */
  const [drawer, setDrawer] = useState<{ seed: RateSeed; key: number } | null>(null)
  const [open, setOpen] = useState(false)
  const openWith = (seed: RateSeed) => {
    setDrawer((d) => ({ seed, key: (d?.key ?? 0) + 1 }))
    setOpen(true)
  }
  const blank = (): RateSeed => ({ day: vnDayOf(new Date()), rate: '', fixedDay: false })

  return (
    <SettingsShell>
      <ScreenHeader
        title={t(message('Tỷ giá', 'Exchange rates', '환율'))}
        description={t(
          message(
            'Tỷ giá USD quy ra đồng theo từng ngày.',
            'USD to dong rate for each day.',
            '일별 USD 대 동 환율입니다.',
          ),
        )}
        actions={
          canSet && (
            <Button size="lg" onClick={() => openWith(blank())}>
              <Icon icon={Plus} size={16} />
              {t(message('Đặt tỷ giá', 'Set rate', '환율 설정'))}
            </Button>
          )
        }
      />

      <QueryBlock query={rates} what={t(message('tỷ giá', 'exchange rates', '환율'))} variant="b">
        {(data) => (
          <RateTable rows={data.rows} canSet={canSet} onEdit={(row) => openWith(seedOf(row))} />
        )}
      </QueryBlock>

      {drawer && (
        <RateDrawer
          key={drawer.key}
          open={open}
          seed={drawer.seed}
          onClose={() => setOpen(false)}
        />
      )}
    </SettingsShell>
  )
}

export default AdminFxRatesPage
