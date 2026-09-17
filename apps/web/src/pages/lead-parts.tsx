import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Plus } from '@pv/ui'
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
  vnd,
} from '@pv/ui'
import {
  CURRENCIES,
  filledSlots,
  toMoneyVnd,
  type CurrencyCode,
  type Lead,
} from '@pv/engines/fixtures/das-vina'
/* Bí danh chứ không import bừa: hình MÁY CHỦ gửi (trường vắng = chưa moi được)
   khác hình FORM đọc (`FormValues`, mọi trường có mặt, `''`/`null` là chưa moi
   được), và `profileForm` là chỗ duy nhất đi từ cái trước sang cái sau. */
import type { LeadProfile as WireLeadProfile } from '@pv/contracts'
import { useLeadDesk } from '@/app/desk'
import { peopleRoleOptions, useSalesPeople } from '@/data/directory'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import {
  buildLeadCreate,
  createFailureMessage,
  emptyDraft,
  ROOT_FIELD,
  useCreateLead,
} from '@/data/lead-create'
import { buildLeadPatch, patchFieldLabel, useUpdateLeadProfile } from '@/data/lead-patch'
import { profileForm } from '@/data/lead-profile'
import {
  changedFields,
  channelUrlLabel,
  DEADLINE_MAX,
  DEADLINE_MIN,
  fieldsOf,
  groupsOf,
  inputModeOf,
  isRequired,
  maxCharsOf,
  readField,
  slotsOfGroup,
  writeField,
  type FormField,
  type FormGroup,
  type FormMode,
  type FormValues,
  type GroupKey,
} from '@/data/lead-form'

