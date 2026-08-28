import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Eye, Plus, Send, TriangleAlert, X } from '@pv/ui'
import {
  Badge,
  Button,
  Drawer,
  GlassCard,
  Icon,
  Input,
  Kicker,
  MetaPill,
  SearchField,
  Select,
  Textarea,
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
import { masPreflight, masTemplatesQuery, useMasSend } from '@/data/mas'

/** Quick MAS — soạn và bắn MỘT lô mail, trọn trong một Drawer.
 *
 *  Người nhận chọn NGAY TRONG panel chứ không phải bằng chế độ tick dòng ở sổ:
 *  sổ giữ nguyên cột, không chèn section, và một lượt soạn mail không làm màn
 *  phía sau đổi hình. Panel nhận cả sổ (`leads`) để tìm được người nằm ở trang
 *  khác — lô gửi thường rải trên nhiều trang mười dòng.
 *
 *  ------------------------------------------------------------------
 *  BA CÂU NÓ PHẢI NÓI ĐÚNG, VÀ CẢ BA ĐỀU DỄ NÓI SAI
 *  ------------------------------------------------------------------
 *  1 · **Gửi là BẤT ĐỒNG BỘ.** `POST /sales/mail/runs` ghi N dòng sổ gửi rồi
 *      trả về; worker quét mỗi 12 giây và thư rời máy sau đó. Nên panel nói
 *      "đã xếp hàng N thư", không nói "đã gửi" — bản demo trước đây nói sai, và
 *      một chữ "Đã gửi" ở đây thì lúc thư bounce không còn từ nào để dùng.
 *  2 · **Mở lại là một lần soạn MỚI.** Giữ nội dung cũ cho một lô người nhận
 *      khác là cách chắc chắn nhất để gửi nhầm. Xem `useEffect` đặt lại toàn bộ
 *      state theo `open`.
 *  3 · **Đừng tin danh sách của client.** Máy chủ chạy lại preflight bên trong
 *      transaction ghi dòng, vì một cú bounce có thể rơi vào giữa lúc xem trước
 *      và lúc bấm gửi. Số ở panel là ƯỚC LƯỢNG; số thật là
 *      `MasSendResponse.queued`, và đó là số toast in ra.
 *
 *  ------------------------------------------------------------------
 *  HAI NHỊP: KIỂM RỒI MỚI GỬI
 *  ------------------------------------------------------------------
 *  Nút chính đổi vai theo trạng thái: chưa chạy thử thì nó là "Kiểm tra người
 *  nhận", chạy thử xong mới thành "Xếp hàng N thư". Đổi danh sách người nhận
 *  thì kết quả cũ bị vứt và nút quay lại nhịp một. Nghĩa là không có đường nào
 *  bấm gửi mà chưa nhìn ai bị chặn — đó là toàn bộ lý do preflight tồn tại như
 *  một endpoint riêng thay vì một cờ trong lời gọi gửi. */

const NO_TEMPLATE = 'none'
const NO_SELECTION: ReadonlySet<string> = new Set()

/** Bao nhiêu dòng gợi ý hiện dưới ô tìm. Tám là đủ để chọn bằng mắt mà không
 *  biến panel thành một cái sổ thứ hai — muốn nhiều hơn thì gõ hẹp ô tìm lại. */
const CANDIDATE_LIMIT = 8

/** Chỗ trống chưa điền của một mẫu KHUNG — `[tên dòng sản phẩm]`.
 *
 *  Mẫu `mas-edge-ai-intro` đang là khung: nội dung thật của dòng sản phẩm chưa
 *  được duyệt, nên mọi chỗ chưa biết nằm trong ngoặc vuông (xem migration
 *  `0013_mas_template_seed.sql`). Thư đi ra ngoài không rút lại được, nên chỗ
 *  trống đó phải KHOÁ ĐƯỢC NÚT, không chỉ nhìn thấy được.
 *
 *  KHÔNG bắt `{{…}}`: đó là cú pháp trộn biến THẬT — `mas.composer.ts` thay
 *  `{{account}}` bằng tên công ty của từng người nhận — nên bắt nó ở đây sẽ
 *  khoá nút gửi trên đúng những lá thư đang chạy tốt.
 *
 *  Tối thiểu ba ký tự bên trong và không xuống dòng: `[1]` trong một câu tiếng
 *  Việt là chú thích của người viết, không phải chỗ trống, và một ngoặc vuông
 *  mở rồi mãi đoạn dưới mới đóng là hai dấu câu chứ không phải một khe. */
const SLOT = /\[[^\]\n]{3,}\]/g

