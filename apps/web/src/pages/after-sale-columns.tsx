import type { ReactNode } from 'react'
import type { TableColumn } from '@pv/ui'
import type { AfterSaleRow } from '@pv/contracts'
import { formatDate, translate, type Lang } from '@/app/i18n'
import { AFTER_SALE_COPY as COPY } from '@/data/after-sale-copy'
import { CareDayCell } from '@/components/after-sale-cards'
import { CodeCell, DateCell, PicCell } from '@/components/book-cells'
import { DueBadge } from '@/components/contract-bits'
import { MoneyCell } from '@/components/money-cell'
import { TemperatureBadge } from '@/components/temperature-pick'

/** The bought-customer book's cells and columns (ADR 0121). A row reads who
 *  the customer is, how warm, what is next, who cares for them, when we last
 *  spoke, when care is due, and what was collected. The order is the server's,
 *  so no column sorts. */

/** When and by whom the reading was taken rides the pill's title, not a line of its own. */
function temperatureCell(row: AfterSaleRow, lang: Lang): ReactNode {
  const reading = row.temperature
  return (
    <TemperatureBadge
      value={reading?.value ?? null}
      title={reading ? `${formatDate(reading.at, lang)} · ${reading.by.name}` : undefined}
    />
  )
}

function stepCell(row: AfterSaleRow, lang: Lang): ReactNode {
  const step = row.nextStep
  if (!step)
    return <span className="text-muted-foreground truncate">{translate(COPY.noStep, lang)}</span>
  return (
    <span
      className="flex min-w-0 items-center gap-2"
      title={`${step.text} · ${translate(COPY.dueOn, lang)} ${formatDate(step.due, lang)}`}
    >
      <span className="min-w-0 flex-1 truncate">{step.text}</span>
      <DueBadge level={step.dueLevel} className="shrink-0" />
    </span>
  )
}

/** `action` is the hot-row button, which draws nothing on other rows. */
export function afterSaleCells(row: AfterSaleRow, action: ReactNode, lang: Lang): ReactNode[] {
  return [
    <span key="c" className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[12.5px] font-semibold" title={row.customer}>
        {row.customer}
      </span>
      <CodeCell code={row.code} />
    </span>,
    <span key="t">{temperatureCell(row, lang)}</span>,
    <span key="s" className="flex min-w-0">
      {stepCell(row, lang)}
    </span>,
    <PicCell
      key="p"
      people={row.carers.map((c) => ({ ...c, role: translate(COPY.carer, lang) }))}
      empty={translate(COPY.noCarer, lang)}
    />,
    row.lastContactAt ? (
      <span key="l" className="truncate text-[12.5px]" title={formatDate(row.lastContactAt, lang)}>
        {formatDate(row.lastContactAt, lang)}
      </span>
    ) : (
      <span key="l" className="text-muted-foreground truncate text-[12.5px]">
        {translate(COPY.noContact, lang)}
      </span>
    ),
    <CareDayCell key="n" row={row} />,
    <MoneyCell key="m" amount={row.collected} />,
    <DateCell key="d" day={row.completedAt} empty={translate(COPY.noCompletedDay, lang)} />,
    <span key="a" className="flex justify-center">
      {action}
    </span>,
  ]
}

/** Temperature and carer are one value each, so they are toolbar picks, not header lists. */
export function afterSaleColumns(completed: ReactNode, lang: Lang): TableColumn[] {
  return [
    { header: translate(COPY.customer, lang), width: 'minmax(180px,2fr)' },
    { header: translate(COPY.temperature, lang), width: '120px' },
    { header: translate(COPY.nextStep, lang), width: 'minmax(144px,1.4fr)' },
    { header: translate(COPY.carer, lang), width: 'minmax(144px,1fr)' },
    { header: translate(COPY.lastContact, lang), width: '112px' },
    { header: translate(COPY.nextCare, lang), width: '120px' },
    { header: translate(COPY.collected, lang), width: '152px', align: 'right' },
    { header: translate(COPY.completed, lang), width: '112px', filter: completed },
    {
      header: <span className="sr-only">{translate(COPY.action, lang)}</span>,
      width: '152px',
      align: 'center',
    },
  ]
}
