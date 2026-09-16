import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from '@pv/ui'
import {
  Button,
  GlassCard,
  Icon,
  Input,
  SectionTitle,
  Select,
  Textarea,
  billions,
  cn,
  dong,
} from '@pv/ui'
import {
  CURRENCIES,
  filledSlots,
  toMoneyVnd,
  type CurrencyCode,
  type Lead,
  type LeadProfile,
} from '@pv/engines/fixtures/das-vina'
/* HAI kiểu cùng tên `LeadProfile` gặp nhau ở file này, và đó là chuyện hợp
   đồng đã báo trước: cái của fixture là hình mà FORM đọc (mọi trường có mặt,
   `''`/`null` nghĩa là chưa moi được), cái của `@pv/contracts` là hình MÁY CHỦ
   gửi (trường vắng nghĩa là chưa moi được). `profileForm` là chỗ duy nhất đi
   từ cái sau sang cái trước. Đặt bí danh chứ không import bừa: một cái tên
   chọn nhầm ở đây là cả cái form đọc sai một hồ sơ. */
import type { LeadProfile as WireLeadProfile } from '@pv/contracts'
import { useLeadDesk } from '@/app/desk'
import { peopleRoleOptions, useSalesPeople } from '@/data/directory'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { ROOT_FIELD } from '@/data/lead-create'
import { buildLeadPatch, patchFieldLabel, useUpdateLeadProfile } from '@/data/lead-patch'
import { profileForm } from '@/data/lead-profile'
import {
  changedFields,
  channelUrlLabel,
  DEADLINE_MAX,
  DEADLINE_MIN,
  fieldsOf,
  inputModeOf,
  isRequiredOnSave,
  maxCharsOf,
  PROFILE_GROUPS,
  readField,
  slotsOfGroup,
  writeField,
  type GroupKey,
  type ProfileField,
} from '@/data/lead-form'

/** Module 2 · Ba khối lớn của hồ sơ lead.
 *
 *  Tách khỏi `lead-detail.tsx` vì cùng một lý do `campaign-parts.tsx` tách khỏi
 *  `campaign-detail.tsx`: màn còn lại chỉ nên là BỐ CỤC — đọc dòng lead, xếp
 *  khối, treo thanh công cụ. Nội dung từng khối là chuyện riêng của khối.
 *
 *   · `ProfileCard`   — hồ sơ sửa được, có cổng init data sống;
 *   · `NotesCard`     — thông tin quan trọng, ô soạn tự do;
 *   · `NextActionCard`— một đề xuất ngắn về bước nên làm tiếp theo.
 *
 *  ------------------------------------------------------------------
 *  LUẬT CHỮ TRÊN MÀN
 *  ------------------------------------------------------------------
 *  Một khối được đúng một câu dẫn, dưới mười hai chữ. Câu dẫn của ô chỉ còn ở ô
 *  có BẪY thật (đổi nó là đổi thứ khác, hoặc nó hay bị hiểu sai nghĩa) — bốn ô
 *  trên ba mươi. Phần lý do đầy đủ ở lại trong docblock, chỗ người sửa code
 *  đọc, chứ không ở trên màn, chỗ người bán hàng nhìn.
 *
 *  Cả ba khối tự nối vào `app/desk.ts`, không nhận callback từ màn: thứ chúng
 *  ghi sống lâu hơn một lần mở màn. */

// ---------------------------------------------------------------------------
// Khung chung của một ô
// ---------------------------------------------------------------------------

