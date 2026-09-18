import { useRef } from 'react'
import { Info, Mail, Pencil, TriangleAlert } from '@pv/ui'
import {
  Badge,
  Button,
  Checkbox,
  GlassCard,
  Icon,
  Input,
  SectionTitle,
  SegmentedControl,
  Select,
  Textarea,
} from '@pv/ui'
import type { CampaignBookRow, MailTemplateRow, MasPreflightResponse } from '@pv/contracts'
import { MAIL_NAME_MAX, MAIL_SUBJECT_MAX, MAS_RECIPIENT_BLOCK_LABEL } from '@pv/contracts'
import { Field } from '@/components/field-bits'
import { PersonTokenField } from '@/components/person-token-field'
import { localSlot } from '@/lib/date'
import {
  MERGE_ACCOUNT,
  MERGE_RECIPIENT,
  NO_CAMPAIGN,
  NO_TEMPLATE,
  ctaWith,
  type MasMailDraft,
  type MasRecipient,
  type MailSendTiming,
} from '@/data/mas-mail-draft'

/** The three step bodies of the compose panel, in the order they are walked.
 *
 *  Split off `mas-mail-modal.tsx` because that file was 822 lines holding a
 *  form, a preview, a preflight report and a send. The shell keeps what the
 *  steps SHARE — the draft, the footer, the gate — and each step here only
 *  knows its own three questions. */

/** STEP 1 · who receives it. */
export function RecipientsStep({
  draft,
  leads,
  chosen,
}: {
  draft: MasMailDraft
  leads: readonly MasRecipient[]
  chosen: readonly MasRecipient[]
}) {
  const pick = (code: string) => {
    draft.setSelected((current) => new Set(current).add(code))
    if (draft.previewCode === '') draft.setPreviewCode(code)
  }
  const drop = (code: string) =>
    draft.setSelected((current) => {
      const next = new Set(current)
      next.delete(code)
      return next
    })

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle
        size="md"
        hint="Người liên hệ chính đã được chọn sẵn. Tìm thêm người nhận — gõ tên, công ty hoặc email để lọc."
      >
        Gửi tới ai?
      </SectionTitle>

      <Field label="Người nhận">
        <PersonTokenField
          label="Thêm người nhận"
          placeholder="Thêm người nhận…"
          tokens={chosen.map((lead) => ({ id: lead.code, name: lead.contactName }))}
          suggestions={leads
            .filter((lead) => !draft.selected.has(lead.code))
            .map((lead) => ({
              id: lead.code,
              name: lead.contactName,
              note: `${lead.contactTitle || 'Chưa có chức danh'} · ${lead.company} · ${lead.email}`,
            }))}
          onPick={pick}
          onRemove={drop}
          hint="Mỗi người nhận một email riêng, tên được điền tự động."
          emptyNote="Không còn ai khác để thêm từ màn này."
        />
      </Field>

      {/* NOT a picker: the sending mailbox is one server setting with no table
          behind it and no endpoint listing it, so a select with a single option
          would promise a choice this panel cannot make. */}
      <Field
        label="Gửi từ hộp thư"
        hint="Hệ chưa bật đường ghi thư trả lời, nên trả lời của khách không tự hiện ở Lịch sử của hồ sơ."
      >
        <p className="text-glass-foreground bg-surface-ink/5 m-0 flex min-w-0 items-start gap-2 rounded-sm px-3 py-2 text-[11.5px] leading-[1.6]">
          <Icon icon={Mail} size={16} className="mt-1 shrink-0" />
          <span className="min-w-0">
            Thư đi từ hộp thư gửi hàng loạt do cấu hình máy chủ đặt — phiếu này không đổi được địa
            chỉ gửi.
          </span>
        </p>
      </Field>
    </section>
  )
}

