import { useEffect, useState, type ReactNode } from 'react'
import {
  CalendarClock,
  CircleAlert,
  Inbox,
  Link,
  Mail,
  MailOpen,
  Megaphone,
  Paperclip,
  Reply,
  Route,
  Users,
  type IconGlyph,
} from '@pv/ui'
import { Badge, DataTable, Drawer, GlassCard, Icon, Info, SegmentedControl } from '@pv/ui'

/** EVERYTHING THE MAIL PANEL WOULD OTHERWISE EXPLAIN IN PLACE, in one drawer.
 *
 *  The compose panel used to carry its guidance as prose beside each field: a
 *  paragraph over the recipient box, another over the campaign select, a
 *  sentence under four checkboxes. Read once, then in the way forever — and it
 *  pushed the controls that do the work below the fold. The three parts here
 *  hold the same words, opened from the `?` in the panel header on the part the
 *  reader is standing on.
 *
 *  Half of the content part is about what does *not* work, because
 *  `mail-markup.ts` understands three constructs and a pasted URL leaves as
 *  dead text; saying what to do INSTEAD is the only thing that closes those
 *  loops. Its right-hand column is rendered rather than described — that is
 *  also the honest test, a sample that stopped matching the mail renderer shows
 *  up here and not in somebody's inbox. */
export type MailGuideSection = 'recipients' | 'content' | 'delivery'

const TABS: { value: MailGuideSection; label: string }[] = [
  { value: 'recipients', label: 'Người nhận' },
  { value: 'content', label: 'Nội dung thư' },
  { value: 'delivery', label: 'Cách gửi' },
]

const ALL_PARTS: MailGuideSection[] = ['recipients', 'content', 'delivery']

/** The `?` of a mail panel, for the header slot beside the close button so it
 *  stays reachable while the body scrolls. `Info` and not a question mark: the
 *  registry has no question glyph, and this is the icon the guide has worn
 *  since it was a button inside the compose card. */
export function MailGuideButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Hướng dẫn gửi email"
      className="motion-std hover:bg-surface-ink/16 bg-surface-ink/9 pointer-coarse:size-12 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-md"
    >
      <Icon icon={Info} size={16} />
    </button>
  )
}

