import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CalendarClock,
  Check,
  ChevronDown,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  Progress,
  RichText,
  SectionTitle,
  SegmentedControl,
  Select,
  Separator,
  StatusDot,
  Textarea,
  billions,
  cn,
  dong,
} from '@pv/ui'
import {
  CURRENCIES,
  dasVina,
  filledSlots,
  INIT_DATA_QUESTIONS,
  leadProfile,
  leadResearch,
  leadTranscript,
  REQUIRED_SLOTS,
  toDong,
  type CurrencyCode,
  type Lead,
  type LeadEventKind,
  type LeadProfile,
  type TranscriptTurn,
  type TurnKind,
} from '@pv/engines/fixtures/das-vina'
import { todosOf, useLeadDesk } from '@/app/desk'
import { useSession } from '@/app/session'
import { dm, dmy } from '@/lib/date'
import { nextActions } from '@/data/leads'
import {
  changedFields,
  fieldsOf,
  isMandatory,
  PROFILE_GROUPS,
  readField,
  slotsOfGroup,
  writeField,
  type ProfileField,
} from '@/data/lead-form'

/** Module 2 · Bốn khối lớn của hồ sơ lead.
 *
 *  Tách khỏi `lead-detail.tsx` vì cùng một lý do `campaign-parts.tsx` tách khỏi
 *  `campaign-detail.tsx`: màn còn lại chỉ nên là BỐ CỤC — đọc dòng lead, xếp
 *  khối, treo thanh công cụ. Nội dung từng khối là chuyện riêng của khối.
 *
 *   · `ProfileCard`   — hồ sơ sửa được, có cổng init data sống;
 *   · `NotesCard`     — thông tin quan trọng, ô soạn tự do;
 *   · `NextActionCard`— gợi ý của hệ + việc người dùng tự hẹn;
 *   · `ActivityCard`  — timeline và transcript, GỘP làm một.
 *
 *  ------------------------------------------------------------------
 *  LUẬT CHỮ TRÊN MÀN
 *  ------------------------------------------------------------------
 *  Một khối được đúng một câu dẫn, dưới mười hai chữ. Câu dẫn của ô chỉ còn ở ô
 *  có BẪY thật (đổi nó là đổi thứ khác, hoặc nó hay bị hiểu sai nghĩa) — bốn ô
 *  trên ba mươi. Phần lý do đầy đủ ở lại trong docblock, chỗ người sửa code
 *  đọc, chứ không ở trên màn, chỗ người bán hàng nhìn.
 *
 *  Cả bốn khối tự nối vào `app/desk.ts`, không nhận callback từ màn: thứ chúng
 *  ghi sống lâu hơn một lần mở màn. */

// ---------------------------------------------------------------------------
// Khung chung của một ô
// ---------------------------------------------------------------------------

/** Một ô: nhãn (kèm dấu sao nếu bắt buộc) · control · câu dẫn nếu ô có bẫy.
 *
 *  Không còn nhãn `ô N`: xem docblock `data/lead-form.ts`. Bề rộng cũng không
 *  còn ở đây — mọi ô chiếm đúng một ô lưới, lưới quyết định bề rộng.
 *
 *  `plain` bỏ thẻ `<label>` bọc ngoài. Cần nó cho hai kiểu control tự mang nhãn
 *  của mình: `Select` (A-15) bọc sẵn một `<label>` — lồng hai label là HTML sai
 *  và trình đọc màn hình đọc ra hai tên cho một ô — còn ô chỉ đọc thì không có
 *  control nào để nhãn trỏ vào. */
