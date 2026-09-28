import { useState } from 'react'
import { Check, Lock, Pencil, TriangleAlert, X } from '@pv/ui'
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  GlassCard,
  Icon,
  Input,
  SectionTitle,
  SegmentedControl,
  Select,
  cn,
} from '@pv/ui'
import type { CampaignBookRow, MasPreflightResponse } from '@pv/contracts'
import { MAIL_NAME_MAX, MAS_RECIPIENT_BLOCK_LABEL, SALES_INBOX } from '@pv/contracts'
import { MailPreviewCard } from '@/components/mail-compose-bits'
import { Field } from '@/components/field-bits'
import { PersonTokenField } from '@/components/person-token-field'
import type { useMailPreview } from '@/data/mas'
import { NO_CAMPAIGN, type MasMailDraft, type MasRecipient } from '@/data/mas-mail-draft'

/** The three step bodies of the compose panel, in the order they are walked.
 *
 *  Split off `mas-mail-modal.tsx` because that file was 822 lines holding a
 *  form, a preview, a preflight report and a send. The shell keeps what the
 *  steps SHARE — the draft, the footer, the gate — and each step here only
 *  knows its own three questions. */

/** The server's answer about the list on screen — or nothing yet. */
export type RecipientVerdicts = { report?: MasPreflightResponse; checking: boolean }

/** STEP 1 · who receives it — full width, no letter beside it (G-Bulk): the
 *  question here is people, and the preview returns once there is a letter. */
export function RecipientsStep({
  draft,
  recipients,
  chosen,
  verdicts,
}: {
  draft: MasMailDraft
  recipients: readonly MasRecipient[]
  chosen: readonly MasRecipient[]
  verdicts: RecipientVerdicts
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
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-6">
      <SectionTitle size="md">Gửi tới ai?</SectionTitle>

      {/* NO TOKENS: the grid below holds the same people with their addresses,
          and two rows of the same names is one too many. */}
      <Field label="Thêm người nhận" className="max-w-[480px]">
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

      <ChosenGrid chosen={chosen} verdicts={verdicts} onRemove={drop} />
    </GlassCard>
  )
}

/** WHO THE LETTER IS ABOUT TO GO TO, one compact cell each, with the server's
 *  verdict ON the cell (G2) — one list with the blocked ones marked, not a
 *  second "after the check" list the reader has to reconcile with this one. */
function ChosenGrid({
  chosen,
  verdicts,
  onRemove,
}: {
  chosen: readonly MasRecipient[]
  verdicts: RecipientVerdicts
  onRemove: (code: string) => void
}) {
  const [filter, setFilter] = useState<'all' | 'blocked'>('all')
  const { report, checking } = verdicts
  const byCode = new Map(report?.recipients.map((row) => [row.subjectCode, row]))
  const blocked = report?.blocked ?? 0
  const cells = chosen.filter((lead) => filter === 'all' || byCode.get(lead.code)?.block)
  const summary = report
    ? `${chosen.length} đã chọn · ${report.sendable} sẽ nhận · ${blocked} bị chặn`
    : checking
      ? `${chosen.length} đã chọn · đang kiểm tra…`
      : `${chosen.length} đã chọn`

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <span className="tnum text-[13px] font-semibold leading-5">{summary}</span>
        <SegmentedControl
          label="Lọc người nhận"
          hideLabel
          tone="quiet"
          value={filter}
          onChange={(value) => setFilter(value as 'all' | 'blocked')}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'blocked', label: 'Bị chặn', count: blocked },
          ]}
        />
      </div>

      {cells.length === 0 ? (
        <p className="text-glass-foreground m-0 text-[12px] leading-5">
          {chosen.length === 0 ? 'Chưa chọn ai.' : 'Không ai bị chặn trong danh sách này.'}
        </p>
      ) : (
        <ul className="m-0 grid max-h-[392px] min-w-0 list-none grid-cols-1 content-start gap-2 overflow-y-auto p-0 sm:grid-cols-2 lg:grid-cols-3">
          {cells.map((lead) => (
            <RecipientCell
              key={lead.code}
              lead={lead}
              verdict={byCode.get(lead.code)}
              onRemove={() => onRemove(lead.code)}
            />
          ))}
        </ul>
      )}

      {report && report.hidden > 0 && (
        <p className="text-warning m-0 text-[12px] leading-5">
          {report.hidden} người nhận bị ẩn theo quyền của bạn nên sẽ không nhận email.
        </p>
      )}
      {report?.apolloCount ? (
        <p className="text-warning m-0 text-[12px] leading-5">
          <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
          Có {report.apolloCount} liên hệ từ Apollo. Chỉ gửi khi đã xác nhận họ đồng ý nhận email.
        </p>
      ) : null}
      <p className="text-glass-foreground m-0 text-[12px] leading-5">
        Kiểm tra người nhận tự chạy mỗi khi danh sách đứng yên. Kết luận của máy chủ hiện trên từng
        dòng.
      </p>
    </div>
  )
}

