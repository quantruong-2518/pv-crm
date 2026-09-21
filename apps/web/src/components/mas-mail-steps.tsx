import { Info, Mail, Pencil, TriangleAlert } from '@pv/ui'
import { Badge, Button, Checkbox, GlassCard, Icon, Input, SectionTitle, Select } from '@pv/ui'
import type { CampaignBookRow, MasCcAddress, MasPreflightResponse } from '@pv/contracts'
import { MAIL_NAME_MAX, MAS_CC_ADDRESSES, MAS_RECIPIENT_BLOCK_LABEL } from '@pv/contracts'
import { Field } from '@/components/field-bits'
import { PersonTokenField } from '@/components/person-token-field'
import { NO_CAMPAIGN, type MasMailDraft, type MasRecipient } from '@/data/mas-mail-draft'

/** The three step bodies of the compose panel, in the order they are walked.
 *
 *  Split off `mas-mail-modal.tsx` because that file was 822 lines holding a
 *  form, a preview, a preflight report and a send. The shell keeps what the
 *  steps SHARE — the draft, the footer, the gate — and each step here only
 *  knows its own three questions. */

/** STEP 1 · who receives it. */
export function RecipientsStep({
  draft,
  recipients,
  chosen,
}: {
  draft: MasMailDraft
  recipients: readonly MasRecipient[]
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

  /* The token beside the label carries a NAME, and a lead's mailbox is not
     always the address of the contact it names — so the one-recipient case
     (every send opened from a lead profile) prints the address itself. */
  const only = chosen.length === 1 ? chosen[0] : undefined

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle
        size="md"
        hint="Người liên hệ chính đã được chọn sẵn. Tìm thêm người nhận — gõ tên, công ty hoặc email để lọc."
      >
        Gửi tới ai?
      </SectionTitle>

      <Field label="Người nhận" note={only?.email}>
        <PersonTokenField
          label="Thêm người nhận"
          placeholder="Thêm người nhận…"
          tokens={chosen.map((lead) => ({
            id: lead.code,
            name: lead.destinationLabel
              ? `${lead.contactName} · ${lead.destinationLabel}`
              : lead.contactName,
          }))}
          suggestions={recipients
            .filter((lead) => !draft.selected.has(lead.code))
            .map((lead) => ({
              id: lead.code,
              name: lead.contactName,
              note: [
                lead.destinationLabel,
                lead.contactTitle || 'Chưa có chức danh',
                lead.company,
                lead.email,
              ]
                .filter(Boolean)
                .join(' · '),
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

/** Saving the letter as a template is a DIFFERENT permission from sending it —
 *  `campaign.edit`, not `lead.send-email` — so somebody without it sees the box
 *  locked with the reason rather than a 403 after pressing send.
 *
 *  Exported because `WaveComposer` owns the letter while this shared setting
 *  remains in the modal shell. */
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
  chosen,
  campaigns,
  allowCampaign,
  preflight,
  chain,
  onEdit,
}: {
  draft: MasMailDraft
  chosen: readonly MasRecipient[]
  campaigns: readonly CampaignBookRow[]
  allowCampaign: boolean
  preflight?: MasPreflightResponse
  chain: { waves: number; subject: string }
  onEdit: (step: number) => void
}) {
  const toggleCc = (address: MasCcAddress, on: boolean) =>
    draft.setCc((current) => {
      const next = new Set(current)
      if (on) next.add(address)
      else next.delete(address)
      return next
    })

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle size="md" hint="Chọn thời điểm và chiến dịch, kiểm tra lại lần cuối rồi gửi.">
        Gửi thế nào?
      </SectionTitle>

      {/* Only RUNNING campaigns: attaching a wave to a DRAFT one sends the mail
          while `campaign.state` stays DRAFT, so its start button still passes
          its own guard and blasts the whole audience a second time. */}
      {allowCampaign && (
        <Field
          label="Chiến dịch (không bắt buộc)"
          hint="Để trống thì các đợt vẫn thuộc chuỗi gửi riêng. Chiến dịch còn nháp thì bắt đầu từ hồ sơ chiến dịch."
        >
          <Select
            label="Chiến dịch"
            hideLabel
            className="w-full"
            value={draft.campaignCode}
            onChange={draft.setCampaignCode}
            options={[
              { value: NO_CAMPAIGN, label: 'Chuỗi riêng, không gắn chiến dịch' },
              ...campaigns.map((item) => ({
                value: item.code,
                label: `${item.code} · ${item.name}`,
              })),
            ]}
          />
        </Field>
      )}

      {draft.campaignCode === NO_CAMPAIGN && (
        <Field
          label="Tên chuỗi gửi *"
          hint="Dùng để gom các đợt này thành một chuỗi dù không thuộc chiến dịch."
        >
          <Input
            value={draft.sequenceName}
            maxLength={MAIL_NAME_MAX}
            placeholder="VD: Chăm sóc lead triển lãm tháng 9"
            onChange={(event) => draft.setSequenceName(event.target.value)}
          />
        </Field>
      )}

      <Field
        label="CC nội bộ (không bắt buộc)"
        hint="Mỗi địa chỉ được chọn nhận một bản CC cho từng email gửi tới từng người nhận."
      >
        <div className="flex min-w-0 flex-col gap-2">
          {MAS_CC_ADDRESSES.map((address) => (
            <Checkbox
              key={address}
              className="min-h-12"
              checked={draft.cc.has(address)}
              onChange={(on) => toggleCc(address, on)}
              label={address}
              hint="Bản lưu nội bộ của email gửi từ hộp thư noreply."
            />
          ))}
        </div>
      </Field>

      <Checkbox
        className="min-h-12"
        checked={draft.trackEngagement}
        onChange={draft.setTrackEngagement}
        label="Ghi nhận khi khách mở email hoặc bấm nút"
        hint="Tín hiệu hiện ở Lịch sử của hồ sơ. Tắt thì lô này không ghi nhận lượt mở và lượt bấm."
      />

      <ReviewTable draft={draft} chain={chain} chosen={chosen} onEdit={onEdit} />

      {preflight && <PreflightReport report={preflight} />}
    </section>
  )
}

/** The last look before the button: three lines and a way back to each one. A
 *  chain reads its own count instead of the body, because the box on screen
 *  holds the wave being written and not everything about to go out.
 *
 *  A single recipient is NAMED WITH THEIR MAILBOX: a count of one is the case
 *  where the number says nothing the reader needed — the question at this point
 *  is which address this letter is about to land in, and a lead's mailbox is
 *  not always the address of the contact shown beside it. */
function ReviewTable({
  draft,
  chain,
  chosen,
  onEdit,
}: {
  draft: MasMailDraft
  chain: { waves: number; subject: string }
  chosen: readonly MasRecipient[]
  onEdit: (step: number) => void
}) {
  const only = chosen.length === 1 ? chosen[0] : undefined
  const to = {
    label: 'Người nhận',
    value: only ? `${only.contactName} · ${only.email}` : `${draft.selected.size} người`,
    step: 0,
  }
  const rows = [
    to,
    { label: 'Chuỗi đợt', value: `${chain.waves} đợt sẽ gửi`, step: 1 },
    { label: 'Tiêu đề', value: chain.subject || 'Chưa có', step: 1 },
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
            key={recipient.subjectCode}
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
