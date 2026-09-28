import { useState } from 'react'
import { Check, TriangleAlert, X } from '@pv/ui'
import {
  Avatar,
  Badge,
  Checkbox,
  GlassCard,
  Icon,
  Input,
  SectionTitle,
  SegmentedControl,
  Select,
  cn,
} from '@pv/ui'
import type { CampaignBookRow, CampaignWaveInput, MasPreflightResponse } from '@pv/contracts'
import { MAIL_NAME_MAX, MAS_RECIPIENT_BLOCK_LABEL, SALES_INBOX } from '@pv/contracts'
import { MailPreviewCard } from '@/components/mail-compose-bits'
import { Field } from '@/components/field-bits'
import { PersonTokenField } from '@/components/person-token-field'
import { MailSendConfirm, SendOptions, type ConfirmRow } from '@/components/mail-send-confirm'
import type { useMailPreview } from '@/data/mas'
import { dmhm } from '@/lib/date'
import {
  NO_CAMPAIGN,
  isLater,
  sendLabel,
  type MasMailDraft,
  type MasRecipient,
} from '@/data/mas-mail-draft'

/** The step bodies of the compose panel, in the order they are walked.
 *
 *  Split off `mas-mail-modal.tsx` because that file was 822 lines holding a
 *  form, a preview, a preflight report and a send. The shell keeps what the
 *  steps SHARE — the draft, the footer, the gate — and each part here only
 *  knows its own questions. */

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

/** The three send choices, folded under the letter (see `SendOptions`). Same
 *  defaults as before: no campaign, derived chain name, tracking on. */
export function DeliveryOptions({
  draft,
  campaigns,
  allowCampaign,
  waves,
  sequenceName,
  forceOpen,
}: {
  draft: MasMailDraft
  campaigns: readonly CampaignBookRow[]
  allowCampaign: boolean
  waves: number
  /** What the chain is called right now — typed, or derived (G3). */
  sequenceName: string
  /** The typed chain name is empty — its error must not sit folded away. */
  forceOpen: boolean
}) {
  const chained = draft.campaignCode === NO_CAMPAIGN && waves > 1
  const summary = [
    draft.campaignCode !== NO_CAMPAIGN
      ? `Chiến dịch ${draft.campaignCode}`
      : chained
        ? `Chuỗi: ${sequenceName}`
        : 'Không gắn chiến dịch',
    draft.trackEngagement ? 'ghi nhận mở và bấm' : 'không ghi nhận mở, bấm',
  ].join(' · ')

  return (
    <SendOptions forceOpen={forceOpen} summary={summary}>
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
      {chained && (
        <Field label="Tên chuỗi gửi · tự điền, sửa được">
          <Input
            value={sequenceName}
            maxLength={MAIL_NAME_MAX}
            onChange={(event) => draft.setSequenceName(event.target.value)}
          />
        </Field>
      )}

      <Checkbox
        className="min-h-12"
        checked={draft.trackEngagement}
        onChange={draft.setTrackEngagement}
        label="Ghi nhận khi khách mở email hoặc bấm nút"
        hint="Tín hiệu hiện ở Lịch sử của hồ sơ. Tắt thì lô này không ghi lượt mở hay lượt bấm nào."
      />
    </SendOptions>
  )
}

/** Send's last look. Opens only once the server has answered for this list —
 *  the footer keeps Send shut until then, and the count below is that answer. */
export function MasSendConfirm({
  open,
  chosen,
  report,
  waves,
  queued,
  onBack,
  onConfirm,
}: {
  open: boolean
  chosen: readonly MasRecipient[]
  report?: MasPreflightResponse
  /** Only the waves still to go — a part-failed press resumes after `queued`. */
  waves: readonly CampaignWaveInput[]
  queued: number
  onBack: () => void
  onConfirm: () => void
}) {
  const sendable = report?.sendable ?? 0
  const later = isLater(waves)
  return (
    <MailSendConfirm
      open={open && Boolean(report)}
      title="Xác nhận gửi"
      subtitle={
        later
          ? 'Trước giờ hẹn vẫn dừng được ở sổ lô gửi.'
          : 'Thư đã vào hàng đợi thì không rút lại được.'
      }
      rows={confirmRows(chosen, sendable, waves, queued)}
      action={sendLabel(later, sendable * waves.length)}
      later={later}
      onBack={onBack}
      onConfirm={onConfirm}
    />
  )
}

/** The confirm box's numbers, over the waves still to go. One recipient is
 *  named with the mailbox: the question then is which address, not how many. */
function confirmRows(
  chosen: readonly MasRecipient[],
  sendable: number,
  waves: readonly CampaignWaveInput[],
  queued: number,
): ConfirmRow[] {
  const only = chosen.length === 1 ? chosen[0] : undefined
  const left = waves.length
  const first = waves[0]?.scheduledAt
  return [
    {
      label: 'Người nhận',
      value: only
        ? `${only.contactName} · ${only.email}`
        : chosen.length === sendable
          ? `${sendable} người`
          : `${chosen.length} người đã chọn · ${sendable} sẽ nhận`,
    },
    {
      label: 'Số đợt',
      value: queued > 0 ? `${left} đợt còn lại · ${queued} đợt đã xếp hàng` : `${left} đợt`,
    },
    {
      label: 'Tổng số thư',
      value: left > 1 ? `${sendable} × ${left} = ${sendable * left} thư` : `${sendable} thư`,
    },
    {
      label: 'Thời điểm',
      value: `${first ? `Lúc ${dmhm(first)}` : 'Gửi ngay'}${left > 1 ? ' · các đợt sau theo giờ đặt ở từng đợt' : ''}`,
    },
    { label: 'Bản lưu nội bộ', value: `${SALES_INBOX} nhận một bản BCC mỗi đợt` },
  ]
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

/** Step 2's right column: the letter as the lead picked in the select gets
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
