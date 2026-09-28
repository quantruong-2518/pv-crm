import { useState, type ReactNode } from 'react'
import type { Actor } from '@pv/engines'
import { Check, Lock, Plus, Search, TriangleAlert, Users, X } from '@pv/ui'
import { Avatar, Button, GlassCard, Icon, Input, Modal, Select, cn } from '@pv/ui'
import { SALES_INBOX } from '@pv/contracts'
import type { LetterContact } from '@/data/mail-letters'
import type { ToCell } from './letter-model'

/** The recipients card of the one-screen composer (G-Compose, G7) and the
 *  secondary picker behind its "+n" and Add buttons.
 *
 *  The To row shows three people, never the whole list: a group letter to a
 *  whole department would otherwise push the letter below the fold. Every
 *  chip is one line; the address rides in its `title`. */

/** How many To chips stand in the row before "+n" takes over — the board's. */
const SHOWN = 3

export function RecipientsCard({
  cells,
  cc,
  colleagues,
  onOpenPicker,
  onDropTo,
  onAddCc,
  onDropCc,
}: {
  cells: readonly ToCell[]
  cc: readonly Actor[]
  /** Everyone who may be copied in, already-copied ones included. */
  colleagues: readonly Actor[]
  onOpenPicker: () => void
  onDropTo: (code: string) => void
  onAddCc: (id: string) => void
  onDropCc: (id: string) => void
}) {
  const more = cells.length - SHOWN
  const addable = colleagues.filter((person) => !cc.some((c) => c.id === person.id))

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 p-4">
      <span className="flex items-center gap-2 text-[13px] font-semibold leading-5">
        <Icon icon={Users} size={16} />
        Người nhận
      </span>

      <Row label="To">
        {cells.slice(0, SHOWN).map((cell) => (
          <ToChip key={cell.code} cell={cell} onDrop={() => onDropTo(cell.code)} />
        ))}
        {more > 0 && (
          <Button
            size="lg"
            variant="ghost"
            className="tnum"
            aria-label={`Xem cả ${cells.length} người trong To`}
            onClick={onOpenPicker}
          >
            +{more}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={onOpenPicker}>
          <Icon icon={Plus} size={16} />
          Thêm
        </Button>
      </Row>

      <Row label="CC">
        {cc.map((person) => (
          <span
            key={person.id}
            title={person.email}
            className="bg-surface-ink/9 flex h-12 max-w-full items-center gap-2 rounded-md pl-2"
          >
            <Avatar name={person.name} size="sm" />
            <span className="truncate text-[13px] font-medium">{person.name}</span>
            <DropButton label={`Bỏ ${person.name}`} onClick={() => onDropCc(person.id)} />
          </span>
        ))}
        <span
          title="Luôn CC, không bỏ được"
          className="bg-surface-ink/9 flex h-12 items-center gap-2 rounded-md pl-2 pr-3"
        >
          <span role="img" aria-label="Khoá" className="text-muted-foreground flex">
            <Icon icon={Lock} size={14} />
          </span>
          <span className="whitespace-nowrap font-mono text-[12px]">{SALES_INBOX}</span>
        </span>
        {addable.length > 0 && (
          <Select
            label="Thêm đồng nghiệp vào CC"
            hideLabel
            size="lg"
            className="w-[240px]"
            value=""
            onChange={(id) => id && onAddCc(id)}
            options={[
              { value: '', label: 'Thêm đồng nghiệp' },
              ...addable.map((person) => ({ value: person.id, label: person.name })),
            ]}
          />
        )}
      </Row>
    </GlassCard>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] items-start gap-3">
      <span className="text-muted-foreground pt-4 text-[12px] font-medium leading-4">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function ToChip({ cell, onDrop }: { cell: ToCell; onDrop: () => void }) {
  return (
    <span
      title={cell.line}
      className="bg-surface-ink/9 flex h-12 max-w-full items-center gap-2 rounded-md pl-2"
    >
      <Avatar name={cell.name} size="sm" />
      <span className="truncate text-[13px] font-medium">{cell.name}</span>
      {cell.flag && <span className="text-warning whitespace-nowrap text-[12px]">{cell.flag}</span>}
      {cell.ok && (
        <span role="img" aria-label="Sẽ nhận" className="text-success flex">
          <Icon icon={Check} size={14} />
        </span>
      )}
      {cell.flag && (
        <span role="img" aria-label="Không nhận" className="text-warning flex">
          <Icon icon={TriangleAlert} size={14} />
        </span>
      )}
      <DropButton label={`Bỏ ${cell.name}`} onClick={onDrop} />
    </span>
  )
}

function DropButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground motion-std hover:bg-surface-ink/9 hover:text-foreground flex size-12 shrink-0 items-center justify-center rounded-md"
    >
      <Icon icon={X} size={14} />
    </button>
  )
}

/** The secondary picker: search the company's people, add with one button per name, and
 *  see the whole To list in three columns with each person's verdict. */
export function RecipientPicker({
  open,
  onClose,
  company,
  pool,
  cells,
  badge,
  onAdd,
  onDrop,
}: {
  open: boolean
  onClose: () => void
  company?: string
  pool: readonly LetterContact[] | undefined
  cells: readonly ToCell[]
  badge: ReactNode
  onAdd: (code: string) => void
  onDrop: (code: string) => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const picked = new Set(cells.map((cell) => cell.code))
  const found = (pool ?? []).filter(
    (row) =>
      !picked.has(row.code) && (!q || `${row.name} ${row.email ?? ''}`.toLowerCase().includes(q)),
  )
  const close = () => {
    setQuery('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={<span className="tnum">{`Người nhận To · ${cells.length} người`}</span>}
      meta={badge}
      footer={
        <div className="flex justify-end">
          <Button size="lg" onClick={close}>
            Xong
          </Button>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">
            {company
              ? `Tìm liên hệ của ${company} theo tên hoặc email`
              : 'Tìm liên hệ theo tên hoặc email'}
          </span>
          <Input
            type="search"
            className="h-12"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên người hoặc @tên-miền"
            suffix={<Icon icon={Search} size={16} className="text-muted-foreground" />}
          />
        </label>

        {pool === undefined ? null : found.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {found.map((row) => (
              <Button
                key={row.code}
                size="lg"
                variant="ghost"
                title={row.email ?? 'Thiếu email'}
                onClick={() => onAdd(row.code)}
              >
                <Icon icon={Plus} size={16} />
                {row.name}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground m-0 text-[12px] leading-5">
            Không có liên hệ nào khớp, hoặc mọi người đã có trong To.
          </p>
        )}

        <GlassCard variant="b" className="p-3">
          {cells.length === 0 && (
            <p className="text-muted-foreground m-0 text-[12px] leading-5">Chưa có ai trong To.</p>
          )}
          <ul className="m-0 grid max-h-[520px] min-w-0 list-none grid-cols-1 content-start gap-2 overflow-y-auto p-0 sm:grid-cols-2 lg:grid-cols-3">
            {cells.map((cell) => (
              <li
                key={cell.code}
                className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-md py-1 pl-2"
              >
                <Avatar name={cell.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium leading-5">{cell.name}</span>
                  <span
                    className={cn(
                      'font-mono text-[11px] leading-4 [overflow-wrap:anywhere]',
                      cell.flag ? 'text-warning' : 'text-glass-foreground',
                    )}
                  >
                    {cell.line}
                  </span>
                </span>
                <DropButton label={`Bỏ ${cell.name}`} onClick={() => onDrop(cell.code)} />
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </Modal>
  )
}