/** STEP 2 · what it says. */
export function ComposeStep({
  draft,
  templates,
  canSaveTemplate,
  ctaBroken,
  bookingBroken,
  onOpenGuide,
}: {
  draft: MasMailDraft
  templates: readonly MailTemplateRow[]
  canSaveTemplate: boolean
  ctaBroken: boolean
  bookingBroken: boolean
  onOpenGuide: () => void
}) {
  const box = useRef<HTMLTextAreaElement>(null)

  /* Insert where the caret IS. Appending to the end instead puts the slot at
     the bottom of a letter whose greeting is what needed it. */
  const insert = (token: string) => {
    const el = box.current
    const at = el?.selectionStart ?? draft.body.length
    const to = el?.selectionEnd ?? at
    draft.setBody(`${draft.body.slice(0, at)}${token}${draft.body.slice(to)}`)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + token.length, at + token.length)
    })
  }

  const applyTemplate = (key: string) => {
    draft.setTemplate(key)
    const found = templates.find((item) => item.code === key)
    draft.setSubject(found?.subject ?? '')
    draft.setBody(found?.body ?? '')
    draft.setCta(found?.cta)
    draft.setWithCta(Boolean(found?.cta))
    draft.setBookingUrl(found?.bookingUrl ?? '')
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle
        size="md"
        hint="Bắt đầu từ mẫu hoặc tự soạn. Bản xem trước bên phải cập nhật theo từng chữ."
      >
        Viết gì?
      </SectionTitle>

      <Field label="Bắt đầu từ mẫu" hint="Chọn mẫu sẽ thay tiêu đề và nội dung đang soạn.">
        <Select
          label="Bắt đầu từ mẫu"
          hideLabel
          className="w-full"
          value={draft.template}
          neutralValue={NO_TEMPLATE}
          onChange={applyTemplate}
          options={[
            { value: NO_TEMPLATE, label: 'Không dùng mẫu — tự soạn' },
            ...templates.map((item) => ({ value: item.code, label: item.name })),
          ]}
        />
      </Field>

      <Field label="Tiêu đề *" note={`${draft.subject.length}/${MAIL_SUBJECT_MAX}`}>
        <Input
          value={draft.subject}
          maxLength={MAIL_SUBJECT_MAX}
          placeholder="Ví dụ: Mời anh/chị xem giải pháp cho nhà máy"
          onChange={(event) => draft.setSubject(event.target.value)}
        />
      </Field>

      <Field
        label="Nội dung *"
        hint={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0">
              **đậm** · _nghiêng_ · dòng bắt đầu bằng &apos;- &apos; thành danh sách
            </span>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="pointer-coarse:h-12"
              onClick={onOpenGuide}
            >
              <Icon icon={Info} size={14} />
              Cách viết nội dung
            </Button>
          </span>
        }
        action={
          <span className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="pointer-coarse:h-12"
              onClick={() => insert(MERGE_RECIPIENT)}
            >
              Tên người nhận
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="pointer-coarse:h-12"
              onClick={() => insert(MERGE_ACCOUNT)}
            >
              Tên công ty
            </Button>
          </span>
        }
      >
        <Textarea
          ref={box}
          autoGrow
          rows={8}
          value={draft.body}
          placeholder="Viết nội dung email ở đây…"
          onChange={(event) => draft.setBody(event.target.value)}
        />
      </Field>

      <CtaBlock draft={draft} ctaBroken={ctaBroken} bookingBroken={bookingBroken} />
      <SaveTemplateBlock draft={draft} allowed={canSaveTemplate} />
    </section>
  )
}

function CtaBlock({
  draft,
  ctaBroken,
  bookingBroken,
}: {
  draft: MasMailDraft
  ctaBroken: boolean
  bookingBroken: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Checkbox
        className="min-h-12"
        checked={draft.withCta}
        onChange={(on) => {
          draft.setWithCta(on)
          /* Turning it off drops the button from the letter; the contract reads
             an absent `cta` as "no button", never as "keep the template's". */
          if (!on) {
            draft.setCta(undefined)
            draft.setBookingUrl('')
          }
        }}
        label="Thêm nút trong email"
        hint="VD: nút đặt lịch họp"
      />

      {draft.withCta && (
        <>
          <Field
            label="Nhãn và địa chỉ của nút"
            problem={
              ctaBroken
                ? 'Nút cần đủ nhãn và địa chỉ bắt đầu bằng http:// hoặc https://.'
                : undefined
            }
          >
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,.55fr)_minmax(0,1fr)]">
              <Input
                value={draft.cta?.label ?? ''}
                placeholder="Tên nút"
                aria-label="Tên nút trong email"
                onChange={(event) =>
                  draft.setCta(ctaWith(draft.cta, { label: event.target.value }))
                }
              />
              <Input
                value={draft.cta?.url ?? ''}
                placeholder="https://…"
                aria-label="Địa chỉ nút trong email"
                invalid={ctaBroken}
                onChange={(event) => draft.setCta(ctaWith(draft.cta, { url: event.target.value }))}
              />
            </div>
          </Field>

          <Field
            label="Link đặt lịch (không bắt buộc)"
            hint="Dán link Calendly. Thêm ?name={{contact_name}}&email={{email}} vào cuối để khách khỏi gõ lại tên và email."
            problem={
              bookingBroken ? 'Link đặt lịch phải bắt đầu bằng http:// hoặc https://.' : undefined
            }
          >
            <Input
              value={draft.bookingUrl}
              invalid={bookingBroken}
              placeholder="https://calendly.com/…"
              aria-label="Link đặt lịch trong email"
              onChange={(event) => draft.setBookingUrl(event.target.value)}
            />
          </Field>
        </>
      )}
    </div>
  )
}

