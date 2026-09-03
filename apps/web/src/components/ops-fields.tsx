import { useRef, type ReactNode } from 'react'
import { Paperclip, Trash2, TriangleAlert } from '@pv/ui'
import { Avatar, Button, Icon, Input, Kicker, Select, Textarea, billions, cn, dong } from '@pv/ui'
import { OPPORTUNITY_FILES_MAX, OPPORTUNITY_LOSS_NOTE_MAX } from '@pv/contracts'
import type { FieldErrors } from '@/app/api'
import {
  CURRENCIES,
  OPPORTUNITY_STATES,
  PIPELINE_STAGES,
  toDong,
  type CurrencyCode,
  type OpportunityDraft,
} from '@pv/engines/fixtures/das-vina'
import { useSalesPeople } from '@/data/directory'
import { useLossReasons, useProductCatalog } from '@/data/sales-config'

/** Ô nhập dùng chung của PHIẾU CƠ HỘI.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO TÁCH RA KHỎI `convert-dialog.tsx`
 *  ------------------------------------------------------------------
 *  Cùng một phiếu được điền ở HAI chỗ: popup đổi lead thành cơ hội
 *  (`components/convert-dialog.tsx`) và hồ sơ cơ hội (`pages/opportunity-detail.tsx`).
 *  Hai chỗ đó phải hỏi đúng những câu như nhau, kiểm đúng những điều kiện như
 *  nhau, và đọc lại số tiền theo đúng một cách — nếu không thì đơn vừa tạo ở
 *  popup mở ra ở hồ sơ đã là một tờ giấy khác.
 *
 *  Chép đôi là cách chắc chắn nhất để hai tờ giấy đó trôi khỏi nhau: sửa nhãn ở
 *  một chỗ, thêm một ô bắt buộc ở một chỗ, và không test nào bắt được vì cả hai
 *  đều tự nhất quán với chính mình.
 *
 *  File này KHÔNG biết mình đang nằm trong popup hay trong trang. Nó nhận
 *  `draft` và một hàm ghi, trả lại ô nhập — chỗ đặt là chuyện của người gọi.
 *
 *  Ở đây chỉ có COMPONENT. Bản kiểm "còn thiếu gì" và phép bật/tắt một người là
 *  luật của phiếu chứ không phải cách vẽ một cái ô, nên chúng ở `data/opportunities.ts` —
 *  `react-refresh` cũng đòi đúng điều đó: một file component chỉ xuất component.
 *
 *  Nó cũng không nằm ở `@pv/ui`: `PeopleRow` gọi thẳng một query của app và năm
 *  trạng thái của phiếu là kiến thức của NHÁNH Sales, mà thư viện component thì
 *  không được biết nhánh nào (biên giới package · CLAUDE.md). */

export type SetDraft = <K extends keyof OpportunityDraft>(
  key: K,
  value: OpportunityDraft[K],
) => void

export const STATE_LABEL = new Map(OPPORTUNITY_STATES.map((s) => [s.key, s.label]))
export const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

/** How far the money box may grow.
 *
 *  Not a number picked here: `Dong` is `z.number().int().nonnegative()`, and
 *  zod 4 reads `.int()` as SAFE integer — anything past `2^53−1` comes back
 *  `too_big` before Postgres is ever asked. So the ceiling already exists on
 *  the wire; this only moves the refusal to the keystroke that would cross it,
 *  where the person can still see what they typed. */
const AMOUNT_MAX = Number.MAX_SAFE_INTEGER

/** Khung một ô của phiếu. Cùng hình với ô của form hồ sơ lead — hai chỗ nhập
 *  trong cùng một app mà khác hình thì đọc ra như hai sản phẩm.
 *
 *  `errors` ĐÈ LÊN `hint` chứ không xếp thêm một dòng bên dưới, và đó là bản
 *  chép nguyên của `FieldShell` ở `components/lead-create-dialog.tsx`: mắt vốn
 *  đã nhìn xuống dòng ngay dưới cái ô vừa điền, nên câu từ chối phải nằm đúng
 *  chỗ đó. Xếp chồng cả hai thì mỗi ô sai đẩy phiếu dài thêm một dòng, và trên
 *  một phiếu mười bốn ô thì cái nút Gửi trôi khỏi màn hình giữa lúc đang sửa. */