/** Module 2 · Ba khối lớn của hồ sơ lead.
 *
 *  Tách khỏi `lead-detail.tsx` vì cùng một lý do `campaign-parts.tsx` tách khỏi
 *  `campaign-detail.tsx`: màn còn lại chỉ nên là BỐ CỤC — đọc dòng lead, xếp
 *  khối, treo thanh công cụ. Nội dung từng khối là chuyện riêng của khối.
 *
 *   · `LeadForm`      — hồ sơ đọc/sửa/tạo được, một component ba cửa (mode);
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
  required,
  plain,
  children,
}: {
  field: FormField
  /** The star. Handed in rather than asked for here, because the two doors ask
   *  two contracts — `LeadPatch` while editing, `LeadCreate` while typing. */
  required: boolean
  plain?: boolean
  children: ReactNode
}) {
  const head = (
    <span className="text-glass-foreground text-[13px] font-semibold leading-[1.4]">
      {field.label}
      {required && (
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
  required,
  options,
  onChange,
}: {
  field: FormField
  value: string
  required: boolean
  /** Danh sách của ô select. Truyền vào chứ không đọc `field.options`, vì ba ô
   *  người của form lấy danh sách từ sổ người trên máy chủ — `FieldRow` dựng
   *  nó một lần cho cả hàng thay vì ba chục ô cùng mở một observer query. */
  options: { value: string; label: string }[]
  onChange: (raw: string) => void
}) {
  const marked = required || undefined

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
        aria-required={marked}
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
        aria-required={marked}
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
          aria-required={marked}
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
      aria-required={marked}
      className={cn('h-11 text-[13px]', field.mono && 'font-mono')}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ---------------------------------------------------------------------------
// 1 · Hồ sơ lead
// ---------------------------------------------------------------------------

/** ONE FORM, TWO DOORS — a lead's profile opened into boxes, and the screen
 *  that types a new lead by hand.
 *
 *  Until 17/09 "gõ tay một lead" was a drawer with its own field table, its own
 *  field type and its own copy of these controls. Two sets for one set of
 *  thirty questions is two places to drift apart, and they had: the URL box
 *  followed the chosen channel on one side and stood still on the other. Now
 *  one table (`data/lead-form.ts`), one set of controls, and `mode` decides
 *  three things — which boxes are drawn, which contract guards the star, and
 *  which door the button writes through.
 *
 *  The four decisions of the old card survive: built from the blueprint · even
 *  grid, one box per cell · star only, no question numbers · nothing is written
 *  until the button is pressed. */
export type LeadFormProps =
  | { mode: 'edit'; profile: WireLeadProfile }
  /** Nothing to hand in: the lead does not exist yet. The 201 answers with its
   *  code, and the create screen walks on to the profile just written. */
  | { mode: 'create'; onCreated: (code: string) => void }

export function LeadForm(props: LeadFormProps) {
  const mode: FormMode = props.mode
  const profile = props.mode === 'edit' ? props.profile : null
  /* Both doors opened up front: a hook cannot sit behind a branch, and a
     mutation nobody calls costs nothing. */
  const save = useUpdateLeadProfile()
  const create = useCreateLead()
  const [failed, setFailed] = useState<FieldErrors | null>(null)

  /* Bản gốc là HỒ SƠ THẬT của máy chủ, không còn là bản sinh từ mã lead. Trường
     vắng trên dây = chưa moi được, và `profileForm` dịch nó thành `''`/`null` —
     đúng thứ ô nhập, cổng init data và ô chỉ đọc đều đã hiểu là "chưa có".

     Không còn lớp đè `desk.profiles` ở giữa. Cho tới 30/08 nút Lưu ghi vào một
     kho zustand, và bản đã "lưu" đó phủ lên bản của máy chủ — nghĩa là sau khi
     có `PATCH` thật, một patch cũ còn nằm trong trình duyệt sẽ che mất chính
     giá trị vừa ghi xuống. Một nguồn sự thật, và nó ở phía máy chủ. */
  const base = useMemo(() => (profile ? profileForm(profile) : emptyDraft()), [profile])
  const [work, setWork] = useState<FormValues>(base)

  /* Đổi lead — hoặc nhận bản mới sau một lượt lưu — thì nạp lại ô nhập. Không
     nạp lại thì bấm sang lead khác vẫn thấy hồ sơ của lead trước. */
  useEffect(() => setWork(base), [base])

  const dirty = useMemo(() => changedFields(base, work), [base, work])
  const groups = groupsOf(mode)
  const pending = mode === 'create' ? create.isPending : save.isPending

  /* Two human clicks are two real writes: on the patch door the second lands a
     second `field-filled` row on the timeline, on the create door it lands a
     second lead. The client only refuses to replay a write AUTOMATICALLY. */
  const submit = () => {
    if (pending) return

    if (props.mode === 'create') {
      const built = buildLeadCreate(work)
      if (!built.ok) {
        setFailed(built.errors)
        return
      }
      setFailed(null)
      create.mutate(built.body, {
        onSuccess: (lead) => props.onCreated(lead.code),
        onError: (error) => setFailed(error.errors ?? {}),
      })
      return
    }

    const built = buildLeadPatch(base, work)
    if (!built.ok) {
      setFailed(built.errors)
      return
    }

    setFailed(null)
    save.mutate(
      { code: props.profile.code, body: built.body },
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
  const [openGroups, setOpenGroups] = useState<ReadonlySet<GroupKey>>(() => openAtFirst(mode, base))
  const [seededFor, setSeededFor] = useState(profile?.code ?? '')

  if (seededFor !== (profile?.code ?? '')) {
    setSeededFor(profile?.code ?? '')
    setOpenGroups(openAtFirst(mode, base))
  }

  /* Typing anywhere drops the complaint from the last attempt. A red sentence
     that survives the very edit it asked for reads as "still wrong", and after
     that the user stops believing any of them. Dropped wholesale rather than
     per field because this note names boxes, not outlines them: keeping the
     other half of a stale sentence on screen is the same lie, shorter. */
  const set = (field: FormField, raw: string) => {
    setFailed(null)
    /* Guarded, not called on every keystroke: `reset` dispatches a state update
       of its own, and the note has nothing to clear while the mutation is idle. */
    if (save.isError) save.reset()
    if (create.isError) create.reset()
    setWork((w) => ({ ...w, [field.key]: writeField(field, raw) }) as FormValues)
  }

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-6 p-4 sm:p-5 lg:p-6"
      aria-label={mode === 'create' ? 'Lead mới' : 'Hồ sơ lead'}
    >
      <SectionTitle
        size="detail"
        /* Kicker cũ đếm số lần cập nhật từ `leadResearch`, thứ đếm số lần chạm
           trong `history`. Bảng `sales.touch` chưa dựng nên hồ sơ về không có
           lần chạm nào — con số đó sẽ là 0 với MỌI lead, kể cả lead vừa nói
           chuyện xong. Một con số luôn bằng 0 không phải thông tin, nên chỗ này
           nói thẳng ra là chưa có sổ để đếm. */
        hint={
          mode === 'create'
            ? 'Điền theo từng nhóm. Ô có dấu * không được để trống khi ghi xuống sổ.'
            : 'Điền theo từng nhóm. Ô có dấu * không được để trống khi lưu.'
        }
        /* The "back to the original" button is gone. It stepped from the copy
           saved ON THIS MACHINE back to the server's, and those two are now one
           and the same. Stepping back from something already written into the
           book is editing it again and saving again, not a button. */
      >
        {mode === 'create' ? 'Thông tin lead' : 'Chi tiết lead'}
      </SectionTitle>

      {groups.map((group) => (
        <FieldGroup
          key={group.key}
          group={group}
          mode={mode}
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
        {/* The create door does NOT gate the button on how much is typed: which
            boxes are required is the contract's answer, and it gives it in a
            sentence placed right beside this button. Create is `lg` (48px,
            law 13) because it is the screen's ONLY primary action, unlike the
            detail toolbar where `md` sits among other buttons (repo-wide debt,
            out of scope here). */}
        <Button
          size={mode === 'create' ? 'lg' : 'md'}
          disabled={(mode === 'edit' && dirty.length === 0) || pending}
          onClick={submit}
        >
          <Icon icon={mode === 'create' ? Plus : Check} size={16} />
          {mode === 'create'
            ? pending
              ? 'Đang ghi…'
              : 'Tạo lead'
            : pending
              ? 'Đang lưu…'
              : `Lưu ${dirty.length > 0 ? `${dirty.length} thay đổi` : 'thay đổi'}`}
        </Button>
        <Button
          size={mode === 'create' ? 'lg' : 'md'}
          variant="ghost"
          disabled={dirty.length === 0 || pending}
          onClick={() => {
            setFailed(null)
            setWork(base)
          }}
        >
          {mode === 'create' ? 'Xoá hết' : 'Bỏ sửa'}
        </Button>
        <SaveNote
          mode={mode}
          dirty={dirty.length}
          failed={failed}
          error={mode === 'create' ? create.error : save.error}
        />
      </div>
    </GlassCard>
  )
}

/** The one sentence beside the save button — three states, never mixed.
 *
 *  The form collapses by group, so the box being complained about may sit
 *  inside a closed group — an outline would mark something nobody can see.
 *  So this prints the box's NAME beside the complaint instead, and the user
 *  opens the group to find it themselves.
 *
 *  `patchFieldLabel` names it: both doors answer keyed by CONTRACT field. A
 *  409 from the create door reads through `createFailureMessage` — the one
 *  refusal `userMessage` words badly (a mailbox already taken, not a
 *  conflicting edit). */
function SaveNote({
  mode,
  dirty,
  failed,
  error,
}: {
  mode: FormMode
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
        {[error ? failureMessage(mode, error) : null, ...complaints].filter(Boolean).join(' · ')}
      </span>
    )
  }

  if (mode === 'create') {
    return (
      <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
        Ô có dấu sao là bắt buộc. Ô bỏ trống không được ghi xuống sổ.
      </span>
    )
  }

  return (
    <span className="text-muted-foreground text-[12.5px] leading-[1.5]">
      {dirty > 0 ? `${dirty} thay đổi chưa lưu.` : 'Hồ sơ đang khớp với bản trên máy chủ.'}
    </span>
  )
}

const failureMessage = (mode: FormMode, error: ApiError) =>
  mode === 'create' ? createFailureMessage(error) : userMessage(error)

/** Một hàng ô, lưới đều.
 *
 *  Ba cột trên màn rộng, hai cột ở khoảng giữa, một cột trên điện thoại. Không
 *  ô nào được `col-span` — thẳng cột là thứ khiến mắt bám được vào một form ba
 *  mươi ô, và một ngoại lệ là đủ để mất nó. */
function FieldRow({
  fields,
  mode,
  work,
  onSet,
}: {
  fields: FormField[]
  mode: FormMode
  work: FormValues
  onSet: (field: FormField, raw: string) => void
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
            required={isRequired(field, mode)}
            plain={field.kind === 'select' || field.kind === 'read'}
          >
            <FieldControl
              field={drawn}
              value={readField(work, field.key)}
              required={isRequired(field, mode)}
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

/** Which groups stand open the moment the form appears.
 *
 *  The CREATE door opens all of them: a blank form has nothing dug out yet, and
 *  its two required boxes sit in the one group the init-data gate does not
 *  count — collapsing by missing slots there would fold away exactly what has
 *  to be typed first.
 *
 *  The EDIT door folds the groups that are complete. `system` is not among them
 *  because `groupsOf` already keeps it off that door: the machine writes it. */
function openAtFirst(mode: FormMode, values: FormValues): Set<GroupKey> {
  const groups = groupsOf(mode)
  if (mode === 'create') return new Set(groups.map((g) => g.key))

  const live = new Set(filledSlots(values))
  return new Set(
    groups
      .filter((g) => {
        const slots = slotsOfGroup(g.key)
        return slots.length > 0 && slots.some((s) => !live.has(s))
      })
      .map((g) => g.key),
  )
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
  mode,
  work,
  onSet,
  open,
  onToggle,
}: {
  group: FormGroup
  mode: FormMode
  work: FormValues
  onSet: (field: FormField, raw: string) => void
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

      {open && (
        <FieldRow fields={fieldsOf(group.key, mode)} mode={mode} work={work} onSet={onSet} />
      )}
    </section>
  )
}

/** Dòng đọc lại số tiền vừa gõ.
 *
 *  Bảy chữ số trong một ô nhập không đọc ra được bằng mắt — gõ nhầm một số 0 là
 *  lệch mười lần và không ai thấy. Dòng này in lại đúng số đó bằng đơn vị người
 *  ta nói (tỷ), và với ngoại tệ thì in luôn phần quy ra đồng, vì sổ cơ hội cộng
 *  bằng đồng. */
function MoneyRead({ work, value }: { work: FormValues; value: string }) {
  if (value === '') return null
  const amount = Number(value)
  const currency: CurrencyCode = work.currency
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? ''

  return (
    <span className="text-muted-foreground text-[12px] leading-[1.6]">
      {currency === 'VND'
        ? `${vnd(amount)} · ${billions(amount)}`
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
