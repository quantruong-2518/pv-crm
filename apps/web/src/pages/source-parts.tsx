import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarClock, Plus, Save, Send, Trash2, TriangleAlert, UserPlus, Zap } from '@pv/ui'
import {
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
import { DAS_VINA_FROZEN_AT, dasVina } from '@pv/engines/fixtures/das-vina'
import { dm } from '@/lib/date'
import {
  DRAFT_TEMPLATE,
  LEAD_CATEGORIES,
  LEAD_TIERS,
  PROVINCES,
  TODAY,
  groupText,
  membersOf,
  type DraftWave,
  type LeadGroup,
} from '@/data/campaigns'
import { CHANNEL_ICON, CHANNEL_LABEL } from '@/data/sales-config'
import {
  CHANNELS,
  ROLE_OF,
  nextWave,
  sendsViaE4,
  whenText,
  type CampaignDraft,
} from './source-model'

/** Module 1 · các KHỐI GIAO DIỆN dùng chung của hai màn.
 *
 *  Form ở ĐÂY chứ không ở một trong hai màn, vì cả ba lối vào đều mở nó: sổ mở
 *  để TẠO, hồ sơ mở để SỬA và để NHÂN BẢN. Đúng một form cho ba việc — chép
 *  thành hai bản là hai bản sẽ lệch nhau.
 *
 *  Hằng số và phép dựng bản nháp nằm ở `campaign-model.ts`, không ở đây. */

/** Cố tình không làm — hai thứ bị bỏ có chủ ý, kèm lý do.
 *
 *  Khối này ở lại trên màn (không phải trong comment) vì cả hai là câu người xem
 *  hỏi ngay trong buổi demo đầu tiên. Trả lời một lần trên màn rẻ hơn trả lời
 *  mười lần.
 *
 *  Mục "không có nút Gửi ngay" đã BỎ 23/08 — giờ có thật, ở từng đợt. Mục "AI
 *  đề xuất" cũng bỏ vì khối AI không còn trên module này.
 *
 *  Không dùng `GlassCard`: khối này nằm trong cột phải của hồ sơ chiến dịch,
 *  thêm một mặt kính nữa là thêm một lớp nền (luật 12). */
export function NotDoing() {
  const items = [
    {
      title: 'Không có bảng lead trên màn này',
      body: 'Lead thuộc module 2. Cùng một dòng lead mà thao tác được ở hai màn thì không màn nào là nơi đúng để tra. Ở đây còn đúng một con số và một lối sang Sổ lead.',
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

/** Nhãn cho một CỤM NÚT. Không bọc `<label>`: một nhãn trỏ vào nhiều nút thì
 *  trình đọc màn hình đọc sai cái nào đang được chọn.
 *
 *  Có `id` để cụm nút bên dưới nối vào bằng `role="group" aria-labelledby`. */
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

/** Một hàng chip bật/tắt nhiều lựa chọn — ba chiều của nhóm người nhận.
 *
 *  `aria-pressed` chứ không phải `checkbox`: đây là bộ lọc, bật một cái là danh
 *  sách bên dưới đổi ngay. Checkbox hứa hẹn một nút "Áp dụng" ở đâu đó.
 *
 *  `max` GẤP phần đuôi lại. Hàng tỉnh có 21 mục và trải ba dòng — ba dòng chip
 *  xám đọc ra như một bức tường, và hai hàng thật sự đáng chọn (ngành, bậc) bị
 *  đẩy lên trên nó. Tám mục đầu đã phủ phần lớn sổ; mục nào ĐANG BẬT thì luôn
 *  hiện, kể cả khi nó nằm trong phần gấp — nếu không thì mở lại bản nháp là
 *  thấy con số người nhận nói một đằng mà hàng chip nói một nẻo. */
function ChipRow({
  label,
  options,
  picked,
  onToggle,
  disabled,
  max,
}: {
  label: string
  options: { value: string; label: string }[]
  picked: string[]
  onToggle: (value: string) => void
  disabled?: boolean
  max?: number
}) {
  const id = useId()
  const [open, setOpen] = useState(false)

  const folded =
    max === undefined || open
      ? options
      : options.filter((o, i) => i < max || picked.includes(o.value))
  const hidden = options.length - folded.length

  return (
    <div className="flex flex-col gap-2">
      <GroupLabel id={id}>{label}</GroupLabel>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {folded.map((o) => (
          <Button
            key={o.value}
            size="sm"
            disabled={disabled}
            aria-pressed={picked.includes(o.value)}
            variant={picked.includes(o.value) ? 'default' : 'ghost'}
            onClick={() => onToggle(o.value)}
          >
            {o.label}
          </Button>
        ))}
        {hidden > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            + {hidden} {label.toLowerCase()} nữa
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** BƯỚC 1 · gửi cho ai — tên chiến dịch và nhóm người nhận.
 *
 *  Nhóm là một BỘ LỌC trên sổ lead, không phải một tệp tải lên: ba hàng chip,
 *  và con số người nhận đổi ngay dưới tay. Đây là chỗ quyết định người mới có
 *  dùng được màn này hay không — mọi thứ khác chỉ là soạn chữ, còn "gửi nhầm
 *  cho ai" là lỗi duy nhất không rút lại được. */
function StepAudience({
  draft,
  setDraft,
  locked,
}: {
  draft: CampaignDraft
  setDraft: (fn: (d: CampaignDraft) => CampaignDraft) => void
  locked: boolean
}) {
  const members = useMemo(() => membersOf(draft.group), [draft.group])

  const toggle = <K extends keyof LeadGroup>(key: K, value: string) =>
    setDraft((d) => {
      const cur = d.group[key] as string[]
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...d, group: { ...d.group, [key]: next } }
    })

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle size="lg" kicker="Bước 1" hint="Ô có dấu sao là bắt buộc.">
        Gửi cho ai?
      </SectionTitle>

      {/* Ô một dòng KHÔNG kéo hết 1.400px. Một ô nhập rộng bằng cả màn nói với
          người dùng rằng nó chờ một đoạn văn, và mắt phải đi hết bề ngang mới
          biết mình gõ tới đâu. */}
      <div className="max-w-2xl">
        <Field
          label="Tên chiến dịch"
          required
          hint="Tên này hiện trong sổ và trong báo cáo — đặt sao cho ba tháng nữa đọc lại vẫn biết nó là cái gì."
        >
          <Input
            value={draft.name}
            aria-required
            readOnly={locked}
            placeholder={`Ví dụ ${DRAFT_TEMPLATE.name}`}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4 rounded-md bg-white/5 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <GroupLabel required>Nhóm người nhận</GroupLabel>
          {/* Con số phải to và phải đứng ngay trên các hàng chip. Nó là thứ nói
              cho người dùng biết họ đang hiểu bộ lọc đúng hay ngược — một dòng
              giải thích không làm được việc đó. */}
          <span className="flex items-baseline gap-2">
            <span className="tnum font-num text-[26px] font-semibold leading-none">
              {members.length}
            </span>
            <span className="text-muted-foreground text-[11.5px]">người nhận</span>
          </span>
        </div>

        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Không chọn gì ở một hàng nghĩa là hàng đó KHÔNG lọc — không phải loại hết. Đang gửi cho:{' '}
          <b className="text-foreground font-semibold">{groupText(draft.group)}</b>.
        </p>

        <ChipRow
          label="Ngành"
          disabled={locked}
          options={LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          picked={draft.group.categories}
          onToggle={(v) => toggle('categories', v)}
        />
        <ChipRow
          label="Bậc"
          disabled={locked}
          options={LEAD_TIERS.map((t) => ({ value: t.key, label: t.label }))}
          picked={draft.group.tiers}
          onToggle={(v) => toggle('tiers', v)}
        />
        <ChipRow
          label="Tỉnh"
          disabled={locked}
          max={8}
          options={PROVINCES.map((p) => ({ value: p, label: p }))}
          picked={draft.group.provinces}
          onToggle={(v) => toggle('provinces', v)}
        />

        {/* Năm cái tên thật. Một con số đứng một mình không kiểm được; năm dòng
            đầu thì người soạn liếc một cái là biết mình vừa chọn đúng nhóm hay
            vừa chọn nhầm cả sổ. */}
        {members.length === 0 ? (
          <p className="text-warning flex items-start gap-2 text-[11.5px] leading-[1.5]">
            <Icon icon={TriangleAlert} size={16} />
            Không ai khớp ba điều kiện này cùng lúc. Bỏ bớt một hàng chip là danh sách có người trở
            lại.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">
              {members.length <= 5 ? 'Cả nhóm' : '5 người đầu nhóm'}
            </span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {members.slice(0, 5).map((l) => (
                <li key={l.code} className="text-[11.5px]">
                  <b className="font-semibold">{l.company}</b>
                  <span className="text-muted-foreground">
                    {' '}
                    · {l.province} · {LEAD_TIERS.find((t) => t.key === l.tier)?.label ?? l.tier}
                  </span>
                </li>
              ))}
            </ul>
            {members.length > 5 ? (
              <span className="text-muted-foreground text-[11px]">
                còn {members.length - 5} người nữa
              </span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}

/** Một thẻ đợt của Bước 2. Xếp DỌC, mỗi thẻ chiếm cả bề ngang.
 *
 *  Trước 23/08 các thẻ nằm trong lưới 2–3 cột. Cột hẹp ép ô soạn nội dung xuống
 *  chừng 300px — mà nội dung mail mới là việc chính của bước này, và không ai
 *  soạn được một lá thư trong một ô bằng nửa cái danh thiếp. */
function WaveCard({
  index,
  wave,
  locked,
  copied,
  onPatch,
  onDrop,
  cardRef,
}: {
  index: number
  wave: DraftWave
  locked: boolean
  /** Đợt CHÉP TỪ chiến dịch cũ — ô nội dung trống ở đó là đúng, không phải thiếu. */
  copied: boolean
  onPatch: (patch: Partial<DraftWave>) => void
  onDrop: () => void
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const uid = useId()
  const titleId = `${uid}-title`
  const channelId = `${uid}-channel`
  const whenId = `${uid}-when`
  const contentId = `${uid}-content`

  const digits = (v: string) => Number(v.replace(/\D/g, '') || '0')

  return (
    /* Mỗi thẻ là một NHÓM có tên. Ba đợt thì màn có 3 ô "Tên đợt", 3 nút "Bỏ" và
       21 nút kênh trùng tên nhau — không có nhóm thì trình đọc màn hình không
       nói được nút nào thuộc đợt nào. */
    <div
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={cardRef}
      className="flex flex-col gap-4 rounded-md bg-white/5 p-4 outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={titleId} className="text-[12.5px] font-semibold">
          Đợt {index + 1}
        </span>
        <span className="text-muted-foreground text-[11px]">{whenText(wave)}</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={locked}
          aria-label={`Bỏ đợt ${index + 1}`}
          onClick={onDrop}
        >
          <Icon icon={Trash2} size={16} />
          Bỏ
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Tên đợt" required>
          <Input
            value={wave.label}
            aria-required
            readOnly={locked}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <GroupLabel id={channelId} required>
            Kênh bắn
          </GroupLabel>
          {/* Đây là thao tác CHÍNH của Bước 2, và ở iPad dọc 768px nó được bấm
              bằng ngón tay — `<button>` trần bọc một tag 11px chỉ cao 24px.
              `min-h-8` đưa nó về đúng cỡ nút `sm` của cả màn (luật 13). */}
          <div role="group" aria-labelledby={channelId} className="flex flex-wrap gap-1">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked}
                aria-pressed={wave.channel === c}
                onClick={() => onPatch({ channel: c })}
                className="motion-std flex min-h-8 items-center rounded-md px-1"
              >
                <ChannelTag
                  icon={CHANNEL_ICON[c]}
                  label={CHANNEL_LABEL[c]}
                  tone={wave.channel === c ? 'accent' : sendsViaE4(c) ? 'default' : 'warning'}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Nói thẳng đợt này ai gửi. Chọn được kênh ngoài — kịch bản có thật hai
          đợt như thế, LinkedIn và Facebook — nhưng màn không giả vờ rằng bấm nút
          là bài lên. */}
      {sendsViaE4(wave.channel) ? (
        <span className="text-muted-foreground flex items-start gap-2 text-[11px] leading-[1.5]">
          <Icon icon={Send} size={16} />
          Hệ gửi đợt này · nhật ký gửi và luật chống trùng người nhận do hệ giữ
        </span>
      ) : (
        <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
          <Icon icon={TriangleAlert} size={16} />
          Hệ chưa nối đường gửi cho {CHANNEL_LABEL[wave.channel]} — hệ giữ lịch và nhắc, người tự
          đăng bài rồi nhập số về.
        </span>
      )}

      {/* GỬI KHI NÀO — hai lựa chọn, không phải một ô "sau bao nhiêu ngày".
          "Sau 14 ngày" bắt người soạn tự cộng lịch trong đầu và không bao giờ
          nói ra thứ hai ngày mấy. Ở đây chọn xong là đọc được thành ngày. */}
      <div className="flex flex-col gap-2">
        <GroupLabel id={whenId} required>
          Gửi khi nào
        </GroupLabel>
        <div role="group" aria-labelledby={whenId} className="flex flex-wrap items-end gap-3">
          <Button
            size="sm"
            disabled={locked}
            aria-pressed={wave.sendNow}
            variant={wave.sendNow ? 'default' : 'ghost'}
            onClick={() => onPatch({ sendNow: true })}
          >
            <Icon icon={Zap} size={16} />
            Gửi ngay
          </Button>
          <Button
            size="sm"
            disabled={locked}
            aria-pressed={!wave.sendNow}
            variant={!wave.sendNow ? 'default' : 'ghost'}
            onClick={() => onPatch({ sendNow: false })}
          >
            <Icon icon={CalendarClock} size={16} />
            Hẹn ngày
          </Button>

          {/* Ô ngày giờ KHÔNG biến mất khi bấm "Gửi ngay" — nó mờ đi. Biến mất
              thì bấm nhầm một cái là mất ngày vừa gõ, và người mới bấm nhầm
              nhiều. Giá trị vẫn nằm trong bản nháp, bấm lại là thấy. */}
          <div className={cn('flex flex-wrap items-end gap-2', wave.sendNow && 'opacity-40')}>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">Ngày</span>
              <Input
                type="date"
                className="w-[150px]"
                value={wave.dateISO}
                min={TODAY}
                disabled={wave.sendNow}
                readOnly={locked}
                onChange={(e) => onPatch({ dateISO: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">Giờ</span>
              <Input
                type="time"
                className="w-[110px]"
                value={wave.time}
                disabled={wave.sendNow}
                readOnly={locked}
                onChange={(e) => onPatch({ time: e.target.value })}
              />
            </label>
          </div>
        </div>
        {wave.sendNow ? (
          <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
            "Gửi ngay" là ngay khi bạn bấm <b className="text-foreground">Bắt đầu chạy</b> — lưu
            nháp thì chưa có mail nào đi.
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Field
          label="Kỳ vọng bao nhiêu lead"
          hint="Không bắt buộc. Để 0 nghĩa là chưa đặt, và sau này màn ghi 'chưa đặt kỳ vọng' chứ không ghi 'hụt'."
        >
          <Input
            value={String(wave.expected)}
            inputMode="numeric"
            readOnly={locked}
            onChange={(e) => onPatch({ expected: digits(e.target.value) })}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <GroupLabel id={contentId} required>
            Nội dung mail của đợt {index + 1}
          </GroupLabel>
          {locked ? (
            <div className="bg-input rounded-md p-3">
              <RichTextView html={wave.content} />
            </div>
          ) : (
            <RichText
              value={wave.content}
              onChange={(html) => onPatch({ content: html })}
              label={`Nội dung mail của đợt ${index + 1}`}
              placeholder="Soạn nội dung đợt này — chèn được ảnh, sửa được HTML thô."
            />
          )}
          {copied && wave.content.trim() === '' ? (
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              Kịch bản không lưu nội dung đã soạn — ô này để trống là đúng.
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Tạo · sửa · nhân bản chiến dịch dùng chung một form — BA BƯỚC, cuộn cùng
 *  trang, một thanh chốt dính đáy.
 *
 *  BA ĐỔI LỚN 23/08, cả ba đều là để người chưa từng chạy chiến dịch dùng được:
 *
 *   1 · **Không cần người duyệt vẫn tạo được.** Chuỗi duyệt còn đó nhưng rỗng
 *       lúc mở, và nút chốt không hỏi tới nó. Trước đây TP Kinh doanh là mắt
 *       xích ghim và nút cuối đọc là "Gửi … duyệt" — tức một người mới không tự
 *       tạo nổi chiến dịch đầu tiên của mình.
 *   2 · **Có NHÁP.** Lưu nháp không gửi cho ai và không tính là chạy; chỉ "Bắt
 *       đầu chạy" mới bung đợt. Nhờ vậy soạn dở bỏ đó được, và "Gửi ngay" ở
 *       từng đợt có một mốc rõ ràng để mà "ngay" so với.
 *   3 · **Không còn khối AI.** Bỏ theo yêu cầu 23/08. Luật 9 cấm AI tự chạy,
 *       không đòi mọi form phải có AI — không có khối thì không có gì để gác.
 *
 *  BẤM CHẠY LÀ KHOÁ. Ô nhập thành chỉ đọc và lối ra đổi tên thành "Về sổ" —
 *  trước đây bấm gửi rồi vẫn gõ tiếp được mà không còn nút gửi lại, nên mọi sửa
 *  đổi sau đó rơi vào hư không. */
export function CampaignForm({
  mode,
  code,
  initial,
  seededWave = false,
  onClose,
}: {
  mode: 'create' | 'edit' | 'duplicate'
  code?: string
  initial: CampaignDraft
  /** Form mở bằng nút "Thêm đợt vào chuỗi": đợt cuối là đợt vừa thêm. */
  seededWave?: boolean
  onClose: () => void
}) {
  const uid = useId()
  const [draft, setDraft] = useState<CampaignDraft>(initial)
  /* Chuỗi duyệt mở đầu RỖNG — "không cần người duyệt vẫn tạo được". Ai muốn có
     người gật thì tự thêm; hệ không ghim ai vào đó nữa. */
  const [approvers, setApprovers] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [saved, setSaved] = useState<'none' | 'draft' | 'running'>('none')
  const [askCancel, setAskCancel] = useState(false)

  /* Luật 13 · đổi chế độ là thay nguyên cây con, nút vừa bấm biến mất và focus
     rơi về `<body>`. Đưa nó lên tiêu đề form. */
  const headRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    headRef.current?.focus()
  }, [])

  /* "Thêm đợt" thả người dùng ở đầu Bước 1 trong khi thẻ đợt mới nằm cuối Bước
     2. Cuộn tới và đặt focus vào chính thẻ đó. */
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

  const locked = saved === 'running'
  const members = useMemo(() => membersOf(draft.group), [draft.group])

  const setWave = (i: number, patch: Partial<DraftWave>) =>
    setDraft((d) => ({ ...d, waves: d.waves.map((w, j) => (j === i ? { ...w, ...patch } : w)) }))

  const addWave = () => {
    const at = draft.waves.length
    setDraft((d) => ({ ...d, waves: [...d.waves, nextWave(d.waves)] }))
    setFocusWave(at)
  }

  /** Số đợt CHÉP TỪ chiến dịch cũ. Đợt vừa thêm trong phiên này không nằm trong
   *  đó — câu "kịch bản không lưu nội dung" chỉ đúng với đợt cũ. */
  const copiedWaves = mode === 'create' ? 0 : initial.waves.length - (seededWave ? 1 : 0)

  const blankWaves = draft.waves.filter((w) => w.content.trim() === '').length

  /* HAI NGƯỠNG khác nhau, và đó là điểm mấu chốt của cả form.

     Lưu nháp chỉ đòi một cái TÊN: nháp là chỗ để soạn dở, chặn nó bằng một danh
     sách yêu cầu là xoá luôn lý do nháp tồn tại.

     Bắt đầu chạy đòi đủ bốn thứ, vì lúc đó mail bay đi thật và không rút lại
     được. Nói RÕ còn thiếu gì, không để một cái nút xám câm. */
  const canSave = draft.name.trim() !== ''

  const missing = [
    draft.name.trim() === '' ? 'tên chiến dịch' : null,
    members.length === 0 ? 'ít nhất một người nhận' : null,
    draft.waves.length === 0 ? 'ít nhất một đợt' : null,
    blankWaves > 0 ? `nội dung mail cho ${blankWaves} đợt` : null,
  ].filter((x): x is string => x !== null)
  const canRun = missing.length === 0

  const candidates = dasVina.actors.filter((a) => !approvers.includes(a.name))

  /* Nháp đã đụng vào chưa. Bấm "Huỷ" lúc nháp còn nguyên thì đi thẳng; đụng rồi
     thì hỏi lại ngay tại chỗ — không `window.confirm`, hộp thoại của trình duyệt
     không có mặt kính nào và không nằm trong hệ thiết kế. */
  const untouched = JSON.stringify(draft) === JSON.stringify(initial) && approvers.length === 0

  const statusId = `${uid}-status`
  const approverId = `${uid}-approver`
  const stopId = `${uid}-stop`

  const title =
    mode === 'edit' ? `Sửa ${code}` : mode === 'duplicate' ? 'Nhân bản nguồn dẫn' : 'Nguồn dẫn mới'

  const kicker = mode === 'edit' ? 'Sửa' : mode === 'duplicate' ? 'Nhân bản' : 'Tạo mới'

  return (
    <GlassCard className="flex flex-col gap-5 p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div ref={headRef} tabIndex={-1} className="min-w-0 outline-none">
          <SectionTitle
            size="lg"
            kicker={kicker}
            hint={
              mode === 'duplicate'
                ? 'Chép nguyên chuỗi đợt và nội dung. Nhóm người nhận CỐ TÌNH để trống — chọn lại ở Bước 1.'
                : 'Ba bước, cuộn thẳng xuống. Không cần ai duyệt: lưu nháp lúc nào cũng được, chỉ "Bắt đầu chạy" mới gửi mail.'
            }
          >
            {title}
          </SectionTitle>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saved === 'draft' ? <Badge tone="draft">Đã lưu nháp · chưa gửi ai</Badge> : null}
          {saved === 'running' ? <Badge tone="running">Đang chạy</Badge> : null}

          {askCancel ? (
            <>
              <span className="text-warning text-[11.5px] leading-[1.5]">
                Bỏ bản nháp đang soạn?
              </span>
              <Button size="md" variant="destructive" onClick={onClose}>
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
              onClick={() => (saved !== 'none' || untouched ? onClose() : setAskCancel(true))}
            >
              {saved === 'none' ? 'Huỷ' : 'Về sổ'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <StepAudience draft={draft} setDraft={setDraft} locked={locked} />

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker="Bước 2"
            hint="Mỗi đợt một nội dung riêng và một mốc gửi riêng."
          >
            Gửi cái gì, lúc nào?
          </SectionTitle>

          {copiedWaves > 0 ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Kịch bản không lưu nội dung đã soạn — ô nội dung của {copiedWaves} đợt cũ để trống.
              Dựng lại một bài chưa từng có thì màn đang bịa.
            </p>
          ) : null}

          <div className="flex flex-col gap-4">
            {draft.waves.map((w, i) => (
              <WaveCard
                key={i}
                index={i}
                wave={w}
                locked={locked}
                copied={i < copiedWaves}
                onPatch={(patch) => setWave(i, patch)}
                onDrop={() => setDraft((d) => ({ ...d, waves: d.waves.filter((_, j) => j !== i) }))}
                cardRef={(el) => {
                  waveRefs.current[i] = el
                }}
              />
            ))}

            <button
              type="button"
              disabled={locked}
              onClick={addWave}
              className="motion-std text-muted-foreground hover:text-foreground hover:bg-white/9 flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-md bg-white/5 p-4 text-[12.5px] font-semibold"
            >
              <Icon icon={Plus} size={20} />
              Thêm đợt
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker="Bước 3"
            hint="Cả hai thứ ở bước này đều không bắt buộc — bỏ qua được."
          >
            Khi nào dừng?
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <GroupLabel id={stopId}>Điều kiện dừng</GroupLabel>
              <div role="group" aria-labelledby={stopId} className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={locked}
                  aria-pressed={draft.stopOnReply}
                  variant={draft.stopOnReply ? 'default' : 'ghost'}
                  onClick={() => setDraft((d) => ({ ...d, stopOnReply: !d.stopOnReply }))}
                >
                  Khách trả lời thì ngưng nhắc
                </Button>
              </div>

              <Field
                label="Đủ bao nhiêu lead thì dừng cả chuỗi"
                hint="Để 0 là không đặt trần — chuỗi chạy hết các đợt đã soạn."
              >
                <Input
                  value={String(draft.stopAtLeads)}
                  inputMode="numeric"
                  readOnly={locked}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      stopAtLeads: Number(e.target.value.replace(/\D/g, '') || '0'),
                    }))
                  }
                />
              </Field>

              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Điều kiện dừng do hệ giữ, không phải do người ngồi canh. Chống trùng người nhận cũng
                vậy: một người nằm trong hai chiến dịch không bị gửi hai lần trong cùng cửa sổ.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-md bg-white/5 p-4">
              <GroupLabel id={approverId}>Người duyệt — không bắt buộc</GroupLabel>

              {approvers.length === 0 ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Chưa có ai trong chuỗi duyệt, và chiến dịch vẫn tạo được. Thêm người vào đây khi
                  khoản chi hoặc danh sách gửi cần một người thứ hai nhìn qua.
                </p>
              ) : (
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
                        disabled={locked}
                        aria-label={`Bỏ ${name} khỏi chuỗi duyệt`}
                        onClick={() => setApprovers((prev) => prev.filter((n) => n !== name))}
                      >
                        <Icon icon={Trash2} size={16} />
                        Bỏ
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {candidates.length > 0 ? (
                <Button
                  size="sm"
                  variant={picking ? 'default' : 'ghost'}
                  className="self-start"
                  disabled={locked}
                  onClick={() => setPicking((v) => !v)}
                >
                  <Icon icon={UserPlus} size={16} />
                  Thêm người duyệt
                </Button>
              ) : null}

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

              {approvers.length > 0 ? (
                <>
                  <ApprovalChain
                    steps={approvers.map((name, i) => ({
                      label: name,
                      state: i === 0 ? 'current' : 'next',
                    }))}
                  />
                  <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                    Chuỗi đi từ trái sang phải, người đầu tiên nhận trước. Có chuỗi thì không đợt
                    nào bung ra trước khi người cuối gật.
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      {/* THANH CHỐT dính đáy khung nhìn. Form này dài hơn một màn, và hai nút
          quan trọng nhất nằm ở cuối thì người mới cuộn lên cuộn xuống để tìm.
          Thanh mang theo câu tóm tắt vì đó là chỗ duy nhất trên màn nói đủ ba
          điều cùng lúc: gửi cho bao nhiêu người, mấy đợt, và đợt đầu đi lúc nào.

          `glass-overlay` chứ KHÔNG `bg-white/5`: thanh này ĐÈ LÊN nội dung đang
          cuộn phía dưới, và một mặt đục 5% thì danh sách người nhận hiện mờ mờ
          sau hai cái nút — đúng lỗi mà docblock của `glass-overlay` mô tả. Đây
          không phải lớp nền thứ năm (luật 12): nó là mặt của thứ nổi trên trang,
          cùng vai với dropdown của nav và panel của Drawer. */}
      <div className="glass-overlay sticky bottom-0 -mx-5 -mb-5 flex flex-col gap-3 rounded-b-md p-4 lg:-mx-6 lg:-mb-6">
        {/* MỘT thẻ `<p>` cho mọi trạng thái, không nhiều thẻ thay nhau: vùng
            `aria-live` phải có mặt sẵn trong DOM trước khi chữ đổi, nếu không
            trình đọc màn hình chẳng đọc gì cả. Nút bị `disabled` không nhận được
            focus — `aria-describedby` là đường duy nhất còn lại để người dùng
            bàn phím nghe được lý do nút xám. */}
        <p
          id={statusId}
          aria-live="polite"
          className={cn(
            'text-[11.5px] leading-[1.5]',
            !locked && !canRun ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {locked
            ? 'Đang chạy — ô nhập đã khoá. Kịch bản đóng băng không nhận chiến dịch mới, nên dòng này chưa lên sổ.'
            : canRun
              ? `Gửi cho ${members.length} người · ${draft.waves.length} đợt · đợt đầu ${whenText(draft.waves[0]!)} · ${draft.stopOnReply ? 'khách trả lời thì ngưng nhắc' : 'chuỗi chạy hết kể cả khi khách đã trả lời'}.`
              : `Chưa chạy được — còn thiếu ${missing.join(' · ')}. Vẫn lưu nháp được.`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="md"
            variant="ghost"
            disabled={locked || !canSave}
            onClick={() => {
              setSaved('draft')
              setAskCancel(false)
              /* Nối E1/E5 khi có backend: lưu bản nháp, KHÔNG lên lịch gửi. */
            }}
          >
            <Icon icon={Save} size={16} />
            Lưu nháp
          </Button>

          <Button
            size="md"
            disabled={locked || !canRun}
            aria-describedby={statusId}
            onClick={() => {
              setSaved('running')
              setAskCancel(false)
              /* Nối E5 khi có backend: đẩy kế hoạch xuống hàng đợi gửi kèm hai
                 điều kiện dừng. Có `approvers` thì đi qua E3 trước; chuỗi rỗng
                 thì chạy thẳng — đó là điều "không cần người duyệt" nghĩa là. */
            }}
          >
            <Icon icon={Zap} size={16} />
            Bắt đầu chạy
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
