import { useRef, type ReactNode } from 'react'
import { Paperclip, Trash2, TriangleAlert } from 'lucide-react'
import { Avatar, Button, Icon, Input, Kicker, Select, Textarea, billions, cn, dong } from '@pv/ui'
import {
  CURRENCIES,
  dasVina,
  LOSS_REASONS,
  OPPORTUNITY_STATES,
  PIPELINE_STAGES,
  toDong,
  type CurrencyCode,
  type OpportunityDraft,
} from '@pv/engines/fixtures/das-vina'

/** Ô nhập dùng chung của PHIẾU CƠ HỘI.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO TÁCH RA KHỎI `convert-dialog.tsx`
 *  ------------------------------------------------------------------
 *  Cùng một phiếu được điền ở HAI chỗ: popup đổi lead thành cơ hội
 *  (`components/convert-dialog.tsx`) và hồ sơ cơ hội (`pages/ops-detail.tsx`).
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
 *  luật của phiếu chứ không phải cách vẽ một cái ô, nên chúng ở `data/ops.ts` —
 *  `react-refresh` cũng đòi đúng điều đó: một file component chỉ xuất component.
 *
 *  Nó cũng không nằm ở `@pv/ui`: bảy cái tên trong `PeopleRow` và năm trạng
 *  thái của phiếu là kiến thức của KỊCH BẢN, mà thư viện component thì không
 *  được biết kịch bản nào (biên giới package · CLAUDE.md). */

export type SetDraft = <K extends keyof OpportunityDraft>(
  key: K,
  value: OpportunityDraft[K],
) => void

export const STATE_LABEL = new Map(OPPORTUNITY_STATES.map((s) => [s.key, s.label]))
export const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

/** Người của phòng, dùng cho cả hai ô chủ sở hữu. */
export const SALES_PEOPLE = dasVina.actors.filter((a) => a.branches.includes('Sales'))

/** Khung một ô của phiếu. Cùng hình với ô của form hồ sơ lead — hai chỗ nhập
 *  trong cùng một app mà khác hình thì đọc ra như hai sản phẩm. */
export function Field({
  label,
  required,
  hint,
  plain,
  className,
  children,
}: {
  label: string
  required?: boolean
  hint?: ReactNode
  /** Bỏ thẻ `<label>` bọc ngoài — cho Select và cụm nút tự mang nhãn. */
  plain?: boolean
  className?: string
  children: ReactNode
}) {
  const head = (
    <span className="text-muted-foreground text-[11px]">
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
      {hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>}
    </div>
  )
}

/** Giá trị đơn + đồng tiền, và dòng đọc lại ngay dưới.
 *
 *  Hai ô đi cùng nhau vì một mình con số không có nghĩa: 4.200.000 là bốn triệu
 *  đồng hay bốn triệu đô. Dòng đọc lại in ra cả hai cách đọc, và với ngoại tệ
 *  thì in luôn phần quy ra đồng — sổ cơ hội cộng bằng đồng. */
export function AmountRow({ draft, onSet }: { draft: OpportunityDraft; onSet: SetDraft }) {
  const amount = draft.amount
  const currency = draft.currency
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <Field label="Giá trị đơn" required>
        <span className="relative flex items-center">
          <Input
            inputMode="numeric"
            aria-label="Giá trị đơn"
            aria-required
            className="pr-8 font-mono"
            value={amount === null ? '' : amount.toLocaleString('vi-VN')}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              onSet('amount', digits === '' ? null : Number(digits))
            }}
          />
          <span className="text-muted-foreground pointer-events-none absolute right-3 text-[12px]">
            {symbol}
          </span>
        </span>
      </Field>

      <Field label="Đồng tiền" plain>
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
  onToggle,
}: {
  label: string
  hint: string
  required?: boolean
  picked: string[]
  onToggle: (id: string) => void
}) {
  return (
    <Field label={label} required={required} hint={hint} plain>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {SALES_PEOPLE.map((p) => {
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

/** Tệp đính kèm. POC giữ đúng tên và cỡ tệp, không tải nội dung lên. */
export function AttachmentsField({ draft, onSet }: { draft: OpportunityDraft; onSet: SetDraft }) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <Field
      label="Tệp đính kèm"
      plain
      hint="POC giữ tên và cỡ tệp, không tải nội dung lên — chưa có backend để nhận."
    >
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant="ghost"
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
            const picked = [...(e.target.files ?? [])].map((f) => ({ name: f.name, size: f.size }))
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
export function LossBlock({ draft, onSet }: { draft: OpportunityDraft; onSet: SetDraft }) {
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
          Bảy lý do hay gặp, không phải danh sách đóng — khác sáu lý do lead ra khỏi luồng. Một đơn
          thua không ghi lý do là một bài học mất trắng.
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {LOSS_REASONS.map((r) => (
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

      <Field
        label="Ghi rõ thêm"
        hint="Câu của riêng đơn này — tên đối thủ, con số họ chào, ai đổi ý."
      >
        <Textarea
          autoGrow
          rows={2}
          value={draft.lossNote}
          aria-label="Ghi rõ lý do thua"
          onChange={(e) => onSet('lossNote', e.target.value)}
        />
      </Field>
    </section>
  )
}