function unfilledSlots(fields: readonly string[]): string[] {
  return [...new Set(fields.flatMap((f) => f.match(SLOT) ?? []))]
}

/** Xem trước theo TỪNG lead. Mẫu giữ biến thô trong state; chỉ chỗ này mới
 *  thay, nên tên của người đang xem không bao giờ bị đóng cứng vào cả lô.
 *
 *  Bốn alias dưới đây cũng là bốn khoá `MasService.intentOf` ghi thật vào
 *  `email_delivery.merge`. Giao diện quảng bá hai tên theo ngôn ngữ sản phẩm
 *  (`account`, `contact_name`); hai tên cũ giữ template đã lưu không bị hỏng. */
type MasRecipient = Pick<LeadRow, 'code' | 'company' | 'contactName' | 'email'>

function renderFor(template: string, lead: MasRecipient): string {
  const merge: Record<string, string> = {
    account: lead.company,
    company: lead.company,
    contact_name: lead.contactName,
    contactName: lead.contactName,
  }
  return template.replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (whole, key: string) => merge[key] ?? whole,
  )
}

export type MasMailDrawerProps = {
  open: boolean
  onClose: () => void
  /** Toàn bộ sổ thật, để người dùng tìm và thêm ngay trong Drawer. */
  leads: MasRecipient[]
  /** Lead được chọn sẵn khi mở từ hồ sơ chi tiết. */
  initialLeadCode?: string
  /** Tên gợi ý cho lô. Màn cha biết ngữ cảnh, panel thì không. Sửa được. */
  defaultLabel?: string
  /** Gọi sau khi lô đã VÀO HÀNG ĐỢI thành công. */
  onQueued: () => void
}