/** Saving the letter as a template is a DIFFERENT permission from sending it —
 *  `campaign.edit`, not `lead.send-email` — so somebody without it sees the box
 *  locked with the reason rather than a 403 after pressing send.
 *
 *  Exported because the CHAIN door composes in `WaveComposer` instead of
 *  `ComposeStep`, and losing this box there would quietly take the feature away
 *  from the screen that uses it most. */
export function SaveTemplateBlock({ draft, allowed }: { draft: MasMailDraft; allowed: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Checkbox
        className="min-h-12"
        disabled={!allowed}
        checked={draft.saveAsTemplate && allowed}
        onChange={draft.setSaveAsTemplate}
        label="Lưu nội dung này thành mẫu"
        hint={
          allowed
            ? 'Cả đội dùng lại được cho thư sau.'
            : 'Cần quyền sửa mẫu email mới lưu được — thư vẫn gửi bình thường.'
        }
      />
      {allowed && draft.saveAsTemplate && (
        <Field label="Tên mẫu *" hint="Tên này hiện trong ô 'Bắt đầu từ mẫu' của cả đội.">
          <Input
            value={draft.templateName}
            maxLength={MAIL_NAME_MAX}
            placeholder="VD: Chào lần đầu — nhà máy thực phẩm"
            onChange={(event) => draft.setTemplateName(event.target.value)}
          />
        </Field>
      )}
    </div>
  )
}

/** STEP 3 · when and under what, then one last look. */
export function DeliveryStep({
  draft,
  campaigns,
  preflight,
  scheduleBroken,
  chain,
  audienceNote,
  onEdit,
}: {
  draft: MasMailDraft
  campaigns: readonly CampaignBookRow[]
  preflight?: MasPreflightResponse
  scheduleBroken: boolean
  /** Present = the letter is a CHAIN, so every wave already carries its own
   *  time and this step must not ask for a second one. */
  chain?: { waves: number; subject: string }
  /** Said out loud when the check below reads a DIFFERENT code from the one the
   *  run is filed against — the deal door, where preflight is lead-only. */
  audienceNote?: string
  onEdit: (step: number) => void
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle size="md" hint="Chọn thời điểm và chiến dịch, kiểm tra lại lần cuối rồi gửi.">
        Gửi thế nào?
      </SectionTitle>

      {!chain && (
        <Field label="Thời điểm">
          <SegmentedControl
            label="Thời điểm"
            hideLabel
            value={draft.sendTiming}
            onChange={(value) => draft.setSendTiming(value as MailSendTiming)}
            options={[
              { value: 'now', label: 'Gửi ngay' },
              { value: 'later', label: 'Hẹn giờ' },
            ]}
          />
        </Field>
      )}

      {!chain && draft.sendTiming === 'later' && (
        <Field
          label="Ngày và giờ gửi"
          hint="Hiển thị theo giờ trên máy của bạn."
          problem={scheduleBroken ? 'Thời gian đặt lịch phải sau thời điểm hiện tại.' : undefined}
        >
          <Input
            type="datetime-local"
            value={draft.scheduledAt}
            min={localSlot(1)}
            invalid={scheduleBroken}
            onChange={(event) => draft.setScheduledAt(event.target.value)}
          />
        </Field>
      )}

      {/* Only RUNNING campaigns: attaching a wave to a DRAFT one sends the mail
          while `campaign.state` stays DRAFT, so its start button still passes
          its own guard and blasts the whole audience a second time. */}
      <Field
        label="Chiến dịch (không bắt buộc)"
        hint="Để trống thì lô này đi lẻ, vẫn xem được ở Sổ lô gửi. Chiến dịch còn nháp thì bắt đầu từ hồ sơ chiến dịch."
      >
        <Select
          label="Chiến dịch"
          hideLabel
          className="w-full"
          value={draft.campaignCode}
          onChange={draft.setCampaignCode}
          options={[
            { value: NO_CAMPAIGN, label: 'Gửi lẻ, không gắn' },
            ...campaigns.map((item) => ({
              value: item.code,
              label: `${item.code} · ${item.name}`,
            })),
          ]}
        />
      </Field>

      <Checkbox
        className="min-h-12"
        checked={draft.trackEngagement}
        onChange={draft.setTrackEngagement}
        label="Ghi nhận khi khách mở email hoặc bấm nút"
        hint="Tín hiệu hiện ở Lịch sử của hồ sơ. Tắt thì lô này không ghi nhận lượt mở và lượt bấm."
      />

      <ReviewTable draft={draft} chain={chain} onEdit={onEdit} />

      {audienceNote && (
        <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.6]">{audienceNote}</p>
      )}

      {preflight && <PreflightReport report={preflight} />}
    </section>
  )
}

