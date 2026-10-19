import type { ReactNode } from 'react'
import { SegmentedControl, Select, type SelectOption } from '@pv/ui'
import type { BookView } from './book-view'

/** What a book needs to draw its rows as cards beside its table: the card face,
 *  the Grid / Table switch, a sort pick and the filter-menu section. Shared by
 *  the company and contact books (`account-cards.tsx`, `contact-cards.tsx`).
 *
 *  Each card is a `glass-b` panel on the page itself — `BookPage` drops its own
 *  card around a grid — so a long list still sits on glass-b (law 8) and no
 *  card nests in another. The card is `relative` so a stretched link can open
 *  the profile while the buttons inside stay pressable. */
export const BOOK_CARD =
  'glass-b hover:bg-muted text-foreground relative flex min-w-0 flex-col gap-3 rounded-md p-4 transition-colors has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring'

/** The profile link over the whole card: its `::after` covers the card. */
export const CARD_LINK =
  "text-foreground no-underline outline-none after:absolute after:inset-0 after:rounded-md after:content-['']"

export function ViewSwitch({
  value,
  onChange,
}: {
  value: BookView
  onChange: (v: BookView) => void
}) {
  return (
    <SegmentedControl
      label="Kiểu hiển thị"
      hideLabel
      tone="quiet"
      value={value}
      options={[
        { value: 'grid', label: 'Lưới' },
        { value: 'table', label: 'Bảng' },
      ]}
      onChange={(v) => onChange(v === 'table' ? 'table' : 'grid')}
    />
  )
}

/** Sort and direction in one pick (`key:dir`): a grid has no headers to click. */
export function SortSelect({
  options,
  sort,
  dir,
  onChange,
}: {
  options: SelectOption[]
  sort: string
  dir: string
  onChange: (sort: string, dir: 'asc' | 'desc') => void
}) {
  const current = `${sort}:${dir}`
  /* A header click on the table can leave a sort the list does not offer. */
  const shown = options.some((s) => s.value === current)
    ? options
    : [...options, { value: current, label: 'Theo cột đã chọn ở bảng' }]
  return (
    <Select
      label="Sắp xếp"
      value={current}
      options={shown}
      neutralValue={options[0]?.value}
      onChange={(v) => {
        const [key = '', d] = v.split(':')
        onChange(key, d === 'desc' ? 'desc' : 'asc')
      }}
    />
  )
}

export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex max-h-[280px] min-h-0 flex-col gap-2">
      <h3 className="text-muted-foreground m-0 text-[12px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}
