import type { ReactNode } from 'react'
import { CalendarClock, CircleAlert, Link, Paperclip } from '@pv/ui'
import { Badge, DataTable, Drawer, GlassCard, Icon } from '@pv/ui'

/** WHAT A LETTER BODY CAN DO, WRITTEN FOR THE PERSON WRITING THE LETTER.
 *
 *  ------------------------------------------------------------------
 *  HALF OF THIS PANEL IS ABOUT WHAT DOES *NOT* WORK, AND THAT IS THE POINT
 *  ------------------------------------------------------------------
 *  A salesperson arrives here having pasted from Word and watched the bold
 *  vanish, or having pasted a link that came out as dead text. Those two are
 *  not bugs to be sorry about, they are properties of how this body is built —
 *  `mail-markup.ts` understands three constructs and nothing else, and a URL in
 *  the body is rendered as text because `Para` puts it in a text node. Telling
 *  somebody what to do INSTEAD is the only thing that closes those two loops:
 *  the CTA button for a link, a shared-drive link for a file.
 *
 *  So the panel is two halves. The table is "type this, get that". The two
 *  cards below are "do not try this, do that instead" — and they are cards
 *  rather than two more table rows because their answer is a paragraph, not a
 *  cell.
 *
 *  ------------------------------------------------------------------
 *  THE RESULT COLUMN IS RENDERED, NOT DESCRIBED
 *  ------------------------------------------------------------------
 *  The right-hand column shows real bold, real italics, a real bullet list. A
 *  guide that merely writes "this text will be bold" asks the reader to imagine
 *  the outcome; showing it removes the imagining. It is also the honest test —
 *  if the sample stopped matching what the mail renderer does, that is visible
 *  here rather than in somebody's inbox. */
export function MailSyntaxGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      /* `lg`: three columns of examples, one of which holds a bullet list. At
         `md` the middle column wraps every sample onto two lines and the table
         stops being scannable. */
      width="lg"
      title="Cách viết nội dung thư"
      subtitle="Gõ đúng mấy ký hiệu dưới đây là thư gửi đi có định dạng. Không cần nhớ hết — mở lại bảng này bất cứ lúc nào."
    >
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
            body="Thân thư được dựng thành chữ thuần, nên một địa chỉ dán vào giữa câu đi ra ngoài dưới dạng chữ — nhiều hòm thư, trong đó có Outlook, không tự biến nó thành link bấm được. Đưa địa chỉ xuống ô “Nút trong email” ở cuối phiếu: chỗ đó chắc chắn bấm được, và người nhận thấy một nút thật."
          />

          <Note
            icon={Paperclip}
            title="Chưa đính kèm được tệp"
            body="Hệ thống chưa có chỗ chứa tệp cho thư đi hàng loạt, nên phiếu này không có ô chọn tệp. Cách đang dùng: tải tài liệu lên Google Drive, mở quyền xem cho người ngoài, rồi dán link đó vào ô “Nút trong email”. Ô đó chỉ có một đích đến, nên chọn một thứ đáng bấm nhất — lời mời đặt lịch không phải tranh chỗ ở đây nữa, nó có ô riêng."
          />

          <Note
            icon={CalendarClock}
            title="Không nhúng được lịch đặt hẹn vào thư"
            body="Khung chọn giờ của Calendly chạy bằng JavaScript, mà Gmail, Outlook và Apple Mail đều bóc script khỏi thư — không có hòm thư nào cho khách bấm chọn giờ ngay trong email, dù hướng dẫn của Calendly có nói gì. Cách thay: dán link Calendly vào ô “Link đặt lịch” ở cuối phiếu. Nó thành nút viền “Chọn khung giờ” nằm dưới nút chính, nên một lá thư mang được cả hai lời mời. Thêm hai tham số dưới đây thì tên và email khách được điền sẵn — khách bấm là chọn giờ luôn, không phải gõ lại, và đó là chỗ phần lớn người bỏ dở."
            sample="https://calendly.com/<lịch-của-bạn>?name={{contact_name}}&email={{email}}"
          />
        </div>
      </div>
    </Drawer>
  )
}

/** The "type this" cell — mono on a faint panel, so the eye separates the marks
 *  from the prose around them. `whitespace-pre-line` because the two bullet
 *  lines have to stand as two lines: that is the very thing being shown. */
function Sample({ children }: { children: ReactNode }) {
  return (
    <span className="block whitespace-pre-line rounded-sm bg-white/5 px-3 py-2 font-mono text-[11.5px] leading-[1.7]">
      {children}
    </span>
  )
}

/** `sample` only where the answer IS a string to copy. The other two cards tell
 *  the writer where to put something they already have; the booking card hands
 *  them a line they have to reproduce character for character, and a URL buried
 *  in a paragraph is a URL somebody retypes with a typo in it. */
function Note({
  icon,
  title,
  body,
  sample,
}: {
  icon: typeof Link
  title: string
  body: string
  sample?: string
}) {
  return (
    <GlassCard variant="b" className="flex items-start gap-3 p-4">
      <Icon icon={icon} size={16} className="text-warning mt-1 shrink-0" />
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
    type: 'Chào anh/chị {{contact_name}},',
    result: (
      <>
        Chào anh/chị <Filled>Trần Thu Hà</Filled>,
      </>
    ),
  },
  {
    id: 'account',
    want: 'Điền tên công ty',
    type: 'gửi {{account}}',
    result: (
      <>
        gửi <Filled>Công ty Misa Amis</Filled>
      </>
    ),
  },
]

/** A value the system fills in, marked so the eye catches where each recipient
 *  differs. The real letter does NOT mark it — this badge belongs to the guide,
 *  not to the mail. */
function Filled({ children }: { children: ReactNode }) {
  return <Badge tone="draft">{children}</Badge>
}
