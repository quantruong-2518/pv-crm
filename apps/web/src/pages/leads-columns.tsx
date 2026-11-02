import type { ReactNode } from 'react'
import { Checkbox, type TableColumn } from '@pv/ui'
import type { LeadRow } from '@pv/contracts'
import { COL } from '@/components/book-columns'
import { HoldUntilCell } from '@/components/hold-strip'
import { CompanyCell } from '@/components/lead-cells'
import { PinCell } from '@/components/pin-cell'
import { SelectionCell } from '@/components/table-bits'
import {
  CreatedByCell,
  DisabledAtCell,
  EnteredCell,
  IndustryCell,
  LeadPicCell,
  SourceCell,
  StatusCell,
} from './leads-parts'
import type { useLeadFilters } from './leads-filters'
import { translate, type Lang } from '@/app/i18n'
import { LEAD_COPY } from '@/data/lead-copy'

/** The lead book's column list and row cells. Two views swap columns: the held
 *  tab trades the entry date for the hold's date, and the switched-off tab
 *  trades the PIC and pin columns for the one fact it adds. */

type View = { heldView: boolean; disabledView: boolean }

export type LeadSelectionHeader = {
  checked: boolean
  indeterminate: boolean
  onChange: (on: boolean) => void
}

export function leadColumns(
  view: View,
  filters: ReturnType<typeof useLeadFilters>,
  header: LeadSelectionHeader,
  lang: Lang,
): TableColumn[] {
  return [
    {
      header: (
        <Checkbox
          checked={header.checked}
          indeterminate={header.indeterminate}
          onChange={header.onChange}
          label={<span className="sr-only">{translate(LEAD_COPY.selectPage, lang)}</span>}
          className="w-full justify-center gap-0 p-0"
        />
      ),
      width: COL.select,
    },
    { header: translate(LEAD_COPY.companyContact, lang), width: COL.name, sortKey: 'company' },
    { header: translate(LEAD_COPY.source, lang), width: COL.text, filter: filters.origin },
    { header: translate(LEAD_COPY.status, lang), width: COL.status, filter: filters.states },
    { header: translate(LEAD_COPY.industry, lang), width: COL.text, filter: filters.industry },
    view.heldView
      ? { header: translate(LEAD_COPY.heldUntil, lang), width: COL.date }
      : {
          header: translate(LEAD_COPY.created, lang),
          width: COL.moment,
          sortKey: 'createdAt',
          filter: filters.created,
        },
    ...(view.disabledView
      ? [{ header: translate(LEAD_COPY.disabledAt, lang), width: COL.moment }]
      : [
          {
            header: translate(LEAD_COPY.creator, lang),
            width: COL.person,
            filter: filters.creator,
          },
          { header: translate(LEAD_COPY.owner, lang), width: COL.person, filter: filters.owner },
          {
            header: <span className="sr-only">{translate(LEAD_COPY.pin, lang)}</span>,
            width: COL.pin,
          },
        ]),
  ]
}

export type LeadCellHandlers = {
  selected: boolean
  onPress: (event: React.PointerEvent<HTMLElement>) => void
  onSelect: (on: boolean) => void
  onEmail?: () => void
}

export function leadCells(l: LeadRow, view: View, on: LeadCellHandlers): ReactNode[] {
  return [
    <SelectionCell
      key="select"
      checked={on.selected}
      label={l.company}
      onPress={on.onPress}
      onChange={on.onSelect}
    />,
    <CompanyCell key="c" lead={l} onEmail={on.onEmail} />,
    <SourceCell key="s" lead={l} />,
    <StatusCell key="w" lead={l} />,
    <IndustryCell key="i" lead={l} />,
    view.heldView ? (
      <span key="d">{l.hold && <HoldUntilCell hold={l.hold} />}</span>
    ) : (
      <EnteredCell key="d" lead={l} />
    ),
    ...(view.disabledView
      ? [<DisabledAtCell key="x" lead={l} />]
      : [
          <CreatedByCell key="b" lead={l} />,
          <LeadPicCell key="o" lead={l} />,
          <PinCell key="p" subject="lead" code={l.code} label={l.company} />,
        ]),
  ]
}
