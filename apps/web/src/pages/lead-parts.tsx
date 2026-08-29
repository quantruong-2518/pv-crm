import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  Mail,
  MessageSquare,
  Phone,
  RotateCcw,
  Users,
  type IconGlyph,
} from '@pv/ui'
import {
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  Input,
  MetaPill,
  SectionTitle,
  SegmentedControl,
  Select,
  Skeleton,
  StatusDot,
  Textarea,
  Timeline,
  type StatusDotState,
  billions,
  cn,
  dong,
} from '@pv/ui'
import {
  CURRENCIES,
  filledSlots,
  INIT_DATA_QUESTIONS,
  toDong,
  type CurrencyCode,
  type Lead,
  type LeadEvent,
  type LeadEventKind,
  type LeadProfile,
  type TranscriptTurn,
  type TurnKind,
} from '@pv/engines/fixtures/das-vina'
/* HAI kiểu cùng tên `LeadProfile` gặp nhau ở file này, và đó là chuyện hợp
   đồng đã báo trước: cái của fixture là hình mà FORM đọc (mọi trường có mặt,
   `''`/`null` nghĩa là chưa moi được), cái của `@pv/contracts` là hình MÁY CHỦ
   gửi (trường vắng nghĩa là chưa moi được). `profileForm` là chỗ duy nhất đi
   từ cái sau sang cái trước. Đặt bí danh chứ không import bừa: một cái tên
   chọn nhầm ở đây là cả cái form đọc sai một hồ sơ. */
