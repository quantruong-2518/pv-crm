import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Paperclip, Trash2, TriangleAlert, X } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Chip,
  Drawer,
  Icon,
  Input,
  Kicker,
  MetaPill,
  Select,
  Textarea,
  billions,
  cn,
  dong,
} from '@pv/ui'
import {
  CURRENCIES,
  dasVina,
  draftOpportunity,
  HEAD_OF_SALES,
  LOSS_REASONS,
  OPPORTUNITY_STATES,
  PIPELINE_STAGES,
  toDong,
  type CurrencyCode,
  type Lead,
  type OpportunityDraft,
  type OpportunityState,
} from '@pv/engines/fixtures/das-vina'
import { useLeadDesk } from '@/app/desk'
import { dmy } from '@/lib/date'

/** Đổi lead thành cơ hội — phiếu điền, mở đè lên hồ sơ.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ PANEL ĐÈ CHỨ KHÔNG PHẢI MỘT MÀN
 *  ------------------------------------------------------------------
 *  Người điền phiếu này đang ĐỌC DỞ hồ sơ: họ vừa xem khách đau ở đâu, ai ký
 *  cuối, khoảng tiền bao nhiêu — và chín trên mười ô của phiếu lấy đúng từ đó.
 *  Chuyển sang một màn riêng là cắt mất phần tra cứu ngay lúc cần nó nhất.
 *  Panel giữ hồ sơ nguyên chỗ phía sau, đóng lại là đọc tiếp.
 *
 *  `Drawer` (T-04) đã là hộp thoại thật — `role="dialog"`, `aria-modal`, tấm
 *  che, Escape, bẫy tiêu điểm. Dựng thêm một Modal căn giữa chỉ để có hình khác
 *  là đẻ ra ngôn ngữ đè màn thứ hai trong cùng một app.
 *
 *  ------------------------------------------------------------------
 *  PHIẾU MỞ RA LÀ ĐÃ GẦN ĐỦ
 *  ------------------------------------------------------------------
 *  `draftOpportunity` mồi sẵn mã, tên, tiền, người bán, mô tả. Người dùng SỬA
 *  một bản nháp chứ không GÕ một tờ giấy trắng. Ba ô hệ không đoán được — ngày
 *  đóng, trạng thái, tệp đính kèm — là ba ô duy nhất thật sự phải nghĩ.
 *
 *  ------------------------------------------------------------------
 *  CLOSE LOST MỞ RA MỘT KHỐI KHÁC
 *  ------------------------------------------------------------------
 *  Chọn "Close lost" là mở khối lý do thua, và khối đó CHẶN nút gửi cho tới khi
 *  có lý do. Một đơn thua không ghi lý do là một bài học mất trắng — sổ vẫn trừ
 *  đúng số tiền, nhưng không ai học được gì từ nó.
 *
 *  Bảy lý do dựng sẵn là bảy lý do hay gặp, KHÔNG phải danh sách đóng — khác
 *  hẳn `EXIT_REASONS` của lead. Vì thế có ô ghi thêm, và ô đó không phải "cho
 *  đủ": chọn một lý do dựng sẵn rồi vẫn ghi thêm được câu của riêng đơn này. */

type Props = {
  lead: Lead
  open: boolean
  onClose: () => void
}

const STATE_LABEL = new Map(OPPORTUNITY_STATES.map((s) => [s.key, s.label]))
const STAGE_LABEL = new Map(PIPELINE_STAGES.map((s) => [s.key, s.label]))

/** Người của phòng, dùng cho cả hai ô chủ sở hữu. */
const SALES_PEOPLE = dasVina.actors.filter((a) => a.branches.includes('Sales'))

