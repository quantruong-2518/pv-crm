import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Check, Eye, Plus, Send, TriangleAlert, X } from '@pv/ui'
import {
  Badge,
  Button,
  GlassCard,
  Icon,
  Input,
  Modal,
  SearchField,
  SegmentedControl,
  Select,
  Textarea,
  cn,
} from '@pv/ui'
import {
  MAS_MAX_RECIPIENTS,
  MAS_RECIPIENT_BLOCK_LABEL,
  type LeadRow,
  type MailTemplateRow,
  type MasPreflightResponse,
  type MasSendRequest,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { localSlot } from '@/lib/date'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import { masPreflight, masTemplatesQuery, useMailPreview, useMasSend } from '@/data/mas'
import { mailHints } from '@/data/mail-hints'
import { campaignFacetQuery } from '@/data/campaign-book'

/** Một phiếu gửi mail đầy đủ, dùng chung cho hai ngữ cảnh:
 *
 *  · Hồ sơ lead: đúng một người đã được chọn, hành động gọi là "Gửi mail".
 *  · Sổ lead: chọn nhiều người ngay trong phiếu, hành động gọi là "Gửi MAS mail".
 *
 * Thứ tự trên phiếu là thứ tự một người mới cần nghĩ: viết gì → gửi lúc nào →
 * gửi cho ai. Preview mở ngay dưới nội dung; preflight là cổng bắt buộc trước
 * khi nút gửi xuất hiện. */

const NO_TEMPLATE = 'none'

/** Giá trị "lô này không thuộc chiến dịch nào" — Quick MAS thuần.
 *
 *  Chuỗi riêng chứ không phải `''`: một `<Select>` có `value=""` không phân
 *  biệt được "người dùng chọn không gắn" với "chưa nạp xong danh sách", và
 *  `MaObject` ở hợp đồng từ chối chuỗi rỗng nên nhầm lẫn đó thành một lượt 400
 *  sau khi thư đã soạn xong. Cùng nước đi `NO_TEMPLATE` ở trên. */
const NO_CAMPAIGN = 'none'
const NO_SELECTION: ReadonlySet<string> = new Set()
const CANDIDATE_LIMIT = 12
const FORM_ID = 'mas-mail-form'

type MasRecipient = Pick<LeadRow, 'code' | 'company' | 'contactName' | 'contactTitle' | 'email'>

export type MasMailModalProps = {
  open: boolean
  onClose: () => void
  leads: MasRecipient[]
  initialLeadCode?: string
  /** Danh sách đã bôi chọn ngoài Sổ lead. Modal dùng làm mồi và vẫn cho thêm. */
  initialLeadCodes?: readonly string[]
  defaultLabel?: string
  onQueued: () => void
}

export function MasMailModal({
  open,
  onClose,
  leads,
  initialLeadCode,
  initialLeadCodes,
  defaultLabel,
  onQueued,
}: MasMailModalProps) {
  const single = Boolean(initialLeadCode)
  const { data: catalogue } = useQuery({ ...masTemplatesQuery, enabled: open })
  /* `enabled: open` như thư viện mẫu: hộp đóng thì không hỏi. Sổ chiến dịch
     dùng chung đúng query của màn Sổ chiến dịch (`campaignFacetQuery`,
     `staleTime` một phút), nên mở hộp lần thứ hai trong cùng phút không tốn
     thêm lượt đi nào. */
  const { data: campaignBook } = useQuery({ ...campaignFacetQuery, enabled: open })
  const send = useMasSend()

  const [template, setTemplate] = useState(NO_TEMPLATE)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [cta, setCta] = useState<MailTemplateRow['cta']>()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION)
  const [previewCode, setPreviewCode] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [sendTiming, setSendTiming] = useState<'now' | 'later'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [campaignCode, setCampaignCode] = useState(NO_CAMPAIGN)
  const [failure, setFailure] = useState('')
  const [preflight, setPreflight] = useState<MasPreflightResponse>()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!open) return
    setTemplate(NO_TEMPLATE)
    setSubject('')
    setBody('')
    setCta(undefined)
    setQuery('')
    const seeded = initialLeadCode ? [initialLeadCode] : (initialLeadCodes ?? [])
    setSelected(seeded.length > 0 ? new Set(seeded) : NO_SELECTION)
    setPreviewCode(seeded[0] ?? '')
    setPreviewOpen(false)
    setSendTiming('now')
    setScheduledAt(localSlot())
    setCampaignCode(NO_CAMPAIGN)
    setPreflight(undefined)
    setChecking(false)
    setFailure('')
  }, [open, initialLeadCode, initialLeadCodes])

  const templates = useMemo(
    () => (catalogue?.rows ?? []).filter((item) => item.active),
    [catalogue],
  )
  /* RUNNING only. Hanging a wave off a DRAFT campaign from here is a
     double-send trap: the mail really flies and `campaign_run` gets its row
     while `campaign.state` stays DRAFT, so the start button on the campaign
     profile still passes its `state === 'DRAFT'` guard and blasts the whole
     audience a second time. `CampaignSweeper` only closes RUNNING campaigns, so
     that campaign is then stuck DRAFT forever. A draft is started from its own
     profile and shows up in this list once it runs. Stopped and done campaigns
     stay out for the older reason: a new wave runs on behind whoever stopped it. */
  const openCampaigns = useMemo(
    () => (campaignBook?.rows ?? []).filter((c) => c.state === 'RUNNING'),
    [campaignBook],
  )
  const selectedLeads = useMemo(
    () => leads.filter((lead) => selected.has(lead.code)),
    [leads, selected],
  )
  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi')
    return leads
      .filter((lead) =>
        needle === ''
          ? true
          : [lead.code, lead.company, lead.contactName, lead.contactTitle ?? '', lead.email].some(
              (value) => value.toLocaleLowerCase('vi').includes(needle),
            ),
      )
      .slice(0, CANDIDATE_LIMIT)
  }, [leads, query])
  const previewLead =
    selectedLeads.find((lead) => lead.code === previewCode) ?? selectedLeads[0] ?? null

  const toggleRecipient = (lead: MasRecipient) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(lead.code)) next.delete(lead.code)
      else next.add(lead.code)
      return next
    })
    if (!selected.has(lead.code) && previewCode === '') setPreviewCode(lead.code)
    setPreflight(undefined)
    setFailure('')
  }

  const applyTemplate = (key: string) => {
    setTemplate(key)
    const found = templates.find((item) => item.code === key)
    setSubject(found?.subject ?? '')
    setBody(found?.body ?? '')
    setCta(found?.cta)
    setPreviewOpen(false)
    setFailure('')
  }

  const scheduleInvalid =
    sendTiming === 'later' &&
    (!scheduledAt ||
      Number.isNaN(new Date(scheduledAt).getTime()) ||
      new Date(scheduledAt) <= new Date())
  const ctaInvalid = Boolean(cta && (!cta.label.trim() || !isHttpUrl(cta.url)))
  const overCeiling = selectedLeads.length > MAS_MAX_RECIPIENTS

  /* THE HARD GATE, AND IT IS DELIBERATELY SHORT.
     Five conditions, and every one of them is a send that CANNOT happen: no
     audience, an audience over the ceiling the contract enforces, an empty
     letter, a button that points nowhere, a schedule in the past.

     What used to be a sixth is now advice. A body still holding a `[…]` slot
     from the seeded template locked this button, and that was wrong for the
     reason `mail-hints.ts` sets out at length: the template is a starting
     point, not a form to complete. Somebody writing their own letter was
     refused a send over a placeholder they had never seen. It is the first
     row of the checklist instead, where it can be read and overruled. */
  const blocker: string | null = overCeiling
    ? `Một lượt tối đa ${MAS_MAX_RECIPIENTS} lead — đang chọn ${selectedLeads.length}.`
    : selectedLeads.length === 0
      ? 'Chưa chọn người nhận.'
      : !subject.trim() || !body.trim()
        ? 'Chọn mẫu hoặc điền đủ tiêu đề và nội dung email.'
        : ctaInvalid
          ? 'Nút trong email cần đủ nhãn và địa chỉ bắt đầu bằng http/https.'
          : scheduleInvalid
            ? 'Thời gian đặt lịch phải sau thời điểm hiện tại.'
            : null

  const preview = useMailPreview(
    {
      subject,
      body,
      ...(cta && !ctaInvalid ? { cta } : {}),
      ...(previewLead ? { leadCode: previewLead.code } : {}),
    },
    previewOpen,
  )
  const hints = mailHints({ subject, body, missing: preview.letter?.missing })

  const checkRecipients = async () => {
    if (blocker) return
    setChecking(true)
    setFailure('')
    try {
      setPreflight(await masPreflight(selectedLeads.map((lead) => lead.code)))
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : 'Không kiểm tra được người nhận.')
    } finally {
      setChecking(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (blocker || !preflight || preflight.sendable === 0 || send.isPending) return

    const label = (
      defaultLabel ||
      templates.find((item) => item.code === template)?.name ||
      subject
    ).trim()
    const payload: MasSendRequest = {
      leadCodes: selectedLeads.map((lead) => lead.code),
      label,
      subject,
      body,
      ...(template === NO_TEMPLATE ? {} : { templateCode: template }),
      ...(cta ? { cta } : {}),
      ...(sendTiming === 'later' ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      ...(campaignCode === NO_CAMPAIGN ? {} : { campaignCode }),
    }

    setFailure('')
    try {
      const result = await send.mutateAsync(payload)
      toast(
        result.state === 'SCHEDULED'
          ? `Đã đặt lịch ${result.queued} email`
          : `Đã xếp hàng ${result.queued} email`,
        {
          tone: 'success',
          detail:
            result.state === 'SCHEDULED'
              ? `Hệ thống bắt đầu gửi lúc ${mailMoment(payload.scheduledAt!)}.`
              : 'Email sẽ rời hệ thống sau vài chục giây.',
        },
      )
      onQueued()
      onClose()
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : 'Không tạo được lượt gửi này.')
    }
  }

  const actionLabel = single ? 'Gửi mail' : 'Gửi MAS mail'

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      title={actionLabel}
      subtitle={
        single
          ? `Soạn, xem trước và kiểm tra email trước khi gửi cho ${selectedLeads[0]?.company ?? 'lead này'}.`
          : 'Chọn nội dung, thời điểm và kiểm tra từng người trước khi gửi hàng loạt.'
      }
      meta={
        <Badge tone={preflight?.blocked ? 'warning' : preflight ? 'success' : 'draft'}>
          {preflight ? `${preflight.sendable} người sẽ nhận` : `${selectedLeads.length} đã chọn`}
        </Badge>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'max-w-[560px] text-[11.5px] leading-[1.5]',
              failure || blocker ? 'text-warning' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {failure ||
              blocker ||
              (preflight
                ? `${preflight.sendable} gửi được · ${preflight.blocked} bị chặn · ${preflight.hidden} bị ẩn theo quyền`
                : 'Kiểm tra người nhận để mở nút gửi.')}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="md" variant="ghost" type="button" onClick={onClose}>
              Huỷ
            </Button>
            {preflight ? (
              <Button
                size="md"
                type="submit"
                form={FORM_ID}
                disabled={Boolean(blocker) || preflight.sendable === 0 || send.isPending}
              >
                <Icon icon={sendTiming === 'later' ? CalendarClock : Send} size={16} />
                {send.isPending
                  ? 'Đang tạo lượt gửi…'
                  : sendTiming === 'later'
                    ? `Đặt lịch cho ${preflight.sendable} người`
                    : `Gửi cho ${preflight.sendable} người`}
              </Button>
            ) : (
              <Button
                size="md"
                type="button"
                disabled={Boolean(blocker) || checking}
                onClick={() => void checkRecipients()}
              >
                <Icon icon={Check} size={16} />
                {checking ? 'Đang kiểm tra…' : 'Kiểm tra người nhận'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
        <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.65fr)]">
          <section className="flex min-w-0 flex-col gap-4">
            <SectionTitle
              number="1"
              title="Nội dung email"
              note="Chọn mẫu để điền sẵn, sau đó sửa nếu cần."
            />

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="Mẫu nội dung">
                <Select
                  label="Mẫu nội dung"
                  hideLabel
                  value={template}
                  neutralValue={NO_TEMPLATE}
                  onChange={applyTemplate}
                  className="w-full"
                  options={[
                    { value: NO_TEMPLATE, label: 'Không dùng mẫu — tự soạn' },
                    ...templates.map((item) => ({ value: item.code, label: item.name })),
                  ]}
                />
              </Field>
              <Button
                type="button"
                size="md"
                variant="secondary"
                /* No longer gated on a picked recipient: the server renders
                   sample merge values when none is given, and somebody who has
                   just written a letter is exactly who wants to look at it
                   before going to choose who gets it. */
                disabled={!subject.trim() || !body.trim()}
                aria-expanded={previewOpen}
                onClick={() => setPreviewOpen((current) => !current)}
              >
                <Icon icon={Eye} size={16} />
                {previewOpen ? 'Đóng xem trước' : 'Xem trước'}
              </Button>
            </div>

            {templates.length === 0 && (
              <p className="text-muted-foreground text-[11px] leading-[1.5]">
                Chưa có mẫu đang bật. Bạn vẫn có thể tự soạn email.
              </p>
            )}

            <Field label="Tiêu đề email" note={`${subject.length}/200 ký tự`}>
              <Input
                value={subject}
                maxLength={200}
                placeholder="Ví dụ: Mời anh/chị xem giải pháp cho nhà máy"
                onChange={(event) => setSubject(event.target.value)}
              />
            </Field>

            <Field
              label="Nội dung"
              hint="Dùng {{contact_name}} và {{account}} để tự điền đúng tên từng người và công ty."
            >
              <Textarea
                autoGrow
                rows={7}
                value={body}
                placeholder="Viết nội dung email ở đây…"
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>

            <Field
              label="Nút trong email (không bắt buộc)"
              hint="Để trống cả hai ô nếu email không cần nút."
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(150px,.55fr)_minmax(0,1fr)]">
                <Input
                  value={cta?.label ?? ''}
                  placeholder="Tên nút"
                  aria-label="Tên nút trong email"
                  onChange={(event) => setCta(ctaWith(cta, { label: event.target.value }))}
                />
                <Input
                  value={cta?.url ?? ''}
                  placeholder="https://…"
                  aria-label="Địa chỉ nút trong email"
                  onChange={(event) => setCta(ctaWith(cta, { url: event.target.value }))}
                />
              </div>
            </Field>

            <MailHintList hints={hints} />

            {previewOpen && (
              <MailPreviewCard
                letter={preview.letter}
                pending={preview.pending}
                error={preview.error}
                recipients={selectedLeads.map((lead) => ({
                  code: lead.code,
                  label: `${lead.contactName} · ${lead.company}`,
                }))}
                recipientCode={previewLead?.code}
                onRecipient={setPreviewCode}
              />
            )}
          </section>

          <section className="flex flex-col gap-4">
            <SectionTitle
              number="2"
              title="Thời điểm gửi"
              note="Gửi ngay hoặc giữ lại đến giờ đã chọn."
            />
            <SegmentedControl
              label="Thời điểm gửi"
              hideLabel
              value={sendTiming}
              onChange={(value) => {
                setSendTiming(value as 'now' | 'later')
                setFailure('')
              }}
              options={[
                { value: 'now', label: 'Gửi ngay' },
                { value: 'later', label: 'Đặt lịch gửi' },
              ]}
            />
            {sendTiming === 'later' && (
              <Field label="Ngày và giờ gửi" hint="Hiển thị theo giờ trên máy của bạn.">
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  min={localSlot(1)}
                  onChange={(event) => setScheduledAt(event.target.value)}
                />
              </Field>
            )}

            {/* GẮN LÔ VÀO MỘT CHIẾN DỊCH — cùng bước với lịch gửi, vì đây cũng
                là một câu về "lô này là gì", không phải về nội dung thư.

                Để trống là Quick MAS: lô vẫn sinh một `mail_run` và vẫn hiện ở
                Sổ lô gửi, chỉ không có dòng nối `campaign_run` nào. Chọn một
                chiến dịch là biến lô này thành ĐỢT TIẾP THEO của nó — đúng
                đường mà `ban-giao-campaign.md` chỉ cho đợt thứ hai trở đi, thay
                vì gọi lại `/start`.

                Chỉ hiện chiến dịch ĐANG CHẠY. Chiến dịch còn NHÁP bắt đầu từ hồ
                sơ của nó, không gắn từ đây — gắn từ đây thì thư bay mà state vẫn
                NHÁP, và cú bấm chạy sau đó bắn lại toàn bộ người nhận. Chiến dịch
                đã DỪNG hay XONG mà nhận thêm một đợt là chạy tiếp sau lưng người
                đã dừng nó. */}
            <Field
              label="Gắn vào chiến dịch (không bắt buộc)"
              hint="Để trống thì lô này đi lẻ, vẫn xem được ở Sổ lô gửi. Chiến dịch còn nháp thì bắt đầu từ hồ sơ chiến dịch, không gắn ở đây."
            >
              <Select
                label="Chiến dịch"
                hideLabel
                value={campaignCode}
                onChange={setCampaignCode}
                options={[
                  { value: NO_CAMPAIGN, label: 'Không gắn — gửi lẻ' },
                  ...openCampaigns.map((c) => ({
                    value: c.code,
                    label: `${c.code} · ${c.name}`,
                  })),
                ]}
              />
            </Field>
            <p className="text-muted-foreground rounded-sm bg-white/5 p-3 text-[11.5px] leading-[1.6]">
              {sendTiming === 'later'
                ? 'Email được giữ trong hàng đợi và chỉ bắt đầu gửi khi tới giờ đã chọn.'
                : 'Email vào hàng đợi ngay sau khi bạn kiểm tra và xác nhận người nhận.'}
            </p>
          </section>
        </div>

        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionTitle
              number="3"
              title="Người nhận"
              note={
                single
                  ? 'Lead này đã được chọn sẵn.'
                  : 'Danh sách ngoài sổ đã được đưa vào. Bạn vẫn có thể tìm và chọn thêm.'
              }
            />
            <Badge tone={preflight?.blocked ? 'warning' : preflight ? 'success' : 'draft'}>
              {preflight
                ? `${preflight.sendable} người sẽ nhận`
                : `${selectedLeads.length} đã chọn`}
            </Badge>
          </div>

          {!single && (
            <>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Tìm thêm theo tên, chức danh, email hoặc công ty…"
              />
              <div className="grid max-h-[240px] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {candidates.map((lead) => {
                  const on = selected.has(lead.code)
                  return (
                    <button
                      key={lead.code}
                      type="button"
                      onClick={() => toggleRecipient(lead)}
                      aria-pressed={on}
                      className={cn(
                        'motion-std flex min-w-0 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left',
                        on ? 'bg-accent' : 'hover:bg-white/8 bg-white/5',
                      )}
                    >
                      <RecipientIdentity lead={lead} />
                      <Icon icon={on ? Check : Plus} size={16} className="shrink-0" />
                    </button>
                  )
                })}
                {candidates.length === 0 && (
                  <p className="text-muted-foreground text-[11.5px]">Không có lead phù hợp.</p>
                )}
              </div>
            </>
          )}

          <GlassCard variant="b" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[12.5px] font-semibold">
                {preflight ? 'Danh sách sau kiểm tra' : 'Danh sách sẽ kiểm tra'}
              </span>
              <span className="tnum font-num text-[14px] font-semibold">
                {preflight?.sendable ?? selectedLeads.length}
              </span>
            </div>
            <div className="bg-white/6 h-px" />
            <div className="max-h-[320px] overflow-y-auto p-4">
              {preflight ? (
                <PreflightReport report={preflight} />
              ) : selectedLeads.length > 0 ? (
                <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
                  {selectedLeads.map((lead) => (
                    <li
                      key={lead.code}
                      className="flex items-start justify-between gap-3 rounded-sm bg-white/5 p-3"
                    >
                      <RecipientIdentity lead={lead} />
                      {!single && (
                        <button
                          type="button"
                          onClick={() => toggleRecipient(lead)}
                          aria-label={`Bỏ ${lead.contactName}`}
                          className="motion-std hover:bg-white/16 bg-white/9 flex size-7 shrink-0 items-center justify-center rounded-md"
                        >
                          <Icon icon={X} size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground py-4 text-center text-[11.5px]">
                  Chưa chọn người nhận.
                </p>
              )}
            </div>
          </GlassCard>

          {preflight?.apolloCount ? (
            <p className="text-warning rounded-sm bg-white/5 px-3 py-2 text-[11.5px] leading-[1.6]">
              <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
              Có {preflight.apolloCount} liên hệ từ Apollo. Chỉ gửi khi đã xác nhận họ đồng ý nhận
              email.
            </p>
          ) : null}
        </section>
      </form>
    </Modal>
  )
}

function SectionTitle({ number, title, note }: { number: string; title: string; note: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-accent text-accent-foreground flex size-6 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-semibold">
        {number}
      </span>
      <div className="min-w-0">
        <h3 className="font-display m-0 text-[14px] font-semibold">{title}</h3>
        <p className="text-muted-foreground m-0 mt-1 text-[11.5px] leading-[1.5]">{note}</p>
      </div>
    </div>
  )
}

function PreflightReport({ report }: { report: MasPreflightResponse }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
      {report.recipients.map((recipient) => (
        <li
          key={recipient.leadCode}
          className="flex items-start justify-between gap-3 rounded-sm bg-white/5 p-3"
        >
          <RecipientIdentity
            lead={{
              code: recipient.leadCode,
              company: recipient.company,
              contactName: recipient.contactName,
              contactTitle: recipient.contactTitle,
              email: recipient.email ?? 'Chưa có email',
            }}
          />
          <Badge tone={recipient.block ? 'warning' : 'success'}>
            {recipient.block ? MAS_RECIPIENT_BLOCK_LABEL[recipient.block] : 'Sẽ gửi'}
          </Badge>
        </li>
      ))}
      {report.hidden > 0 && (
        <li className="text-warning rounded-sm bg-white/5 p-3 text-[11.5px] leading-[1.5]">
          {report.hidden} lead bị ẩn theo quyền của bạn nên sẽ không nhận email.
        </li>
      )}
    </ul>
  )
}

function RecipientIdentity({ lead }: { lead: MasRecipient }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[12.5px] font-semibold">{lead.contactName}</span>
      <span className="text-muted-foreground truncate text-[11px]">
        {lead.contactTitle || 'Chưa có chức danh'} · {lead.company}
      </span>
      <span className="text-glass-foreground truncate font-mono text-[10.5px]">{lead.email}</span>
    </span>
  )
}

function Field({
  label,
  hint,
  note,
  children,
}: {
  label: string
  hint?: string
  note?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-[11px]">{label}</span>
        {note && <span className="text-muted-foreground font-mono text-[10.5px]">{note}</span>}
      </div>
      {children}
      {hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>}
    </div>
  )
}
function ctaWith(
  current: MailTemplateRow['cta'],
  patch: { label?: string; url?: string },
): MailTemplateRow['cta'] {
  const next = { label: patch.label ?? current?.label ?? '', url: patch.url ?? current?.url ?? '' }
  return next.label === '' && next.url === '' ? undefined : next
}

function isHttpUrl(raw: string): boolean {
  try {
    return /^https?:$/.test(new URL(raw).protocol)
  } catch {
    return false
  }
}

/** Keeps the YEAR, so NOT `dmhm` from `@/lib/date`. This prints back the moment
 *  the user just typed into a `datetime-local` field that shows a year, and a
 *  mistyped year is the one scheduling slip nothing else on the screen catches. */
function mailMoment(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
