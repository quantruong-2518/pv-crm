import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Plus, Send, Trash2, TriangleAlert, UserPlus } from 'lucide-react'
import {
  AiAction,
  ApprovalChain,
  Avatar,
  Badge,
  Button,
  ChannelTag,
  GlassCard,
  Icon,
  Input,
  RichText,
  RichTextView,
  SectionTitle,
  cn,
} from '@pv/ui'
import { DAS_VINA_FROZEN_AT, HEAD_OF_SALES, dasVina } from '@pv/engines/fixtures/das-vina'
import { dm } from '@/lib/date'
import { DRAFT_TEMPLATE, type DraftWave, type SourceRow } from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import {
  CHANNELS,
  KIND_ICON,
  KIND_LABEL,
  ROLE_OF,
  draftHtml,
  nextWave,
  sendsViaE4,
  type CampaignDraft,
} from './campaign-model'

/** Module 1 · các KHỐI GIAO DIỆN dùng chung của hai màn.
 *
 *  Form ở ĐÂY chứ không ở một trong hai màn, vì cả hai đều mở nó: sổ nguồn mở
 *  để TẠO, hồ sơ nguồn mở để SỬA. Đúng một form cho cả hai việc là luật của
 *  module (docs · mục 1.6) — chép thành hai bản là hai bản sẽ lệch nhau.
 *
 *  Hằng số và phép dựng bản nháp nằm ở `campaign-model.ts`, không ở đây. */

/** Cố tình không làm — ba thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở lại trên màn (không phải trong comment) vì cả ba là câu người xem
 *  hỏi ngay trong buổi demo đầu tiên: "lead đâu", "sao không gửi luôn được",
 *  "sao không có biểu đồ". Trả lời một lần trên màn rẻ hơn trả lời mười lần.
 *
 *  Không dùng `GlassCard`: khối này nằm trong cột phải của hồ sơ nguồn, thêm
 *  một mặt kính nữa là thêm một lớp nền (luật 12). */
