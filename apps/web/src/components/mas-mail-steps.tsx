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
import { MAIL_NAME_MAX, SALES_INBOX } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { recipientBlockLabel } from '@/components/mail-letter/letter-model'
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

const ADD_RECIPIENT = message('Thêm người nhận', 'Add a recipient', '수신자 추가')

const NO_EMAIL = message('Chưa có email', 'No email yet', '이메일 없음')

/** `n` people, said per language (no plural in Vietnamese or Korean). */
const peopleOf = (n: number) =>
  message(`${n} người`, `${n} ${n === 1 ? 'person' : 'people'}`, `${n}명`)

/** The server's answer about the list on screen — or nothing yet. */
export type RecipientVerdicts = { report?: MasPreflightResponse; checking: boolean }

/** STEP 1 · who receives it — full width, no letter beside it (G-Bulk): the
 *  question here is people, and the preview returns once there is a letter. */
export function RecipientsStep({
  draft,
  recipients,
  onSearch,
  chosen,
  verdicts,
}: {
  draft: MasMailDraft
  recipients: readonly MasRecipient[]
  onSearch?: (text: string) => void
  chosen: readonly MasRecipient[]
  verdicts: RecipientVerdicts
}) {
  const { t } = useI18n()
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
      <SectionTitle size="md">
        {t(message('Gửi tới ai?', 'Who receives it?', '누구에게 보낼까요?'))}
      </SectionTitle>

      {/* NO TOKENS: the grid below holds the same people with their addresses,
          and two rows of the same names is one too many. */}
      <Field label={t(ADD_RECIPIENT)} className="max-w-[480px]">
        <PersonTokenField
          label={t(ADD_RECIPIENT)}
          placeholder={t(message('Thêm người nhận…', 'Add a recipient…', '수신자 추가…'))}
          tokens={[]}
          onSearch={onSearch}
          suggestions={recipients
            .filter((lead) => !draft.selected.has(lead.code))
            .map((lead) => ({
              id: lead.code,
              name: lead.contactName,
              note: [
                lead.destinationLabel,
                lead.contactTitle || t(message('Chưa có chức danh', 'No job title', '직함 없음')),
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
  const { t } = useI18n()
  const [filter, setFilter] = useState<'all' | 'blocked'>('all')
  const { report, checking } = verdicts
  const byCode = new Map(report?.recipients.map((row) => [row.subjectCode, row]))
  const blocked = report?.blocked ?? 0
  const cells = chosen.filter((lead) => filter === 'all' || byCode.get(lead.code)?.block)
  const summary = t(
    report
      ? message(
          `${chosen.length} đã chọn · ${report.sendable} sẽ nhận · ${blocked} bị chặn`,
          `${chosen.length} selected · ${report.sendable} will receive · ${blocked} blocked`,
          `${chosen.length}명 선택 · ${report.sendable}명 수신 · ${blocked}명 차단`,
        )
      : checking
        ? message(
            `${chosen.length} đã chọn · đang kiểm tra…`,
            `${chosen.length} selected · checking…`,
            `${chosen.length}명 선택 · 확인 중…`,
          )
        : message(
            `${chosen.length} đã chọn`,
            `${chosen.length} selected`,
            `${chosen.length}명 선택`,
          ),
  )

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <span className="tnum text-[13px] font-semibold leading-5">{summary}</span>
        <SegmentedControl
          label={t(message('Lọc người nhận', 'Filter recipients', '수신자 필터'))}
          hideLabel
          tone="quiet"
          value={filter}
          onChange={(value) => setFilter(value as 'all' | 'blocked')}
          options={[
            { value: 'all', label: t(message('Tất cả', 'All', '전체')) },
            { value: 'blocked', label: t(message('Bị chặn', 'Blocked', '차단됨')), count: blocked },
          ]}
        />
      </div>

      {cells.length === 0 ? (
        <p className="text-glass-foreground m-0 text-[12px] leading-5">
          {chosen.length === 0
            ? t(message('Chưa chọn ai.', 'Nobody selected yet.', '선택한 수신자가 없습니다.'))
            : t(
                message(
                  'Không ai bị chặn trong danh sách này.',
                  'Nobody in this list is blocked.',
                  '이 목록에는 차단된 수신자가 없습니다.',
                ),
              )}
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
          {t(
            message(
              `${report.hidden} người nhận bị ẩn theo quyền của bạn, sẽ không nhận email.`,
              `${report.hidden} ${report.hidden === 1 ? 'recipient is' : 'recipients are'} hidden by your permissions and will not get the email.`,
              `권한에 따라 숨겨진 수신자 ${report.hidden}명은 이메일을 받지 않습니다.`,
            ),
          )}
        </p>
      )}
      {report?.apolloCount ? (
        <p className="text-warning m-0 text-[12px] leading-5">
          <Icon icon={TriangleAlert} size={14} className="mr-2 inline align-middle" />
          {t(
            message(
              `Có ${report.apolloCount} liên hệ từ Apollo. Chỉ gửi khi đã xác nhận họ đồng ý nhận email.`,
              `${report.apolloCount} ${report.apolloCount === 1 ? 'contact comes' : 'contacts come'} from Apollo. Send only if they have agreed to receive email.`,
              `Apollo 출처 연락처가 ${report.apolloCount}명 있습니다. 이메일 수신 동의를 확인한 경우에만 보내세요.`,
            ),
          )}
        </p>
      ) : null}
      <p className="text-glass-foreground m-0 text-[12px] leading-5">
        {t(
          message(
            'Kết quả kiểm tra hiện trên từng dòng.',
            'Check results appear on each row.',
            '확인 결과는 각 행에 표시됩니다.',
          ),
        )}
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
  const { t, lang } = useI18n()
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
          {lead.email || t(NO_EMAIL)}
        </span>
      </span>
      {verdict?.block ? (
        <Badge tone="warning">{recipientBlockLabel(verdict.block, lang)}</Badge>
      ) : verdict ? (
        <span
          role="img"
          aria-label={t(message('Sẽ gửi', 'Will send', '발송 예정'))}
          className="text-success flex shrink-0"
        >
          <Icon icon={Check} size={14} />
        </span>
      ) : null}
      <button
        type="button"
        aria-label={t(
          message(
            `Bỏ ${lead.contactName}`,
            `Remove ${lead.contactName}`,
            `${lead.contactName} 제외`,
          ),
        )}
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
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Checkbox
        className="min-h-12"
        disabled={!allowed}
        checked={draft.saveAsTemplate && allowed}
        onChange={draft.setSaveAsTemplate}
        label={t(
          message(
            'Lưu nội dung này thành mẫu',
            'Save this content as a template',
            '이 내용을 템플릿으로 저장',
          ),
        )}
        /* The only hint left in the form: not guidance, but the reason a
           control is locked, and it has to stand beside that control. */
        {...(allowed
          ? {}
          : {
              hint: t(
                message(
                  'Cần quyền sửa mẫu email. Thư vẫn gửi bình thường.',
                  'Editing email templates needs permission. The email still sends normally.',
                  '이메일 템플릿을 수정할 권한이 필요합니다. 메일은 정상적으로 발송됩니다.',
                ),
              ),
            })}
      />
      {allowed && draft.saveAsTemplate && (
        <Field
          label={t(message('Tên mẫu', 'Template name', '템플릿 이름'))}
          required
          hint={t(
            message(
              "Cả đội thấy tên này trong ô 'Bắt đầu từ mẫu'.",
              "The whole team sees this name in the 'Start from a template' box.",
              "팀 전체가 '템플릿으로 시작' 칸에서 이 이름을 봅니다.",
            ),
          )}
        >
          <Input
            aria-required
            value={draft.templateName}
            maxLength={MAIL_NAME_MAX}
            placeholder={t(
              message(
                'VD: Chào lần đầu, nhà máy thực phẩm',
                'e.g. First hello, food factory',
                '예: 첫 인사, 식품 공장',
              ),
            )}
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
  const { t } = useI18n()
  const chained = draft.campaignCode === NO_CAMPAIGN && waves > 1
  const code = draft.campaignCode
  const summary = [
    code !== NO_CAMPAIGN
      ? t(message(`Chiến dịch ${code}`, `Campaign ${code}`, `캠페인 ${code}`))
      : chained
        ? t(message(`Chuỗi: ${sequenceName}`, `Chain: ${sequenceName}`, `시퀀스: ${sequenceName}`))
        : t(message('Không gắn chiến dịch', 'No campaign', '캠페인 없음')),
    draft.trackEngagement
      ? t(message('ghi nhận mở và bấm', 'tracks opens and clicks', '열람·클릭 기록'))
      : t(message('không ghi nhận mở, bấm', 'no open or click tracking', '열람·클릭 기록 안 함')),
  ].join(' · ')

  return (
    <SendOptions forceOpen={forceOpen} summary={summary}>
      {/* Only RUNNING campaigns: attaching a wave to a DRAFT one sends the mail
          while `campaign.state` stays DRAFT, so its start button still passes
          its own guard and blasts the whole audience a second time. */}
      {allowCampaign && (
        <Field
          label={t(message('Chiến dịch (không bắt buộc)', 'Campaign (optional)', '캠페인 (선택)'))}
          hint={t(
            message(
              'Chỉ chiến dịch đang chạy mới hiện ở đây.',
              'Only running campaigns appear here.',
              '진행 중인 캠페인만 여기에 표시됩니다.',
            ),
          )}
        >
          <Select
            label={t(message('Chiến dịch', 'Campaign', '캠페인'))}
            hideLabel
            size="lg"
            className="w-full"
            value={draft.campaignCode}
            onChange={draft.setCampaignCode}
            options={[
              {
                value: NO_CAMPAIGN,
                label: t(
                  message(
                    'Chuỗi riêng, không gắn chiến dịch',
                    'Standalone chain, no campaign',
                    '캠페인 없는 단독 시퀀스',
                  ),
                ),
              },
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
        <Field
          label={t(
            message(
              'Tên chuỗi gửi · tự điền, sửa được',
              'Chain name · filled in, editable',
              '발송 시퀀스 이름 · 자동 입력, 수정 가능',
            ),
          )}
        >
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
        label={t(
          message(
            'Ghi nhận khi khách mở email hoặc bấm nút',
            'Track when the customer opens the email or presses a button',
            '고객이 이메일을 열거나 버튼을 누르면 기록',
          ),
        )}
        hint={t(
          message(
            'Lượt mở và lượt bấm hiện ở Lịch sử của hồ sơ.',
            'Opens and clicks show in the record history.',
            '열람과 클릭은 기록의 이력에 표시됩니다.',
          ),
        )}
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
  const { t } = useI18n()
  const sendable = report?.sendable ?? 0
  const later = isLater(waves)
  return (
    <MailSendConfirm
      open={open && Boolean(report)}
      title={t(message('Xác nhận gửi', 'Confirm sending', '발송 확인'))}
      subtitle={
        later
          ? t(
              message(
                'Trước giờ hẹn vẫn dừng được ở sổ lô gửi.',
                'Until the scheduled time you can still stop it in the mail runs list.',
                '예약 시간 전까지는 발송 건 목록에서 중단할 수 있습니다.',
              ),
            )
          : t(
              message(
                'Thư đã vào hàng đợi thì không rút lại được.',
                'Once emails are in the queue they cannot be recalled.',
                '대기열에 들어간 메일은 회수할 수 없습니다.',
              ),
            )
      }
      rows={confirmRows(chosen, sendable, waves, queued, t)}
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
  t: (copy: Message) => string,
): ConfirmRow[] {
  const only = chosen.length === 1 ? chosen[0] : undefined
  const left = waves.length
  const first = waves[0]?.scheduledAt
  const mails = (n: number) =>
    message(`${n} thư`, `${n} ${n === 1 ? 'email' : 'emails'}`, `메일 ${n}건`)
  const rounds = (n: number) =>
    message(`${n} đợt`, `${n} ${n === 1 ? 'wave' : 'waves'}`, `웨이브 ${n}개`)
  return [
    {
      label: t(message('Người nhận', 'Recipients', '수신자')),
      value: only
        ? `${only.contactName} · ${only.email}`
        : chosen.length === sendable
          ? t(peopleOf(sendable))
          : t(
              message(
                `${chosen.length} người đã chọn · ${sendable} sẽ nhận`,
                `${chosen.length} selected · ${sendable} will receive`,
                `${chosen.length}명 선택 · ${sendable}명 수신`,
              ),
            ),
    },
    {
      label: t(message('Số đợt', 'Waves', '웨이브')),
      value:
        queued > 0
          ? t(
              message(
                `${left} đợt còn lại · ${queued} đợt đã xếp hàng`,
                `${left} ${left === 1 ? 'wave' : 'waves'} left · ${queued} already queued`,
                `남은 웨이브 ${left}개 · 대기열 웨이브 ${queued}개`,
              ),
            )
          : t(rounds(left)),
    },
    {
      label: t(message('Tổng số thư', 'Total emails', '총 메일 수')),
      value:
        left > 1
          ? t(
              message(
                `${sendable} × ${left} = ${sendable * left} thư`,
                `${sendable} × ${left} = ${sendable * left} emails`,
                `${sendable} × ${left} = 메일 ${sendable * left}건`,
              ),
            )
          : t(mails(sendable)),
    },
    {
      label: t(message('Thời điểm', 'Timing', '발송 시점')),
      value: `${
        first
          ? t(message(`Lúc ${dmhm(first)}`, `At ${dmhm(first)}`, `${dmhm(first)}에`))
          : t(message('Gửi ngay', 'Send now', '즉시 발송'))
      }${
        left > 1
          ? t(
              message(
                ' · các đợt sau theo giờ đặt ở từng đợt',
                ' · later waves follow the time set on each wave',
                ' · 이후 웨이브는 각 웨이브에 설정한 시간에 발송',
              ),
            )
          : ''
      }`,
    },
    {
      label: t(message('Bản lưu nội bộ', 'Internal copy', '내부 보관본')),
      value: t(
        message(
          `${SALES_INBOX} nhận một bản BCC mỗi đợt`,
          `${SALES_INBOX} gets a BCC copy of each wave`,
          `${SALES_INBOX} 주소로 웨이브마다 BCC 사본이 발송됩니다`,
        ),
      ),
    },
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
  const { t } = useI18n()
  if (checking)
    return <Badge tone="draft">{t(message('Đang kiểm tra…', 'Checking…', '확인 중…'))}</Badge>
  if (!report) {
    return (
      <Badge tone="draft">
        {t(message(`${picked} đã chọn`, `${picked} selected`, `${picked}명 선택`))}
      </Badge>
    )
  }
  return (
    <Badge tone={report.blocked ? 'warning' : 'success'}>
      {t(
        message(
          `${report.sendable} người sẽ nhận`,
          `${report.sendable} will receive`,
          `${report.sendable}명 수신`,
        ),
      )}
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
  const { t } = useI18n()
  if (!ready) return <PreviewPlaceholder />
  const to = previewLead ? `${previewLead.contactName} · ${previewLead.email || t(NO_EMAIL)}` : '—'

  return (
    <MailPreviewCard
      letter={preview.letter}
      pending={preview.pending}
      error={preview.error}
      recipients={chosen.map((lead) => ({
        code: lead.code,
        label: t(
          message(
            `Như ${lead.contactName} nhận`,
            `As ${lead.contactName} receives it`,
            `${lead.contactName}님이 받는 모습`,
          ),
        ),
      }))}
      recipientCode={previewLead?.code}
      onRecipient={onRecipient}
      envelope={[
        {
          label: t(message('Từ', 'From', '보낸 사람')),
          value: preview.letter?.from ?? 'noreply · Pebble Vina',
        },
        { label: t(message('Tới', 'To', '받는 사람')), value: to },
        {
          label: t(message('Trả lời về', 'Replies go to', '회신 주소')),
          value: t(
            message('địa chỉ riêng của thư này', "this email's own address", '이 메일 전용 주소'),
          ),
        },
      ]}
      caption={t(
        message(
          'Mỗi người nhận một thư riêng, tên điền theo từng người. Không đính kèm tệp được.',
          'Each recipient gets their own email, with their name filled in. Files cannot be attached.',
          '수신자마다 별도 메일이 발송되며 이름이 자동으로 채워집니다. 파일은 첨부할 수 없습니다.',
        ),
      )}
    />
  )
}

/** Nothing written yet, so nothing to render — one dim line in the column the
 *  letter will occupy, not a card that announces its own emptiness. */
function PreviewPlaceholder() {
  const { t } = useI18n()
  return (
    <p className="text-muted-foreground m-0 px-1 text-[11.5px] leading-[1.6]">
      {t(
        message(
          'Bản xem trước hiện khi bước "Nội dung" có tiêu đề và nội dung.',
          'The preview appears once the "Content" step has a subject and a body.',
          '"내용" 단계에 제목과 본문이 있으면 미리보기가 표시됩니다.',
        ),
      )}
    </p>
  )
}
