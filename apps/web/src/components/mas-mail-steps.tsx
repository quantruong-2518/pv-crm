import { Pencil, TriangleAlert, X } from '@pv/ui'
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

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle size="md">Gửi tới ai?</SectionTitle>

      {/* NO TOKENS: the list below holds the same people with their addresses,
          and two rows of the same names is one too many. */}
      <Field label="Thêm người nhận">
        <PersonTokenField
          label="Thêm người nhận"
          placeholder="Thêm người nhận…"
          tokens={[]}
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
        />
      </Field>

      <ChosenList chosen={chosen} onRemove={drop} />
    </section>
  )
}

/** WHO THE LETTER IS ABOUT TO GO TO, one row each.
 *
 *  The same shape `PreflightReport` draws at step 3, minus the verdict: nobody
 *  has asked the server anything yet, and a badge here would answer a question
 *  that has not been put. It replaced the token row, which could only carry a
 *  NAME — the address, the thing a mass send is actually aimed at, was on
 *  screen only when exactly one person was picked, which is the one case this
 *  panel does not exist for. */
function ChosenList({
  chosen,
  onRemove,
}: {
  chosen: readonly MasRecipient[]
  onRemove: (code: string) => void
}) {
  return (
    <GlassCard variant="b" className="min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3">
        <span className="text-[12.5px] font-semibold">Người nhận đã chọn</span>
        <span className="tnum font-num text-[14px] font-semibold">{chosen.length}</span>
      </div>
      {chosen.length === 0 ? (
        <p className="text-glass-foreground m-0 px-4 pb-4 text-[11.5px] leading-[1.5]">
          Chưa chọn ai.
        </p>
      ) : (
        <ul className="m-0 flex max-h-64 list-none flex-col gap-2 overflow-y-auto p-4">
          {chosen.map((lead) => (
            <li
              key={lead.code}
              className="bg-surface-ink/5 flex min-w-0 items-start justify-between gap-3 rounded-sm py-2 pl-3 pr-1"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px] font-semibold">
                  {lead.destinationLabel
                    ? `${lead.contactName} · ${lead.destinationLabel}`
                    : lead.contactName}
                </span>
                <span className="text-glass-foreground truncate text-[11px]">{lead.company}</span>
                <span
                  className={
                    lead.email
                      ? 'text-glass-foreground truncate font-mono text-[10.5px]'
                      : 'text-warning truncate font-mono text-[10.5px]'
                  }
                >
                  {lead.email || 'Chưa có email'}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                className="pointer-coarse:h-12"
                onClick={() => onRemove(lead.code)}
              >
                <Icon icon={X} size={14} />
                Bỏ
              </Button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
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
        /* The only hint left in the form: not guidance, but the reason a
           control is locked, and it has to stand beside that control. */
        {...(allowed
          ? {}
          : { hint: 'Cần quyền sửa mẫu email mới lưu được — thư vẫn gửi bình thường.' })}
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
      <SectionTitle size="md">Gửi thế nào?</SectionTitle>

      {/* Only RUNNING campaigns: attaching a wave to a DRAFT one sends the mail
          while `campaign.state` stays DRAFT, so its start button still passes
          its own guard and blasts the whole audience a second time. */}
      {allowCampaign && (
        <Field label="Chiến dịch (không bắt buộc)" hint="Chỉ chiến dịch đang chạy mới hiện ở đây.">
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
        <Field label="Tên chuỗi gửi *">
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
        hint="Mỗi địa chỉ nhận một bản của từng email. Khách không thấy các địa chỉ này."
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
          {MAS_CC_ADDRESSES.map((address) => (
            <Checkbox
              key={address}
              className="min-h-12"
              checked={draft.cc.has(address)}
              onChange={(on) => toggleCc(address, on)}
              label={address}
            />
          ))}
        </div>
      </Field>

      <Checkbox
        className="min-h-12"
        checked={draft.trackEngagement}
        onChange={draft.setTrackEngagement}
        label="Ghi nhận khi khách mở email hoặc bấm nút"
        hint="Tín hiệu hiện ở Lịch sử của hồ sơ. Tắt thì lô này không ghi lượt mở hay lượt bấm nào."
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

/** Nothing written yet, so nothing to render — one dim line in the column the
 *  letter will occupy, not a card that announces its own emptiness. */
export function PreviewPlaceholder() {
  return (
    <p className="text-muted-foreground m-0 px-1 text-[11.5px] leading-[1.6]">
      Bản xem trước hiện ở đây ngay khi bước "Nội dung" có tiêu đề và nội dung.
    </p>
  )
}
