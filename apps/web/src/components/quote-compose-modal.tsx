import { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Button,
  DataTable,
  GlassCard,
  Icon,
  Input,
  Modal,
  Money,
  Plus,
  Select,
  Trash2,
  dong,
} from '@pv/ui'
import type { QuoteRow } from '@pv/contracts'
import { CURRENCIES } from '@pv/contracts'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import {
  bodyOf,
  emptyLine,
  formOf,
  formTotals,
  missingOf,
  toLineDraft,
  type QuoteForm,
  type QuoteLineForm,
} from '@/data/quotes-write'
import { lineTotalOf } from '@pv/contracts'

/** The compose-a-quote modal — three write doors, one form.
 *
 *  ------------------------------------------------------------------
 *  A MODAL, NOT A DRAWER
 *  ------------------------------------------------------------------
 *  A drawer is for a confirmation form of a few fields; the sign button uses
 *  one. This is a TABLE people type into, and an eight-column table inside a
 *  480px drawer leaves every column too narrow to read. Hence `width="xl"`.
 *
 *  ------------------------------------------------------------------
 *  BUILT ON THE EXISTING `DataTable`, NO NEW COMPONENT IN `@pv/ui`
 *  ------------------------------------------------------------------
 *  Inputs go straight into the cells — the precedent is the checkbox inside
 *  `AudiencePicker` in `campaign-form.tsx`. A new "EditableTable" in the library
 *  would be an API to maintain for exactly ONE caller.
 *
 *  Rows are reordered with two arrow buttons rather than drag-and-drop: far less
 *  code, and the keyboard works immediately instead of needing a parallel
 *  accessibility layer built for the drag.
 *
 *  ------------------------------------------------------------------
 *  THE SUMMARY IS COMPUTED BY THE SAME FUNCTION THE SERVER WRITES WITH
 *  ------------------------------------------------------------------
 *  `formTotals` calls `totalsOf` from `@pv/contracts`, and the `line_total`
 *  column in Postgres is the same two-stage rounding. So the number moving under
 *  the typist's hands IS the number that will be in the table — not an estimate
 *  that ends up a few dong away from the printed sheet. */

/** The three jobs this modal does. They differ on the SERVER, not in the form.
 *
 *  One `mode` rather than three components: same fields, same line table, same
 *  summary. Three copies of one form are three places for a field to drift. */
export type QuoteComposeMode = 'create' | 'edit' | 'replace'

export type QuoteComposeProps = {
  open: boolean
  onClose: () => void
  mode: QuoteComposeMode
  /** The deal being quoted — code and customer, so the header says whose sheet
   *  this is. */
  deal: { code: string; account: string }
  /** The version being edited, or the one a replacement will supersede. Absent
   *  means this is the first sheet. */
  source?: QuoteRow
  /** Which round — for the heading only. The server assigns the real number. */
  nextVersion: number
  saving: boolean
  onSubmit: (body: ReturnType<typeof bodyOf>) => Promise<unknown>
}

/** Default validity: two weeks out.
 *
 *  Seeded rather than left blank, because a blank field blocks the save button
 *  and would make somebody open a date picker for every sheet. Two weeks is long
 *  enough for one round of customer questions — and it stays editable, because
 *  this is an input, not a rule. */
const DEFAULT_VALID_DAYS = 14

function defaultValidUntil(): string {
  const at = new Date()
  at.setDate(at.getDate() + DEFAULT_VALID_DAYS)
  return at.toISOString().slice(0, 10)
}

function blankForm(): QuoteForm {
  return {
    title: '',
    note: '',
    validUntil: defaultValidUntil(),
    currency: 'VND',
    lines: [emptyLine()],
  }
}