/** Một ô: nhãn (kèm dấu sao nếu ô không được để trống) · control · câu dẫn.
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
      {isRequiredOnSave(field) && (
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
  const required = isRequiredOnSave(field) || undefined

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
        maxLength={maxCharsOf(field)}
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
        min={DEADLINE_MIN}
        max={DEADLINE_MAX}
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
          /* Clamped by DIGITS, not by `maxLength`: the box shows `1.000.000`
             while the value behind it is `1000000`, so a character ceiling on
             the control would cut the number short by however many separators
             it happens to be wearing. */
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, maxCharsOf(field)))}
        />
        {field.unit && (
          <span className="text-muted-foreground shrink-0 text-[12.5px]">{field.unit}</span>
        )}
      </span>
    )
  }

  return (
    <Input
      type={field.key === 'email' ? 'email' : 'text'}
      inputMode={inputModeOf(field)}
      /* Nothing on this card benefits from the browser's own suggestions, and
         one of them actively harms: a box asking for the contact person invites
         the autofill of whoever is TYPING, not of the customer being recorded. */
      autoComplete="off"
      value={value}
      maxLength={maxCharsOf(field)}
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
  const save = useUpdateLeadProfile()
  const [failed, setFailed] = useState<FieldErrors | null>(null)

  /* Bản gốc là HỒ SƠ THẬT của máy chủ, không còn là bản sinh từ mã lead. Trường
     vắng trên dây = chưa moi được, và `profileForm` dịch nó thành `''`/`null` —
     đúng thứ ô nhập, cổng init data và ô chỉ đọc đều đã hiểu là "chưa có".

     Không còn lớp đè `desk.profiles` ở giữa. Cho tới 30/08 nút Lưu ghi vào một
     kho zustand, và bản đã "lưu" đó phủ lên bản của máy chủ — nghĩa là sau khi
     có `PATCH` thật, một patch cũ còn nằm trong trình duyệt sẽ che mất chính
     giá trị vừa ghi xuống. Một nguồn sự thật, và nó ở phía máy chủ. */
  const base = useMemo(() => profileForm(profile), [profile])
  const [work, setWork] = useState<LeadProfile>(base)

  /* Đổi lead — hoặc nhận bản mới sau một lượt lưu — thì nạp lại ô nhập. Không
     nạp lại thì bấm sang lead khác vẫn thấy hồ sơ của lead trước. */
  useEffect(() => setWork(base), [base])

  const dirty = useMemo(() => changedFields(base, work), [base, work])

  /* Two human clicks are two real writes, and the second one lands a second
     `dien-o` row on the timeline — one sitting reading as two. `isPending`
     guards it here; the client only refuses to replay a write automatically. */
  const submit = () => {
    if (save.isPending) return

    const built = buildLeadPatch(base, work)
    if (!built.ok) {
      setFailed(built.errors)
      return
    }

    setFailed(null)
    save.mutate(
      { code: profile.code, body: built.body },
      { onError: (error) => setFailed(error.errors ?? {}) },
    )
  }

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
   *  Tính từ `base` chứ không từ `work`, và đây là chỗ dễ sai nhất: `work` là
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
   *   · Không còn mảng phụ thuộc để mà khai thiếu. Bản trước bỏ `base` ra
   *     khỏi `[profile.code]` một cách cố ý, và `react-hooks/exhaustive-deps`
   *     cảnh báo đúng — nhưng thêm `base` vào lại chính là con bọ "tự gập
   *     dưới con trỏ" ở trên. Hình dạng này không phải chọn giữa hai cái sai.
   *
   *  Đây là mẫu chính thức của React cho "đặt lại state khi prop đổi". */
  const [openGroups, setOpenGroups] = useState<ReadonlySet<GroupKey>>(
    () => new Set(incompleteGroups(base)),
  )
  const [seededFor, setSeededFor] = useState(profile.code)

  if (seededFor !== profile.code) {
    setSeededFor(profile.code)
    setOpenGroups(new Set(incompleteGroups(base)))
  }

  /* Typing anywhere drops the complaint from the last attempt. A red sentence
     that survives the very edit it asked for reads as "still wrong", and after
     that the user stops believing any of them. Dropped wholesale rather than
     per field because this note names boxes, not outlines them: keeping the
     other half of a stale sentence on screen is the same lie, shorter. */
  const set = (field: ProfileField, raw: string) => {
    setFailed(null)
    /* Guarded, not called on every keystroke: `reset` dispatches a state update
       of its own, and the note has nothing to clear while the mutation is idle. */
    if (save.isError) save.reset()
    setWork((w) => ({ ...w, [field.key]: writeField(field, raw) }) as LeadProfile)
  }

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
        hint="Điền theo từng nhóm. Ô có dấu * không được để trống khi lưu."
        /* The "back to the original" button is gone. It stepped from the copy
           saved ON THIS MACHINE back to the server's, and those two are now one
           and the same. Stepping back from something already written into the
           book is editing it again and saving again, not a button. */
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
        <Button size="md" disabled={dirty.length === 0 || save.isPending} onClick={submit}>
          <Icon icon={Check} size={16} />
          {save.isPending
            ? 'Đang lưu…'
            : `Lưu ${dirty.length > 0 ? `${dirty.length} thay đổi` : 'thay đổi'}`}
        </Button>
        <Button
          size="md"
          variant="ghost"
          disabled={dirty.length === 0 || save.isPending}
          onClick={() => {
            setFailed(null)
            setWork(base)
          }}
        >
          Bỏ sửa
        </Button>
        <SaveNote dirty={dirty.length} failed={failed} error={save.error} />
      </div>
    </GlassCard>
  )
}