export function Field({
  label,
  required,
  hint,
  errors,
  plain,
  className,
  children,
}: {
  label: string
  required?: boolean
  hint?: ReactNode
  /** What the server just said about THIS box. Absent or empty = no complaint. */
  errors?: string[]
  /** Bỏ thẻ `<label>` bọc ngoài — cho Select và cụm nút tự mang nhãn. */
  plain?: boolean
  className?: string
  children: ReactNode
}) {
  const wrong = Boolean(errors?.length)

  const head = (
    <span
      className={cn('text-[11px]', wrong ? 'text-destructive-foreground' : 'text-muted-foreground')}
    >
      {label}
      {required && (
        <span className="text-warning" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </span>
  )

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {plain ? (
        <div className="flex flex-col gap-2">
          {head}
          {children}
        </div>
      ) : (
        <label className="flex flex-col gap-2">
          {head}
          {children}
        </label>
      )}
      {wrong ? (
        <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
          {errors?.join(' · ')}
        </span>
      ) : (
        hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>
      )}
    </div>
  )
}

/** Giá trị đơn + đồng tiền, và dòng đọc lại ngay dưới.
 *
 *  Hai ô đi cùng nhau vì một mình con số không có nghĩa: 4.200.000 là bốn triệu
 *  đồng hay bốn triệu đô. Dòng đọc lại in ra cả hai cách đọc, và với ngoại tệ
 *  thì in luôn phần quy ra đồng — sổ cơ hội cộng bằng đồng. */
export function AmountRow({
  draft,
  onSet,
  errors = {},
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: FieldErrors
}) {
  const amount = draft.amount
  const currency = draft.currency
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field label="Giá trị đơn" required errors={errors.amount}>
        <span className="relative flex items-center">
          <Input
            inputMode="numeric"
            aria-label="Giá trị đơn"
            aria-required
            invalid={Boolean(errors.amount)}
            className="pr-8 font-mono"
            value={amount === null ? '' : amount.toLocaleString('vi-VN')}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              if (digits === '') {
                onSet('amount', null)
                return
              }
              /* REFUSE the keystroke rather than cut the number down to size.
                 A text box that silently drops the tail turns 12,345,678,901,
                 234,567,890 into a different, plausible-looking amount; a box
                 that simply stops growing says "that is as far as this goes",
                 which is what `maxLength` does for every other field here. */
              const next = Number(digits)
              if (next > AMOUNT_MAX) return
              onSet('amount', next)
            }}
          />
          <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
            {symbol}
          </span>
        </span>
      </Field>

      <Field label="Đồng tiền" plain errors={errors.currency}>
        <Select
          label="Đồng tiền"
          hideLabel
          value={currency}
          neutralValue={currency}
          onChange={(v) => onSet('currency', v as CurrencyCode)}
          options={CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
          className="w-full"
        />
      </Field>

      {amount !== null && amount > 0 && (
        <span className="text-muted-foreground text-[11.5px] leading-[1.5] sm:col-span-2">
          {currency === 'VND'
            ? `${dong(amount)} · ${billions(amount)}`
            : `${amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toDong(amount, currency))} quy ra đồng`}
        </span>
      )}
    </section>
  )
}

/** Chọn nhiều người bằng nút bật/tắt có avatar.
 *
 *  Bảy người thì danh sách checkbox dọc chiếm nửa panel mà chỉ để tick một hai
 *  cái. Nút bật/tắt xếp ngang gói cùng chỗ đó vào hai hàng, và avatar cho phép
 *  nhận ra người bằng mắt thay vì đọc tên. */