export function NotDoing() {
  const items = [
    {
      title: 'Không có bảng lead trên màn này',
      body: 'Lead thuộc module 2. Cùng một dòng lead mà thao tác được ở hai màn thì không màn nào là nơi đúng để tra. Ở đây còn đúng một con số "đã qua cổng" và một lối sang Sổ lead.',
    },
    {
      title: 'Không có nút "Gửi ngay"',
      body: 'Nút cuối của form là gửi duyệt. Chuỗi duyệt do hệ giữ, và không đợt nào bung ra trước khi có người gật.',
    },
    {
      title: 'Không vẽ đường theo thời gian',
      body: `Kịch bản là một lát cắt đóng băng ${dm(DAS_VINA_FROZEN_AT)}. Dựng trục tháng-quý là phải đẻ số không ai ký.`,
    },
  ]

  return (
    <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
      <h3 className="text-[12.5px] font-semibold">Cố tình không làm</h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-1">
            <b className="text-[11.5px] font-semibold">{it.title}</b>
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{it.body}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Nhãn của một ô nhập. Ô bắt buộc mang dấu sao màu cảnh báo ngay cạnh nhãn —
 *  người soạn thấy trước khi gõ, không phải sau khi bấm gửi.
 *
 *  Dấu sao là `aria-hidden`: mọi chữ trong thẻ label chui vào TÊN của ô nhập,
 *  nên để nguyên thì trình đọc màn hình đọc ô kia là "Tên sao". Việc "ô này bắt
 *  buộc" nói bằng `aria-required` trên chính ô nhập, đúng chỗ của nó. */
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          {label}
          {required ? (
            <span className="text-warning" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </span>
        {children}
      </label>
      {hint ? (
        <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{hint}</span>
      ) : null}
    </div>
  )
}

/** Nhãn cho một CỤM NÚT (loại, kênh). Không bọc `<label>`: một nhãn trỏ vào
 *  nhiều nút thì trình đọc màn hình đọc sai cái nào đang được chọn.
 *
 *  Có `id` để cụm nút bên dưới nối vào bằng `role="group" aria-labelledby`. Thiếu
 *  dây nối đó thì nhãn chỉ là một chữ đứng cạnh, và bảy nút kênh của ba đợt đọc
 *  ra y hệt nhau. */
function GroupLabel({
  id,
  children,
  required,
}: {
  id?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <span id={id} className="text-muted-foreground text-[11px]">
      {children}
      {required ? (
        <span className="text-warning" aria-hidden="true">
          {' '}
          *
        </span>
      ) : null}
    </span>
  )
}

/** Tạo và SỬA chiến dịch dùng chung một form (docs · mục 1.6) — dàn ngang, ba
 *  section, tự cuộn bên trong.
 *
 *  Không đợt nào tự gửi. Nút cuối cùng là "gửi duyệt", không phải "gửi ngay":
 *  E3 giữ chuỗi duyệt, E5 chỉ bung đợt sau khi có người gật.
 *
 *  GỬI XONG LÀ KHOÁ. Trước đây bấm gửi rồi vẫn gõ tiếp được, sửa đợt được, thêm
 *  người duyệt được — mà không còn nút gửi lại, nên mọi sửa đổi sau đó rơi vào
 *  hư không. Giờ ô nhập thành chỉ đọc và lối ra đổi tên thành "Về sổ nguồn". */
export function CampaignForm({
  mode,
  code,
  initial,
  seededWave,
  sources,
  onCancel,
}: {
  mode: 'create' | 'edit'
  code?: string
  initial: CampaignDraft
  /** Form mở bằng nút "Thêm đợt vào chuỗi": đợt cuối là đợt vừa thêm. */
  seededWave: boolean
  sources: SourceRow[]
  onCancel: () => void
}) {
  const uid = useId()
  const [draft, setDraft] = useState<CampaignDraft>(initial)
  /* Chuỗi duyệt mở đầu bằng đúng một mắt xích — TP Kinh doanh, và đó là mắt xích
     KHÔNG BỎ ĐƯỢC (docs: "Người gật vẫn là TP Kinh doanh"). Người thêm vào chỉ
     nối phía sau. */
  const [approvers, setApprovers] = useState<string[]>([HEAD_OF_SALES])
  const [picking, setPicking] = useState(false)
  const [stopOnReply, setStopOnReply] = useState(true)
  const [drafted, setDrafted] = useState(false)
  const [sent, setSent] = useState(false)
  const [askCancel, setAskCancel] = useState(false)

  /* Luật 13 · đổi chế độ là thay nguyên cây con, nút vừa bấm biến mất và focus
     rơi về `<body>`. Đưa nó lên tiêu đề form. */
  const headRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    headRef.current?.focus()
  }, [])

  /* "Thêm đợt" thả người dùng ở đầu Section 1 trong khi thẻ đợt mới nằm cuối
     Section 2, trong một lưới 2–3 cột. Cuộn tới và đặt focus vào chính thẻ đó. */
  const waveRefs = useRef<(HTMLDivElement | null)[]>([])
  const [focusWave, setFocusWave] = useState<number | null>(
    seededWave ? initial.waves.length - 1 : null,
  )

  useEffect(() => {
    if (focusWave === null) return
    const el = waveRefs.current[focusWave]
    setFocusWave(null)
    if (!el) return
    el.scrollIntoView?.({ block: 'center' })
    el.focus()
  }, [focusWave])

  /* Căn cứ của khối AI phải là số THẬT trong kịch bản, không phải câu nói suông:
     lấy đúng đợt đã ra nhiều lead nhất trong kỳ làm mẫu mở lời. */
  const best = useMemo(() => {
    const all = sources.flatMap((s) => s.waves.map((w) => ({ code: s.code, ...w })))
    return [...all].sort((a, b) => b.leads - a.leads)[0]
  }, [sources])

  const setWave = (i: number, patch: Partial<DraftWave>) =>
    setDraft((d) => ({ ...d, waves: d.waves.map((w, j) => (j === i ? { ...w, ...patch } : w)) }))

  const addWave = () => {
    const at = draft.waves.length
    setDraft((d) => ({ ...d, waves: [...d.waves, nextWave(d.waves)] }))
    setFocusWave(at)
  }

  const digits = (v: string) => Number(v.replace(/\D/g, '') || '0')

  /* Bốn con số dưới cộng từ BẢN NHÁP người dùng vừa gõ, không phải từ fixture —
     tầng data không có hàm nào cộng hộ một chiến dịch chưa tồn tại. */
  const expected = draft.waves.reduce((n, w) => n + w.expected, 0)
  const spread = draft.waves.reduce((n, w) => Math.max(n, w.afterDays), 0)
  const byE4 = draft.waves.filter((w) => sendsViaE4(w.channel)).length
  const manual = draft.waves.length - byE4

  /* Ô khán giả xoá trắng được. Không in "0 người nhận" cho ô trắng — số 0 ở đây
     đọc thành "gửi cho không ai", mà thật ra là chưa ai đặt số. */
  const audienceText =
    draft.audience === '' ? 'chưa đặt số người nhận' : `${draft.audience} người nhận`

  const stopText = stopOnReply
    ? 'khách trả lời thì ngưng nhắc'
    : 'chuỗi chạy hết kể cả khi khách đã trả lời'

  /* Nói RÕ còn thiếu gì, không để một cái nút xám câm. Chuỗi duyệt không có mặt
     trong danh sách này: TP Kinh doanh là mắt xích ghim, chuỗi không rỗng được. */
  const missing = [
    draft.name.trim() === '' ? 'tên' : null,
    draft.waves.length === 0 ? 'ít nhất một đợt' : null,
    draft.kind === 'su-kien' && draft.venue.trim() === '' ? 'địa điểm của sự kiện' : null,
  ].filter((x): x is string => x !== null)
  const ready = missing.length === 0

  const firstApprover = approvers[0] ?? HEAD_OF_SALES
  const candidates = dasVina.actors.filter((a) => !approvers.includes(a.name))

  /** Số đợt CHÉP TỪ NGUỒN. Đợt vừa thêm trong phiên này không nằm trong đó —
   *  câu "kịch bản không lưu nội dung" chỉ đúng với đợt cũ. */
  const copiedWaves = mode === 'edit' ? initial.waves.length - (seededWave ? 1 : 0) : 0

  /* Nháp đã đụng vào chưa. Bấm "Huỷ" lúc nháp còn nguyên thì đi thẳng; đụng rồi
     thì hỏi lại ngay tại chỗ — không `window.confirm`, hộp thoại của trình duyệt
     không có mặt kính nào và không nằm trong hệ thiết kế. */
  const untouched =
    JSON.stringify(draft) === JSON.stringify(initial) && approvers.length === 1 && stopOnReply

  const statusId = `${uid}-status`
  const kindId = `${uid}-kind`
  const approverId = `${uid}-approver`
  const stopId = `${uid}-stop`

  return (
    <GlassCard className="flex flex-col gap-5 p-5 lg:min-h-0 lg:flex-1 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div ref={headRef} tabIndex={-1} className="min-w-0 outline-none">
          <SectionTitle
            size="lg"
            kicker={mode === 'edit' ? 'Sửa chiến dịch' : 'Tạo mới'}
            hint={
              mode === 'edit'
                ? 'Sửa dùng đúng màn tạo, không có màn thứ hai. Ô có dấu sao là bắt buộc.'
                : 'Ô có dấu sao là bắt buộc. Chuỗi đợt và kỳ vọng đặt ngay ở đây, không đợi chạy xong mới ghi.'
            }
          >
            {mode === 'edit' ? `Sửa ${code}` : 'Chiến dịch mới'}
          </SectionTitle>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {askCancel ? (
            <>
              <span className="text-warning text-[11.5px] leading-[1.5]">
                Bỏ bản nháp đang soạn?
              </span>
              <Button size="md" variant="destructive" onClick={onCancel}>
                Bỏ nháp
              </Button>
              <Button size="md" variant="ghost" onClick={() => setAskCancel(false)}>
                Soạn tiếp
              </Button>
            </>
          ) : (
            <Button
              size="md"
              variant="ghost"
              onClick={() => (sent || untouched ? onCancel() : setAskCancel(true))}
            >
              {sent ? 'Về sổ nguồn' : 'Huỷ'}
            </Button>
          )}

          {sent ? (
            <Badge tone="running">Đã gửi · chờ {firstApprover} gật</Badge>
          ) : (
            <Button
              size="md"
              disabled={!ready}
              aria-describedby={statusId}
              onClick={() => {
                setSent(true)
                setAskCancel(false)
                /* Nối E3 khi có backend: `submit` một yêu cầu loại 'chiến-dịch'
                   với chuỗi duyệt đúng bằng `approvers`, và `stopOnReply` đi kèm
                   kế hoạch xuống E5. */
              }}
            >
              <Icon icon={Send} size={16} />
              Gửi {firstApprover} duyệt
            </Button>
          )}
        </div>
      </div>

      {/* MỘT thẻ `<p>` cho cả ba trạng thái, không ba thẻ thay nhau: vùng
          `aria-live` phải có mặt sẵn trong DOM trước khi chữ đổi, nếu không
          trình đọc màn hình chẳng đọc gì cả. Nút gửi `disabled` nên không nhận
          được focus — `aria-describedby` là đường duy nhất còn lại để người dùng
          bàn phím nghe được lý do nút xám.

          Nhánh "còn thiếu" tô `text-warning`: đây là câu DUY NHẤT giải thích vì
          sao nút bị chặn, để nó ở màu mờ nhất màn là chôn đúng thứ cần đọc. */}
      <p
        id={statusId}
        aria-live="polite"
        className={cn(
          'text-[11.5px] leading-[1.5]',
          !sent && !ready ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {sent
          ? `Chưa có màn Hộp duyệt — yêu cầu sẽ vào hệ duyệt khi có backend. Chưa gật thì không đợt nào được bung và không lệnh gửi nào được phát. Kịch bản đóng băng không nhận chiến dịch mới: dòng này chưa lên bảng nguồn.`
          : ready
            ? `${draft.waves.length} đợt · ${audienceText} · kỳ vọng ${expected} lead · hệ gửi được ${byE4} đợt, ${manual} đợt phải tự đăng · ${stopText}. Không đợt nào tự gửi trước khi có người gật.`
            : `Chưa gửi duyệt được — còn thiếu ${missing.join(' · ')}.`}
      </p>

      <div className="flex flex-col gap-8 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <section className="flex flex-col gap-4">
          <SectionTitle size="lg" kicker="Bước 1">
            Thông tin chung
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Tên" required>
              <Input
                value={draft.name}
                aria-required
                readOnly={sent}
                /* Gợi ý lấy tên nguồn mẫu, không chép nguyên văn một nhãn vào
                   code: "Ví dụ" ở đầu để không ai đọc thành tên có thật. */
                placeholder={`Ví dụ ${DRAFT_TEMPLATE.name}`}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <GroupLabel id={kindId} required>
                Loại
              </GroupLabel>
              <div role="group" aria-labelledby={kindId} className="flex flex-wrap gap-2">
                {(['chien-dich', 'su-kien'] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    disabled={sent}
                    variant={draft.kind === k ? 'default' : 'ghost'}
                    onClick={() => setDraft((d) => ({ ...d, kind: k }))}
                  >
                    <Icon icon={KIND_ICON[k]} size={16} />
                    {KIND_LABEL[k]}
                  </Button>
                ))}
              </div>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Sự kiện là buổi có mặt người thật — có chỗ, có đăng ký, có người điểm danh. Cả hai
                đo bằng cùng một câu hỏi: đợt này ra bao nhiêu khách.
              </span>
            </div>

            {draft.kind === 'su-kien' ? (
              <Field label="Địa điểm" required>
                <Input
                  value={draft.venue}
                  aria-required
                  readOnly={sent}
                  placeholder={`Ví dụ ${DRAFT_TEMPLATE.venue}`}
                  onChange={(e) => setDraft((d) => ({ ...d, venue: e.target.value }))}
                />
              </Field>
            ) : null}

            <Field
              label="Khán giả · số người nhận"
              hint={`Mở sẵn bằng số người nhận của đợt mở màn ${DRAFT_TEMPLATE.fromCode} — điểm xuất phát để sửa, không phải số đo của chiến dịch này.`}
            >
              <Input
                value={draft.audience}
                inputMode="numeric"
                readOnly={sent}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, audience: e.target.value.replace(/\D/g, '') }))
                }
              />
            </Field>

            <div className="flex flex-col gap-2">
              <GroupLabel>Chạy trong bao nhiêu ngày</GroupLabel>
              <span className="tnum font-num text-[26px] font-semibold leading-none">{spread}</span>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Suy từ nhịp các đợt — từ đợt mở màn tới đợt cuối. Đây là số ĐỌC, không phải ô nhập:
                một ô "chạy bao nhiêu ngày" gõ tay sẽ chọi với chính chuỗi đợt ngay dưới nó.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <GroupLabel>Kỳ vọng lead cả chiến dịch</GroupLabel>
              <span className="tnum font-num text-[26px] font-semibold leading-none">
                {expected}
              </span>
              <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Cộng từ kỳ vọng của các đợt, không gõ thẳng. Đặt kỳ vọng ở từng đợt là cách duy nhất
                sau này chấm được đợt nào đạt, đợt nào hụt.
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker="Bước 2"
            hint="Mỗi đợt một nội dung riêng. Nhịp tính bằng số ngày kể từ đợt mở màn."
          >
            Kế hoạch từng đợt
          </SectionTitle>

          {mode === 'edit' ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Kịch bản không lưu nội dung đã soạn — ô nội dung của các đợt cũ để trống. Dựng lại một
              bài chưa từng có thì màn đang bịa.
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {draft.waves.map((w, i) => {
              const titleId = `${uid}-wave-${i}`
              const channelId = `${uid}-wave-${i}-channel`
              const contentId = `${uid}-wave-${i}-content`
              return (
                /* Mỗi thẻ là một NHÓM có tên. Ba đợt thì màn có 3 ô "Tên đợt",
                   3 ô "Sau bao nhiêu ngày", 3 nút "Bỏ" và 21 nút kênh trùng tên
                   nhau — không có nhóm thì trình đọc màn hình không nói được nút
                   nào thuộc đợt nào. */
                <div
                  key={i}
                  role="group"
                  aria-labelledby={titleId}
                  tabIndex={-1}
                  ref={(el) => {
                    waveRefs.current[i] = el
                  }}
                  className="flex flex-col gap-3 rounded-md bg-white/5 p-4 outline-none"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span id={titleId} className="text-[11.5px] font-semibold">
                      Đợt {i + 1}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={sent}
                      aria-label={`Bỏ đợt ${i + 1}`}
                      onClick={() =>
                        setDraft((d) => ({ ...d, waves: d.waves.filter((_, j) => j !== i) }))
                      }
                    >
                      <Icon icon={Trash2} size={16} />
                      Bỏ
                    </Button>
                  </div>

                  <Field label="Tên đợt" required>
                    <Input
                      value={w.label}
                      aria-required
                      readOnly={sent}
                      onChange={(e) => setWave(i, { label: e.target.value })}
                    />
                  </Field>

                  <div className="flex flex-col gap-2">
                    <GroupLabel id={channelId} required>
                      Kênh
                    </GroupLabel>
                    {/* Đây là thao tác CHÍNH của Bước 2, và ở iPad dọc 768px nó
                        được bấm bằng ngón tay — `<button>` trần bọc một tag
                        11px chỉ cao 24px. `min-h-8` đưa nó về đúng cỡ nút `sm`
                        của cả màn (luật 13). */}
                    <div role="group" aria-labelledby={channelId} className="flex flex-wrap gap-1">
                      {CHANNELS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={sent}
                          aria-pressed={w.channel === c}
                          onClick={() => setWave(i, { channel: c })}
                          className="motion-std flex min-h-8 items-center rounded-md px-1"
                        >
                          <ChannelTag
                            icon={CHANNEL_ICON[c]}
                            label={CHANNEL_LABEL[c]}
                            tone={
                              w.channel === c ? 'accent' : sendsViaE4(c) ? 'default' : 'warning'
                            }
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nói thẳng đợt này ai gửi. Chọn được kênh ngoài — kịch bản
                      có thật hai đợt như thế, LinkedIn và Facebook — nhưng màn
                      không giả vờ rằng bấm nút là bài lên. */}
                  {sendsViaE4(w.channel) ? (
                    <span className="text-muted-foreground flex items-start gap-2 text-[11px] leading-[1.5]">
                      <Icon icon={Send} size={16} />
                      Hệ gửi đợt này · nhật ký gửi và luật chống trùng người nhận do hệ giữ
                    </span>
                  ) : (
                    <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
                      <Icon icon={TriangleAlert} size={16} />
                      Hệ chưa nối đường gửi cho {CHANNEL_LABEL[w.channel]} — hệ giữ lịch và nhắc,
                      người tự đăng bài rồi nhập số về.
                    </span>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Sau bao nhiêu ngày">
                      <Input
                        value={String(w.afterDays)}
                        inputMode="numeric"
                        readOnly={sent}
                        onChange={(e) => setWave(i, { afterDays: digits(e.target.value) })}
                      />
                    </Field>
                    <Field label="Kỳ vọng bao nhiêu lead" required>
                      <Input
                        value={String(w.expected)}
                        inputMode="numeric"
                        aria-required
                        readOnly={sent}
                        onChange={(e) => setWave(i, { expected: digits(e.target.value) })}
                      />
                    </Field>
                  </div>

                  <div className="flex flex-col gap-2">
                    <GroupLabel id={contentId}>Nội dung đợt {i + 1}</GroupLabel>
                    {sent ? (
                      <div className="bg-input rounded-md p-3">
                        <RichTextView html={w.content} />
                      </div>
                    ) : (
                      <RichText
                        value={w.content}
                        onChange={(html) => setWave(i, { content: html })}
                        label={`Nội dung đợt ${i + 1}`}
                        placeholder="Soạn nội dung đợt này — chèn được ảnh, sửa được HTML thô."
                      />
                    )}
                    {/* Câu này đã có một lần ở đầu Section 2, nhưng người dùng
                        cuộn tới thẻ đợt thứ ba chỉ thấy một ô soạn trống — lặp
                        lại đúng chỗ họ đang nhìn. */}
                    {i < copiedWaves && w.content.trim() === '' ? (
                      <span className="text-muted-foreground text-[11px] leading-[1.5]">
                        Kịch bản không lưu nội dung đã soạn — ô này để trống là đúng.
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}

            <button
              type="button"
              disabled={sent}
              onClick={addWave}
              className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-md bg-white/5 p-4 text-[12.5px] font-semibold"
            >
              <Icon icon={Plus} size={20} />
              Thêm đợt
            </button>
          </div>

          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            Chuỗi {draft.waves.length} đợt · trải {spread} ngày · kỳ vọng {expected} lead.
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker="Bước 3"
            hint="Chuỗi duyệt và điều kiện dừng do hệ giữ. Màn chỉ soạn ra hai thứ đó."
          >
            Duyệt &amp; điều kiện dừng
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <GroupLabel id={approverId} required>
                Người duyệt
              </GroupLabel>

              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {approvers.map((name) => (
                  <li key={name} className="flex items-center gap-2">
                    <Avatar name={name} size="sm" />
                    <span className="min-w-0 flex-1 text-[11.5px]">
                      <b className="font-semibold">{name}</b>
                      <span className="text-muted-foreground"> · {ROLE_OF.get(name)}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      /* TP Kinh doanh là mắt xích ghim. Chỉ chặn "người cuối
                         cùng" thì thêm một Sale rồi bỏ TP là hợp lệ, và nút gửi
                         đọc thành "Gửi Đỗ Quang Huy duyệt" — trái docs. */
                      disabled={sent || name === HEAD_OF_SALES}
                      aria-label={`Bỏ ${name} khỏi chuỗi duyệt`}
                      onClick={() => setApprovers((prev) => prev.filter((n) => n !== name))}
                    >
                      <Icon icon={Trash2} size={16} />
                      Bỏ khỏi chuỗi duyệt
                    </Button>
                  </li>
                ))}
              </ul>

              {candidates.length === 0 ? (
                <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Cả phòng đã ở trong chuỗi — không còn ai để thêm.
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={picking ? 'default' : 'ghost'}
                  className="self-start"
                  disabled={sent}
                  onClick={() => setPicking((v) => !v)}
                >
                  <Icon icon={UserPlus} size={16} />
                  Thêm người duyệt
                </Button>
              )}

              {picking && candidates.length > 0 ? (
                <div role="group" aria-labelledby={approverId} className="flex flex-wrap gap-2">
                  {candidates.map((a) => (
                    <Button
                      key={a.id}
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setApprovers((prev) => [...prev, a.name])
                        setPicking(false)
                      }}
                    >
                      {a.name}
                    </Button>
                  ))}
                </div>
              ) : null}

              <ApprovalChain
                steps={approvers.map((name, i) => ({
                  label: name,
                  state: i === 0 ? 'current' : 'next',
                }))}
              />

              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chuỗi đi từ trái sang phải, người đầu tiên nhận trước. {HEAD_OF_SALES} là mắt xích
                không bỏ được — người gật cuối cùng vẫn là TP Kinh doanh; người thêm vào chỉ nối
                phía sau.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md bg-white/5 p-4">
                <GroupLabel id={stopId}>Điều kiện dừng</GroupLabel>
                <div role="group" aria-labelledby={stopId} className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={stopOnReply ? 'default' : 'ghost'}
                    disabled={sent}
                    aria-pressed={stopOnReply}
                    onClick={() => {
                      setStopOnReply((v) => !v)
                      /* Nối E5 khi có backend: điều kiện dừng đi CÙNG kế hoạch
                         chiến dịch xuống E5, không phải một quy tắc rời của E4 —
                         E4 chỉ biết "gửi hay không gửi", nó không biết chuỗi này
                         còn mấy đợt nữa. */
                    }}
                  >
                    Khách trả lời thì ngưng nhắc
                  </Button>
                </div>
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Điều kiện dừng do hệ giữ, và nó đi kèm bản gửi duyệt — câu tóm tắt ngay trên nút
                  gửi nói rõ chuỗi này dừng theo cách nào. Chống trùng người nhận cũng do hệ giữ:
                  một người nằm trong hai chiến dịch không bị gửi hai lần trong cùng cửa sổ.
                </p>
              </div>

              {sent ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Đã gửi duyệt — trợ lý không soạn thêm vào bản đã gửi.
                </p>
              ) : (
                <>
                  <AiAction
                    variant="panel"
                    suggestion={`Soạn nội dung cho ${draft.waves.length} đợt, mở lời bằng thứ đợt ra nhiều lead nhất đã dùng.`}
                    basis={
                      best
                        ? `Đợt ${best.no} của ${best.code} · gửi ${best.sent}, trả lời ${best.replied}, ra ${best.leads} lead trên kỳ vọng ${best.expected}`
                        : 'Chưa có đợt nào đã chạy trong kỳ'
                    }
                    confirmLabel="Soạn nội dung"
                    done={drafted}
                    onConfirm={() => {
                      /* Đổ nháp vào Ô NỘI DUNG của từng đợt, không in ra một danh
                         sách riêng: người soạn sửa ngay tại chỗ mình sẽ gửi. Đợt nào
                         đã có chữ thì giữ nguyên — trợ lý không đè bài của người. */
                      setDraft((d) => ({
                        ...d,
                        waves: d.waves.map((w) => ({
                          ...w,
                          content: w.content.trim() === '' ? draftHtml(w) : w.content,
                        })),
                      }))
                      setDrafted(true)
                    }}
                  />

                  {drafted ? (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Đã đổ nháp vào {draft.waves.length} đợt — bản nháp chờ người sửa và duyệt,
                      chưa gửi cho ai.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                      Chưa tạo gì cả. Trợ lý không tự soạn và không tự gửi.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </GlassCard>
  )
}