function RecipientCell({
  lead,
  verdict,
  onRemove,
}: {
  lead: MasRecipient
  verdict?: MasPreflightResponse['recipients'][number]
  onRemove: () => void
}) {
  const name = lead.destinationLabel
    ? `${lead.contactName} · ${lead.destinationLabel}`
    : lead.contactName

  return (
    <li className="bg-surface-ink/5 flex min-h-14 min-w-0 items-center gap-3 rounded-md py-1 pl-3">
      <Avatar name={lead.contactName} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-[13px] font-semibold leading-5"
          title={`${name} · ${lead.company}`}
        >
          {name}
        </span>
        <span
          className={cn(
            'truncate font-mono text-[11px] leading-4',
            lead.email ? 'text-glass-foreground' : 'text-warning',
          )}
          title={lead.email}
        >
          {lead.email || 'Chưa có email'}
        </span>
      </span>
      {verdict?.block ? (
        <Badge tone="warning">{MAS_RECIPIENT_BLOCK_LABEL[verdict.block]}</Badge>
      ) : verdict ? (
        <span role="img" aria-label="Sẽ gửi" className="text-success flex shrink-0">
          <Icon icon={Check} size={14} />
        </span>
      ) : null}
      <button
        type="button"
        aria-label={`Bỏ ${lead.contactName}`}
        onClick={onRemove}
        className="text-muted-foreground motion-std hover:bg-surface-ink/9 hover:text-foreground flex size-12 shrink-0 items-center justify-center rounded-md"
      >
        <Icon icon={X} size={14} />
      </button>
    </li>
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
  sequenceName,
  onEdit,
}: {
  draft: MasMailDraft
  chosen: readonly MasRecipient[]
  campaigns: readonly CampaignBookRow[]
  allowCampaign: boolean
  preflight?: MasPreflightResponse
  chain: { waves: number; subject: string }
  /** What the chain is called right now — typed, or derived (G3). */
  sequenceName: string
  onEdit: (step: number) => void
}) {
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
            size="lg"
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

      {/* One wave needs no chain name on screen (G3): it is still sent, filled
          from the list and the template, and only a chain makes it worth a look. */}
      {draft.campaignCode === NO_CAMPAIGN && chain.waves > 1 && (
        <Field label="Tên chuỗi gửi · tự điền, sửa được">
          <Input
            value={sequenceName}
            maxLength={MAIL_NAME_MAX}
            onChange={(event) => draft.setSequenceName(event.target.value)}
          />
        </Field>
      )}

      {/* A fact, not a choice (G9): the server files one archive copy per run
          to the sales inbox, so there is nothing here to tick. */}
      <Field label="Bản lưu nội bộ">
        <div className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-md px-4 py-3">
          <Icon icon={Lock} size={16} className="text-muted-foreground shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-mono text-[12px] leading-4">{SALES_INBOX}</span>
            <span className="text-muted-foreground text-[12px] leading-4">
              Nhận một bản BCC cho mỗi lô, không phải một bản cho từng người. Khách không thấy địa
              chỉ này.
            </span>
          </span>
        </div>
      </Field>

      <Checkbox
        className="min-h-12"
        checked={draft.trackEngagement}
        onChange={draft.setTrackEngagement}
        label="Ghi nhận khi khách mở email hoặc bấm nút"
        hint="Tín hiệu hiện ở Lịch sử của hồ sơ. Tắt thì lô này không ghi lượt mở hay lượt bấm nào."
      />

      <ReviewTable chain={chain} chosen={chosen} preflight={preflight} onEdit={onEdit} />
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
  chain,
  chosen,
  preflight,
  onEdit,
}: {
  chain: { waves: number; subject: string }
  chosen: readonly MasRecipient[]
  preflight?: MasPreflightResponse
  onEdit: (step: number) => void
}) {
  const only = chosen.length === 1 ? chosen[0] : undefined
  const count = preflight
    ? `${chosen.length} người · ${preflight.sendable} sẽ nhận`
    : `${chosen.length} người`
  const to = {
    label: 'Người nhận',
    value: only ? `${only.contactName} · ${only.email}` : count,
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

/** The header badge: the server's count once it answered for this list. */
export function CheckBadge({
  checking,
  report,
  picked,
}: {
  checking: boolean
  report?: MasPreflightResponse
  picked: number
}) {
  if (checking) return <Badge tone="draft">Đang kiểm tra…</Badge>
  if (!report) return <Badge tone="draft">{`${picked} đã chọn`}</Badge>
  return (
    <Badge tone={report.blocked ? 'warning' : 'success'}>
      {`${report.sendable} người sẽ nhận`}
    </Badge>
  )
}

/** Steps 2–3's right column: the letter as the lead picked in the select gets
 *  it, under the envelope a recipient sees (G-Bulk). */
export function LetterColumn({
  ready,
  preview,
  chosen,
  previewLead,
  onRecipient,
}: {
  ready: boolean
  preview: ReturnType<typeof useMailPreview>
  chosen: readonly MasRecipient[]
  previewLead: MasRecipient | null
  onRecipient: (code: string) => void
}) {
  if (!ready) return <PreviewPlaceholder />
  const to = previewLead
    ? `${previewLead.contactName} · ${previewLead.email || 'Chưa có email'}`
    : '—'

  return (
    <MailPreviewCard
      letter={preview.letter}
      pending={preview.pending}
      error={preview.error}
      recipients={chosen.map((lead) => ({
        code: lead.code,
        label: `Như ${lead.contactName} nhận`,
      }))}
      recipientCode={previewLead?.code}
      onRecipient={onRecipient}
      envelope={[
        { label: 'Từ', value: preview.letter?.from ?? 'noreply · Pebble Vina' },
        { label: 'Tới', value: to },
        { label: 'Trả lời về', value: 'địa chỉ theo dõi riêng của thư này' },
      ]}
      caption="Gửi loạt: mỗi người nhận một thư riêng, trộn tên của chính họ. Gửi loạt không đính kèm file."
    />
  )
}

/** Nothing written yet, so nothing to render — one dim line in the column the
 *  letter will occupy, not a card that announces its own emptiness. */
function PreviewPlaceholder() {
  return (
    <p className="text-muted-foreground m-0 px-1 text-[11.5px] leading-[1.6]">
      Bản xem trước hiện ở đây ngay khi bước "Nội dung" có tiêu đề và nội dung.
    </p>
  )
}