export function PeopleRow({
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
  /* Người của phòng, đọc từ `GET /users/directory` chứ không từ một hằng số:
     ai mới vào phòng phải bấm chọn được ngay trong ngày mở tài khoản. */
  const people = useSalesPeople()

  return (
    <Field label={label} required={required} hint={hint} errors={errors} plain>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {people.map((p) => {
          const on = picked.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              title={p.role}
              onClick={() => onToggle(p.id)}
              className={cn(
                'motion-std flex h-10 items-center gap-2 rounded-md pl-1 pr-3 text-[12px]',
                on
                  ? 'bg-primary/24 text-accent-foreground font-semibold'
                  : 'bg-white/9 hover:bg-white/16',
              )}
            >
              <Avatar name={p.name} size="sm" />
              {p.name}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

/** Win probability — 0 to 100, or LEFT EMPTY.
 *
 *  ------------------------------------------------------------------
 *  AN EMPTY BOX AND A ZERO ARE OPPOSITE STATEMENTS
 *  ------------------------------------------------------------------
 *  Empty = nobody has judged this deal. `0` = the seller looked and said it is
 *  not happening. The forecast reads the two in opposite directions — the first
 *  is excluded from the sum, the second drags it down — so this box must NOT
 *  have a default value, and clearing it has to return `null` rather than 0.
 *
 *  `type="number"` with `min`/`max` only makes the browser show a numeric
 *  keypad and a pair of arrows. The real fence is the contract's bound on
 *  `probability` and `opportunity_probability_range` at the table layer — the
 *  100 typed in here is a third copy, so it is a hint and nothing more. */
export function ProbabilityField({
  value,
  errors,
  onSet,
}: {
  value: number | null
  errors?: string[]
  onSet: (next: number | null) => void
}) {
  return (
    <Field
      label="Xác suất thắng"
      errors={errors}
      hint={
        value === null
          ? 'Bỏ trống = chưa ai đánh giá. Khác hẳn 0% — bản dự báo loại đơn chưa đánh giá ra ngoài, còn 0% thì kéo tổng xuống.'
          : `Đơn này được đánh giá ${value}% khả năng chốt.`
      }
    >
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={0}
          max={100}
          step={5}
          className="w-28"
          aria-label="Xác suất thắng, phần trăm"
          invalid={Boolean(errors)}
          value={value === null ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value.trim()
            /* An empty string becomes `null`, NOT 0 — see the docblock.
               `Number('')` returns 0, so this branch has to come before any
               coercion. */
            if (raw === '') return onSet(null)
            const n = Number(raw)
            onSet(Number.isFinite(n) ? Math.trunc(n) : null)
          }}
        />
        <span className="text-muted-foreground text-[12px]">%</span>
      </div>
    </Field>
  )
}

/** What the customer is asking about — multi-select from the `PRODUCT` catalog.
 *
 *  The catalog is read from the server (`salesCatalogQuery`) rather than from a
 *  constant: adding a product line is a row in `sales.config_entry`, not a
 *  build. An entry that has been switched OFF (`active: false`) is not offered
 *  for new picks, but still shows if this deal already holds it — a deal that
 *  asked about a line we have since stopped selling is still a fact, and hiding
 *  the chip would be editing history.
 *
 *  An empty catalog says so and points the way, rather than showing a blank the
 *  user reads as a broken screen. */
export function ProductsField({
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

  return (
    <Field
      label="Sản phẩm/dịch vụ quan tâm"
      errors={errors}
      hint="Chọn từ danh mục của phòng. Sửa danh mục ở Thiết lập · Sản phẩm/dịch vụ."
      plain
    >
      {shown.length === 0 ? (
        <p className="text-muted-foreground text-[12px] leading-[1.6]">
          Danh mục Sản phẩm/dịch vụ chưa có mục nào — vào Thiết lập để nhập, rồi quay lại chọn.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sản phẩm/dịch vụ quan tâm">
          {shown.map((p) => {
            const on = picked.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                title={p.active ? undefined : 'Mục này đã tắt — giữ lại vì đơn đang chọn nó'}
                onClick={() => onToggle(p.id)}
                className={cn(
                  'motion-std flex h-10 items-center rounded-md px-3 text-[12px]',
                  on
                    ? 'bg-primary/24 text-accent-foreground font-semibold'
                    : 'bg-white/9 hover:bg-white/16',
                  p.active ? '' : 'opacity-60',
                )}
              >
                {p.name}
              </button>
            )
          })}
        </div>
      )}
    </Field>
  )
}

/** Tệp đính kèm. POC giữ đúng tên và cỡ tệp, không tải nội dung lên. */
export function AttachmentsField({
  draft,
  onSet,
  errors,
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: string[]
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const room = OPPORTUNITY_FILES_MAX - draft.attachments.length

  return (
    <Field
      label="Tệp đính kèm"
      plain
      errors={errors}
      hint={
        room > 0
          ? `POC giữ tên và cỡ tệp, không tải nội dung lên — chưa có backend để nhận. Còn nhận thêm ${room} tệp.`
          : `Đã đủ ${OPPORTUNITY_FILES_MAX} tệp — bỏ bớt một tệp mới đính thêm được.`
      }
    >
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={room <= 0}
          className="self-start"
          onClick={() => fileRef.current?.click()}
        >
          <Icon icon={Paperclip} size={16} />
          Chọn tệp
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          aria-label="Chọn tệp đính kèm"
          onChange={(e) => {
            /* `slice(0, room)` because the picker is `multiple`: one trip
               through it can hand back thirty files at once, so a check that
               only looked at the button would let the array over the contract's
               cap in a single go. Taking the first `room` keeps what fits
               instead of dropping the whole batch — the hint above already
               says how much room is left. */
            const picked = [...(e.target.files ?? [])]
              .slice(0, Math.max(0, room))
              .map((f) => ({ name: f.name, size: f.size }))
            e.target.value = ''
            if (picked.length > 0) onSet('attachments', [...draft.attachments, ...picked])
          }}
        />

        {draft.attachments.length === 0 ? (
          <span className="text-muted-foreground text-[11.5px]">Chưa đính kèm gì.</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.attachments.map((f) => (
              <li key={f.name} className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2">
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
                  className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 flex size-8 shrink-0 items-center justify-center rounded-md"
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

/** Khối lý do thua — chỉ hiện khi trạng thái là Close lost.
 *
 *  Bảy lý do dựng sẵn bấm một phát là xong, và ô ghi thêm luôn mở chứ không nấp
 *  sau một nút "khác": lý do thật thường là "lý do dựng sẵn CỘNG một câu của
 *  riêng đơn này", không phải một trong hai.
 *
 *  Với 14 đơn đã thua có sẵn trong sổ, ô ghi thêm mở sẵn bằng lý do lead ra
 *  khỏi luồng còn bảy nút vẫn trắng — chọn lý do thua của ĐƠN là việc còn phải
 *  làm, không phải việc fixture làm hộ (`buildOpportunities`). */
export function LossBlock({
  draft,
  onSet,
  errors = {},
}: {
  draft: OpportunityDraft
  onSet: SetDraft
  errors?: FieldErrors
}) {
  /* The buttons read from the server's `LOSS_REASON` catalog, not from a
     fixture constant: changing a reason is the sales team's job on the
     configuration screen, not a build. */
  const reasons = useLossReasons()

  return (
    <section className="flex flex-col gap-4 rounded-md bg-white/5 p-4" aria-label="Lý do thua">
      <div className="flex flex-col gap-2">
        <Kicker>
          <span className="flex items-center gap-2">
            <Icon icon={TriangleAlert} size={16} className="text-warning" />
            Vì sao thua
          </span>
        </Kicker>
        <span className="text-muted-foreground text-[11px] leading-[1.5]">
          Danh sách MỞ, sửa được ở Thiết lập — khác sáu lý do lead ra khỏi luồng, vốn là danh sách
          đóng. Một đơn thua không ghi lý do là một bài học mất trắng.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={draft.lossReason === r ? 'default' : 'ghost'}
              aria-pressed={draft.lossReason === r}
              onClick={() => onSet('lossReason', draft.lossReason === r ? '' : r)}
            >
              {r}
            </Button>
          ))}
        </div>
        {/* The seven buttons are a fixed list well inside the contract's 120,
            so this line only ever carries the CROSS-FIELD refusal — "a lost
            deal must record a reason", which zod reports on `lossReason`. */}
        {errors.lossReason && (
          <span role="alert" className="text-destructive-foreground text-[11px] leading-[1.5]">
            {errors.lossReason.join(' · ')}
          </span>
        )}
      </div>

      <Field
        label="Ghi rõ thêm"
        errors={errors.lossNote}
        hint="Câu của riêng đơn này — tên đối thủ, con số họ chào, ai đổi ý."
      >
        <Textarea
          autoGrow
          rows={2}
          maxLength={OPPORTUNITY_LOSS_NOTE_MAX}
          invalid={Boolean(errors.lossNote)}
          value={draft.lossNote}
          aria-label="Ghi rõ lý do thua"
          onChange={(e) => onSet('lossNote', e.target.value)}
        />
      </Field>
    </section>
  )
}
