import type { ReactNode } from 'react'
import type { TableColumn } from '@pv/ui'
import type { AfterSaleRow } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { activityAgo } from '@/data/opportunities'
import { CareDayCell } from '@/components/after-sale-cards'
import { CodeCell, DateCell, PicCell } from '@/components/book-cells'
import { DueBadge } from '@/components/contract-bits'
import { MoneyCell } from '@/components/money-cell'
import { TemperatureBadge } from '@/components/temperature-pick'

/** The bought-customer book's cells and columns (ADR 0121). A row reads who
 *  the customer is, how warm, what is next, who cares for them, when we last
 *  spoke, when care is due, and what was collected. The order is the server's,
 *  so no column sorts. */

const NO_CARER = 'Chưa có người chăm sóc'

/** When and by whom the reading was taken rides the pill's title, not a line of its own. */
function temperatureCell(row: AfterSaleRow): ReactNode {
  const reading = row.temperature
  return (
    <TemperatureBadge
      value={reading?.value ?? null}
      title={reading ? `${dmy(reading.at)} · ${reading.by.name}` : undefined}
    />
  )
}

function stepCell(row: AfterSaleRow): ReactNode {
  const step = row.nextStep
  if (!step) return <span className="text-muted-foreground truncate">Chưa có việc tiếp theo</span>
  return (
    <span className="flex min-w-0 items-center gap-2" title={`${step.text} · hạn ${dmy(step.due)}`}>
      <span className="min-w-0 flex-1 truncate">{step.text}</span>
      <DueBadge level={step.dueLevel} className="shrink-0" />
    </span>
  )
}

/** `action` is the hot-row button, which draws nothing on other rows. */
export function afterSaleCells(row: AfterSaleRow, action: ReactNode): ReactNode[] {
  return [
    <span key="c" className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[12.5px] font-semibold" title={row.customer}>
        {row.customer}
      </span>
      <CodeCell code={row.code} />
    </span>,
    <span key="t">{temperatureCell(row)}</span>,
    <span key="s" className="flex min-w-0">
      {stepCell(row)}
    </span>,
    <PicCell
      key="p"
      people={row.carers.map((c) => ({ ...c, role: 'Người chăm sóc' }))}
      empty={NO_CARER}
    />,
    row.lastContactAt ? (
      <span key="l" className="truncate text-[12.5px]" title={dmy(row.lastContactAt)}>
        {activityAgo(row.lastContactAt)}
      </span>
    ) : (
      <span key="l" className="text-muted-foreground truncate text-[12.5px]">
        Chưa liên hệ
      </span>
    ),
    <CareDayCell key="n" row={row} />,
    <MoneyCell key="m" amount={row.collected} />,
    <DateCell key="d" day={row.completedAt} empty="Chưa ghi ngày hoàn tất" />,
    <span key="a" className="flex justify-center">
      {action}
    </span>,
  ]
}

/** Temperature and carer are one value each, so they are toolbar picks, not header lists. */
export function afterSaleColumns(completed: ReactNode): TableColumn[] {
  return [
    { header: 'Khách hàng', width: 'minmax(180px,2fr)' },
    { header: 'Nhiệt độ', width: '120px' },
    { header: 'Việc tiếp theo', width: 'minmax(144px,1.4fr)' },
    { header: 'Người chăm sóc', width: 'minmax(144px,1fr)' },
    { header: 'Liên hệ gần nhất', width: '112px' },
    { header: 'Kỳ chăm sóc tới', width: '120px' },
    { header: 'Đã thu (₫)', width: '152px', align: 'right' },
    { header: 'Hoàn tất', width: '112px', filter: completed },
    { header: <span className="sr-only">Thao tác</span>, width: '152px', align: 'center' },
  ]
}
