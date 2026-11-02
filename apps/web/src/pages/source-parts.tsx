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
import { message, useI18n } from '@/app/i18n'
import {
  draftTemplate,
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

const START_RUNNING = message('Bắt đầu chạy', 'Start running', '실행 시작')

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
  const { t } = useI18n()
  const items = [
    {
      title: t(
        message(
          'Không có bảng lead trên màn này',
          'No lead table on this screen',
          '이 화면에는 리드 표가 없습니다',
        ),
      ),
      body: t(
        message(
          'Danh sách lead xem ở Sổ lead. Ở đây chỉ có số tổng.',
          'See the lead list in the Lead book. This screen shows totals only.',
          '리드 목록은 리드 목록 화면에서 확인하세요. 여기에는 합계만 표시됩니다.',
        ),
      ),
    },
    {
      title: t(
        message(
          'Không vẽ đường theo thời gian',
          'No trend line over time',
          '시간별 추이 그래프 없음',
        ),
      ),
      body: t(
        message(
          `Số liệu chốt ngày ${dm(DAS_VINA_FROZEN_AT)}, chưa có số theo tháng hay quý.`,
          `Figures are as of ${dm(DAS_VINA_FROZEN_AT)}; there are no monthly or quarterly figures yet.`,
          `수치는 ${dm(DAS_VINA_FROZEN_AT)} 기준이며, 월별·분기별 수치는 아직 없습니다.`,
        ),
      ),
    },
  ]

  return (
    <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-md p-4">
      <h3 className="text-[12.5px] font-semibold">
        {t(message('Cố tình không làm', 'Deliberately not done', '의도적으로 하지 않은 것'))}
      </h3>
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
            <span className="text-destructive-foreground" aria-hidden="true">
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
        <span className="text-destructive-foreground" aria-hidden="true">
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
  const { t } = useI18n()
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
            {t(
              message(
                `+ ${hidden} ${label.toLowerCase()} nữa`,
                `+ ${hidden} more ${label.toLowerCase()}`,
                `${label} ${hidden}개 더 보기`,
              ),
            )}
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
  const { t, lang } = useI18n()
  const example = draftTemplate(lang).name
  const members = useMemo(() => membersOf(draft.group), [draft.group])

  const toggle = <K extends keyof LeadGroup>(key: K, value: string) =>
    setDraft((d) => {
      const cur = d.group[key] as string[]
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
      return { ...d, group: { ...d.group, [key]: next } }
    })

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        size="lg"
        kicker={t(message('Bước 1', 'Step 1', '1단계'))}
        hint={t(
          message(
            'Ô có dấu sao là bắt buộc.',
            'Fields marked with * are required.',
            '*가 있는 항목은 필수입니다.',
          ),
        )}
      >
        {t(message('Gửi cho ai?', 'Who receives it?', '누구에게 보낼까요?'))}
      </SectionTitle>

      {/* Ô một dòng KHÔNG kéo hết 1.400px. Một ô nhập rộng bằng cả màn nói với
          người dùng rằng nó chờ một đoạn văn, và mắt phải đi hết bề ngang mới
          biết mình gõ tới đâu. */}
      <div className="max-w-2xl">
        <Field label={t(message('Tên chiến dịch', 'Campaign name', '캠페인 이름'))} required>
          <Input
            value={draft.name}
            aria-required
            readOnly={locked}
            placeholder={t(message(`Ví dụ ${example}`, `e.g. ${example}`, `예: ${example}`))}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </Field>
      </div>

      <div className="bg-surface-ink/5 flex flex-col gap-4 rounded-md p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <GroupLabel required>
            {t(message('Nhóm người nhận', 'Recipient group', '수신자 그룹'))}
          </GroupLabel>
          {/* Con số phải to và phải đứng ngay trên các hàng chip. Nó là thứ nói
              cho người dùng biết họ đang hiểu bộ lọc đúng hay ngược — một dòng
              giải thích không làm được việc đó. */}
          <span className="flex items-baseline gap-2">
            <span className="tnum font-num text-[26px] font-semibold leading-none">
              {members.length}
            </span>
            <span className="text-muted-foreground text-[11.5px]">
              {t(message('người nhận', 'recipients', '수신자'))}
            </span>
          </span>
        </div>

        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {t(
            message(
              'Để trống là lấy tất cả. Đang gửi cho:',
              'Leave empty to include everyone. Sending to:',
              '비워 두면 모두 포함됩니다. 발송 대상:',
            ),
          )}{' '}
          <b className="text-foreground font-semibold">{groupText(draft.group, lang)}</b>.
        </p>

        <ChipRow
          label={t(message('Ngành', 'Industry', '업종'))}
          disabled={locked}
          options={LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          picked={draft.group.categories}
          onToggle={(v) => toggle('categories', v)}
        />
        <ChipRow
          label={t(message('Bậc', 'Tier', '등급'))}
          disabled={locked}
          options={LEAD_TIERS.map((t) => ({ value: t.key, label: t.label }))}
          picked={draft.group.tiers}
          onToggle={(v) => toggle('tiers', v)}
        />
        <ChipRow
          label={t(message('Tỉnh', 'Province', '지역'))}
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
            {t(
              message(
                'Không ai khớp cả ba điều kiện. Bỏ bớt một điều kiện để có người nhận.',
                'No one matches all three conditions. Remove a condition to get recipients.',
                '세 가지 조건을 모두 만족하는 사람이 없습니다. 조건을 하나 줄이면 수신자가 생깁니다.',
              ),
            )}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">
              {members.length <= 5
                ? t(message('Cả nhóm', 'Whole group', '전체 그룹'))
                : t(message('5 người đầu nhóm', 'First 5 people', '처음 5명'))}
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
                {t(
                  message(
                    `còn ${members.length - 5} người nữa`,
                    `${members.length - 5} more`,
                    `${members.length - 5}명 더 있음`,
                  ),
                )}
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
  const { t, lang } = useI18n()
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
      className="bg-surface-ink/5 flex flex-col gap-4 rounded-md p-4 outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span id={titleId} className="text-[12.5px] font-semibold">
          {t(message(`Đợt ${index + 1}`, `Wave ${index + 1}`, `웨이브 ${index + 1}`))}
        </span>
        <span className="text-muted-foreground text-[11px]">{whenText(wave, lang)}</span>
        <Button
          size="sm"
          variant="ghost"
          disabled={locked}
          aria-label={t(
            message(`Bỏ đợt ${index + 1}`, `Remove wave ${index + 1}`, `웨이브 ${index + 1} 삭제`),
          )}
          onClick={onDrop}
        >
          <Icon icon={Trash2} size={16} />
          {t(message('Bỏ', 'Remove', '삭제'))}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label={t(message('Tên đợt', 'Wave name', '웨이브 이름'))} required>
          <Input
            value={wave.label}
            aria-required
            readOnly={locked}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <GroupLabel id={channelId} required>
            {t(message('Kênh bắn', 'Send channel', '발송 채널'))}
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
          {t(
            message(
              'Gửi tự động, có nhật ký gửi và chống trùng người nhận',
              'Sent automatically, with a send log and no duplicate recipients',
              '자동 발송되며 발송 기록이 남고 수신자 중복이 방지됩니다',
            ),
          )}
        </span>
      ) : (
        <span className="text-warning flex items-start gap-2 text-[11px] leading-[1.5]">
          <Icon icon={TriangleAlert} size={16} />
          {t(
            message(
              `Chưa gửi tự động qua ${CHANNEL_LABEL[wave.channel]}. Bạn đăng bài rồi nhập số liệu về.`,
              `Not sent automatically via ${CHANNEL_LABEL[wave.channel]}. Post it yourself, then enter the figures.`,
              `${CHANNEL_LABEL[wave.channel]}로는 자동 발송되지 않습니다. 직접 게시한 뒤 수치를 입력하세요.`,
            ),
          )}
        </span>
      )}

      {/* GỬI KHI NÀO — hai lựa chọn, không phải một ô "sau bao nhiêu ngày".
          "Sau 14 ngày" bắt người soạn tự cộng lịch trong đầu và không bao giờ
          nói ra thứ hai ngày mấy. Ở đây chọn xong là đọc được thành ngày. */}
      <div className="flex flex-col gap-2">
        <GroupLabel id={whenId} required>
          {t(message('Gửi khi nào', 'When to send', '발송 시점'))}
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
            {t(message('Gửi ngay', 'Send now', '즉시 발송'))}
          </Button>
          <Button
            size="sm"
            disabled={locked}
            aria-pressed={!wave.sendNow}
            variant={!wave.sendNow ? 'default' : 'ghost'}
            onClick={() => onPatch({ sendNow: false })}
          >
            <Icon icon={CalendarClock} size={16} />
            {t(message('Hẹn ngày', 'Schedule', '날짜 예약'))}
          </Button>

          {/* Ô ngày giờ KHÔNG biến mất khi bấm "Gửi ngay" — nó mờ đi. Biến mất
              thì bấm nhầm một cái là mất ngày vừa gõ, và người mới bấm nhầm
              nhiều. Giá trị vẫn nằm trong bản nháp, bấm lại là thấy. */}
          <div className={cn('flex flex-wrap items-end gap-2', wave.sendNow && 'opacity-40')}>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[11px]">
                {t(message('Ngày', 'Date', '날짜'))}
              </span>
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
              <span className="text-muted-foreground text-[11px]">
                {t(message('Giờ', 'Time', '시간'))}
              </span>
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
            {t(
              message(
                '"Gửi ngay" tính từ lúc bạn bấm ',
                'Send now counts from when you press ',
                '즉시 발송은 ',
              ),
            )}
            <b className="text-foreground">{t(START_RUNNING)}</b>
            {t(
              message(
                '. Lưu nháp thì chưa gửi mail nào.',
                '. Saving a draft sends no email.',
                '을 누른 시점부터 적용됩니다. 임시 저장 시에는 메일이 발송되지 않습니다.',
              ),
            )}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Field
          label={t(message('Kỳ vọng bao nhiêu lead', 'Expected leads', '예상 리드 수'))}
          hint={t(
            message(
              'Không bắt buộc. Để 0 nếu chưa đặt kỳ vọng.',
              'Optional. Leave 0 if no expectation is set.',
              '선택 사항입니다. 기대치가 없으면 0으로 두세요.',
            ),
          )}
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
            {t(
              message(
                `Nội dung mail của đợt ${index + 1}`,
                `Email content for wave ${index + 1}`,
                `웨이브 ${index + 1} 메일 내용`,
              ),
            )}
          </GroupLabel>
          {locked ? (
            <div className="bg-input rounded-md p-3">
              <RichTextView html={wave.content} />
            </div>
          ) : (
            <RichText
              value={wave.content}
              onChange={(html) => onPatch({ content: html })}
              label={t(
                message(
                  `Nội dung mail của đợt ${index + 1}`,
                  `Email content for wave ${index + 1}`,
                  `웨이브 ${index + 1} 메일 내용`,
                ),
              )}
              placeholder={t(
                message(
                  'Soạn nội dung đợt này. Chèn được ảnh, sửa được HTML.',
                  "Write this wave's content. You can insert images and edit HTML.",
                  '이 웨이브의 내용을 작성하세요. 이미지를 삽입하고 HTML을 수정할 수 있습니다.',
                ),
              )}
            />
          )}
          {copied && wave.content.trim() === '' ? (
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              {t(
                message(
                  'Nội dung đợt cũ không còn lưu. Soạn lại ở ô này.',
                  'The old wave content is no longer stored. Write it again here.',
                  '이전 웨이브의 내용은 더 이상 저장되어 있지 않습니다. 여기에 다시 작성하세요.',
                ),
              )}
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
  const { t } = useI18n()
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
    draft.name.trim() === '' ? t(message('tên chiến dịch', 'campaign name', '캠페인 이름')) : null,
    members.length === 0
      ? t(message('ít nhất một người nhận', 'at least one recipient', '수신자 1명 이상'))
      : null,
    draft.waves.length === 0
      ? t(message('ít nhất một đợt', 'at least one wave', '웨이브 1개 이상'))
      : null,
    blankWaves > 0
      ? t(
          message(
            `nội dung mail cho ${blankWaves} đợt`,
            `email content for ${blankWaves} waves`,
            `웨이브 ${blankWaves}개의 메일 내용`,
          ),
        )
      : null,
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
    mode === 'edit'
      ? t(message(`Sửa ${code}`, `Edit ${code}`, `${code} 수정`))
      : mode === 'duplicate'
        ? t(message('Nhân bản nguồn dẫn', 'Duplicate source', '유입 경로 복제'))
        : t(message('Nguồn dẫn mới', 'New source', '새 유입 경로'))

  const kicker =
    mode === 'edit'
      ? t(message('Sửa', 'Edit', '수정'))
      : mode === 'duplicate'
        ? t(message('Nhân bản', 'Duplicate', '복제'))
        : t(message('Tạo mới', 'Create', '새로 만들기'))

  return (
    <GlassCard className="flex flex-col gap-5 p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div ref={headRef} tabIndex={-1} className="min-w-0 outline-none">
          <SectionTitle
            size="lg"
            kicker={kicker}
            hint={
              mode === 'duplicate'
                ? t(
                    message(
                      'Đã chép chuỗi đợt và nội dung. Chọn lại người nhận ở Bước 1.',
                      'The wave sequence and content were copied. Choose the recipients again in Step 1.',
                      '웨이브 순서와 내용이 복사되었습니다. 1단계에서 수신자를 다시 선택하세요.',
                    ),
                  )
                : t(
                    message(
                      'Lưu nháp lúc nào cũng được. Chỉ "Bắt đầu chạy" mới gửi mail.',
                      'You can save a draft any time. Only "Start running" sends email.',
                      '임시 저장은 언제든 가능합니다. "실행 시작"을 눌러야만 메일이 발송됩니다.',
                    ),
                  )
            }
          >
            {title}
          </SectionTitle>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {saved === 'draft' ? (
            <Badge tone="draft">
              {t(
                message(
                  'Đã lưu nháp · chưa gửi ai',
                  'Draft saved · nothing sent',
                  '임시 저장됨 · 아직 발송 안 됨',
                ),
              )}
            </Badge>
          ) : null}
          {saved === 'running' ? (
            <Badge tone="running">{t(message('Đang chạy', 'Running', '진행 중'))}</Badge>
          ) : null}

          {askCancel ? (
            <>
              <span className="text-warning text-[11.5px] leading-[1.5]">
                {t(
                  message(
                    'Bỏ bản nháp đang soạn?',
                    'Discard the draft you are writing?',
                    '작성 중인 초안을 버릴까요?',
                  ),
                )}
              </span>
              <Button size="md" variant="destructive" onClick={onClose}>
                {t(message('Bỏ nháp', 'Discard draft', '초안 버리기'))}
              </Button>
              <Button size="md" variant="ghost" onClick={() => setAskCancel(false)}>
                {t(message('Soạn tiếp', 'Keep writing', '계속 작성'))}
              </Button>
            </>
          ) : (
            <Button
              size="md"
              variant="ghost"
              onClick={() => (saved !== 'none' || untouched ? onClose() : setAskCancel(true))}
            >
              {saved === 'none'
                ? t(message('Huỷ', 'Cancel', '취소'))
                : t(message('Về sổ', 'Back to list', '목록으로'))}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <StepAudience draft={draft} setDraft={setDraft} locked={locked} />

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker={t(message('Bước 2', 'Step 2', '2단계'))}
            hint={t(
              message(
                'Mỗi đợt một nội dung riêng và một mốc gửi riêng.',
                'Each wave has its own content and its own send time.',
                '웨이브마다 내용과 발송 시점이 따로 있습니다.',
              ),
            )}
          >
            {t(message('Gửi cái gì, lúc nào?', 'What to send, and when?', '무엇을 언제 보낼까요?'))}
          </SectionTitle>

          {copiedWaves > 0 ? (
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              {t(
                message(
                  `Nội dung của ${copiedWaves} đợt cũ không còn lưu, ô nội dung để trống.`,
                  `The content of ${copiedWaves} old waves is no longer stored, so the content box is empty.`,
                  `이전 웨이브 ${copiedWaves}개의 내용은 더 이상 저장되어 있지 않아 내용 칸이 비어 있습니다.`,
                ),
              )}
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
              className="motion-std text-muted-foreground hover:text-foreground hover:bg-surface-ink/9 bg-surface-ink/5 flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-md p-4 text-[12.5px] font-semibold"
            >
              <Icon icon={Plus} size={20} />
              {t(message('Thêm đợt', 'Add wave', '웨이브 추가'))}
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle
            size="lg"
            kicker={t(message('Bước 3', 'Step 3', '3단계'))}
            hint={t(
              message('Cả hai đều không bắt buộc.', 'Both are optional.', '둘 다 선택 사항입니다.'),
            )}
          >
            {t(message('Khi nào dừng?', 'When to stop?', '언제 중단할까요?'))}
          </SectionTitle>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-md p-4">
              <GroupLabel id={stopId}>
                {t(message('Điều kiện dừng', 'Stop conditions', '중단 조건'))}
              </GroupLabel>
              <div role="group" aria-labelledby={stopId} className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={locked}
                  aria-pressed={draft.stopOnReply}
                  variant={draft.stopOnReply ? 'default' : 'ghost'}
                  onClick={() => setDraft((d) => ({ ...d, stopOnReply: !d.stopOnReply }))}
                >
                  {t(
                    message(
                      'Khách trả lời thì ngưng nhắc',
                      'Stop reminding once the customer replies',
                      '고객이 답장하면 알림 중단',
                    ),
                  )}
                </Button>
              </div>

              <Field
                label={t(
                  message(
                    'Đủ bao nhiêu lead thì dừng cả chuỗi',
                    'Stop the whole sequence after how many leads',
                    '리드가 몇 건이면 전체 시퀀스를 중단할까요',
                  ),
                )}
                hint={t(
                  message(
                    'Để 0 thì chạy hết các đợt đã soạn.',
                    'Leave 0 to run all the waves written.',
                    '0이면 작성한 웨이브를 끝까지 실행합니다.',
                  ),
                )}
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
                {t(
                  message(
                    'Một người nằm trong hai chiến dịch không bị gửi hai lần trong cùng một khoảng thời gian.',
                    'A person in two campaigns is not emailed twice within the same period.',
                    '두 캠페인에 속한 사람에게 같은 기간 중 두 번 발송되지 않습니다.',
                  ),
                )}
              </p>
            </div>

            <div className="bg-surface-ink/5 flex flex-col gap-3 rounded-md p-4">
              <GroupLabel id={approverId}>
                {t(
                  message('Người duyệt (không bắt buộc)', 'Approvers (optional)', '승인자 (선택)'),
                )}
              </GroupLabel>

              {approvers.length === 0 ? (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  {t(
                    message(
                      'Chưa có người duyệt. Thêm khi khoản chi hoặc danh sách gửi cần người xem lại.',
                      'No approvers yet. Add one when the spend or the send list needs review.',
                      '승인자가 아직 없습니다. 비용이나 발송 목록에 검토가 필요하면 추가하세요.',
                    ),
                  )}
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
                        aria-label={t(
                          message(
                            `Bỏ ${name} khỏi chuỗi duyệt`,
                            `Remove ${name} from the approval chain`,
                            `${name}님을 승인 단계에서 삭제`,
                          ),
                        )}
                        onClick={() => setApprovers((prev) => prev.filter((n) => n !== name))}
                      >
                        <Icon icon={Trash2} size={16} />
                        {t(message('Bỏ', 'Remove', '삭제'))}
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
                  {t(message('Thêm người duyệt', 'Add approver', '승인자 추가'))}
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
                    {t(
                      message(
                        'Duyệt lần lượt từ trái sang phải. Đợt nào cũng chờ người cuối duyệt xong mới gửi.',
                        'Approval goes left to right. Every wave waits until the last approver is done before sending.',
                        '왼쪽에서 오른쪽 순서로 승인합니다. 모든 웨이브는 마지막 승인자가 승인한 뒤에 발송됩니다.',
                      ),
                    )}
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

          `glass-overlay` chứ KHÔNG `bg-surface-ink/5`: thanh này ĐÈ LÊN nội dung đang
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
            ? t(
                message(
                  'Đang chạy. Ô nhập đã khoá. Chiến dịch này chưa lên sổ.',
                  'Running. Inputs are locked. This campaign is not in the list yet.',
                  '진행 중입니다. 입력란이 잠겼습니다. 이 캠페인은 아직 목록에 올라가지 않았습니다.',
                ),
              )
            : canRun
              ? t(
                  message(
                    `Gửi cho ${members.length} người · ${draft.waves.length} đợt · đợt đầu ${whenText(draft.waves[0]!, 'vi')} · ${draft.stopOnReply ? 'khách trả lời thì ngưng nhắc' : 'khách trả lời vẫn gửi tiếp'}.`,
                    `Sending to ${members.length} people · ${draft.waves.length} waves · first wave ${whenText(draft.waves[0]!, 'en')} · ${draft.stopOnReply ? 'stops reminding once the customer replies' : 'keeps sending after a reply'}.`,
                    `수신자 ${members.length}명 · 웨이브 ${draft.waves.length}개 · 첫 웨이브 ${whenText(draft.waves[0]!, 'ko')} · ${draft.stopOnReply ? '고객이 답장하면 알림 중단' : '고객이 답장해도 계속 발송'}.`,
                  ),
                )
              : t(
                  message(
                    `Chưa chạy được, còn thiếu ${missing.join(' · ')}. Vẫn lưu nháp được.`,
                    `Cannot run yet, missing ${missing.join(' · ')}. You can still save a draft.`,
                    `아직 실행할 수 없습니다. 부족한 항목: ${missing.join(' · ')}. 임시 저장은 가능합니다.`,
                  ),
                )}
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
            {t(message('Lưu nháp', 'Save draft', '임시 저장'))}
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
            {t(START_RUNNING)}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}
