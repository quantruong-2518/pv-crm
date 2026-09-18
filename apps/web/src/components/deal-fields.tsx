import { useRef, useState } from 'react'
import { Paperclip, Plus, Trash2, Upload, X } from '@pv/ui'
import { Button, Icon, Input, billions, cn } from '@pv/ui'
import { OPPORTUNITY_FILES_MAX } from '@pv/contracts'
import { CURRENCIES, toMoneyVnd, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { SetDraft } from '@/data/deal-draft'
import { useSalesPeople } from '@/data/directory'
import { useProductCatalog } from '@/data/sales-config'
import { PersonTokenField } from '@/components/person-token-field'
import { Field } from '@/components/ops-fields'

/** Module 3 · the boxes of the DEAL FORM.
 *
 *  Drawn by both doors onto the same piece of paper — the form card
 *  (`pages/opportunity-form-card.tsx`) and the convert panel
 *  (`components/convert-dialog.tsx`). They answer one layout: tags and a
 *  searchable picker instead of walls of toggles, so the eye lands on what
 *  was CHOSEN rather than on everything that was not. `ops-fields.tsx` keeps
 *  the frame (`Field`) and the loss block.
 *
 *  Nothing here is in `@pv/ui`: every one of them calls an app query, and the
 *  library may not know a branch (package boundary · CLAUDE.md). */

/** How far the money box may grow — the same safe-integer ceiling the wire
 *  already holds, moved to the keystroke that would cross it. */
const AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** The deal's amount — ONE box, with a suffix naming its own currency.
 *
 *  Only the convert panel stands a currency picker beside it, because that is
 *  the one door where a currency is chosen. So the suffix carries the answer
 *  everywhere else, and it reads `CURRENCIES` rather than printing "VND": a
 *  box that says VND over a dollar figure is the most expensive lie this
 *  screen could tell. */
export function AmountField({
  draft,
  onSet,
  errors,
  lockNote,
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: string[]
  /** Why the box is shut, when it is. A locked box with no reason beside it is
   *  a dead end — money moves the contract once a deal is signed. */
  lockNote?: string | null
}) {
  const amount = draft.amount
  const currency = draft.currency
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <Field
      label="Giá trị đơn"
      required
      errors={errors}
      hint={
        lockNote ??
        (amount === null || amount === 0
          ? undefined
          : currency === 'VND'
            ? billions(amount)
            : `${billions(toMoneyVnd(amount, currency))} quy ra đồng`)
      }
    >
      {/* `suffix` of `Input` (A-04) rather than a shell built here: the focus
          and invalid rings then come from the same place as every other box on
          this form, instead of a copy that drifts on the next edit. */}
      <Input
        inputMode="numeric"
        aria-label="Giá trị đơn"
        aria-required
        disabled={Boolean(lockNote)}
        invalid={Boolean(errors?.length)}
        suffix={`${symbol} ${currency}`}
        className="tnum text-right font-mono"
        value={amount === null ? '' : amount.toLocaleString('vi-VN')}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '')
          if (digits === '') {
            onSet('amount', null)
            return
          }
          /* REFUSE the keystroke rather than cut the number down to size: a
             box that silently drops the tail turns one amount into another,
             plausible-looking one. */
          const next = Number(digits)
          if (next > AMOUNT_MAX) return
          onSet('amount', next)
        }}
      />
    </Field>
  )
}

/** The two owner boxes — a picker with the chosen people INSIDE it.
 *
 *  Still multi-select, and that is not a detail to trade away for a tidier
 *  box: `saleOwners` is an array because commission splits between everyone on
 *  it, so a single-select control would silently drop the second name off any
 *  deal two people carried. With one person it reads exactly like a select. */