export function QuoteComposeModal({
  open,
  onClose,
  mode,
  deal,
  source,
  nextVersion,
  saving,
  onSubmit,
}: QuoteComposeProps) {
  const [form, setForm] = useState<QuoteForm>(blankForm)

  /* Reload the form when the modal OPENS, not whenever props change. Opening it
     on a different version has to show that version; a background refetch
     landing mid-typing must not wipe what somebody is halfway through writing.
     `open` is the honest boundary of "where this form starts from". */
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && source) setForm(formOf(source))
    else if (mode === 'replace' && source)
      setForm({ ...formOf(source), validUntil: defaultValidUntil() })
    else setForm(blankForm())
  }, [open, mode, source])

  const totals = formTotals(form.lines)
  const missing = missingOf(form)
  const patch = (p: Partial<QuoteForm>) => setForm((f) => ({ ...f, ...p }))

  const patchLine = (index: number, p: Partial<QuoteLineForm>) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => (i === index ? { ...l, ...p } : l)),
    }))

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))

  const removeLine = (index: number) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }))

  /** Swap two adjacent lines. `lineNo` is not in state — it is derived from the
   *  position in `toLineDraft` — so reordering the array reorders the printed
   *  sheet, with no second field to forget to update. */
  const move = (index: number, by: -1 | 1) =>
    setForm((f) => {
      const to = index + by
      if (to < 0 || to >= f.lines.length) return f
      const lines = [...f.lines]
      const a = lines[index]
      const b = lines[to]
      if (!a || !b) return f
      lines[index] = b
      lines[to] = a
      return { ...f, lines }
    })

  const submit = async () => {
    try {
      await onSubmit(bodyOf(form))
      onClose()
    } catch (e) {
      /* The modal STAYS OPEN when the server refuses. Closing it throws away
         the form somebody just typed with no way to get it back — the same rule
         `ConvertDialog` holds: close only once the server has accepted. */
      toast(isApiError(e) ? userMessage(e) : 'Không lưu được báo giá.', { tone: 'danger' })
    }
  }

  const title =
    mode === 'edit'
      ? `Sửa báo giá · ${source?.code ?? ''}`
      : `Soạn báo giá · bản ${nextVersion} của ${deal.code}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={title}
      subtitle={deal.account}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {/* Say what is missing. A greyed-out button with no reason is a dead
              end — the user cannot tell which field would light it again. */}
          <span className="text-muted-foreground text-[11.5px]">
            {missing.length > 0 ? `Còn thiếu: ${missing.join(' · ')}` : ' '}
          </span>
          <div className="flex items-center gap-3">
            <Button size="md" variant="ghost" onClick={onClose} disabled={saving}>
              Huỷ
            </Button>
            <Button size="md" onClick={() => void submit()} disabled={saving || missing.length > 0}>
              {saving ? 'Đang lưu…' : 'Lưu nháp'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-[200px_1fr_140px]">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11.5px]">Hạn hiệu lực</span>
            <Input
              type="date"
              value={form.validUntil}
              onChange={(e) => patch({ validUntil: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11.5px]">Tiêu đề</span>
            <Input
              value={form.title}
              placeholder="Factory MES + One Plus"
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <Select
            label="Đồng tiền"
            value={form.currency}
            onChange={(v) => patch({ currency: v as QuoteForm['currency'] })}
            className="w-full max-w-none"
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
          />
        </div>

        {/* Table on a wide screen, stacked cards on a narrow one. Eight columns
            inside 440px leaves every one too narrow to type in — the three-device
            rule, and the move the design sketched for mobile. */}
        <div className="hidden md:block">
          <DataTable
            /* Every header is a NON-EMPTY, DISTINCT string, and that is a
               correctness requirement rather than a style choice: `DataTable`
               keys its header cells by `col.header`, so two blank ones collide
               on one React key and the rendered row is undefined behaviour. The
               two button columns are named for what they do, which also stops
               them being two unlabelled columns nobody can explain. */
            columns={[
              { header: 'Thứ tự', width: '76px' },
              { header: 'Mô tả', width: 'minmax(180px,1.6fr)' },
              { header: 'ĐVT', width: '90px' },
              { header: 'SL', width: '80px', align: 'right' },
              { header: 'Đơn giá', width: 'minmax(110px,1fr)', align: 'right' },
              { header: 'CK%', width: '80px', align: 'right' },
              { header: 'VAT%', width: '80px', align: 'right' },
              { header: 'Thành tiền', width: 'minmax(120px,1fr)', align: 'right' },
              { header: 'Xoá', width: '56px' },
            ]}
            rows={form.lines.map((line, i) => ({
              id: `line-${i}`,
              cells: [
                <div key="move" className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Đưa dòng ${i + 1} lên trên`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Icon icon={ArrowUp} size={16} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Đưa dòng ${i + 1} xuống dưới`}
                    disabled={i === form.lines.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Icon icon={ArrowDown} size={16} />
                  </Button>
                </div>,
                <Input
                  key="desc"
                  value={line.description}
                  aria-label={`Mô tả dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { description: e.target.value })}
                />,
                <Input
                  key="unit"
                  value={line.unit}
                  aria-label={`Đơn vị tính dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { unit: e.target.value })}
                />,
                <Input
                  key="qty"
                  value={line.qty}
                  inputMode="decimal"
                  className="text-right"
                  aria-label={`Số lượng dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { qty: e.target.value })}
                />,
                <Input
                  key="price"
                  value={line.unitPrice}
                  inputMode="numeric"
                  className="text-right"
                  aria-label={`Đơn giá dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { unitPrice: e.target.value })}
                />,
                <Input
                  key="ck"
                  value={line.discountPct}
                  inputMode="decimal"
                  className="text-right"
                  aria-label={`Chiết khấu dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { discountPct: e.target.value })}
                />,
                <Input
                  key="vat"
                  value={line.vatPct}
                  inputMode="decimal"
                  className="text-right"
                  aria-label={`VAT dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { vatPct: e.target.value })}
                />,
                <Money key="total" value={lineTotalOf(toLineDraft(line, i))} scale="table" />,
                <Button
                  key="rm"
                  size="sm"
                  variant="ghost"
                  aria-label={`Xoá dòng ${i + 1}`}
                  onClick={() => removeLine(i)}
                >
                  <Icon icon={Trash2} size={16} />
                </Button>,
              ],
            }))}
          />
        </div>

        <div className="flex flex-col gap-3 md:hidden">
          {form.lines.map((line, i) => (
            <GlassCard key={`card-${i}`} variant="a" className="flex flex-col gap-3 p-4">
              <Input
                value={line.description}
                placeholder="Mô tả"
                aria-label={`Mô tả dòng ${i + 1}`}
                onChange={(e) => patchLine(i, { description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={line.qty}
                  inputMode="decimal"
                  aria-label={`Số lượng dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { qty: e.target.value })}
                />
                <Input
                  value={line.unitPrice}
                  inputMode="numeric"
                  aria-label={`Đơn giá dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { unitPrice: e.target.value })}
                />
                <Input
                  value={line.discountPct}
                  inputMode="decimal"
                  aria-label={`Chiết khấu dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { discountPct: e.target.value })}
                />
                <Input
                  value={line.vatPct}
                  inputMode="decimal"
                  aria-label={`VAT dòng ${i + 1}`}
                  onChange={(e) => patchLine(i, { vatPct: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Money value={lineTotalOf(toLineDraft(line, i))} scale="table" />
                <div className="flex items-center gap-1">
                  <Button
                    size="md"
                    variant="ghost"
                    aria-label={`Đưa dòng ${i + 1} lên trên`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Icon icon={ArrowUp} size={16} />
                  </Button>
                  <Button
                    size="md"
                    variant="ghost"
                    aria-label={`Đưa dòng ${i + 1} xuống dưới`}
                    disabled={i === form.lines.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Icon icon={ArrowDown} size={16} />
                  </Button>
                  <Button
                    size="md"
                    variant="ghost"
                    aria-label={`Xoá dòng ${i + 1}`}
                    onClick={() => removeLine(i)}
                  >
                    <Icon icon={Trash2} size={16} />
                  </Button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        <div>
          <Button size="md" variant="ghost" onClick={addLine}>
            <Icon icon={Plus} size={16} />
            Thêm dòng
          </Button>
        </div>

        {/* The summary sits on `glass-a`: the table already stands on its own
            ground, and rule 12 allows exactly four background layers — a third
            sheet of glass stacked here would be a fifth. */}
        <GlassCard variant="a" className="flex flex-col gap-3 p-4">
          <SumRow label="Tạm tính" value={totals.subtotal} />
          <SumRow label="Chiết khấu" value={-totals.discountTotal} />
          <SumRow label="VAT" value={totals.vatTotal} />
          <div aria-hidden className="bg-white/6 h-px" />
          {/* EXACT dong at hero size, not `Money scale="hero"` — that scale
              prints BILLIONS, so a 2.6-million quote renders as a rounded 0,00.
              This is the number the customer adds up by hand off the column
              above it, so it is the one figure on this screen that may not be
              rounded at all. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] font-semibold">TỔNG CỘNG</span>
            <span className="tnum font-num text-[28px] font-semibold leading-none tracking-[-1px]">
              {dong(totals.total)}
            </span>
          </div>
          <p className="text-muted-foreground text-[11.5px]">
            Tổng cộng bằng đúng tổng cột "Thành tiền" — khách cộng tay ra cùng con số.
          </p>
        </GlassCard>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11.5px]">Ghi chú in cho khách đọc</span>
          <Input
            value={form.note}
            placeholder="Giá đã gồm triển khai tại nhà máy"
            onChange={(e) => patch({ note: e.target.value })}
          />
        </label>
      </div>
    </Modal>
  )
}

function SumRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      <span className="tnum font-num text-[12.5px]">{dong(value)}</span>
    </div>
  )
}
