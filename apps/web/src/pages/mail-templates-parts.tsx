import { useEffect, useState, type ReactNode } from 'react'
import { Info } from '@pv/ui'
import { Badge, Button, Drawer, Icon, Input, SegmentedControl, Textarea, cn } from '@pv/ui'
import type { MailTemplateRow } from '@pv/contracts'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { useMailTemplateCreate, useMailTemplatePatch } from '@/data/mas'
import { MailSyntaxGuide } from '@/components/mail-syntax-guide'

/** THE PANEL THAT WRITES A TEMPLATE — one panel for both jobs, the way
 *  `users-parts.tsx` does it: a null row adds, a row edits that row. Two panels
 *  would be two copies of one form, and the second copy is where the CTA pair
 *  stops matching. */
export function MailTemplateDrawer({
  open,
  onClose,
  template,
}: {
  open: boolean
  onClose: () => void
  template: MailTemplateRow | null
}) {
  const create = useMailTemplateCreate()
  const patch = useMailTemplatePatch()

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)

  /* Reset on every open, keyed on the row too: reopening the panel on a
     different template must not show the previous one's text for a frame. */
  useEffect(() => {
    /* Closing the form takes the guide with it — otherwise the guide is left
       floating over a page whose form has gone. */
    if (!open) {
      setGuideOpen(false)
      return
    }
    setCode(template?.code ?? '')
    setName(template?.name ?? '')
    setSubject(template?.subject ?? '')
    setBody(template?.body ?? '')
    setCtaLabel(template?.cta?.label ?? '')
    setCtaUrl(template?.cta?.url ?? '')
    setActive(template?.active ?? true)
    setErrors({})
    setFailure('')
  }, [open, template])

  /** Typing into a field that was just refused clears the refusal — a red mark
   *  that survives the fix reads as "still wrong". */
  const clearError = (field: string) =>
    setErrors((current) => {
      if (!current[field]) return current
      const { [field]: _fixed, ...rest } = current
      return rest
    })

  const onRefusal = (error: ApiError) => {
    const fields = error.errors ?? {}
    setErrors(fields)
    /* An empty map is not "no error" — it is an error belonging to no field,
       and that sentence has to go somewhere the person will read it. */
    setFailure(Object.keys(fields).length > 0 ? '' : userMessage(error))
  }

  const busy = create.isPending || patch.isPending

  const submit = () => {
    /* Two human clicks are two real requests — `mayReplay` only refuses the
       automatic kind. */
    if (busy) return
    setErrors({})
    setFailure('')

    /* Both boxes empty means REMOVE the button, which is why this is `null` and
       not `undefined` on the patch: the contract reads absent as "leave it".
       On create there is nothing to leave, so absent is the honest shape. */
    const cta = ctaLabel.trim() && ctaUrl.trim() ? { label: ctaLabel, url: ctaUrl } : null

    if (template) {
      patch.mutate(
        { code: template.code, patch: { name, subject, body, cta, active } },
        { onSuccess: onClose, onError: onRefusal },
      )
      return
    }

    create.mutate(
      { code, name, subject, body, ...(cta ? { cta } : {}) },
      { onSuccess: onClose, onError: onRefusal },
    )
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        /* `lg`, not the `md` the user panel uses: this form's centre of gravity is
         a letter body, and a body typed seven characters at a time in a narrow
         column reads nothing like the letter it becomes. */
        width="lg"
        title={template ? `Sửa ${template.name}` : 'Thêm mẫu thư'}
        subtitle={
          template
            ? 'Sửa mẫu KHÔNG đụng tới lô đã gửi — mỗi lô đã chụp lại tiêu đề và nội dung lúc tạo.'
            : 'Mẫu là chỗ bắt đầu của một lá thư. Người soạn vẫn sửa được trước khi gửi.'
        }
        meta={
          template ? (
            <Badge tone={template.active ? 'success' : 'draft'}>
              {template.active ? 'Đang dùng' : 'Ngừng dùng'}
            </Badge>
          ) : undefined
        }
        footer={
          <div className="flex flex-col gap-3">
            {failure && (
              <span
                role="alert"
                className="text-destructive-foreground text-[11.5px] leading-[1.5]"
              >
                {failure}
              </span>
            )}
            <div className="flex justify-end gap-2">
              <Button size="md" variant="ghost" type="button" onClick={onClose}>
                Huỷ
              </Button>
              <Button size="md" type="button" onClick={submit} disabled={busy}>
                {busy ? 'Đang lưu…' : template ? 'Lưu thay đổi' : 'Tạo mẫu'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Field
            label="Mã mẫu"
            errors={errors['code']}
            hint={
              template
                ? 'Mã không sửa được: lô đã gửi còn gọi tên nó.'
                : 'Chữ thường, số và dấu nối. Ví dụ: mas-tiep-can-4.'
            }
          >
            <Input
              value={code}
              /* Locked once the row exists, the same way a mailbox is locked on
               the user panel: changing it would orphan every run naming it. */
              disabled={Boolean(template)}
              invalid={Boolean(errors['code']?.length)}
              placeholder="mas-tiep-can-4"
              className="font-mono"
              onChange={(event) => {
                setCode(event.target.value)
                clearError('code')
              }}
            />
          </Field>

          <Field label="Tên mẫu" errors={errors['name']} hint="Tên hiện trong ô chọn mẫu.">
            <Input
              value={name}
              maxLength={200}
              invalid={Boolean(errors['name']?.length)}
              placeholder="Ví dụ: Tiếp cận lần 4 — nhắc hội thảo"
              onChange={(event) => {
                setName(event.target.value)
                clearError('name')
                /* Suggest the code from the name, but only while CREATING and
                 only while the person has not typed their own: hand-writing a
                 slug is a habit of people who work with code, and this screen
                 is built for the people who write the copy. */
                if (!template && code === slugify(name)) setCode(slugify(event.target.value))
              }}
            />
          </Field>

          <Field
            label={`Tiêu đề email · ${subject.length}/200`}
            errors={errors['subject']}
            hint="Phần lớn hộp thư cắt quanh 70 ký tự."
          >
            <Input
              value={subject}
              maxLength={200}
              invalid={Boolean(errors['subject']?.length)}
              placeholder="Tiêu đề người nhận đọc thấy trong hộp thư"
              onChange={(event) => {
                setSubject(event.target.value)
                clearError('subject')
              }}
            />
          </Field>

          <Field
            label="Nội dung"
            errors={errors['body']}
            hint="**đậm** · _nghiêng_ · đầu dòng `- ` thành danh sách. Dùng {{contact_name}} và {{account}} để điền tên từng người."
            /* The guide opens as a second drawer over this one. The button rides
             on this field's label rather than sitting in the panel header
             because this is the only field the guide is about, and a person
             looks for help where they are stuck — not at the top of a form they
             have already scrolled past. Escape closes only the guide: `Drawer`
             keeps a stack for exactly this case, so a half-written template
             survives the keypress. */
            action={
              <Button size="sm" variant="ghost" type="button" onClick={() => setGuideOpen(true)}>
                <Icon icon={Info} size={14} />
                Cách viết nội dung
              </Button>
            }
          >
            <Textarea
              autoGrow
              rows={10}
              value={body}
              invalid={Boolean(errors['body']?.length)}
              placeholder="Thân thư. Một dòng trống là một đoạn."
              onChange={(event) => {
                setBody(event.target.value)
                clearError('body')
              }}
            />
          </Field>

          <Field
            label="Nút trong email (không bắt buộc)"
            errors={errors['cta.label'] ?? errors['cta.url'] ?? errors['cta']}
            hint="Để trống cả hai ô nếu mẫu không cần nút. Link dán trong thân thư không bấm được."
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(150px,.55fr)_minmax(0,1fr)]">
              <Input
                value={ctaLabel}
                maxLength={80}
                aria-label="Tên nút trong email"
                invalid={Boolean(errors['cta.label']?.length)}
                placeholder="Tên nút"
                onChange={(event) => {
                  setCtaLabel(event.target.value)
                  clearError('cta.label')
                }}
              />
              <Input
                value={ctaUrl}
                aria-label="Địa chỉ nút trong email"
                invalid={Boolean(errors['cta.url']?.length)}
                placeholder="https://…"
                onChange={(event) => {
                  setCtaUrl(event.target.value)
                  clearError('cta.url')
                }}
              />
            </div>
          </Field>

          {/* Only while EDITING: a template just created is in use, and a control
            with one correct answer is a control not worth asking. Retiring
            stands in for deleting — a batch already sent still names this
            template. */}
          {template && (
            <Field
              label="Trạng thái"
              hint="Ngừng dùng thì mẫu biến khỏi ô chọn, nhưng lô cũ vẫn đọc được tên nó."
              control="plain"
            >
              <SegmentedControl
                label="Trạng thái"
                hideLabel
                value={active ? 'active' : 'off'}
                onChange={(value) => setActive(value === 'active')}
                options={[
                  { value: 'active', label: 'Đang dùng' },
                  { value: 'off', label: 'Ngừng dùng' },
                ]}
              />
            </Field>
          )}
        </div>
      </Drawer>

      {/* A sibling, not a child: both drawers portal to `document.body` anyway,
          and reading them side by side says what is true — two panels, the
          second stacked on the first. */}
      <MailSyntaxGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}

/** Label, control, one line underneath. An error REPLACES the hint rather than
 *  stacking below it: the eye is already looking there, and stacking means every
 *  refused field pushes the save button a little further off screen. Same shape
 *  as `ops-fields.tsx` and `users-parts.tsx`. */
function Field({
  label,
  hint,
  errors,
  control = 'input',
  action,
  children,
}: {
  label: string
  hint?: string
  errors?: string[]
  /** `plain` drops the wrapping `<label>` — the control brings its own, and
   *  nesting two makes a screen reader announce two names for one field. */
  control?: 'input' | 'plain'
  /** A control on the label row, right-aligned. It sits OUTSIDE the `<label>`
   *  wrapper: a button inside a label is a button that toggles the field every
   *  time it is clicked, which is how a help button starts stealing focus into
   *  the textarea. */
  action?: ReactNode
  children: ReactNode
}) {
  const wrong = Boolean(errors?.length)

  const labelText = (
    <span
      className={cn('text-[11px]', wrong ? 'text-destructive-foreground' : 'text-muted-foreground')}
    >
      {label}
    </span>
  )

  const inner = (
    <>
      {labelText}
      {children}
    </>
  )

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {action ? (
        /* With an action the label row becomes its own line, so the `<label>`
           wraps the control only — the button must not be inside it. */
        <>
          <div className="flex items-center justify-between gap-3">
            {labelText}
            {action}
          </div>
          {control === 'plain' ? children : <label className="flex flex-col">{children}</label>}
        </>
      ) : control === 'plain' ? (
        inner
      ) : (
        <label className="flex flex-col gap-2">{inner}</label>
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

/** An accented name into an unaccented code — `MailTemplateCode` accepts only
 *  lowercase letters, digits and hyphens. `NFD` splits each diacritic off its
 *  base letter so the combining range can be dropped. The d-with-stroke letter
 *  is a letter in its own right rather than an accented `d`, so it survives that
 *  pass untouched and needs a replacement of its own. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