/** The one sentence beside the save button — three states, never mixed.
 *
 *  ------------------------------------------------------------------
 *  A SENTENCE, NOT AN OUTLINE ROUND EACH BOX
 *  ------------------------------------------------------------------
 *  The hand-typing drawer outlines the box the server disliked, and there that
 *  is cheap: one `errors` map handed straight down one loop. This card COLLAPSES
 *  by group, so the box being complained about may well be inside a group that
 *  is shut — an outline would then mark something nobody can see, and it would
 *  still cost threading the map through four components to draw it.
 *
 *  So this prints the box's NAME beside its complaint, right next to the button
 *  just pressed. The trade is stated rather than hidden: the user opens the
 *  group and finds the box themselves. The day outlining is worth it, the fix
 *  is to OPEN the group holding the bad box first — outlining without opening
 *  is half the job.
 *
 *  `patchFieldLabel` does the naming: the server answers keyed by CONTRACT
 *  field (`currency`), and a reader knows only the label on screen. */
function SaveNote({
  dirty,
  failed,
  error,
}: {
  dirty: number
  failed: FieldErrors | null
  error: ApiError | null
}) {
  const complaints = failed
    ? Object.entries(failed).flatMap(([wire, messages]) =>
        messages.map((m) => (wire === ROOT_FIELD ? m : `${patchFieldLabel(wire)}: ${m}`)),
      )
    : []

  if (complaints.length > 0 || error) {
    return (
      <span
        role="alert"
        className="text-destructive-foreground max-w-[520px] text-[12.5px] leading-[1.5]"
      >
        {[error ? userMessage(error) : null, ...complaints].filter(Boolean).join(' · ')}
      </span>
    )
  }

  return (
    <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
      {dirty > 0 ? `${dirty} thay đổi chưa lưu.` : 'Hồ sơ đang khớp với bản trên máy chủ.'}
    </span>
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
      {fields.map((field) => {
        /* The URL box takes its label from the channel picked — "URL LinkedIn"
           rather than a bare "URL". Swapped at draw time instead of mutating
           `PROFILE_FIELDS`, which is a module-level constant: writing into it
           would relabel every open profile after whichever lead drew last.
           `onSet` still receives the ORIGINAL field — a label is a matter for
           the eye, not for where the value is written. */
        const drawn =
          field.key === 'channelUrl'
            ? { ...field, label: channelUrlLabel(readField(work, 'channel')) }
            : field

        return (
          <FieldShell
            key={field.key}
            field={drawn}
            plain={field.kind === 'select' || field.kind === 'read'}
          >
            <FieldControl
              field={drawn}
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
        )
      })}
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
    <section className="bg-surface-ink/5 flex flex-col gap-5 rounded-lg p-4 sm:p-5">
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
        : `${amount.toLocaleString('vi-VN')} ${symbol} · ${billions(toMoneyVnd(amount, currency))} quy ra đồng`}
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
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Ghi chú">
      <SectionTitle size="detail" hint="Điều cần nhớ khi liên hệ khách này.">
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
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Việc tiếp theo">
      <SectionTitle size="detail" hint="Một bước cụ thể phải làm tiếp.">
        Việc tiếp theo
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
            {changed || saved === '' ? 'Lưu' : 'Đã lưu'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