export function MailGuideDrawer({
  open,
  onClose,
  section = 'content',
  parts = ALL_PARTS,
}: {
  open: boolean
  onClose: () => void
  /** Which part opens first — the step the reader is standing on. `'content'`
   *  for doors with no steps (the template editor): the syntax table is what
   *  people come to this drawer for. */
  section?: MailGuideSection
  /** Which parts this door HAS — filtered out of the tab strip too, because a
   *  tab is a way in and not only a default. The run editor passes
   *  `['content']`: the other two explain fields that panel does not draw. */
  parts?: MailGuideSection[]
}) {
  const tabs = TABS.filter((tab) => parts.includes(tab.value))
  /* A door with one part promises one part: no tab strip, and a title that
     names what is inside instead of the three-part tour. */
  const only = tabs.length === 1 ? tabs[0] : undefined
  const [part, setPart] = useState<MailGuideSection>(section)

  /* Re-opening from another step must land on that step's part; the drawer
     keeps its own state between opens. */
  useEffect(() => {
    if (open) setPart(parts.includes(section) ? section : (parts[0] ?? 'content'))
  }, [open, section, parts])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      /* `lg`: three columns of examples, one of which holds a bullet list. At
         `md` the middle column wraps every sample onto two lines and the table
         stops being scannable. */
      width="lg"
      title={only ? `Hướng dẫn · ${only.label}` : 'Hướng dẫn gửi email'}
      subtitle={
        only
          ? 'Không cần nhớ hết — mở lại bảng này bất cứ lúc nào.'
          : 'Ba mục cho một lượt gửi: người nhận, nội dung thư, cách gửi. Không cần nhớ hết — mở lại bất cứ lúc nào.'
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        {tabs.length > 1 && (
          <SegmentedControl
            label="Mục hướng dẫn"
            hideLabel
            value={part}
            onChange={(value) => setPart(value as MailGuideSection)}
            options={tabs}
          />
        )}

        {part === 'content' ? (
          <ContentPart />
        ) : (
          <div className="flex flex-col gap-3">
            {(part === 'recipients' ? RECIPIENT_FACTS : DELIVERY_FACTS).map((fact) => (
              <Note
                key={fact.title}
                tone="plain"
                icon={fact.icon}
                title={fact.title}
                body={fact.body}
              />
            ))}
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** Who gets the letter and which mailbox it leaves from — the two questions the
 *  recipient step cannot answer with a control, because neither is a choice. */
const RECIPIENT_FACTS: { icon: IconGlyph; title: string; body: string }[] = [
  {
    icon: Mail,
    title: 'Thư đi từ hộp thư chung của công ty',
    body: 'Hộp thư gửi hàng loạt do cấu hình máy chủ đặt — phiếu này không đổi được địa chỉ gửi, nên không có ô chọn hộp thư.',
  },
  {
    icon: Reply,
    title: 'Khách trả lời thì thư về hộp thư chung',
    body: 'Hệ chưa bật đường ghi thư trả lời, nên trả lời của khách không tự hiện ở Lịch sử của hồ sơ. Ai trông hộp thư chung thì đọc ở đó.',
  },
  {
    icon: Users,
    title: 'Mỗi người nhận một email riêng',
    body: 'Không ai thấy tên người khác trong danh sách, tên và công ty được điền tự động cho từng người. Người liên hệ chính đã được chọn sẵn — gõ tên, công ty hoặc email để tìm thêm người nhận.',
  },
]

const DELIVERY_FACTS: { icon: IconGlyph; title: string; body: string }[] = [
  {
    icon: Megaphone,
    title: 'Chỉ gắn được chiến dịch đang chạy',
    body: 'Gắn đợt vào một chiến dịch còn nháp thì thư đi ngay trong khi chiến dịch vẫn là nháp — nút bắt đầu của nó sau đó vẫn chạy và gửi cho cả tập khách một lần nữa. Chiến dịch còn nháp thì bắt đầu từ hồ sơ chiến dịch.',
  },
  {
    icon: Route,
    title: 'Tên chuỗi gửi',
    body: 'Không gắn chiến dịch thì các đợt vẫn thuộc một chuỗi riêng, và tên này là thứ gom chúng lại khi xem lại lịch sử gửi.',
  },
  {
    icon: Inbox,
    title: 'CC nội bộ là bản lưu cho người trong nhà',
    body: 'Mỗi địa chỉ được chọn nhận một bản CC cho từng email gửi tới từng người nhận. Khách không thấy các địa chỉ này.',
  },
  {
    icon: MailOpen,
    title: 'Ghi nhận lượt mở và lượt bấm',
    body: 'Bật thì tín hiệu mở thư và bấm nút hiện ở Lịch sử của hồ sơ. Tắt thì lô này không ghi nhận lượt mở và lượt bấm nào.',
  },
]

function ContentPart() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* A table ALWAYS sits on glass-b — rule 8. */}
      <GlassCard variant="b" className="overflow-hidden">
        <div className="overflow-x-auto p-4 lg:p-5">
          <DataTable
            className="min-w-[620px]"
            columns={[
              { header: 'Muốn gì', width: '1fr' },
              { header: 'Gõ thế này', width: '1.5fr' },
              { header: 'Thư hiện ra', width: '1.5fr' },
            ]}
            rows={ROWS.map((row) => ({
              id: row.id,
              cells: [
                <span key="w" className="block">
                  {row.want}
                </span>,
                <Sample key="t">{row.type}</Sample>,
                <span key="r" className="block text-[12.5px] leading-[1.7]">
                  {row.result}
                </span>,
              ],
            }))}
          />
        </div>
      </GlassCard>

      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Icon icon={CircleAlert} size={16} />
          Ba thứ KHÔNG làm được trong thân thư
        </span>

        <Note
          icon={Link}
          title="Dán link vào thân thư thì bấm không được"
          body="Thân thư được dựng thành chữ thuần, nên một địa chỉ dán vào giữa câu đi ra ngoài dưới dạng chữ — nhiều hòm thư, trong đó có Outlook, không tự biến nó thành link bấm được. Đưa địa chỉ xuống ô “Nút trong email” ở cuối bước Nội dung: chỗ đó chắc chắn bấm được, và người nhận thấy một nút thật."
        />

        <Note
          icon={Paperclip}
          title="Chưa đính kèm được tệp"
          body="Hệ thống chưa có chỗ chứa tệp cho thư đi hàng loạt, nên phiếu này không có ô chọn tệp. Cách đang dùng: tải tài liệu lên Google Drive, mở quyền xem cho người ngoài, rồi dán link đó vào ô “Nút trong email”. Ô đó chỉ có một đích đến, nên chọn một thứ đáng bấm nhất — lời mời đặt lịch không phải tranh chỗ ở đây nữa, nó có ô riêng."
        />

        <Note
          icon={CalendarClock}
          title="Không nhúng được lịch đặt hẹn vào thư"
          body="Khung chọn giờ của Calendly chạy bằng JavaScript, mà Gmail, Outlook và Apple Mail đều bóc script khỏi thư — không có hòm thư nào cho khách bấm chọn giờ ngay trong email, dù hướng dẫn của Calendly có nói gì. Cách thay: dán link Calendly vào ô “Link đặt lịch” ở cuối bước Nội dung. Nó thành nút viền “Chọn khung giờ” nằm dưới nút chính, nên một lá thư mang được cả hai lời mời. Thêm hai tham số dưới đây thì tên và email khách được điền sẵn — khách bấm là chọn giờ luôn, không phải gõ lại, và đó là chỗ phần lớn người bỏ dở."
          sample="https://calendly.com/<lịch-của-bạn>?name={{contact_name}}&email={{email}}"
        />
      </div>
    </div>
  )
}

/** The "type this" cell — mono on a faint panel, so the eye separates the marks
 *  from the prose around them. `whitespace-pre-line` because the two bullet
 *  lines have to stand as two lines: that is the very thing being shown. */
function Sample({ children }: { children: ReactNode }) {
  return (
    <span className="bg-surface-ink/5 block whitespace-pre-line rounded-sm px-3 py-2 font-mono text-[11.5px] leading-[1.7]">
      {children}
    </span>
  )
}

/** `sample` only where the answer IS a string to copy. The other two cards tell
 *  the writer where to put something they already have; the booking card hands
 *  them a line they have to reproduce character for character, and a URL buried
 *  in a paragraph is a URL somebody retypes with a typo in it.
 *
 *  `tone`: the amber icon means "this will bite you". A part that merely
 *  explains how the panel behaves is not a warning and must not borrow the
 *  colour of one. */
function Note({
  icon,
  title,
  body,
  sample,
  tone = 'warn',
}: {
  icon: IconGlyph
  title: string
  body: string
  sample?: string
  tone?: 'warn' | 'plain'
}) {
  return (
    <GlassCard variant="b" className="flex items-start gap-3 p-4">
      <Icon
        icon={icon}
        size={16}
        className={tone === 'warn' ? 'text-warning mt-1 shrink-0' : 'mt-1 shrink-0'}
      />
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex flex-col gap-1">
          <span className="text-[12.5px] font-semibold leading-[1.45]">{title}</span>
          <span className="text-muted-foreground text-[11.5px] leading-[1.65]">{body}</span>
        </span>
        {sample ? (
          <span className="overflow-x-auto">
            <Sample>{sample}</Sample>
          </span>
        ) : null}
      </span>
    </GlassCard>
  )
}

/** Every row is something the writer actually wants to DO, not a mark that needs
 *  explaining — so the first column reads "bold a phrase", never "double
 *  asterisk".
 *
 *  Five variable names, three values: two spellings resolve to the company name
 *  and two to the contact's, all four in circulation and all four accepted by
 *  the contract (`MAIL_MERGE_KEYS`). This table teaches exactly ONE spelling per
 *  value; teaching four would make somebody choose between two identical
 *  things.
 *
 *  The fifth — `{{email}}` — is deliberately NOT a row here. It exists for the
 *  BOOKING LINK, where it saves the reader from retyping their own address; in
 *  the prose of a letter it would only print the recipient's address back at
 *  them. It is taught in the card that needs it, next to the URL it goes into. */
const ROWS: { id: string; want: string; type: ReactNode; result: ReactNode }[] = [
  {
    id: 'bold',
    want: 'In đậm một cụm',
    type: '**đúng hạn**',
    result: (
      <>
        Giao <strong>đúng hạn</strong> trong 6 tuần.
      </>
    ),
  },
  {
    id: 'italic',
    want: 'In nghiêng',
    type: '_không bắt buộc_',
    result: (
      <>
        Phí khảo sát <em>không bắt buộc</em>.
      </>
    ),
  },
  {
    id: 'list',
    want: 'Danh sách gạch đầu dòng',
    type: '- Rút ngắn vòng kiểm\n- Giảm lỗi lắp ráp',
    result: (
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
        <li>Rút ngắn vòng kiểm</li>
        <li>Giảm lỗi lắp ráp</li>
      </ul>
    ),
  },
  {
    id: 'break',
    want: 'Xuống dòng trong cùng đoạn',
    type: 'Trân trọng,\nQuân',
    result: (
      <>
        Trân trọng,
        <br />
        Quân
      </>
    ),
  },
  {
    id: 'para',
    want: 'Ngắt sang đoạn mới',
    type: 'Câu cuối đoạn trên.\n\nCâu đầu đoạn dưới.',
    result: (
      <span className="flex flex-col gap-2">
        <span>Câu cuối đoạn trên.</span>
        <span>Câu đầu đoạn dưới.</span>
      </span>
    ),
  },
  {
    id: 'contact',
    want: 'Điền tên người nhận',
    type: 'Chào {{contact_name}},',
    result: (
      <>
        Chào <Filled>anh/chị</Filled>,
      </>
    ),
  },
  {
    id: 'account',
    want: 'Điền tên công ty',
    type: 'gửi {{account}}',
    result: (
      <>
        gửi <Filled>Công ty mẫu</Filled>
      </>
    ),
  },
]

/** A value the system fills in, marked so the eye catches where each recipient
 *  differs. The real letter does NOT mark it — this badge belongs to the guide,
 *  not to the mail.
 *
 *  The values inside are `MasService.SAMPLE_MERGE`, the same stand-ins the
 *  preview substitutes when nobody is picked: a real customer's name in a
 *  sample is a name somebody eventually reads as the actual recipient. */
function Filled({ children }: { children: ReactNode }) {
  return <Badge tone="draft">{children}</Badge>
}