import type { LeadMailTimelineRow, LeadProfile as WireLeadProfile } from '@pv/contracts'
import { useLeadDesk } from '@/app/desk'
import { dm, dmy } from '@/lib/date'
import { peopleRoleOptions, useSalesPeople } from '@/data/directory'
import { leadMailTimelineQuery } from '@/data/mas'
import { isApiError, userMessage } from '@/app/api'
import { profileForm } from '@/data/lead-profile'
import {
  changedFields,
  fieldsOf,
  isMandatory,
  PROFILE_GROUPS,
  readField,
  slotsOfGroup,
  writeField,
  type GroupKey,
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
 *   · `NextActionCard`— một đề xuất ngắn về bước nên làm tiếp theo;
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
    <span className="text-glass-foreground text-[13px] font-semibold leading-[1.4]">
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
        <span className="text-muted-foreground text-[12px] leading-[1.6]">{field.hint}</span>
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
  options,
  onChange,
}: {
  field: ProfileField
  value: string
  /** Danh sách của ô select. Truyền vào chứ không đọc `field.options`, vì ba ô
   *  người của form lấy danh sách từ sổ người trên máy chủ — `FieldRow` dựng
   *  nó một lần cho cả hàng thay vì ba chục ô cùng mở một observer query. */
  options: { value: string; label: string }[]
  onChange: (raw: string) => void
}) {
  const required = isMandatory(field) || undefined

  if (field.kind === 'read') {
    return (
      <span
        className={cn(
          'flex h-11 items-center text-[13px]',
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
        options={options}
        onChange={onChange}
        neutralValue={value}
        className="w-full [&_button]:h-11 [&_button]:text-[13px]"
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
        className="text-[13px]"
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
        className="h-11 text-[13px]"
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
          className="h-11 min-w-0 flex-1 font-mono text-[13px]"
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        />
        {field.unit && (
          <span className="text-muted-foreground shrink-0 text-[12.5px]">{field.unit}</span>
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
      className={cn('h-11 text-[13px]', field.mono && 'font-mono')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ---------------------------------------------------------------------------
// 1 · Hồ sơ lead
// ---------------------------------------------------------------------------

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
export function ProfileCard({ profile }: { profile: WireLeadProfile }) {
  const saved = useLeadDesk((s) => s.profiles[profile.code])
  const patchProfile = useLeadDesk((s) => s.patchProfile)
  const resetProfile = useLeadDesk((s) => s.resetProfile)

  /* Bản gốc là HỒ SƠ THẬT của máy chủ, không còn là bản sinh từ mã lead. Trường
     vắng trên dây = chưa moi được, và `profileForm` dịch nó thành `''`/`null` —
     đúng thứ ô nhập, cổng init data và ô chỉ đọc đều đã hiểu là "chưa có". */
  const base = useMemo(() => profileForm(profile), [profile])
  const stored = useMemo(() => ({ ...base, ...saved }), [base, saved])
  const [work, setWork] = useState<LeadProfile>(stored)

  /* Đổi lead (hoặc nhận bản đã lưu mới) thì nạp lại ô nhập. Không nạp lại thì
     bấm sang lead khác vẫn thấy hồ sơ của lead trước. */
  useEffect(() => setWork(stored), [stored])

  const dirty = useMemo(() => changedFields(stored, work), [stored, work])
  const edited = useMemo(() => changedFields(base, stored), [base, stored])

  /* GẬP THEO Ô CÒN THIẾU, KHÔNG THEO THỨ TỰ.
   *
   *  Ba mươi ô mở sẵn là lý do màn này bị kêu "nhiều quá", và cách gập rẻ tiền
   *  — mở nhóm đầu, gập hai nhóm sau — không giảm được gì: nhóm đầu vẫn là
   *  nhóm dài nhất và vẫn không phải nhóm đang thiếu.
   *
   *  Nên nhóm nào CÒN Ô TRỐNG thì mở, nhóm nào đã đủ thì gập kèm dấu ✓. Một
   *  lead 2/6 ô chỉ nhìn thấy đúng phần phải điền; một lead đã đầy đủ mở ra là
   *  ba dòng tiêu đề, không phải ba mươi ô.
   *
   *  Tính từ `stored` chứ không từ `work`, và đây là chỗ dễ sai nhất: `work` là
   *  thứ đang gõ dở, nên lấy nó làm mốc thì ô cuối cùng của một nhóm vừa được
   *  điền xong sẽ TỰ GẬP CẢ NHÓM ngay dưới con trỏ đang gõ. Trạng thái gập chỉ
   *  được tính lại khi đổi sang LEAD khác.
   *
   *  Đặt lại NGAY TRONG LÚC VẼ, không bằng `useEffect`, và đó là hai cái được
   *  chứ không phải một mẹo lách lint:
   *
   *   · `useEffect` chạy SAU khi trình duyệt đã vẽ, nên bấm sang lead khác sẽ
   *     loé một nhịp accordion của lead cũ rồi mới gập lại đúng. Gán trong lúc
   *     vẽ thì React bỏ luôn lượt vẽ dở và vẽ lại trước khi có gì lên màn.
   *   · Không còn mảng phụ thuộc để mà khai thiếu. Bản trước bỏ `stored` ra
   *     khỏi `[profile.code]` một cách cố ý, và `react-hooks/exhaustive-deps`
   *     cảnh báo đúng — nhưng thêm `stored` vào lại chính là con bọ "tự gập
   *     dưới con trỏ" ở trên. Hình dạng này không phải chọn giữa hai cái sai.
   *
   *  Đây là mẫu chính thức của React cho "đặt lại state khi prop đổi". */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<GroupKey>>(
    () => new Set(incompleteGroups(stored)),
  )
  const [seededFor, setSeededFor] = useState(profile.code)

  if (seededFor !== profile.code) {
    setSeededFor(profile.code)
    setOpenGroups(new Set(incompleteGroups(stored)))
  }

  const set = (field: ProfileField, raw: string) =>
    setWork((w) => ({ ...w, [field.key]: writeField(field, raw) }) as LeadProfile)

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-6 p-4 sm:p-5 lg:p-6"
      aria-label="Hồ sơ lead"
    >
      <SectionTitle
        size="detail"
        /* Kicker cũ đếm số lần cập nhật từ `leadResearch`, thứ đếm số lần chạm
           trong `history`. Bảng `sales.touch` chưa dựng nên hồ sơ về không có
           lần chạm nào — con số đó sẽ là 0 với MỌI lead, kể cả lead vừa nói
           chuyện xong. Một con số luôn bằng 0 không phải thông tin, nên chỗ này
           nói thẳng ra là chưa có sổ để đếm. */
        hint="Điền theo từng nhóm. Các trường có dấu * là thông tin bắt buộc."
        actions={
          edited.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => resetProfile(profile.code)}>
              <Icon icon={RotateCcw} size={16} />
              Về bản gốc · {edited.length} ô
            </Button>
          ) : undefined
        }
      >
        Chi tiết lead
      </SectionTitle>

      {PROFILE_GROUPS.filter((g) => g.key !== 'so').map((group) => (
        <FieldGroup
          key={group.key}
          group={group}
          work={work}
          onSet={set}
          open={openGroups.has(group.key)}
          onToggle={() =>
            setOpenGroups((cur) => {
              const next = new Set(cur)
              if (next.has(group.key)) next.delete(group.key)
              else next.add(group.key)
              return next
            })
          }
        />
      ))}

      <div className="bg-popover shadow-panel flex flex-wrap items-center gap-3 rounded-md p-3 lg:sticky lg:bottom-24 lg:z-10">
        <Button
          size="md"
          disabled={dirty.length === 0}
          onClick={() => patchProfile(profile.code, work)}
        >
          <Icon icon={Check} size={16} />
          Lưu {dirty.length > 0 ? `${dirty.length} thay đổi` : 'thay đổi'}
        </Button>
        <Button
          size="md"
          variant="ghost"
          disabled={dirty.length === 0}
          onClick={() => setWork(stored)}
        >
          Bỏ sửa
        </Button>
        <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
          {dirty.length > 0
            ? `${dirty.length} thay đổi chưa lưu.`
            : 'Dữ liệu được lưu trên thiết bị này.'}
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
  /* Ba ô người của form đọc sổ người trên máy chủ. Dựng ở đây, một lần cho cả
     hàng: ô nào khai `people` thì nhận dòng "chưa ai" của chính nó rồi tới tên
     kèm vai, ô khác giữ nguyên danh sách đóng của bản vẽ. */
  const people = useSalesPeople()
  const staffOptions = useMemo(() => peopleRoleOptions(people), [people])

  return (
    <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
      {fields.map((field) => (
        <FieldShell
          key={field.key}
          field={field}
          plain={field.kind === 'select' || field.kind === 'read'}
        >
          <FieldControl
            field={field}
            value={readField(work, field.key)}
            options={
              field.people
                ? [{ value: '', label: field.people }, ...staffOptions]
                : (field.options ?? [])
            }
            onChange={(raw) => onSet(field, raw)}
          />
          {field.kind === 'money' && <MoneyRead work={work} value={readField(work, field.key)} />}
        </FieldShell>
      ))}
    </div>
  )
}

/** Nhóm nào còn ô bắt buộc chưa moi được — dùng để quyết định mở hay gập.
 *
 *  Nhóm `so` ("Thông tin hệ thống") không nằm trong danh sách vì chính
 *  `ProfileCard` đã lọc nó ra khỏi màn: máy tự ghi, người không điền. */
function incompleteGroups(profile: LeadProfile): GroupKey[] {
  const live = new Set(filledSlots(profile))
  return PROFILE_GROUPS.filter((g) => g.key !== 'so')
    .filter((g) => {
      const slots = slotsOfGroup(g.key)
      return slots.length > 0 && slots.some((s) => !live.has(s))
    })
    .map((g) => g.key)
}

/** Một cụm: tên · mục đích · đã moi được mấy ô — gập được.
 *
 *  Cả tiêu đề là MỘT `<button>`, không phải một cái nhãn cạnh một mũi tên bé
 *  tí: vùng chạm phải đủ 48px cho tablet (luật 13), và một hàng dài 600px mà
 *  chỉ bấm được vào 16px cuối là cái bẫy thiết kế kinh điển.
 *
 *  `aria-expanded` chứ không chỉ xoay mũi tên — trình đọc màn hình phải biết
 *  ba mươi ô kia còn tồn tại và đang đóng, nếu không thì với họ cái form vừa
 *  mất một nửa. */
function FieldGroup({
  group,
  work,
  onSet,
  open,
  onToggle,
}: {
  group: (typeof PROFILE_GROUPS)[number]
  work: LeadProfile
  onSet: (field: ProfileField, raw: string) => void
  open: boolean
  onToggle: () => void
}) {
  const live = useMemo(() => new Set(filledSlots(work)), [work])
  const slots = slotsOfGroup(group.key)
  const got = slots.filter((s) => live.has(s)).length
  const done = slots.length > 0 && got === slots.length

  return (
    <section className="flex flex-col gap-5 rounded-lg bg-white/5 p-4 sm:p-5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 flex-wrap items-start justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-display flex items-center gap-2 text-[16px] font-semibold">
            <Icon
              icon={ChevronDown}
              size={16}
              className={cn('transition-transform', open ? '' : '-rotate-90')}
            />
            {group.label}
          </span>
          <span className="text-muted-foreground text-[12.5px] leading-[1.6]">{group.purpose}</span>
        </span>
        {slots.length > 0 && (
          <span
            className={cn(
              'tnum flex shrink-0 items-center gap-1 font-mono text-[12px]',
              done ? 'text-muted-foreground' : 'text-warning',
            )}
          >
            {done && <Icon icon={Check} size={14} />}
            {got}/{slots.length} trường
          </span>
        )}
      </button>

      {open && <FieldRow fields={fieldsOf(group.key)} work={work} onSet={onSet} />}
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
    <span className="text-muted-foreground text-[12px] leading-[1.6]">
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
 *  Dùng `Textarea` vì ghi chú của lead là nội dung ngắn, thuần văn bản. Toolbar
 *  định dạng làm card nặng hơn mà không giúp người bán hàng ghi nhanh hơn. */
export function NotesCard({ lead }: { lead: Lead }) {
  const note = useLeadDesk((s) => s.notes[lead.code] ?? '')
  const setNote = useLeadDesk((s) => s.setNote)
  const text = plainNote(note)

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label="Ghi chú quan trọng"
    >
      <SectionTitle size="detail" hint="Lưu điều cần nhớ khi liên hệ và xử lý lead.">
        Ghi chú
      </SectionTitle>

      <Textarea
        value={text}
        rows={4}
        autoGrow
        aria-label="Ghi chú về lead"
        onChange={(event) => setNote(lead.code, event.target.value)}
        placeholder="Ví dụ: chỉ gọi trước 9h; người duyệt mới chưa tham gia buổi trao đổi…"
      />
    </GlassCard>
  )
}

/** Ghi chú cũ có thể là HTML do RichText lưu. Chỉ chuyển ở lớp hiển thị; lần
 *  gõ tiếp theo sẽ lưu lại chuỗi thuần và hoàn tất việc chuyển đổi tự nhiên. */
function plainNote(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value
  const node = document.createElement('div')
  node.innerHTML = value
  node.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'))
  node.querySelectorAll('p, div, li').forEach((block) => block.append('\n'))
  return (node.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------------------
// 3 · Next action
// ---------------------------------------------------------------------------

/** Một đề xuất duy nhất cho bước tiếp theo của lead.
 *
 *  Khối này cố ý không phải todo list: không hạn, không người nhận và không
 *  gợi ý tự động. Họp và email phía trên cung cấp bối cảnh; người phụ trách chỉ
 *  cần chốt lại một câu hành động rõ ràng. Phân công vẫn thuộc luồng Giao việc. */
export function NextActionCard({ lead }: { lead: Lead }) {
  const saved = useLeadDesk((s) => s.nextSteps[lead.code] ?? '')
  const setNextStep = useLeadDesk((s) => s.setNextStep)
  const [text, setText] = useState(saved)
  const normalized = text.trim()
  const changed = normalized !== saved

  const save = () => {
    setNextStep(lead.code, normalized)
    setText(normalized)
  }

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-4 sm:p-5"
      aria-label="Đề xuất việc tiếp theo"
    >
      <SectionTitle size="detail" hint="Ghi một bước cụ thể cần làm sau khi xem lịch họp và email.">
        Đề xuất việc tiếp theo
      </SectionTitle>

      <div className="flex flex-col gap-3">
        <Textarea
          value={text}
          rows={2}
          autoGrow
          placeholder="Ví dụ: Gọi lại để chốt lịch khảo sát vào chiều thứ Năm."
          aria-label="Bước nên thực hiện tiếp theo"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && changed) save()
          }}
        />
        <div className="flex justify-end">
          <Button size="md" disabled={!changed} onClick={save}>
            {changed ? 'Lưu đề xuất' : saved === '' ? 'Lưu đề xuất' : 'Đã lưu'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// 4 · Dòng thời gian — timeline VÀ transcript, một khối
// ---------------------------------------------------------------------------

/** Bốn kiểu lần chạm. Hình lấy từ chính công cụ đã dùng — nhìn là biết lần đó
 *  gặp mặt hay chỉ nhắn một câu. */
const TURN_FACE: Record<TurnKind, { label: string; icon: IconGlyph }> = {
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
 *  một cuộc nói chuyện đọc ra phải giống một cuộc nói chuyện.
 *
 *  ------------------------------------------------------------------
 *  DỮ LIỆU ĐI VÀO BẰNG PROPS — KHỐI NÀY KHÔNG TỰ ĐI LẤY
 *  ------------------------------------------------------------------
 *  Khối có HAI người gọi đứng trên hai nền dữ liệu khác nhau, và đó là lý do
 *  nó không được tự gọi `leadTranscript()`:
 *   · `ops-detail` đứng trên sổ ĐÓNG BĂNG — mốc và nguyên văn đều có thật;
 *   · `lead-detail` đứng trên máy chủ — `sales.touch` chưa dựng nên không có
 *     mốc nào, và hàm sinh của fixture với một mã Apollo thì bịa ra một cuộc
 *     hội thoại chưa từng xảy ra.
 *
 *  Nhãn `FrozenLead` bên `@pv/engines` đã chặn đường thứ hai ở tầng kiểu; khối
 *  này nhận `history` và `turns` rời nhau để MỖI người gọi tự khai mình đứng
 *  trên nền nào. Rỗng vẫn là một câu trả lời đúng, và câu ấy nằm ở nhánh
 *  `shown.length === 0` bên dưới — không phải một chỗ hỏng.
 *
 *  Khối ở lại nguyên hình để ngày có endpoint lần chạm chỉ còn là việc đổ dữ
 *  liệu vào — không phải dựng lại một dòng thời gian. */
export function ActivityCard({
  code,
  history,
  turns,
}: {
  code: string
  history: readonly LeadEvent[]
  turns: readonly TranscriptTurn[]
}) {
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    setTab('all')
    setOpen(null)
  }, [code])

  /* Nối mốc với lần chạm bằng ĐÚNG mốc thời gian: `leadTranscript` lấy `at` của
     turn thẳng từ sự kiện timeline sinh ra nó, nên hai đầu luôn khớp chuỗi. */
  const turnAt = useMemo(() => {
    const m = new Map<string, TranscriptTurn>()
    for (const t of turns) if (!m.has(t.at)) m.set(t.at, t)
    return m
  }, [turns])

  const rows = history.map((e, i) => ({ ...e, id: `${e.at}-${i}`, turn: turnAt.get(e.at) }))
  const withConvo = rows.filter((r) => r.turn)
  const shown = tab === 'convo' ? withConvo : rows

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Dòng thời gian">
      <SectionTitle size="lg" hint="Các lần gọi, gặp và trao đổi đã được ghi nhận.">
        Lịch sử tương tác
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
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Chưa có lịch sử tương tác. Dữ liệu lần chạm chưa được kết nối.
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

// ---------------------------------------------------------------------------
// Sổ mail của lead — GET /sales/leads/:code/mail
// ---------------------------------------------------------------------------

/** Mình đã viết cho người này mấy lần, và có tín hiệu gì không.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG BAO GIỜ VIẾT "CHƯA ĐỌC". VIẾT "CHƯA CÓ TÍN HIỆU MỞ".
 *  ------------------------------------------------------------------
 *  Đếm lượt mở là một cái ảnh 1×1, và nó hỏng theo CẢ HAI chiều cùng lúc:
 *
 *   · Apple Mail Privacy Protection tự tải mọi ảnh trên máy chủ của Apple, cho
 *     mọi người bật nó — sinh ra lượt mở KHÔNG AI thực hiện. Trên một tệp B2B
 *     Việt Nam đây không phải trường hợp hiếm, nó là phần lớn người dùng
 *     iPhone.
 *   · Gmail cache ảnh đó, nên mọi lần mở sau lần đầu KHÔNG được đếm.
 *   · Ai đọc thư với chế độ tắt ảnh thì đọc mà không đếm gì cả.
 *
 *  Nên `openCount` là một SÀN DƯỚI CÓ NHIỄU, và ở quy mô một lead thì nhiễu đó
 *  nặng hơn nhiều so với cả lô: một lượt mở ma biến một khách phớt lờ mình
 *  thành một khách "đọc hai lần". Màn này vì thế không có chữ "chưa đọc" và
 *  không có tỉ lệ phần trăm nào — nó nói "chưa có tín hiệu mở", là đúng thứ dữ
 *  liệu này chở được. `clickCount` mới là thứ đáng tin: một cú click là một
 *  hành động người ta chủ động làm, không có proxy ảnh nào bịa ra được.
 *
 *  ------------------------------------------------------------------
 *  MỘT MỐC LÀ MỘT `mail_run`, KHÔNG PHẢI MỘT SỰ KIỆN
 *  ------------------------------------------------------------------
 *  Thẻ này chèn TRƯỚC `ActivityCard`: nó cụ thể hơn — đây là những lá thư đã
 *  gửi cho đúng người này — còn dòng thời gian kia là dòng chảy chung của lead.
 *
 *  Trạng thái của một mốc gộp HAI trục lại thành một chấm, và thứ tự đọc là
 *  thứ tự ưu tiên: người dùng cần biết "có tín hiệu gì không" trước, "thư có
 *  tới không" sau — trừ khi thư KHÔNG tới, lúc đó đó mới là tin quan trọng
 *  nhất trên mốc. Xem `dotOf`. */
export function MailTimelineCard({ code, actions }: { code: string; actions?: ReactNode }) {
  const { data, isPending, error } = useQuery(leadMailTimelineQuery(code))
  const rows = data?.rows ?? []

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Sổ mail của lead">
      <SectionTitle
        size="detail"
        hint="Theo dõi trạng thái gửi và tín hiệu tương tác của từng email."
        actions={actions}
      >
        Email MAS
      </SectionTitle>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        /* Hỏi không được thì nói là hỏi không được — cùng luật với sổ lead.
           Một thẻ trống ở đây đọc ra là "chưa gửi lá thư nào", và đó là câu sai
           nguy hiểm nhất thẻ này có thể nói: nó dẫn người dùng đi gửi thêm một
           lá thư nữa cho người vừa nhận ba lá. */
        <p className="text-warning text-[12.5px] leading-[1.6]">
          Không đọc được lịch sử email của lead này.{' '}
          {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
          Chưa gửi email nào cho lead này.
        </p>
      ) : (
        <Timeline
          items={rows.map((row) => {
            const face = deliveryFace(row)
            const signal = signalOf(row)
            return {
              id: row.runId,
              state: face.dot,
              title: row.label,
              meta: (
                <>
                  <Badge tone={face.tone}>{face.label}</Badge>
                  {face.at && <MetaPill mono>{face.at}</MetaPill>}
                  {signal && (
                    <MetaPill tone={row.clickCount > 0 ? 'accent' : undefined}>{signal}</MetaPill>
                  )}
                </>
              ),
              children: row.failReason ? (
                <span className="text-destructive-foreground">
                  Không gửi được: {row.failReason}
                </span>
              ) : face.tone === 'danger' ? (
                <span className="text-destructive-foreground">
                  Không gửi được. Kiểm tra lại địa chỉ email trước khi thử lại.
                </span>
              ) : undefined,
            }
          })}
        />
      )}
    </GlassCard>
  )
}

/** Hai trục → một chấm, theo thứ tự đọc của người dùng.
 *
 *  `bad` đứng trước mọi thứ: một lá thư bounce hoặc hỏng là tin quan trọng
 *  nhất trên mốc, và nó cũng là thứ duy nhất đòi một hành động (sửa địa chỉ,
 *  hoặc thôi đuổi theo). `warning` cho lá thư bị GIỮ LẠI — địa chỉ đã nằm
 *  trong sổ chặn lúc tới lượt nó — vì đó không phải lỗi đường ống mà là dấu
 *  hiệu tệp danh sách đang mục.
 *
 *  Rồi mới tới tín hiệu: `ok` khi người ta ĐÃ CLICK hoặc đã mở, `current` khi
 *  thư đã tới mà chưa có tín hiệu gì, `next` khi còn đang xếp hàng. */
type MailDeliveryFace = {
  label: string
  tone: 'draft' | 'warning' | 'success' | 'danger'
  dot: StatusDotState
  at?: string
}

/** Trạng thái của LÁ THƯ, không phải trạng thái chung của cả đợt gửi. */
function deliveryFace(row: LeadMailTimelineRow): MailDeliveryFace {
  if (FAILED_MAIL[row.deliveryState]) {
    return { label: 'Gửi lỗi', tone: 'danger', dot: 'bad' }
  }
  if (row.runState === 'CANCELLED') {
    return { label: 'Đã huỷ', tone: 'draft', dot: 'next' }
  }
  if (DELIVERED_MAIL[row.deliveryState]) {
    const moment = row.deliveredAt ?? row.sentAt
    return {
      label: 'Đã gửi',
      tone: 'success',
      dot: 'ok',
      ...(moment
        ? { at: `${row.deliveredAt ? 'Đã tới hộp thư' : 'Gửi thành công'} · ${mailMoment(moment)}` }
        : {}),
    }
  }
  if (row.runState === 'SCHEDULED') {
    return {
      label: 'Đã hẹn gửi',
      tone: 'warning',
      dot: 'next',
      ...(row.scheduledAt ? { at: `Dự kiến · ${mailMoment(row.scheduledAt)}` } : {}),
    }
  }
  return {
    label: 'Đang gửi',
    tone: 'warning',
    dot: 'current',
    ...(row.scheduledAt ? { at: `Bắt đầu · ${mailMoment(row.scheduledAt)}` } : {}),
  }
}

/** Một câu về tín hiệu — và câu "chưa có tín hiệu mở" là câu quan trọng nhất
 *  trong file này. Xem docblock của `MailTimelineCard`. */
function signalOf(row: LeadMailTimelineRow): string | null {
  if (row.clickCount > 0) {
    const count = row.clickCount === 1 ? 'Đã bấm liên kết' : `Đã bấm ${row.clickCount} lần`
    return row.lastClickAt ? `${count} · ${mailMoment(row.lastClickAt)}` : count
  }
  if (row.openCount > 0) {
    const count = `${row.openCount} tín hiệu mở`
    return row.lastOpenAt ? `${count} · gần nhất ${mailMoment(row.lastOpenAt)}` : count
  }
  if (DELIVERED_MAIL[row.deliveryState]) return 'Chưa ghi nhận lượt mở'
  return null
}

function mailMoment(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return dmy(iso)
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).format(date)
}

/* Hai bảng tra thay cho hai chuỗi `||`: mười giá trị của `MAIL_STATES` nằm bên
   `apps/api`, không import sang đây được (`LeadMailTimelineRow.deliveryState`
   giải thích vì sao trường này là `string` trần), nên thứ duy nhất đúng là kể
   tên đúng những giá trị màn này biết xử. Giá trị lạ rơi vào nhánh cuối cùng —
   "đang trên đường" — là hướng hỏng an toàn: nói ít hơn sự thật, không nói sai. */
const FAILED_MAIL: Record<string, true | undefined> = {
  bounced: true,
  complained: true,
  suppressed: true,
  failed_permanent: true,
  dead: true,
}

const DELIVERED_MAIL: Record<string, true | undefined> = {
  accepted: true,
  delivered: true,
}