export function ConvertDialog({ lead, open, onClose }: Props) {
  const convert = useLeadDesk((s) => s.convert)
  const seed = useMemo(() => draftOpportunity(lead, dasVina.actors), [lead])
  const [draft, setDraft] = useState<OpportunityDraft>(seed)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Mở phiếu là một lần bắt đầu mới: nạp lại bản nháp. Không nạp lại thì đóng
     rồi mở lại vẫn thấy thứ mình vừa gõ dở của lần trước — hoặc tệ hơn, của
     một lead khác. */
  useEffect(() => {
    if (open) setDraft(seed)
  }, [open, seed])

  const set = <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const lost = draft.state === 'close-lost'
  const stage = OPPORTUNITY_STATES.find((s) => s.key === draft.state)?.stage ?? null

  /* Thiếu gì thì NÓI RA thiếu gì, đừng chỉ tắt nút. Một nút mờ không lý do là
     một ngõ cụt — người dùng không biết phải sửa ô nào để nó sáng lại. */
  const missing: string[] = []
  if (draft.name.trim() === '') missing.push('tên cơ hội')
  if (draft.closedDate === '') missing.push('ngày đóng dự kiến')
  if (draft.amount === null || draft.amount === 0) missing.push('giá trị đơn')
  if (draft.saleOwners.length === 0) missing.push('ít nhất một Sale đứng đơn')
  if (lost && draft.lossReason === '' && draft.lossNote.trim() === '') missing.push('lý do thua')

  const ready = missing.length === 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Đổi lead thành cơ hội"
      subtitle={
        <>
          <span className="font-mono">{lead.code}</span> · {lead.company} — phiếu này tạo một dòng
          mới trong sổ cơ hội và nối nó vào đúng lead đang mở.
        </>
      }
      meta={<Badge tone={lost ? 'danger' : 'running'}>{STATE_LABEL.get(draft.state)}</Badge>}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'text-[11.5px] leading-[1.5]',
              ready ? 'text-muted-foreground' : 'text-warning',
            )}
            aria-live="polite"
          >
            {ready
              ? `Đổi xong, ${lead.company} rời sổ lead và đứng ở sổ cơ hội dưới mã ${draft.code}. ${HEAD_OF_SALES} gật thì đơn vào cột thật.`
              : `Chưa đổi được — còn thiếu ${missing.join(' · ')}.`}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="md"
              disabled={!ready}
              onClick={() => {
                convert(lead.code, draft)
                onClose()
                /* Nối E3 khi có backend: phiếu này thành đề nghị duyệt thật, và
                   E1 nối OP mới vào AC/CT đã có trong đồ thị. */
              }}
            >
              <Icon icon={ArrowRight} size={16} />
              Đổi thành cơ hội
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Mã cơ hội" hint="Hệ cấp, tiếp nối mã lớn nhất đang có trong sổ.">
            <span className="flex h-10 items-center">
              <Chip>{draft.code}</Chip>
            </span>
          </Field>

          <Field
            label="Account"
            hint="Đi thẳng từ lead — một cơ hội không đổi được sang khách khác."
          >
            <span className="flex h-10 flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold">{draft.account}</span>
              {draft.accountCode !== '' && <Chip variant="source">{draft.accountCode}</Chip>}
            </span>
          </Field>

          <Field label="Tên cơ hội" required className="sm:col-span-2">
            <Input
              value={draft.name}
              aria-label="Tên cơ hội"
              aria-required
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field
            label="Ngày đóng dự kiến"
            required
            hint={draft.closedDate !== '' ? `Đọc là ${dmy(draft.closedDate)}.` : undefined}
          >
            <Input
              type="date"
              value={draft.closedDate}
              aria-label="Ngày đóng dự kiến"
              aria-required
              onChange={(e) => set('closedDate', e.target.value)}
            />
          </Field>

          <Field
            label="Trạng thái"
            plain
            hint={
              stage
                ? `Vào cột "${STAGE_LABEL.get(stage)}" của sổ cơ hội.`
                : 'Hai kết cục đóng sổ — đơn ra khỏi năm cột, không nằm cột nào.'
            }
          >
            <Select
              label="Trạng thái"
              hideLabel
              value={draft.state}
              neutralValue={draft.state}
              onChange={(v) => set('state', v as OpportunityState)}
              options={OPPORTUNITY_STATES.map((s) => ({ value: s.key, label: s.label }))}
              className="w-full"
            />
          </Field>
        </section>

        <AmountRow draft={draft} onSet={set} />

        <PeopleRow
          label="Sale đứng đơn"
          required
          hint="Người chốt. Phần chốt của hoa hồng chia theo danh sách này, nên đừng để trống cho xong."
          picked={draft.saleOwners}
          onToggle={(id) =>
            set(
              'saleOwners',
              draft.saleOwners.includes(id)
                ? draft.saleOwners.filter((x) => x !== id)
                : [...draft.saleOwners, id],
            )
          }
        />

        <PeopleRow
          label="BD mở cửa"
          hint="Người moi được ô bắt buộc và mở được khách. Công trạng mở cửa ghi cho danh sách này, tách khỏi phần chốt."
          picked={draft.bdOwners}
          onToggle={(id) =>
            set(
              'bdOwners',
              draft.bdOwners.includes(id)
                ? draft.bdOwners.filter((x) => x !== id)
                : [...draft.bdOwners, id],
            )
          }
        />

        <Field
          label="Mô tả"
          hint="Mở sẵn bằng ô 6 của init data — việc khách muốn giải. Sửa lại cho đúng phạm vi đang chào."
        >
          <Textarea
            autoGrow
            rows={3}
            value={draft.description}
            aria-label="Mô tả cơ hội"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>

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
                const picked = [...(e.target.files ?? [])].map((f) => ({
                  name: f.name,
                  size: f.size,
                }))
                e.target.value = ''
                if (picked.length > 0) set('attachments', [...draft.attachments, ...picked])
              }}
            />

            {draft.attachments.length === 0 ? (
              <span className="text-muted-foreground text-[11.5px]">Chưa đính kèm gì.</span>
            ) : (
              <ul className="flex flex-col gap-2">
                {draft.attachments.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center gap-3 rounded-md bg-white/5 px-3 py-2"
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
                        set(
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

        {lost && <LossBlock draft={draft} onSet={set} />}
      </div>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------

type SetFn = <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) => void

/** Khung một ô của phiếu. Cùng hình với ô của form hồ sơ — hai chỗ nhập trên
 *  cùng một màn mà khác hình thì đọc ra như hai sản phẩm. */
function Field({
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
function AmountRow({ draft, onSet }: { draft: OpportunityDraft; onSet: SetFn }) {
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
function PeopleRow({
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

/** Khối lý do thua — chỉ hiện khi trạng thái là Close lost.
 *
 *  Bảy lý do dựng sẵn bấm một phát là xong, và ô ghi thêm luôn mở chứ không nấp
 *  sau một nút "khác": lý do thật thường là "lý do dựng sẵn CỘNG một câu của
 *  riêng đơn này", không phải một trong hai. */
function LossBlock({ draft, onSet }: { draft: OpportunityDraft; onSet: SetFn }) {
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

/** Thẻ đọc của một phiếu đã gửi — dùng ở màn hồ sơ, ngay dưới thanh đáy.
 *
 *  Đổi xong mà màn không đổi gì thì người dùng bấm lại lần nữa. Thẻ này là câu
 *  trả lời "rồi, xong": mã mới, trạng thái, tiền, người đứng đơn, và đường lùi
 *  vì chưa có backend nào để rút phiếu về. */
export function ConvertedCard({ lead }: { lead: Lead }) {
  const deal = useLeadDesk((s) => s.deals[lead.code])
  const undo = useLeadDesk((s) => s.undoConvert)
  if (!deal) return null

  const lost = deal.state === 'close-lost'
  const names = [...deal.saleOwners, ...deal.bdOwners].map(
    (id) => dasVina.actors.find((a) => a.id === id)?.name ?? id,
  )

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md bg-white/5 p-4">
      <Chip variant="source">{deal.code}</Chip>
      <Badge tone={lost ? 'danger' : 'running'}>{STATE_LABEL.get(deal.state)}</Badge>
      <span className="min-w-0 truncate text-[12.5px] font-semibold">{deal.name}</span>
      {deal.amount !== null && (
        <MetaPill mono>{billions(toDong(deal.amount, deal.currency))}</MetaPill>
      )}
      <MetaPill mono>đóng dự kiến {dmy(deal.closedDate)}</MetaPill>
      {names.map((n) => (
        <MetaPill key={n} avatar={n}>
          {n}
        </MetaPill>
      ))}
      {lost && (deal.lossReason !== '' || deal.lossNote !== '') && (
        <span className="text-warning text-[11.5px]">
          Thua · {deal.lossReason !== '' ? deal.lossReason : deal.lossNote}
        </span>
      )}
      <span className="text-muted-foreground text-[11.5px]">chờ {HEAD_OF_SALES} gật</span>
      <Button size="sm" variant="ghost" onClick={() => undo(lead.code)}>
        Rút phiếu
      </Button>
    </div>
  )
}