export function MasMailDrawer({
  open,
  onClose,
  leads,
  initialLeadCode,
  defaultLabel,
  onQueued,
}: MasMailDrawerProps) {
  const { data: catalogue } = useQuery({ ...masTemplatesQuery, enabled: open })
  const send = useMasSend()

  const [template, setTemplate] = useState(NO_TEMPLATE)
  const [runLabel, setRunLabel] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [cta, setCta] = useState<MailTemplateRow['cta']>()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION)
  const [previewCode, setPreviewCode] = useState('')
  const [failure, setFailure] = useState('')

  /* Preflight sống trong state của panel, KHÔNG trong cache của TanStack. Lý do
     đầy đủ ở `masPreflight` (`data/mas.ts`): câu trả lời này hỏng theo thời
     gian, và cache nó là treo một tấm ảnh dưới một dòng chữ hứa hẹn sự thật.
     Ở đây vòng đời của nó nhìn thấy được — nó sống đúng bằng panel, và bị vứt
     ngay khi danh sách người nhận đổi. */
  const [preflight, setPreflight] = useState<MasPreflightResponse>()
  const [checking, setChecking] = useState(false)

  /* Mở lại là một lần soạn mới — điều 2 của docblock đầu file. Đặt lại HẾT, kể
     cả kết quả chạy thử: một panel mở lại với preflight của lô trước là một nút
     "Xếp hàng 37 thư" cách một cú bấm với danh sách của người khác. */
  useEffect(() => {
    if (!open) return
    setTemplate(NO_TEMPLATE)
    setRunLabel(defaultLabel ?? '')
    setSubject('')
    setBody('')
    setCta(undefined)
    setQuery('')
    setSelected(initialLeadCode ? new Set([initialLeadCode]) : NO_SELECTION)
    setPreviewCode(initialLeadCode ?? '')
    setPreflight(undefined)
    setChecking(false)
    setFailure('')
  }, [open, defaultLabel, initialLeadCode])

  /* Mẫu đã tắt vẫn về trên dây (một lô đã gửi phải in được tên mẫu của nó),
     nhưng KHÔNG đứng trong ô chọn: tắt một mẫu nghĩa là không ai soạn thư mới
     bằng nó nữa — cùng luật với danh mục nguồn ở sổ lead. */
  const templates = useMemo(() => (catalogue?.rows ?? []).filter((t) => t.active), [catalogue])

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
          : [lead.code, lead.company, lead.contactName, lead.email].some((v) =>
              v.toLocaleLowerCase('vi').includes(needle),
            ),
      )
      .slice(0, CANDIDATE_LIMIT)
  }, [leads, query])

  const previewLead =
    selectedLeads.find((lead) => lead.code === previewCode) ?? selectedLeads[0] ?? null

  /* Đổi người nhận là vứt kết quả chạy thử. Giữ lại thì nút sẽ hứa "37 gửi
     được" cho một danh sách không còn là danh sách đã kiểm — và preflight tồn
     tại chính vì con số đó phải nói về đúng những người sắp nhận thư. */
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
    /* Mẫu chỉ MỒI bốn ô, người gửi sửa tiếp — kể cả nút. Máy chủ không còn tự
       chép CTA từ mẫu lúc gửi (`MasSendRequest.cta`), nên thứ đi ra là đúng thứ
       đang nằm trên màn này. Bỏ chọn mẫu thì xoá cả bốn: giữ lại nội dung của
       một mẫu vừa bị bỏ là gửi đi một lá thư không ai chọn. */
    setRunLabel(found?.name ?? defaultLabel ?? '')
    setSubject(found?.subject ?? '')
    setBody(found?.body ?? '')
    setCta(found?.cta)
  }

  const slots = unfilledSlots([subject, body, cta?.label ?? ''])
  const overCeiling = selectedLeads.length > MAS_MAX_RECIPIENTS

  /* Năm cách một lô chưa gửi được, mỗi cách một câu. Gộp thành một `disabled`
     trần thì người dùng thấy nút xám mà không biết phải sửa gì. */
  const blocker: string | null = overCeiling
    ? `Một lô tối đa ${MAS_MAX_RECIPIENTS} lead — đang chọn ${selectedLeads.length}. Bỏ bớt người nhận.`
    : selectedLeads.length === 0
      ? 'Chưa chọn người nhận nào.'
      : !runLabel.trim()
        ? 'Đặt tên cho lô — sổ lô gửi hiện tên này, không phải tiêu đề thư.'
        : !subject.trim() || !body.trim()
          ? 'Tiêu đề và nội dung không được để trống.'
          : slots.length > 0
            ? `Nội dung còn ${slots.length} chỗ trống chưa điền: ${slots.join(' · ')}`
            : null

  const checkRecipients = async () => {
    if (blocker) return
    setChecking(true)
    setFailure('')
    try {
      setPreflight(await masPreflight(selectedLeads.map((lead) => lead.code)))
    } catch (error) {
      setFailure(
        isApiError(error) ? userMessage(error) : 'Không kiểm tra được danh sách người nhận.',
      )
    } finally {
      setChecking(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (blocker || !preflight || preflight.sendable === 0 || send.isPending) return

    setFailure('')
    const payload: MasSendRequest = {
      leadCodes: selectedLeads.map((lead) => lead.code),
      label: runLabel,
      subject,
      body,
      ...(template === NO_TEMPLATE ? {} : { templateCode: template }),
      ...(cta ? { cta } : {}),
    }

    try {
      const result = await send.mutateAsync(payload)
      /* "Đã xếp hàng", và con số là của MÁY CHỦ — điều 1 và điều 3 của docblock
         đầu file. `skipped` trả lời luôn câu "sao tôi chọn 40 mà chỉ có 37"
         trước khi ai kịp hỏi. */
      toast(`Đã xếp hàng ${result.queued} thư`, {
        tone: 'success',
        detail: [
          result.skipped > 0 ? `${result.skipped} lượt chọn không thành thư` : null,
          'Thư rời máy sau vài chục giây — theo dõi ở timeline của từng lead.',
        ]
          .filter(Boolean)
          .join(' · '),
      })
      onQueued()
      onClose()
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : 'Không xếp hàng được lượt gửi này.')
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Quick MAS"
      subtitle="Chọn người nhận, soạn nội dung, kiểm tra — rồi mới xếp hàng gửi."
      meta={
        <Badge tone={preflight?.blocked ? 'warning' : preflight ? 'success' : 'draft'}>
          {preflight ? `${preflight.sendable} gửi được` : `${selectedLeads.length} đã chọn`}
        </Badge>
      }
      footer={
        <div className="flex flex-col gap-3">
          {(failure || blocker) && (
            <span className="text-warning text-[11.5px] leading-[1.5]">{failure || blocker}</span>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
              {preflight
                ? `${preflight.sendable} gửi được · ${preflight.blocked} bị chặn · ${preflight.hidden} bị ẩn theo quyền`
                : 'Kiểm tra danh sách trước khi xếp hàng gửi.'}
            </span>
            <div className="flex shrink-0 gap-2">
              <Button size="md" variant="ghost" type="button" onClick={onClose}>
                <Icon icon={X} size={16} />
                Huỷ
              </Button>
              {preflight ? (
                <Button
                  size="md"
                  type="submit"
                  form="mas-mail-form"
                  disabled={Boolean(blocker) || preflight.sendable === 0 || send.isPending}
                >
                  <Icon icon={Send} size={16} />
                  {send.isPending ? 'Đang xếp hàng…' : `Xếp hàng ${preflight.sendable} thư`}
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
        </div>
      }
    >
      <form id="mas-mail-form" onSubmit={submit} noValidate className="flex flex-col gap-6">
        {/* ── Người nhận ────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <div>
            <Kicker>Người nhận</Kicker>
            <p className="text-muted-foreground mt-1 text-[11.5px] leading-[1.5]">
              Tìm trong sổ lead thật. Bỏ được từng người nếu chọn nhầm.
            </p>
          </div>

          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Tìm account, người liên hệ, email hoặc mã lead…"
          />

          <div className="grid max-h-[240px] gap-2 overflow-y-auto sm:grid-cols-2">
            {candidates.map((lead) => {
              const on = selected.has(lead.code)
              return (
                <button
                  key={lead.code}
                  type="button"
                  onClick={() => toggleRecipient(lead)}
                  aria-pressed={on}
                  className={`motion-std flex min-w-0 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left ${
                    on ? 'bg-accent' : 'hover:bg-white/8 bg-white/5'
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[12.5px] font-semibold">{lead.company}</span>
                    <span className="text-muted-foreground truncate text-[11px]">
                      {lead.contactName} · {lead.email}
                    </span>
                  </span>
                  <Icon icon={on ? Check : Plus} size={16} />
                </button>
              )
            })}
            {candidates.length === 0 && (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Không có lead nào khớp ô tìm.
              </p>
            )}
          </div>

          {selectedLeads.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {selectedLeads.map((lead) => (
                <button
                  key={lead.code}
                  type="button"
                  onClick={() => toggleRecipient(lead)}
                  title={`Bỏ ${lead.company} khỏi lô`}
                  className="motion-std bg-accent flex items-center gap-2 rounded-sm px-2 py-1 text-[11px]"
                >
                  {lead.company}
                  <Icon icon={X} size={14} />
                </button>
              ))}
            </div>
          )}

          {preflight && <PreflightReport report={preflight} />}
        </section>

        {/* ── Nội dung ──────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <Kicker>Nội dung</Kicker>

          <Field label="Mẫu mail">
            <Select
              label="Mẫu mail"
              hideLabel
              value={template}
              neutralValue={NO_TEMPLATE}
              onChange={applyTemplate}
              className="w-full"
              options={[
                { value: NO_TEMPLATE, label: 'Không dùng mẫu — soạn tay' },
                ...templates.map((t) => ({ value: t.code, label: t.name })),
              ]}
            />
            {templates.length === 0 && (
              <span className="text-muted-foreground text-[11px] leading-[1.5]">
                Chưa có mẫu nào đang bật — soạn tay vẫn gửi được bình thường.
              </span>
            )}
          </Field>

          {slots.length > 0 && (
            <p className="text-warning rounded-sm bg-white/5 px-3 py-2 text-[11.5px] leading-[1.6]">
              <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
              Nội dung còn {slots.length} chỗ trống của mẫu khung: {slots.join(' · ')}. Điền hết
              trước khi gửi — nút khoá cho tới lúc đó.
            </p>
          )}

          <Field label="Tên lô" hint="Sổ lô gửi hiện tên này. Không phải tiêu đề thư.">
            <Input
              value={runLabel}
              placeholder="Giới thiệu chip AI biên · đợt tháng 8"
              onChange={(e) => setRunLabel(e.target.value)}
            />
          </Field>

          <Field
            label="Tiêu đề"
            hint="Phần lớn hòm thư cắt tiêu đề quanh 70 ký tự — dài hơn là viết cho không ai."
          >
            <Input
              value={subject}
              placeholder="Tiêu đề thư"
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>

          <Field
            label="Nội dung"
            hint="Dòng trống ngăn đoạn. Dùng {{contact_name}} và {{account}} để chào đúng từng người và công ty."
          >
            <Textarea
              autoGrow
              rows={10}
              value={body}
              placeholder="Nội dung thư"
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>

          <Field label="Nút trong thư" hint="Bỏ trống cả hai ô nếu thư không có nút.">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={cta?.label ?? ''}
                placeholder="Nhãn nút"
                className="sm:w-1/3"
                onChange={(e) => setCta(ctaWith(cta, { label: e.target.value }))}
              />
              <Input
                value={cta?.url ?? ''}
                placeholder="https://…"
                className="sm:flex-1"
                onChange={(e) => setCta(ctaWith(cta, { url: e.target.value }))}
              />
            </div>
          </Field>
        </section>

        {/* ── Xem trước ─────────────────────────────────────────────────── */}
        {previewLead && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Kicker>
                <Icon icon={Eye} size={14} className="mr-2 inline align-middle" />
                Xem trước · {previewLead.company}
              </Kicker>
              {selectedLeads.length > 1 && (
                <Select
                  label="Xem trước theo lead"
                  hideLabel
                  size="sm"
                  value={previewLead.code}
                  onChange={setPreviewCode}
                  options={selectedLeads.map((l) => ({ value: l.code, label: l.company }))}
                />
              )}
            </div>

            <GlassCard variant="b" className="flex flex-col gap-3 p-4">
              <span className="text-[12.5px] font-semibold">
                {renderFor(subject, previewLead) || '—'}
              </span>
              <p className="text-glass-foreground whitespace-pre-wrap text-[12px] leading-[1.7]">
                {renderFor(body, previewLead) || '—'}
              </p>
              {cta?.label && cta.url && (
                <span className="text-[12px]">
                  {cta.label} → <span className="font-mono text-[11px]">{cta.url}</span>
                </span>
              )}
            </GlassCard>

            <p className="text-warning text-[11.5px] leading-[1.6]">
              <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
              Thư đi ra ngoài công ty và KHÔNG rút lại được. Bấm xong là thư vào hàng đợi, worker
              quét sau vài chục giây.
            </p>
          </section>
        )}
      </form>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------

/** Kết quả chạy thử — BA con số, không phải hai.
 *
 *  Con số thứ ba (`hidden`) đếm những lượt chọn máy chủ không trả về dòng nào:
 *  mã không có lead nào, hoặc lead của người khác mà trục phạm vi đã cắt ngay
 *  trong SQL. Không in nó ra thì `sendable + blocked` nhỏ hơn số người vừa
 *  chọn, và không có gì trên màn giải thích phần chênh. */
function PreflightReport({ report }: { report: MasPreflightResponse }) {
  const blocked = report.recipients.filter((r) => r.block)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <MetaPill tone="accent">{report.sendable} gửi được</MetaPill>
        {report.blocked > 0 && <MetaPill tone="warning">{report.blocked} bị chặn</MetaPill>}
        {report.hidden > 0 && (
          <MetaPill tone="warning">{report.hidden} bị ẩn theo quyền của bạn</MetaPill>
        )}
      </div>

      {report.apolloCount > 0 && (
        <p className="text-warning rounded-sm bg-white/5 px-3 py-2 text-[11.5px] leading-[1.6]">
          {report.apolloCount} lead trong lô này đến từ Apollo — dữ liệu liên hệ MUA VỀ. Chính sách
          của Resend cấm gửi cho danh sách mua, và trần của họ là bounce 4% · phàn nàn 0,08%, tính ở
          mức TÀI KHOẢN: vượt là khoá cả đường mail giao dịch chứ không riêng đường chiến dịch. Chỉ
          gửi nếu bạn biết chắc từng địa chỉ này đã đồng ý nhận.
        </p>
      )}

      {blocked.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {blocked.map((r) => (
            <li
              key={r.leadCode}
              className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-white/5 px-3 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px]">{r.company}</span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {r.contactName}
                  {r.email ? ` · ${r.email}` : ''}
                </span>
              </span>
              <Badge tone="warning">{MAS_RECIPIENT_BLOCK_LABEL[r.block!]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Sửa một nửa của cặp CTA và giữ nửa kia.
 *
 *  Cặp này là "cả hai hoặc không cái nào" ở CẢ hai đầu — `mail_run_cta_pair`
 *  chặn ở bảng, `MailCta` chặn ở cổng zod — nên state phải diễn tả được lúc
 *  người dùng đang gõ dở một nửa. Hai ô rỗng thì trả `undefined`: một CTA rỗng
 *  gửi lên sẽ chết ở cổng zod với một câu lỗi về một cái nút mà người gửi
 *  tưởng mình đã bỏ trống. */
function ctaWith(
  current: MailTemplateRow['cta'],
  patch: { label?: string; url?: string },
): MailTemplateRow['cta'] {
  const next = { label: patch.label ?? current?.label ?? '', url: patch.url ?? current?.url ?? '' }
  return next.label === '' && next.url === '' ? undefined : next
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-[11px] leading-[1.5]">{hint}</span>}
    </label>
  )
}