/** The last look before the button: three lines and a way back to each one. A
 *  chain reads its own count instead of the body, because the box on screen
 *  holds the wave being written and not everything about to go out. */
function ReviewTable({
  draft,
  chain,
  onEdit,
}: {
  draft: MasMailDraft
  chain?: { waves: number; subject: string }
  onEdit: (step: number) => void
}) {
  const rows = chain
    ? [
        { label: 'Người nhận', value: `${draft.selected.size} người`, step: 0 },
        { label: 'Chuỗi đợt', value: `${chain.waves} đợt sẽ gửi`, step: 1 },
        { label: 'Tiêu đề', value: chain.subject || 'Chưa có', step: 1 },
      ]
    : [
        { label: 'Người nhận', value: `${draft.selected.size} người`, step: 0 },
        { label: 'Tiêu đề', value: draft.subject || 'Chưa có', step: 1 },
        { label: 'Nội dung', value: firstLine(draft.body), step: 1 },
      ]

  return (
    <GlassCard variant="b" className="min-w-0 p-4">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li
            key={row.label}
            className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-sm py-1 pl-3 pr-1"
          >
            <span className="text-muted-foreground w-20 shrink-0 text-[11px]">{row.label}</span>
            <span className="text-foreground min-w-0 flex-1 truncate text-[12.5px]">
              {row.value}
            </span>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              className="pointer-coarse:h-12"
              onClick={() => onEdit(row.step)}
            >
              <Icon icon={Pencil} size={14} />
              Sửa
            </Button>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

const firstLine = (body: string): string => body.split('\n')[0]?.trim() || 'Chưa có'

export function PreflightReport({ report }: { report: MasPreflightResponse }) {
  return (
    <GlassCard variant="b" className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12.5px] font-semibold">Danh sách sau kiểm tra</span>
        <span className="tnum font-num text-[14px] font-semibold">{report.sendable}</span>
      </div>
      <ul className="m-0 flex max-h-64 list-none flex-col gap-2 overflow-y-auto p-4">
        {report.recipients.map((recipient) => (
          <li
            key={recipient.leadCode}
            className="bg-surface-ink/5 flex min-w-0 items-start justify-between gap-3 rounded-sm p-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{recipient.contactName}</span>
              <span className="text-glass-foreground truncate font-mono text-[10.5px]">
                {recipient.email ?? 'Chưa có email'}
              </span>
            </span>
            <Badge tone={recipient.block ? 'warning' : 'success'}>
              {recipient.block ? MAS_RECIPIENT_BLOCK_LABEL[recipient.block] : 'Sẽ gửi'}
            </Badge>
          </li>
        ))}
        {report.hidden > 0 && (
          <li className="text-warning bg-surface-ink/5 rounded-sm p-3 text-[11.5px] leading-[1.5]">
            {report.hidden} người nhận bị ẩn theo quyền của bạn nên sẽ không nhận email.
          </li>
        )}
        {report.apolloCount ? (
          <li className="text-warning bg-surface-ink/5 rounded-sm p-3 text-[11.5px] leading-[1.6]">
            <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
            Có {report.apolloCount} liên hệ từ Apollo. Chỉ gửi khi đã xác nhận họ đồng ý nhận email.
          </li>
        ) : null}
      </ul>
    </GlassCard>
  )
}

/** The letter has not been written yet, so there is nothing to render — said in
 *  a sentence rather than by a skeleton that never resolves. */
export function PreviewPlaceholder() {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-2 p-4">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold">
        <Icon icon={Info} size={16} />
        Chưa có gì để xem trước
      </span>
      <p className="text-glass-foreground m-0 text-[11.5px] leading-[1.6]">
        Bản xem trước hiện ở đây ngay khi bước "Nội dung" có tiêu đề và nội dung.
      </p>
    </GlassCard>
  )
}
