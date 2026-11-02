import { useEffect, useState, type ReactNode } from 'react'
import {
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
import { Badge, DataTable, Drawer, GlassCard, Icon, SegmentedControl } from '@pv/ui'
import { SALES_INBOX } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'

/** EVERYTHING THE MAIL PANEL WOULD OTHERWISE EXPLAIN IN PLACE, in one drawer.
 *
 *  The compose panel used to carry its guidance as prose beside each field: a
 *  paragraph over the recipient box, another over the campaign select, a
 *  sentence under four checkboxes. Read once, then in the way forever — and it
 *  pushed the controls that do the work below the fold. The three parts here
 *  hold the same words, opened from the `?` in the panel's corner on the part the
 *  reader is standing on.
 *
 *  Half of the content part is about what does *not* work, because
 *  `mail-markup.ts` understands three constructs and a pasted URL leaves as
 *  dead text; saying what to do INSTEAD is the only thing that closes those
 *  loops. Its right-hand column is rendered rather than described — that is
 *  also the honest test, a sample that stopped matching the mail renderer shows
 *  up here and not in somebody's inbox. */
export type MailGuideSection = 'recipients' | 'content' | 'delivery'

const TABS: { value: MailGuideSection; label: Message }[] = [
  { value: 'recipients', label: message('Người nhận', 'Recipients', '수신자') },
  { value: 'content', label: message('Nội dung thư', 'Letter content', '메일 내용') },
  { value: 'delivery', label: message('Tuỳ chọn gửi', 'Send options', '발송 옵션') },
]

const ALL_PARTS: MailGuideSection[] = ['recipients', 'content', 'delivery']

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
  const { t } = useI18n()
  const tabs = TABS.filter((tab) => parts.includes(tab.value)).map((tab) => ({
    value: tab.value,
    label: t(tab.label),
  }))
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
      title={
        only
          ? t(message(`Hướng dẫn · ${only.label}`, `Guide · ${only.label}`, `안내 · ${only.label}`))
          : t(message('Hướng dẫn gửi email', 'Email sending guide', '이메일 발송 안내'))
      }
      subtitle={
        only
          ? undefined
          : t(
              message(
                'Hai bước: người nhận, rồi nội dung thư và tuỳ chọn gửi.',
                'Two steps: recipients, then the letter content and send options.',
                '두 단계: 수신자를 정하고, 메일 내용과 발송 옵션을 설정합니다.',
              ),
            )
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        {tabs.length > 1 && (
          <SegmentedControl
            label={t(message('Mục hướng dẫn', 'Guide sections', '안내 항목'))}
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
                key={fact.title.vi}
                tone="plain"
                icon={fact.icon}
                title={t(fact.title)}
                body={t(fact.body)}
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
type Fact = { icon: IconGlyph; title: Message; body: Message }

const RECIPIENT_FACTS: Fact[] = [
  {
    icon: Mail,
    title: message(
      'Thư đi từ noreply',
      'Letters go out from noreply',
      '메일은 noreply 주소로 발송됩니다',
    ),
    body: message(
      'Phiếu này không đổi được địa chỉ gửi.',
      'This form cannot change the sending address.',
      '이 양식에서는 발신 주소를 바꿀 수 없습니다.',
    ),
  },
  {
    icon: Reply,
    title: message('Khách bấm Trả lời', 'The customer presses Reply', '고객이 답장을 누르면'),
    body: message(
      'Thư trả lời được ghi vào hồ sơ và báo cho người giữ.',
      'The reply is logged on the record and the owner is notified.',
      '답장은 기록에 저장되고 담당자에게 알림이 갑니다.',
    ),
  },
  {
    icon: Users,
    title: message(
      'Mỗi người nhận một email riêng',
      'Each recipient gets a separate email',
      '수신자마다 별도 이메일을 받습니다',
    ),
    body: message(
      'Không ai thấy tên người khác. Tên và công ty tự điền cho từng người. Người liên hệ chính được chọn sẵn; gõ tên, công ty hoặc email để thêm người nhận.',
      "No one sees anyone else's name. Name and company are filled in for each person. The primary contact is preselected; type a name, company or email to add recipients.",
      '다른 사람의 이름은 보이지 않습니다. 이름과 회사는 사람마다 자동으로 채워집니다. 주요 연락처가 미리 선택되어 있으며, 이름·회사·이메일을 입력해 수신자를 추가할 수 있습니다.',
    ),
  },
]

const DELIVERY_FACTS: Fact[] = [
  {
    icon: Megaphone,
    title: message(
      'Chỉ gắn được chiến dịch đang chạy',
      'Only a running campaign can be attached',
      '진행 중인 캠페인만 연결할 수 있습니다',
    ),
    body: message(
      'Chiến dịch còn nháp không gắn được. Hãy bắt đầu nó từ hồ sơ chiến dịch.',
      'A draft campaign cannot be attached. Start it from the campaign record.',
      '초안 캠페인은 연결할 수 없습니다. 캠페인 상세에서 먼저 시작해 주세요.',
    ),
  },
  {
    icon: Route,
    title: message('Tên chuỗi gửi', 'Sequence name', '발송 시퀀스 이름'),
    body: message(
      'Không gắn chiến dịch thì các đợt thuộc một chuỗi riêng. Tên chuỗi dùng để gom chúng trong lịch sử gửi.',
      'Without a campaign, the waves belong to a sequence of their own. The sequence name groups them in the send history.',
      '캠페인을 연결하지 않으면 각 웨이브는 별도의 시퀀스에 속합니다. 시퀀스 이름으로 발송 건 목록에서 묶어 볼 수 있습니다.',
    ),
  },
  {
    icon: Inbox,
    title: message(
      'sales@ nhận một bản lưu mỗi lô',
      'sales@ receives one archive copy per run',
      'sales@ 주소로 발송 건마다 사본 한 부가 전달됩니다',
    ),
    body: message(
      `Hộp thư chung ${SALES_INBOX} nhận một bản BCC cho mỗi lô. Khách không thấy địa chỉ này.`,
      `The shared inbox ${SALES_INBOX} receives one BCC copy for each run. Customers do not see this address.`,
      `공용 받은편지함 ${SALES_INBOX}으로 발송 건마다 숨은참조 사본이 한 부 전달됩니다. 고객에게는 이 주소가 보이지 않습니다.`,
    ),
  },
  {
    icon: MailOpen,
    title: message('Ghi nhận lượt mở và lượt bấm', 'Track opens and clicks', '열람 및 클릭 기록'),
    body: message(
      'Bật thì lượt mở thư và lượt bấm nút hiện ở Lịch sử của hồ sơ. Tắt thì không ghi.',
      "When on, opens and button clicks show in the record's History. When off, nothing is recorded.",
      '켜면 메일 열람과 버튼 클릭이 기록의 이력에 표시됩니다. 끄면 기록하지 않습니다.',
    ),
  },
]

function ContentPart() {
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* A table ALWAYS sits on glass-b — rule 8. */}
      <GlassCard variant="b" className="overflow-hidden">
        <div className="overflow-x-auto p-4 lg:p-5">
          <DataTable
            className="min-w-[620px]"
            columns={[
              { header: t(message('Muốn gì', 'What you want', '원하는 것')), width: '1fr' },
              { header: t(message('Gõ thế này', 'Type this', '이렇게 입력')), width: '1.5fr' },
              {
                header: t(message('Thư hiện ra', 'The letter shows', '메일에 표시되는 모습')),
                width: '1.5fr',
              },
            ]}
            rows={ROWS.map((row) => ({
              id: row.id,
              cells: [
                <span key="w" className="block">
                  {t(row.want)}
                </span>,
                <Sample key="t">{t(row.type)}</Sample>,
                <span key="r" className="block text-[12.5px] leading-[1.7]">
                  {row.result(t)}
                </span>,
              ],
            }))}
          />
        </div>
      </GlassCard>

      <div className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Icon icon={CircleAlert} size={16} />
          {t(
            message(
              'Hai thứ không làm được trong thân thư',
              'Two things that do not work in the body',
              '본문에서 되지 않는 두 가지',
            ),
          )}
        </span>

        <Note
          icon={Link}
          title={t(
            message(
              'Dán link vào thân thư thì bấm không được',
              'A link pasted in the body is not clickable',
              '본문에 붙여 넣은 링크는 클릭되지 않습니다',
            ),
          )}
          body={t(
            message(
              'Nhiều hộp thư, trong đó có Outlook, không tự biến địa chỉ dán giữa câu thành link bấm được. Hãy đưa địa chỉ xuống ô “Nút trong email” ở cuối bước Nội dung để người nhận thấy một nút bấm được.',
              'Many mail clients, Outlook among them, do not turn an address pasted mid-sentence into a clickable link. Put the address in the “Email button” field at the end of the Content step so the recipient sees a button they can click.',
              'Outlook을 비롯한 많은 메일 프로그램은 문장 중간에 붙여 넣은 주소를 클릭 가능한 링크로 바꾸지 않습니다. 내용 단계 맨 아래 “이메일 버튼” 칸에 주소를 넣어 받는 사람이 누를 수 있는 버튼으로 보이게 하세요.',
            ),
          )}
        />

        <Note
          icon={Paperclip}
          title={t(
            message(
              'Chưa đính kèm được tệp',
              'Files cannot be attached yet',
              '파일을 아직 첨부할 수 없습니다',
            ),
          )}
          body={t(
            message(
              'Thư gửi hàng loạt chưa đính kèm được tệp. Hãy tải tài liệu lên Google Drive, mở quyền xem cho người ngoài, rồi dán link vào ô “Nút trong email”. Ô đó chỉ nhận một link, nên chọn tài liệu quan trọng nhất.',
              'Bulk letters cannot carry file attachments yet. Upload the document to Google Drive, open view access to outsiders, then paste the link into the “Email button” field. That field takes only one link, so pick the most important document.',
              '대량 발송 메일에는 아직 파일을 첨부할 수 없습니다. 문서를 Google Drive에 올리고 외부 사용자도 볼 수 있게 권한을 연 다음, 링크를 “이메일 버튼” 칸에 붙여 넣으세요. 이 칸에는 링크를 하나만 넣을 수 있으니 가장 중요한 문서를 고르세요.',
            ),
          )}
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

/** `tone`: the amber icon means "this will bite you". A part that merely
 *  explains how the panel behaves is not a warning and must not borrow the
 *  colour of one. */
function Note({
  icon,
  title,
  body,
  tone = 'warn',
}: {
  icon: IconGlyph
  title: string
  body: string
  tone?: 'warn' | 'plain'
}) {
  return (
    <GlassCard variant="b" className="flex items-start gap-3 p-4">
      <Icon
        icon={icon}
        size={16}
        className={tone === 'warn' ? 'text-warning mt-1 shrink-0' : 'mt-1 shrink-0'}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[12.5px] font-semibold leading-[1.45]">{title}</span>
        <span className="text-muted-foreground text-[11.5px] leading-[1.65]">{body}</span>
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
 *  The fifth — `{{email}}` — is deliberately NOT a row here: it exists for a
 *  CTA url that prefills a form; in the prose of a letter it would only print
 *  the recipient's address back at them. */
type Say = (copy: Message) => string

const SAMPLE_SIGNER = 'Quân' // i18n-ignore: a person's name in the sample

const ROWS: { id: string; want: Message; type: Message; result: (t: Say) => ReactNode }[] = [
  {
    id: 'bold',
    want: message('In đậm một cụm', 'Bold a phrase', '구절을 굵게'),
    type: message('**đúng hạn**', '**on time**', '**기한 내**'),
    result: (t) => (
      <>
        {t(message('Giao ', 'Delivered ', '6주 안에 '))}
        <strong>{t(message('đúng hạn', 'on time', '기한 내'))}</strong>
        {t(message(' trong 6 tuần.', ' within 6 weeks.', ' 납품합니다.'))}
      </>
    ),
  },
  {
    id: 'italic',
    want: message('In nghiêng', 'Italicise', '기울임'),
    type: message('_không bắt buộc_', '_optional_', '_선택 사항_'),
    result: (t) => (
      <>
        {t(message('Phí khảo sát ', 'The survey fee is ', '현장 조사 비용은 '))}
        <em>{t(message('không bắt buộc', 'optional', '선택 사항'))}</em>
        {t(message('.', '.', '입니다.'))}
      </>
    ),
  },
  {
    id: 'list',
    want: message('Danh sách gạch đầu dòng', 'Bulleted list', '글머리 기호 목록'),
    type: message(
      '- Rút ngắn vòng kiểm\n- Giảm lỗi lắp ráp',
      '- Shorter inspection cycle\n- Fewer assembly errors',
      '- 검사 주기 단축\n- 조립 오류 감소',
    ),
    result: (t) => (
      <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
        <li>{t(message('Rút ngắn vòng kiểm', 'Shorter inspection cycle', '검사 주기 단축'))}</li>
        <li>{t(message('Giảm lỗi lắp ráp', 'Fewer assembly errors', '조립 오류 감소'))}</li>
      </ul>
    ),
  },
  {
    id: 'break',
    want: message(
      'Xuống dòng trong cùng đoạn',
      'Line break within a paragraph',
      '같은 문단 안에서 줄바꿈',
    ),
    type: message('Trân trọng,\nQuân', 'Best regards,\nQuân', '감사합니다,\nQuân'),
    result: (t) => (
      <>
        {t(message('Trân trọng,', 'Best regards,', '감사합니다,'))}
        <br />
        {SAMPLE_SIGNER}
      </>
    ),
  },
  {
    id: 'para',
    want: message('Ngắt sang đoạn mới', 'Start a new paragraph', '새 문단으로 나누기'),
    type: message(
      'Câu cuối đoạn trên.\n\nCâu đầu đoạn dưới.',
      'Last sentence of the paragraph above.\n\nFirst sentence of the paragraph below.',
      '윗 문단의 마지막 문장.\n\n아랫 문단의 첫 문장.',
    ),
    result: (t) => (
      <span className="flex flex-col gap-2">
        <span>
          {t(
            message(
              'Câu cuối đoạn trên.',
              'Last sentence of the paragraph above.',
              '윗 문단의 마지막 문장.',
            ),
          )}
        </span>
        <span>
          {t(
            message(
              'Câu đầu đoạn dưới.',
              'First sentence of the paragraph below.',
              '아랫 문단의 첫 문장.',
            ),
          )}
        </span>
      </span>
    ),
  },
  {
    id: 'contact',
    want: message('Điền tên người nhận', "Insert the recipient's name", '받는 사람 이름 넣기'),
    type: message(
      'Chào {{contact_name}},',
      'Hello {{contact_name}},',
      '안녕하세요, {{contact_name}}님,',
    ),
    result: (t) => (
      <>
        {t(message('Chào ', 'Hello ', '안녕하세요, '))}
        <Filled>{t(message('anh/chị', 'Sir/Madam', '고객'))}</Filled>
        {t(message(',', ',', '님,'))}
      </>
    ),
  },
  {
    id: 'account',
    want: message('Điền tên công ty', 'Insert the company name', '회사명 넣기'),
    type: message('gửi {{account}}', 'to {{account}}', '{{account}} 귀중'),
    result: (t) => {
      const [before, after] = t(message('gửi {name}', 'to {name}', '{name} 귀중')).split('{name}')
      return (
        <>
          {before}
          <Filled>{t(message('Công ty mẫu', 'Sample Company', '샘플 회사'))}</Filled>
          {after}
        </>
      )
    },
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