export function PersonPickField({
  label,
  hint,
  required,
  picked,
  errors,
  onToggle,
}: {
  label: string
  hint: string
  required?: boolean
  picked: string[]
  errors?: string[]
  onToggle: (id: string) => void
}) {
  const people = useSalesPeople()

  return (
    <Field label={label} required={required} hint={hint} errors={errors} plain>
      <PersonTokenField
        variant="inline"
        label={label}
        placeholder="Gõ tên để tìm…"
        tokens={picked.map((id) => {
          const person = people.find((a) => a.id === id)
          /* An id with nobody behind it prints as itself: the person may have
             been locked out since, and the deal still carries their name. */
          return { id, name: person?.name ?? id, ...(person && { note: person.role }) }
        })}
        suggestions={people
          .filter((a) => !picked.includes(a.id))
          .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
        onPick={onToggle}
        onRemove={onToggle}
        emptyNote="Cả phòng đã có trong danh sách này."
      />
    </Field>
  )
}

/** The product lines this customer asked about — chosen ones as removable
 *  tags, the catalog behind one button.
 *
 *  Laying the whole catalog out as toggles buries the two or three answers in
 *  a wall of buttons nobody picked — and the question on both doors is "what
 *  did we pick". An entry switched OFF still shows while this deal holds it —
 *  hiding the tag would be editing history. */
export function ProductTagsField({
  picked,
  errors,
  onToggle,
}: {
  picked: string[]
  errors?: string[]
  onToggle: (id: string) => void
}) {
  const products = useProductCatalog()
  const shown = products.filter((p) => p.active || picked.includes(p.id))
  const free = shown.filter((p) => !picked.includes(p.id))
  const [browsing, setBrowsing] = useState(false)

  /* NO "0 / 0" AND NO PROMISE OF A CATALOG THAT IS NOT THERE. An empty list
     is a trip to the Settings screen, not a fraction — and the older wording
     pointed below itself, where only the button stood. */
  const hint =
    shown.length === 0
      ? 'Danh mục Sản phẩm/dịch vụ chưa có mục nào — vào Thiết lập để nhập, rồi quay lại chọn.'
      : `Đã chọn ${picked.length} / ${shown.length} thẻ · bấm Thêm thẻ để mở danh mục của phòng, sửa nó ở Thiết lập.`

  return (
    <Field label="Sản phẩm / dịch vụ quan tâm" plain errors={errors} hint={hint}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {picked.map((id) => {
            const name = shown.find((p) => p.id === id)?.name ?? id
            return (
              <span
                key={id}
                className="text-on-tint-primary bg-primary/24 flex items-center gap-2 rounded-sm py-1 pl-3 pr-1 text-[12px] font-medium"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Bỏ thẻ ${name}`}
                  onClick={() => onToggle(id)}
                  className="motion-std hover:bg-surface-ink/16 pointer-coarse:size-12 flex size-6 shrink-0 items-center justify-center rounded-sm"
                >
                  <Icon icon={X} size={14} />
                </button>
              </span>
            )
          })}
          {/* Shut when there is nothing to open — the hint above already says
              where the catalog is filled in. */}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={browsing}
            disabled={shown.length === 0}
            className="pointer-coarse:h-12"
            onClick={() => setBrowsing((open) => !open)}
          >
            <Icon icon={Plus} size={16} />
            Thêm thẻ
          </Button>
        </div>

        {browsing &&
          (free.length === 0 ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Đã chọn hết danh mục.
            </p>
          ) : (
            <div
              role="group"
              aria-label="Danh mục sản phẩm/dịch vụ"
              className="bg-surface-ink/5 flex flex-wrap gap-2 rounded-md p-3"
            >
              {free.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.active ? undefined : 'Mục này đã tắt — giữ lại vì đơn đang chọn nó'}
                  onClick={() => onToggle(p.id)}
                  className={cn(
                    'motion-std bg-surface-ink/9 hover:bg-surface-ink/16 flex h-10 items-center rounded-md px-3 text-[12px]',
                    p.active ? '' : 'opacity-60',
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ))}
      </div>
    </Field>
  )
}

/** Attachments — a COMPACT drop zone, name and size only.
 *
 *  `FileDrop` of `@pv/ui` takes exactly one file and draws a 64px glyph, so it
 *  cannot stand in a two-column row beside a five-line textarea; this one takes
 *  many, and keeps the POC promise: name and size only, nothing uploaded.
 *
 *  THE BUTTON IS A REAL BUTTON. A zone that only answers drag-and-drop is dead
 *  ground to a keyboard and to an iPad, so the pointer gesture is the extra
 *  road, never the only one. */
export function AttachmentsDropField({
  draft,
  onSet,
  errors,
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: string[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const room = OPPORTUNITY_FILES_MAX - draft.attachments.length

  /* `slice(0, room)` because one trip through a `multiple` picker — or one
     drop — can hand back thirty files at once. Taking what fits keeps the
     batch instead of refusing all of it. */
  const take = (files: FileList | null) => {
    const picked = [...(files ?? [])]
      .slice(0, Math.max(0, room))
      .map((f) => ({ name: f.name, size: f.size }))
    if (picked.length > 0) onSet('attachments', [...draft.attachments, ...picked])
  }

  return (
    <Field label="Tệp đính kèm" plain grow errors={errors}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files)
          }}
          className={cn(
            /* `flex-1` so the zone takes the height the row hands it and its
               bottom edge lines up with the description box beside it. */
            'motion-std flex min-h-0 w-full min-w-0 flex-1 items-center gap-3 rounded-md p-4',
            /* Not a tinted ground on drag: the two lines on it are muted text,
               and azure under them drops below the 4.5:1 floor of law 13. */
            over ? 'bg-surface-ink/16' : 'bg-surface-ink/5',
          )}
        >
          <Icon icon={Upload} size={20} className="text-muted-foreground shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12.5px] font-semibold">Kéo tệp vào đây</span>
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              {draft.attachments.length === 0
                ? `Chưa có tệp nào · tối đa ${OPPORTUNITY_FILES_MAX} tệp`
                : `${draft.attachments.length} tệp · tối đa ${OPPORTUNITY_FILES_MAX} tệp`}
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={room <= 0}
            className="pointer-coarse:h-12 shrink-0"
            onClick={() => fileRef.current?.click()}
          >
            <Icon icon={Paperclip} size={16} />
            Chọn tệp
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Chọn tệp đính kèm"
          onChange={(e) => {
            take(e.target.files)
            e.target.value = ''
          }}
        />

        {draft.attachments.length > 0 && (
          <ul className="flex flex-col gap-2">
            {draft.attachments.map((f) => (
              <li
                key={f.name}
                className="bg-surface-ink/5 flex items-center gap-3 rounded-md px-3 py-2"
              >
                <Icon icon={Paperclip} size={16} className="text-muted-foreground shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[12px]">{f.name}</span>
                <span className="text-muted-foreground tnum font-mono text-[11px]">
                  {Math.max(1, Math.round(f.size / 1024)).toLocaleString('vi-VN')} KB
                </span>
                <button
                  type="button"
                  aria-label={`Bỏ tệp ${f.name}`}
                  onClick={() =>
                    onSet(
                      'attachments',
                      draft.attachments.filter((x) => x.name !== f.name),
                    )
                  }
                  className="motion-std text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 pointer-coarse:size-12 flex size-8 shrink-0 items-center justify-center rounded-md"
                >
                  <Icon icon={Trash2} size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}
