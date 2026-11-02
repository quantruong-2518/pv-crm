import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { Info } from '@pv/ui'
import { Badge, Button, Icon, Input, Modal, SegmentedControl, Textarea, cn } from '@pv/ui'
import type { MailDoor, MailTemplateMilestone, MailTemplateRow } from '@pv/contracts'
import { userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { isHttpUrl } from '@/data/http-url'
import { useMailPreview, useMailTemplateCreate, useMailTemplatePatch } from '@/data/mas'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import { MailPreviewCard, OldBookingLink } from '@/components/mail-compose-bits'
import { useMailBodyMode } from '@/components/mail-rich-body-model'
import { DoorsField, MilestoneField, MilestonePill } from './mail-templates-doors'

/* Tiptap is ~110 kB gzipped. Fetched beside the list, not inside its chunk: the
   list paints first, and by the time a template opens the editor is usually here. */
const loadRichBody = () => import('@/components/mail-rich-body')
void loadRichBody().catch(() => {})
const MailRichBody = lazy(() => loadRichBody().then((m) => ({ default: m.MailRichBody })))

/** THE PANEL THAT WRITES A TEMPLATE — one panel for both jobs, the way
 *  `users-parts.tsx` does it: a null row adds, a row edits that row. Two panels
 *  would be two copies of one form, and the second copy is where the CTA pair
 *  stops matching.
 *
 *  A `Modal`, not a `Drawer` (22/09): the letter body and its rendered preview
 *  have to be checked side by side before saving, and that is T-07's case for
 *  a modal over a drawer — see `layout/modal.tsx`. */
export function MailTemplateDrawer({
  open,
  onClose,
  template,
}: {
  open: boolean
  onClose: () => void
  template: MailTemplateRow | null
}) {
  const { t } = useI18n()
  const create = useMailTemplateCreate()
  const patch = useMailTemplatePatch()

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [dropBooking, setDropBooking] = useState(false)
  const [doors, setDoors] = useState<MailDoor[]>([])
  const [defaultFor, setDefaultFor] = useState<MailDoor[]>([])
  const [milestone, setMilestone] = useState<MailTemplateMilestone | null>(null)
  const [active, setActive] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [failure, setFailure] = useState('')
  const [guideOpen, setGuideOpen] = useState(false)
  const [bodyMode, setBodyMode] = useMailBodyMode()

  /* Reset on every open, keyed on the row too: reopening the panel on a
     different template must not show the previous one's text for a frame. */
  useEffect(() => {
    /* Closing the form takes the guide with it — otherwise the guide is left
       floating over a page whose form has gone. */
    if (!open) {
      setGuideOpen(false)
      return
    }
    setName(template?.name ?? '')
    setSubject(template?.subject ?? '')
    setBody(template?.body ?? '')
    setCtaLabel(template?.cta?.label ?? '')
    setCtaUrl(template?.cta?.url ?? '')
    setDropBooking(false)
    setDoors(template?.doors ?? [])
    setDefaultFor(template?.defaultFor ?? [])
    setMilestone(template?.milestone ?? null)
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

  /* Only a COMPLETE, parseable pair travels to the preview — same shape the
     submit below builds, minus the trim: a preview lags a keystroke behind
     either way, so there is nothing to lose by gating it earlier. */
  const previewCta =
    ctaLabel.trim() && isHttpUrl(ctaUrl.trim())
      ? { label: ctaLabel, url: ctaUrl.trim() }
      : undefined
  const preview = useMailPreview(
    {
      subject,
      body,
      ...(previewCta ? { cta: previewCta } : {}),
    },
    open,
  )

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
        {
          code: template.code,
          patch: {
            name,
            subject,
            body,
            cta,
            active,
            doors,
            defaultFor,
            /* `null` clears it — absent would leave the stored one alone. */
            milestone,
            /* Calendly is retired: an old link can only be cleared. */
            ...(dropBooking ? { bookingUrl: null } : {}),
          },
        },
        { onSuccess: onClose, onError: onRefusal },
      )
      return
    }

    create.mutate(
      {
        name,
        subject,
        body,
        ...(cta ? { cta } : {}),
        ...(milestone ? { milestone } : {}),
        doors,
        defaultFor,
      },
      { onSuccess: onClose, onError: onRefusal },
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width="xl"
        title={
          template
            ? t(message(`Sửa ${template.name}`, `Edit ${template.name}`, `${template.name} 수정`))
            : t(message('Thêm mẫu thư', 'Add email template', '이메일 템플릿 추가'))
        }
        subtitle={
          template ? (
            <>
              {t(
                message(
                  'Sửa mẫu ',
                  'Editing a template does ',
                  '템플릿을 수정해도 이미 발송한 건은 ',
                ),
              )}
              <span className="font-semibold">{t(message('không', 'not', '바뀌지 않습니다'))}</span>
              {t(message(' đổi các lô đã gửi.', ' change runs already sent.', '.'))}
            </>
          ) : (
            t(
              message(
                'Người soạn vẫn sửa được thư trước khi gửi.',
                'Whoever writes the letter can still edit it before sending.',
                '작성자는 발송 전에 메일을 수정할 수 있습니다.',
              ),
            )
          )
        }
        meta={
          template ? (
            <span className="flex flex-wrap gap-1">
              {template.milestone && <MilestonePill milestone={template.milestone} />}
              <Badge tone={template.active ? 'success' : 'draft'}>
                {template.active
                  ? t(message('Đang dùng', 'In use', '사용 중'))
                  : t(message('Ngừng dùng', 'Not in use', '사용 중지'))}
              </Badge>
            </span>
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
              <Button
                size="md"
                variant="ghost"
                type="button"
                className="pointer-coarse:h-12"
                onClick={onClose}
              >
                {t(message('Huỷ', 'Cancel', '취소'))}
              </Button>
              <Button
                size="md"
                type="button"
                className="pointer-coarse:h-12"
                onClick={submit}
                disabled={busy || doors.length === 0}
              >
                {busy
                  ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
                  : template
                    ? t(message('Lưu thay đổi', 'Save changes', '변경 사항 저장'))
                    : t(message('Tạo mẫu', 'Create template', '템플릿 만들기'))}
              </Button>
            </div>
          </div>
        }
      >
        {/* 3:2 (G-Template) — the letter is the thing being written, the
           preview a check on it. Narrower than a real inbox at this modal's
           width: it reads the copy and shape, not the sent pixel width. */}
        <div className="grid min-w-0 gap-4 md:grid-cols-[3fr_2fr] md:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <Field
              label={t(message('Tên mẫu', 'Template name', '템플릿 이름'))}
              errors={errors['name']}
            >
              <Input
                value={name}
                maxLength={200}
                invalid={Boolean(errors['name']?.length)}
                placeholder={t(
                  message(
                    'Ví dụ: Tiếp cận lần 4 — nhắc hội thảo',
                    'For example: 4th outreach — event reminder',
                    '예: 4차 연락 — 행사 안내',
                  ),
                )}
                onChange={(event) => {
                  setName(event.target.value)
                  clearError('name')
                }}
              />
            </Field>

            <DoorsField
              doors={doors}
              defaultFor={defaultFor}
              errors={{ doors: errors['doors'], defaultFor: errors['defaultFor'] }}
              onChange={(next) => {
                setDoors(next.doors)
                setDefaultFor(next.defaultFor)
                /* The milestone rides on the opportunity door alone. */
                if (!next.doors.includes('opportunity')) setMilestone(null)
                clearError('doors')
                clearError('defaultFor')
                clearError('milestone')
              }}
            />

            {doors.includes('opportunity') && (
              <MilestoneField
                milestone={milestone}
                errors={errors['milestone']}
                onChange={(next) => {
                  setMilestone(next)
                  clearError('milestone')
                }}
              />
            )}

            <Field
              label={t(
                message(
                  `Tiêu đề email · ${subject.length}/200`,
                  `Email subject · ${subject.length}/200`,
                  `이메일 제목 · ${subject.length}/200`,
                ),
              )}
              errors={errors['subject']}
              hint={t(
                message(
                  'Tiêu đề dài hơn 70 ký tự dễ bị cắt.',
                  'Subjects longer than 70 characters tend to get cut off.',
                  '제목이 70자를 넘으면 잘리기 쉽습니다.',
                ),
              )}
            >
              <Input
                value={subject}
                maxLength={200}
                invalid={Boolean(errors['subject']?.length)}
                placeholder={t(
                  message(
                    'Tiêu đề hiện trong hộp thư người nhận',
                    "Subject shown in the recipient's inbox",
                    '받는 사람의 받은편지함에 표시되는 제목',
                  ),
                )}
                onChange={(event) => {
                  setSubject(event.target.value)
                  clearError('subject')
                }}
              />
            </Field>

            <Field
              label={t(message('Nội dung', 'Body', '내용'))}
              errors={errors['body']}
              /* The rich box carries toolbar buttons, and a `<label>` round it
                 would forward every click on the text to the first of them. */
              control={bodyMode === 'rich' ? 'plain' : 'input'}
              hint={
                bodyMode === 'rich'
                  ? t(
                      message(
                        'Bôi đen chữ rồi bấm B / I. Bấm nút để chèn tên khách, tên công ty.',
                        'Select text, then press B / I. Press a button to insert the customer name or company name.',
                        '글자를 선택한 뒤 B / I를 누르세요. 버튼을 눌러 고객명, 회사명을 넣을 수 있습니다.',
                      ),
                    )
                  : t(
                      message(
                        '**đậm** · _nghiêng_ · đầu dòng `- ` thành danh sách. Dùng {{contact_name}} và {{account}} để điền tên từng người.',
                        "**bold** · _italic_ · a line starting with `- ` becomes a list. Use {{contact_name}} and {{account}} to fill in each person's name.",
                        '**굵게** · _기울임_ · 줄 앞의 `- `는 목록이 됩니다. {{contact_name}}과 {{account}}로 사람마다 이름을 채울 수 있습니다.',
                      ),
                    )
              }
              /* The guide opens as a second drawer over this one. The button rides
               on this field's label rather than sitting in the panel header
               because this is the only field the guide is about, and a person
               looks for help where they are stuck — not at the top of a form they
               have already scrolled past. Escape closes only the guide: `Modal`
               keeps a stack for exactly this case, so a half-written template
               survives the keypress. */
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <SegmentedControl
                    label={t(message('Cách soạn', 'Editor style', '작성 방식'))}
                    hideLabel
                    tone="quiet"
                    value={bodyMode}
                    onChange={(value) => setBodyMode(value === 'rich' ? 'rich' : 'markdown')}
                    options={[
                      {
                        value: 'rich',
                        label: t(
                          message('Soạn kiểu Gmail', 'Gmail-style editor', 'Gmail 방식 편집'),
                        ),
                      },
                      { value: 'markdown', label: 'Markdown' },
                    ]}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="pointer-coarse:h-12"
                    onClick={() => setGuideOpen(true)}
                  >
                    <Icon icon={Info} size={14} />
                    {t(message('Cách viết nội dung', 'How to write the body', '내용 작성 방법'))}
                  </Button>
                </div>
              }
            >
              {bodyMode === 'rich' ? (
                <Suspense fallback={<Textarea rows={20} value={body} readOnly />}>
                  <MailRichBody
                    value={body}
                    invalid={Boolean(errors['body']?.length)}
                    placeholder={t(
                      message(
                        'Nội dung thư. Enter xuống đoạn mới, Shift+Enter xuống dòng.',
                        'Letter body. Enter starts a new paragraph, Shift+Enter a new line.',
                        '메일 내용. Enter는 새 문단, Shift+Enter는 줄바꿈입니다.',
                      ),
                    )}
                    onChange={(markdown) => {
                      setBody(markdown)
                      clearError('body')
                    }}
                  />
                </Suspense>
              ) : (
                <Textarea
                  autoGrow
                  rows={20}
                  value={body}
                  invalid={Boolean(errors['body']?.length)}
                  placeholder={t(
                    message(
                      'Nội dung thư. Một dòng trống là một đoạn.',
                      'Letter body. A blank line makes a paragraph.',
                      '메일 내용. 빈 줄 하나가 문단 하나입니다.',
                    ),
                  )}
                  onChange={(event) => {
                    setBody(event.target.value)
                    clearError('body')
                  }}
                />
              )}
            </Field>

            <Field
              label={t(
                message(
                  'Nút trong email (không bắt buộc)',
                  'Email button (optional)',
                  '이메일 버튼 (선택)',
                ),
              )}
              errors={errors['cta.label'] ?? errors['cta.url'] ?? errors['cta']}
              hint={t(
                message(
                  'Để trống nếu không cần nút. Link dán trong nội dung thư không bấm được.',
                  'Leave empty if no button is needed. A link pasted in the body is not clickable.',
                  '버튼이 필요 없으면 비워 두세요. 본문에 붙여 넣은 링크는 클릭되지 않습니다.',
                ),
              )}
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(150px,.55fr)_minmax(0,1fr)]">
                <Input
                  value={ctaLabel}
                  maxLength={80}
                  aria-label={t(
                    message('Tên nút trong email', 'Email button label', '이메일 버튼 이름'),
                  )}
                  invalid={Boolean(errors['cta.label']?.length)}
                  placeholder={t(message('Tên nút', 'Button label', '버튼 이름'))}
                  onChange={(event) => {
                    setCtaLabel(event.target.value)
                    clearError('cta.label')
                  }}
                />
                <Input
                  value={ctaUrl}
                  aria-label={t(
                    message('Địa chỉ nút trong email', 'Email button address', '이메일 버튼 주소'),
                  )}
                  invalid={Boolean(errors['cta.url']?.length)}
                  placeholder="https://…"
                  onChange={(event) => {
                    setCtaUrl(event.target.value)
                    clearError('cta.url')
                  }}
                />
              </div>
            </Field>

            {template?.bookingUrl && (
              <OldBookingLink
                owner="template"
                url={template.bookingUrl}
                dropped={dropBooking}
                onDrop={setDropBooking}
              />
            )}

            {/* Only while EDITING: a template just created is in use, and a control
              with one correct answer is a control not worth asking. Retiring
              stands in for deleting — a batch already sent still names this
              template. */}
            {template && (
              <Field
                label={t(message('Trạng thái', 'Status', '상태'))}
                errors={errors['active']}
                hint={t(
                  message(
                    'Mẫu ngừng dùng không hiện trong ô chọn.',
                    'A template not in use does not appear in the picker.',
                    '사용 중지한 템플릿은 선택 목록에 표시되지 않습니다.',
                  ),
                )}
                control="plain"
              >
                <SegmentedControl
                  label={t(message('Trạng thái', 'Status', '상태'))}
                  hideLabel
                  value={active ? 'active' : 'off'}
                  onChange={(value) => {
                    setActive(value === 'active')
                    clearError('active')
                  }}
                  options={[
                    { value: 'active', label: t(message('Đang dùng', 'In use', '사용 중')) },
                    { value: 'off', label: t(message('Ngừng dùng', 'Not in use', '사용 중지')) },
                  ]}
                />
              </Field>
            )}
          </div>

          <MailPreviewCard
            letter={preview.letter}
            pending={preview.pending}
            error={preview.error}
            caption={t(
              message(
                'Tên và công ty là dữ liệu mẫu.',
                'The name and company are sample data.',
                '이름과 회사는 예시 데이터입니다.',
              ),
            )}
          />
        </div>
      </Modal>

      {/* A sibling, not a child: both overlays portal to `document.body` anyway,
          and reading them side by side says what is true — two panels, the
          second stacked on the first. */}
      <MailGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
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