function FieldShell({
  field,
  plain,
  children,
}: {
  field: ProfileField
  plain?: boolean
  children: ReactNode
}) {
  const head = (
    <span className="text-muted-foreground text-[11px]">
      {field.label}
      {isMandatory(field) && (
        <span className="text-warning" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </span>
  )

  const body = (
    <>
      {head}
      {children}
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {plain ? body : <label className="flex flex-col gap-2">{body}</label>}
      {field.hint && (
        <span className="text-muted-foreground text-[11px] leading-[1.5]">{field.hint}</span>
      )}
    </div>
  )
}

/** Số có dấu chấm ngăn nghìn cho ô nhập — luật 6.
 *
 *  Chỉ dùng để HIỆN. Lúc ghi lại thì `writeField` bóc hết ký tự không phải số,
 *  nên người dùng gõ chấm hay không gõ đều ra cùng một giá trị. */
const grouped = (raw: string) => (raw === '' ? '' : Number(raw).toLocaleString('vi-VN'))

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ProfileField
  value: string
  onChange: (raw: string) => void
}) {
  const required = isMandatory(field) || undefined

  if (field.kind === 'read') {
    return (
      <span
        className={cn(
          'flex h-10 items-center text-[12.5px]',
          field.mono && 'font-mono',
          value === '' && 'text-muted-foreground',
        )}
      >
        {value === '' ? '—' : value}
      </span>
    )
  }

  if (field.kind === 'select') {
    return (
      <Select
        label={field.label}
        hideLabel
        value={value}
        options={field.options ?? []}
        onChange={onChange}
        neutralValue={value}
        className="w-full"
      />
    )
  }

  if (field.kind === 'long') {
    /* Ô văn bản CAO lên chứ không rộng ra — nó vẫn đúng một ô lưới như mọi ô
       khác, nếu không cả hàng lệch cột. */
    return (
      <Textarea
        autoGrow
        rows={3}
        value={value}
        placeholder={field.placeholder}
        aria-label={field.label}
        aria-required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (field.kind === 'date') {
    return (
      <Input
        type="date"
        value={value.slice(0, 10)}
        aria-label={field.label}
        aria-required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (field.kind === 'num' || field.kind === 'money') {
    return (
      <span className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          value={grouped(value)}
          aria-label={field.label}
          aria-required={required}
          className="min-w-0 flex-1 font-mono"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        />
        {field.unit && (
          <span className="text-muted-foreground shrink-0 text-[11px]">{field.unit}</span>
        )}
      </span>
    )
  }

  return (
    <Input
      value={value}
      placeholder={field.placeholder}
      aria-label={field.label}
      aria-required={required}
      className={cn(field.mono && 'font-mono')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ---------------------------------------------------------------------------
// 1 · Hồ sơ lead
// ---------------------------------------------------------------------------

/** Cổng init data, một dòng.
 *
 *  Chỉ ô CÒN THIẾU mới ra mặt; đủ rồi thì thanh xanh là hết chuyện. Đếm từ hồ
 *  sơ ĐANG SỬA (`filledSlots`), không đếm từ `lead.requiredFilled`: con số
 *  trong sổ là ảnh chụp lúc vào màn, còn cổng phải nhích theo từng chữ. */
function GateStrip({ profile }: { profile: LeadProfile }) {
  const live = useMemo(() => new Set(filledSlots(profile)), [profile])
  const required = INIT_DATA_QUESTIONS.filter((q) => q.required)
  const got = required.filter((q) => live.has(q.key)).length
  const missing = INIT_DATA_QUESTIONS.filter((q) => !live.has(q.key))

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Bộ 10 câu">
      <Progress
        value={got / REQUIRED_SLOTS}
        label={`Ô bắt buộc · ${got}/${REQUIRED_SLOTS}`}
        tone={got < REQUIRED_SLOTS ? 'warning' : 'primary'}
      />

      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-[11px]">Chưa moi được</span>
          {missing.map((q) => (
            <span
              key={q.key}
              className={cn(
                'rounded-sm px-2 py-1 text-[11px]',
                q.required ? 'bg-warning/20 text-warning' : 'bg-white/9 text-muted-foreground',
              )}
            >
              {q.label}
            </span>
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-[11px] leading-[1.5]">
        Cổng là {REQUIRED_SLOTS} ô bắt buộc, không phải {INIT_DATA_QUESTIONS.length}/
        {INIT_DATA_QUESTIONS.length}.
      </p>
    </div>
  )
}

/** Hồ sơ lead — bộ 10 câu mở ra thành ô nhập.
 *
 *  ------------------------------------------------------------------
 *  BỐN QUYẾT ĐỊNH
 *  ------------------------------------------------------------------
 *  1 · **Form dựng từ bản vẽ, không viết tay.** `PROFILE_FIELDS` là bảng; khối
 *      này chỉ lặp qua nó. Thêm trường vào hồ sơ = thêm một dòng vào bảng.
 *
 *  2 · **Lưới đều, mọi ô một ô lưới.** Xem docblock `data/lead-form.ts` — hai
 *      cách xếp trước đó đều sai, và sai theo hai hướng ngược nhau.
 *
 *  3 · **Chỉ dấu sao, không số ô.** Người điền form quan tâm ô nào bắt buộc,
 *      không quan tâm câu đó đánh số mấy. Cổng vẫn đếm ở dải trên đầu thẻ.
 *
 *  4 · **Cụm Sổ sách đóng sẵn.** Mười hai ô hệ tự ghi, mở ra chín trên mười lần
 *      không ai sửa gì. Ba ô đáng nhìn nhất của cụm (người giữ · bậc · cột) đã
 *      nằm trên dãy pill ở đầu trang rồi.
 *
 *  Sửa xong phải bấm lưu. Tự lưu từng phím nghe tiện nhưng bỏ mất trạng thái
 *  "tôi đang sửa dở" — mà đó chính là lúc người dùng cần thấy còn bao nhiêu ô
 *  chưa lưu và có đường lùi. */
export function ProfileCard({ lead }: { lead: Lead }) {
  const saved = useLeadDesk((s) => s.profiles[lead.code])
  const patchProfile = useLeadDesk((s) => s.patchProfile)
  const resetProfile = useLeadDesk((s) => s.resetProfile)

  const base = useMemo(() => leadProfile(lead), [lead])
  const stored = useMemo(() => ({ ...base, ...saved }), [base, saved])
  const [work, setWork] = useState<LeadProfile>(stored)
  const [openBook, setOpenBook] = useState(false)

  /* Đổi lead (hoặc nhận bản đã lưu mới) thì nạp lại ô nhập. Không nạp lại thì
     bấm sang lead khác vẫn thấy hồ sơ của lead trước. */
  useEffect(() => setWork(stored), [stored])

  const research = useMemo(() => leadResearch(lead), [lead])
  const dirty = useMemo(() => changedFields(stored, work), [stored, work])
  const edited = useMemo(() => changedFields(base, stored), [base, stored])

  const set = (field: ProfileField, raw: string) =>
    setWork((w) => ({ ...w, [field.key]: writeField(field, raw) }) as LeadProfile)

  return (
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Hồ sơ lead">
      <SectionTitle
        size="lg"
        kicker={
          research.version > 0
            ? `Cập nhật lần thứ ${research.version} · ${dmy(research.updatedAt)} · ${research.updatedBy}`
            : 'Chưa ai nói chuyện được với khách'
        }
        hint="Mười ô init data, mở ra thành ô nhập. Dấu sao là ô bắt buộc."
        actions={
          edited.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => resetProfile(lead.code)}>
              <Icon icon={RotateCcw} size={16} />
              Về bản gốc · {edited.length} ô
            </Button>
          ) : undefined
        }
      >
        Hồ sơ lead
      </SectionTitle>

      <GateStrip profile={work} />

      {PROFILE_GROUPS.filter((g) => g.key !== 'so').map((group) => (
        <FieldGroup key={group.key} group={group} work={work} onSet={set} />
      ))}

      <Separator />

      <div className="flex flex-col gap-4">
        <button
          type="button"
          aria-expanded={openBook}
          onClick={() => setOpenBook((v) => !v)}
          className="motion-std flex items-center gap-3 self-start rounded-md text-left"
        >
          <Icon
            icon={ChevronDown}
            size={16}
            className={cn('text-muted-foreground', openBook && 'rotate-180')}
          />
          <span className="flex flex-col">
            <span className="text-[12.5px] font-semibold">Sổ sách · {fieldsOf('so').length} ô</span>
            <span className="text-muted-foreground text-[11px]">
              {PROFILE_GROUPS.find((g) => g.key === 'so')?.purpose}
            </span>
          </span>
        </button>

        {openBook && <FieldRow fields={fieldsOf('so')} work={work} onSet={set} />}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="md"
          disabled={dirty.length === 0}
          onClick={() => patchProfile(lead.code, work)}
        >
          <Icon icon={Check} size={16} />
          Lưu {dirty.length > 0 ? `${dirty.length} ô đã sửa` : 'hồ sơ'}
        </Button>
        <Button
          size="md"
          variant="ghost"
          disabled={dirty.length === 0}
          onClick={() => setWork(stored)}
        >
          Bỏ sửa
        </Button>
        <span className="text-muted-foreground text-[11.5px]">
          {dirty.length > 0
            ? `${dirty.length} ô chưa lưu — rời màn bây giờ là mất.`
            : 'Chưa có backend: lưu là ghi vào bàn làm việc trên máy này.'}
        </span>
      </div>
    </GlassCard>
  )
}

/** Một hàng ô, lưới đều.
 *
 *  Ba cột trên màn rộng, hai cột ở khoảng giữa, một cột trên điện thoại. Không
 *  ô nào được `col-span` — thẳng cột là thứ khiến mắt bám được vào một form ba
 *  mươi ô, và một ngoại lệ là đủ để mất nó. */
function FieldRow({
  fields,
  work,
  onSet,
}: {
  fields: ProfileField[]
  work: LeadProfile
  onSet: (field: ProfileField, raw: string) => void
}) {
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => (
        <FieldShell
          key={field.key}
          field={field}
          plain={field.kind === 'select' || field.kind === 'read'}
        >
          <FieldControl
            field={field}
            value={readField(work, field.key)}
            onChange={(raw) => onSet(field, raw)}
          />
          {field.kind === 'money' && <MoneyRead work={work} value={readField(work, field.key)} />}
        </FieldShell>
      ))}
    </div>
  )
}

/** Một cụm: số thứ tự · tên · mục đích · đã moi được mấy ô. */
function FieldGroup({
  group,
  work,
  onSet,
}: {
  group: (typeof PROFILE_GROUPS)[number]
  work: LeadProfile
  onSet: (field: ProfileField, raw: string) => void
}) {
  const live = useMemo(() => new Set(filledSlots(work)), [work])
  const slots = slotsOfGroup(group.key)
  const got = slots.filter((s) => live.has(s)).length
  const no = PROFILE_GROUPS.findIndex((g) => g.key === group.key) + 1

  return (
    <section className="flex flex-col gap-4">
      <Separator />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <span className="text-muted-foreground font-mono text-[11px]">{no}</span>
          <span className="font-display text-[14px] font-semibold">{group.label}</span>
          <span className="text-muted-foreground text-[11.5px]">{group.purpose}</span>
        </span>
        {slots.length > 0 && (
          <span
            className={cn(
              'tnum shrink-0 font-mono text-[11px]',
              got < slots.length ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {got}/{slots.length} ô
          </span>
        )}
      </div>

      <FieldRow fields={fieldsOf(group.key)} work={work} onSet={onSet} />
    </section>
  )
}

/** Dòng đọc lại số tiền vừa gõ.
 *
 *  Bảy chữ số trong một ô nhập không đọc ra được bằng mắt — gõ nhầm một số 0 là
 *  lệch mười lần và không ai thấy. Dòng này in lại đúng số đó bằng đơn vị người
 *  ta nói (tỷ), và với ngoại tệ thì in luôn phần quy ra đồng, vì sổ cơ hội cộng
 *  bằng đồng. */
function MoneyRead({ work, value }: { work: LeadProfile; value: string }) {
  if (value === '') return null
  const amount = Number(value)
  const currency: CurrencyCode = work.currency
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <span className="text-muted-foreground text-[11px] leading-[1.5]">
      {currency === 'VND'
        ? `${dong(amount)} · ${billions(amount)}`
        : `${amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toDong(amount, currency))} quy ra đồng`}
    </span>
  )
}

// ---------------------------------------------------------------------------
// 2 · Thông tin quan trọng
// ---------------------------------------------------------------------------

/** Ô tự do duy nhất của hồ sơ.
 *
 *  Cố ý đứng NGOÀI bộ 10 câu và cố ý không đếm vào cổng. Mười ô kia là thứ hệ
 *  đo được và đem đi so giữa các lead; ô này là thứ chỉ người cầm lead biết —
 *  "gọi trước 9h, sau 9h là vào xưởng", "đừng nhắc tên đối thủ trước mặt sếp
 *  họ". Trộn hai loại vào một chỗ thì hoặc cổng đếm nhầm, hoặc người ta ngại gõ
 *  vì sợ ảnh hưởng tới cổng.
 *
 *  Dùng `RichText` chứ không `Textarea` vì đây là thứ NGƯỜI đọc: gạch đầu dòng
 *  và chữ đậm làm được việc thật ở một khối ghi chú dài. */
export function NotesCard({ lead }: { lead: Lead }) {
  const note = useLeadDesk((s) => s.notes[lead.code] ?? '')
  const setNote = useLeadDesk((s) => s.setNote)

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Thông tin quan trọng">
      <SectionTitle size="md" hint="Thứ không ô nào chứa được. Không đếm vào cổng.">
        Thông tin quan trọng
      </SectionTitle>

      <RichText
        label="Thông tin quan trọng về lead này"
        value={note}
        onChange={(html) => setNote(lead.code, html)}
        minHeight={132}
        placeholder="Gọi trước 9h, sau 9h là vào xưởng. Sếp bên họ vừa đổi, người mới chưa gặp…"
      />
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// 3 · Next action
// ---------------------------------------------------------------------------

/** Việc tiếp theo — gợi ý của hệ ở trên, việc tự hẹn ở dưới.
 *
 *  Hai tầng này KHÔNG thay nhau. Gợi ý của hệ suy từ trạng thái lead nên luôn
 *  đúng và luôn chung chung ("lấy 2 ô còn thiếu"); việc tự hẹn là câu hệ không
 *  đoán được ("gọi lại sau khi khách họp xong thứ Năm"). Bấm một gợi ý là nó
 *  rơi xuống ô soạn thành chữ sửa được — người dùng không phải gõ lại, mà vẫn
 *  hẹn được ngày và giao được cho ai.
 *
 *  Ngày hẹn để TRỐNG được. Ép chọn ngày cho mọi việc thì người ta chọn bừa một
 *  ngày, và cả cột hạn thành vô nghĩa. */
export function NextActionCard({ lead }: { lead: Lead }) {
  const me = useSession((s) => s.actor)
  const todos = useLeadDesk((s) => todosOf(s, lead.code))
  const addTodo = useLeadDesk((s) => s.addTodo)
  const toggleTodo = useLeadDesk((s) => s.toggleTodo)
  const removeTodo = useLeadDesk((s) => s.removeTodo)

  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [who, setWho] = useState('')

  const suggestions = useMemo(() => nextActions(lead).filter((a) => a.key !== 'giao-viec'), [lead])
  const people = useMemo(() => dasVina.actors.filter((a) => a.branches.includes('Sales')), [])
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? me?.name ?? ''

  const add = () => {
    if (text.trim() === '') return
    addTodo(lead.code, { text: text.trim(), due, who })
    setText('')
    setDue('')
    setWho('')
  }

  const open = todos.filter((t) => !t.done).length

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Việc tiếp theo">
      <SectionTitle
        size="md"
        kicker={open > 0 ? `${open} việc chưa xong` : 'Chưa hẹn việc nào'}
        hint="Bấm một gợi ý của hệ để mồi chữ, rồi hẹn ngày."
      >
        Việc tiếp theo
      </SectionTitle>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((a) => (
          <Button
            key={a.key}
            size="sm"
            variant="ghost"
            title={a.why}
            onClick={() => setText(a.label)}
          >
            <Icon icon={a.icon} size={16} />
            {a.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-md bg-white/5 p-3">
        <Input
          value={text}
          placeholder="Việc cần làm tiếp trên lead này…"
          aria-label="Việc cần làm"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground text-[11px]">Hạn</span>
            <Input
              type="date"
              value={due}
              aria-label="Hạn của việc"
              className="w-[168px]"
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <Select
            label="Giao cho"
            value={who}
            neutralValue=""
            onChange={setWho}
            className="max-w-[248px]"
            options={[
              { value: '', label: 'Chính mình' },
              ...people.map((p) => ({ value: p.id, label: `${p.name} · ${p.role}` })),
            ]}
          />
          <Button size="md" disabled={text.trim() === ''} onClick={add}>
            <Icon icon={Plus} size={16} />
            Thêm việc
          </Button>
        </div>
      </div>

      {todos.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Gợi ý phía trên là việc hệ suy ra từ trạng thái lead — nó không tự thành lịch của bạn cho
          tới khi bạn hẹn ngày.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-md bg-white/5 pr-3">
              <Checkbox
                checked={t.done}
                onChange={() => toggleTodo(lead.code, t.id)}
                className="min-w-0 flex-1"
                label={
                  <span className={cn(t.done && 'text-muted-foreground line-through')}>
                    {t.text}
                  </span>
                }
                hint={
                  <span className="flex flex-wrap items-center gap-2">
                    {t.due !== '' && (
                      <span className="flex items-center gap-1">
                        <Icon icon={CalendarClock} size={14} />
                        {dmy(t.due)}
                      </span>
                    )}
                    <span>{t.who === '' ? 'chính mình' : nameOf(t.who)}</span>
                  </span>
                }
                trailing={
                  <Avatar name={t.who === '' ? (me?.name ?? '?') : nameOf(t.who)} size="sm" />
                }
              />
              <button
                type="button"
                aria-label={`Xoá việc ${t.text}`}
                onClick={() => removeTodo(lead.code, t.id)}
                className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 flex size-8 shrink-0 items-center justify-center rounded-md"
              >
                <Icon icon={Trash2} size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// 4 · Dòng thời gian — timeline VÀ transcript, một khối
// ---------------------------------------------------------------------------

/** Bốn kiểu lần chạm. Hình lấy từ chính công cụ đã dùng — nhìn là biết lần đó
 *  gặp mặt hay chỉ nhắn một câu. */
const TURN_FACE: Record<TurnKind, { label: string; icon: LucideIcon }> = {
  gap: { label: 'Gặp mặt', icon: Users },
  goi: { label: 'Gọi điện', icon: Phone },
  chat: { label: 'Nhắn tin', icon: MessageSquare },
  mail: { label: 'Email', icon: Mail },
}

const EVENT_DOT: Record<LeadEventKind, 'ok' | 'current' | 'next' | 'bad' | 'warning'> = {
  'vao-so': 'next',
  cham: 'next',
  'dien-o': 'current',
  giao: 'current',
  'len-bac': 'ok',
  'gap-lan-dau': 'ok',
  'vao-pipeline': 'ok',
  'doi-cot': 'current',
  ky: 'ok',
  'ra-khoi-luong': 'bad',
}

/** Cả đời lead và nguyên văn các lần nói chuyện — GỘP làm một.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO GỘP
 *  ------------------------------------------------------------------
 *  Hai khối cũ kể cùng một câu chuyện bằng hai giọng. Timeline có chín mốc và
 *  nói "ngày 05/06 agent 1 nhắn lại, lấy được 3 ô đầu"; transcript có năm lần
 *  chạm và nói "ngày 05/06, đây là nguyên văn câu đã hỏi". Mốc thứ hai của
 *  timeline VÀ lần chạm thứ hai của transcript là cùng một sự việc — để cạnh
 *  nhau thành hai danh sách thì người đọc phải tự ghép ngày để biết điều đó.
 *
 *  Gộp rồi thì mỗi mốc là một dòng, và mốc nào CÓ hội thoại thì mở ra đọc được
 *  nguyên văn ngay tại chỗ. Không còn chuyện nhảy qua nhảy lại giữa hai khối.
 *
 *  Hai tab: "Tất cả" là chín mốc, "Có hội thoại" lọc còn đúng những mốc mở ra
 *  được. Tab thứ hai là chế độ người ta cần khi đang đi tìm một câu khách đã
 *  nói — bốn mốc hành chính xen vào giữa chỉ làm loãng.
 *
 *  Nguyên văn vẫn ĐÓNG sẵn: docs chốt transcript tiếng Anh là dữ liệu lưu,
 *  không phải thứ hiển thị mặc định. Mở ra thì vẽ thành bong bóng hai phía —
 *  một cuộc nói chuyện đọc ra phải giống một cuộc nói chuyện. */
export function ActivityCard({ lead }: { lead: Lead }) {
  const turns = useMemo(() => leadTranscript(lead), [lead])
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    setTab('all')
    setOpen(null)
  }, [lead.code])

  /* Nối mốc với lần chạm bằng ĐÚNG mốc thời gian: `leadTranscript` lấy `at` của
     turn thẳng từ sự kiện timeline sinh ra nó, nên hai đầu luôn khớp chuỗi. */
  const turnAt = useMemo(() => {
    const m = new Map<string, TranscriptTurn>()
    for (const t of turns) if (!m.has(t.at)) m.set(t.at, t)
    return m
  }, [turns])

  const rows = lead.history.map((e, i) => ({ ...e, id: `${e.at}-${i}`, turn: turnAt.get(e.at) }))
  const withConvo = rows.filter((r) => r.turn)
  const shown = tab === 'convo' ? withConvo : rows

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Dòng thời gian">
      <SectionTitle
        size="md"
        hint="Lưu nguyên văn bằng tiếng Anh — một ngôn ngữ duy nhất để phân tích được cả sổ."
      >
        Dòng thời gian
      </SectionTitle>

      <SegmentedControl
        label="Lọc mốc"
        hideLabel
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'all', label: 'Tất cả', count: rows.length },
          {
            value: 'convo',
            label: 'Có hội thoại',
            count: withConvo.length,
            disabled: withConvo.length === 0,
          },
        ]}
      />

      {shown.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa lần chạm nào moi được ô nào, nên chưa có gì để lưu. Gọi mà không hỏi ra gì thì không
          sinh transcript.
        </p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((row, i) => {
            const face = row.turn ? TURN_FACE[row.turn.kind] : undefined
            const on = open === row.id
            const last = i === shown.length - 1

            return (
              <li key={row.id} className="flex gap-3">
                {/* Cột mốc: chấm trạng thái và sợi dây nối xuống mốc sau. Dây
                    dừng ở mốc cuối, nếu không nó chỉ vào khoảng trống. */}
                <span className="flex flex-col items-center pt-1">
                  <StatusDot state={EVENT_DOT[row.kind]} />
                  {!last && <span aria-hidden className="bg-white/8 w-px flex-1" />}
                </span>

                <div className={cn('flex min-w-0 flex-1 flex-col gap-2', !last && 'pb-4')}>
                  <span className="text-muted-foreground font-mono text-[10.5px]">
                    {dm(row.at)}
                  </span>
                  <p className="text-[12px] font-semibold leading-[1.5]">{row.note}</p>

                  <div className="flex flex-wrap items-center gap-2">
                    <MetaPill avatar={row.by}>{row.by}</MetaPill>
                    {face && <MetaPill icon={face.icon}>{face.label}</MetaPill>}
                  </div>

                  {row.turn && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {INIT_DATA_QUESTIONS.filter((q) => row.turn?.slots.includes(q.key)).map(
                          (q) => (
                            <Chip key={q.key}>{q.label}</Chip>
                          ),
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="self-start"
                        aria-expanded={on}
                        onClick={() => setOpen(on ? null : row.id)}
                      >
                        <Icon icon={ChevronDown} size={16} className={cn(on && 'rotate-180')} />
                        {on ? 'Ẩn nguyên văn' : 'Xem nguyên văn'}
                      </Button>

                      {on && <Bubbles turn={row.turn} />}
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </GlassCard>
  )
}

function Bubbles({ turn }: { turn: TranscriptTurn }) {
  return (
    <div className="flex flex-col gap-2">
      {turn.lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'flex max-w-[90%] flex-col gap-1 rounded-md px-3 py-2',
            line.speaker === 'pv'
              ? 'bg-primary/24 text-accent-foreground self-end'
              : 'text-glass-foreground self-start bg-white/5',
          )}
        >
          <span className="font-mono text-[10px] uppercase tracking-[.13em] opacity-75">
            {line.speaker === 'pv' ? `PV · ${turn.by}` : 'Khách'}
          </span>
          <span className="text-[12px] leading-[1.65]">{line.text}</span>
        </div>
      ))}
    </div>
  )
}
