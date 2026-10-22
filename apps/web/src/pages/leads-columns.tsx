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
  LeadPicCell,
  SourceCell,
  StatusCell,
} from './leads-parts'
import type { useLeadFilters } from './leads-filters'
import { LEAD_HEADER } from './leads-model'

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
): TableColumn[] {
  return [
    {
      header: (
        <Checkbox
          checked={header.checked}
          indeterminate={header.indeterminate}
          onChange={header.onChange}
          label={<span className="sr-only">Chọn cả trang</span>}
          className="w-full justify-center gap-0 p-0"
        />
      ),
      width: COL.select,
    },
    { header: 'Công ty / Người liên hệ', width: COL.name, sortKey: 'company' },
    { header: LEAD_HEADER.source, width: COL.text, filter: filters.origin },
    { header: LEAD_HEADER.status, width: COL.status, filter: filters.states },
    view.heldView
      ? { header: 'Ngày hẹn gặp lại', width: COL.date }
      : {
          header: LEAD_HEADER.created,
          width: COL.moment,
          sortKey: 'createdAt',
          filter: filters.created,
        },
    ...(view.disabledView
      ? [{ header: 'Ngày vô hiệu hóa', width: COL.moment }]
      : [
          { header: LEAD_HEADER.creator, width: COL.person, filter: filters.creator },
          { header: LEAD_HEADER.owner, width: COL.person, filter: filters.owner },
          { header: <span className="sr-only">Ghim</span>, width: COL.pin },
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
