import type { Dispatch, SetStateAction } from 'react'
import {
  Badge,
  Button,
  GlassCard,
  Icon,
  Pencil,
  SectionTitle,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import { MasRecipientBlock, type MasRecipient } from '@pv/contracts'
import type {
  CampaignPreflightResponse,
  CampaignProfile,
  CampaignWaveInput,
  MailTemplateRow,
} from '@pv/contracts'
import { formatNumber } from '@/app/i18n'
import type { useMailPreview } from '@/data/mas'
import { dmhm } from '@/lib/date'
import { MailPreviewCard } from '@/components/mail-compose-bits'
import { WaveComposer } from '@/components/mail-sequence/wave-composer'
import type { ComposerState } from '@/components/mail-sequence/wave-draft'
import { overlapNote } from './campaign-model'
import { msg } from './campaign-wave-modal-text'

/** Module 1 · the pieces of `WaveModal` that only draw — each step's body, the
 *  header count and the review list. The firing logic stays in the modal. */

/** The modal body under the stepper: the audience, or the form / review
 *  column beside the letter. Below `wide:` the letter stacks under the form. */
export function StepBody({
  step,
  campaign,
  preflight,
  preflightFailed,
  composer,
  setComposer,
  templates,
  firstRun,
  people,
  waves,
  letterReady,
  preview,
  onEdit,
}: {
  step: number
  campaign: CampaignProfile
  preflight?: CampaignPreflightResponse
  preflightFailed: boolean
  composer: ComposerState
  setComposer: Dispatch<SetStateAction<ComposerState>>
  templates: MailTemplateRow[]
  firstRun: boolean
  people: string
  waves: CampaignWaveInput[]
  letterReady: boolean
  preview: ReturnType<typeof useMailPreview>
  onEdit: (step: number) => void
}) {
  if (step === 0) return <AudienceStep preflight={preflight} failed={preflightFailed} />
  return (
    <div className="wide:grid-cols-2 grid min-w-0 items-start gap-8">
      {step === 1 ? (
        <WaveComposer
          state={composer}
          setState={setComposer}
          templates={templates}
          frame="host"
          door="campaign"
          showAdd={firstRun}
          alreadyFired={campaign.waveCount}
        />
      ) : (
        <WaveReview
          people={people}
          waves={waves}
          firstWave={campaign.waveCount + 1}
          onEdit={onEdit}
        />
      )}
      <LetterPreview
        ready={letterReady}
        preview={preview}
        to={msg(
          `${people} người nhận của ${campaign.code}`,
          `${people} recipients for ${campaign.code}`,
          `${campaign.code} 수신자 ${people}명`,
        )}
      />
    </div>
  )
}

/** The letter beside the form — sample values in the merge slots, because a
 *  campaign audience is frozen members, not a mailbox this draft can name. */
function LetterPreview({
  ready,
  preview,
  to,
}: {
  ready: boolean
  preview: ReturnType<typeof useMailPreview>
  to: string
}) {
  if (!ready)
    return (
      <p className="text-muted-foreground m-0 px-1 text-[12px] leading-[1.6]">
        {msg(
          'Nhập tiêu đề và nội dung để xem trước.',
          'Enter a subject and message to preview the email.',
          '미리 보려면 제목과 내용을 입력하세요.',
        )}
      </p>
    )
  return (
    <MailPreviewCard
      letter={preview.letter}
      pending={preview.pending}
      error={preview.error}
      envelope={[
        {
          label: msg('Từ', 'From', '보낸 사람'),
          value: preview.letter?.from ?? 'noreply · Pebble Vina',
        },
        { label: msg('Tới', 'To', '받는 사람'), value: to },
      ]}
      caption={msg(
        'Tên và công ty trong bản xem trước chỉ là ví dụ. Mỗi người nhận sẽ thấy thông tin của họ.',
        'Names and company details in this preview are examples. Each recipient will see their own.',
        '미리 보기의 이름과 회사는 예시입니다. 각 수신자에게는 본인의 정보가 표시됩니다.',
      )}
    />
  )
}

/** STEP 1 · the audience as the server reads it. Nothing to pick: the list is
 *  the campaign's, and a second place to edit it would be a second truth. */
export function AudienceStep({
  preflight,
  failed,
}: {
  preflight?: CampaignPreflightResponse
  failed: boolean
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionTitle size="md">
          {msg(
            'Ai sẽ nhận đợt này?',
            'Who will receive this wave?',
            '이번 웨이브의 수신자는 누구인가요?',
          )}
        </SectionTitle>
        <p className="text-muted-foreground m-0 max-w-[720px] text-[12.5px] leading-[1.65]">
          {msg(
            'Đợt gửi tới toàn bộ danh sách trong tab Người nhận. Để thêm hoặc bớt người, đóng cửa sổ và chỉnh danh sách ở tab đó.',
            'This wave goes to everyone in the Recipients tab. Close this window to add or remove people from that list.',
            '이 웨이브는 수신자 탭의 전체 목록으로 발송됩니다. 수신자를 추가하거나 삭제하려면 창을 닫고 해당 탭에서 목록을 수정하세요.',
          )}
        </p>
      </div>
      {preflight && <WavePreflight report={preflight} />}
      {!preflight && !failed && <Skeleton className="h-40 w-full" />}
    </section>
  )
}

/** The header count — the server's, once it answered; the audience before. */
export function ReachBadge({
  preflight,
  failed,
  campaign,
}: {
  preflight?: CampaignPreflightResponse
  failed: boolean
  campaign: CampaignProfile
}) {
  if (!preflight && !failed)
    return <Badge tone="draft">{msg('Đang kiểm tra…', 'Checking…', '확인 중…')}</Badge>
  if (!preflight)
    return (
      <Badge tone="draft">
        <span className="tnum">
          {msg(
            `${formatNumber(campaign.audienceCount)} người nhận`,
            `${formatNumber(campaign.audienceCount)} recipients`,
            `수신자 ${formatNumber(campaign.audienceCount)}명`,
          )}
        </span>
      </Badge>
    )
  return (
    <Badge tone={preflight.blocked ? 'warning' : 'success'}>
      <span className="tnum">
        {msg(
          `${formatNumber(preflight.sendable)} người sẽ nhận`,
          `${formatNumber(preflight.sendable)} will receive this`,
          `${formatNumber(preflight.sendable)}명에게 발송됩니다`,
        )}
      </span>
    </Badge>
  )
}

/** THE LAST LOOK — four lines and a way back to each, beside the letter. A
 *  chain names its length instead of one hour, because each wave carries its
 *  own. */
export function WaveReview({
  people,
  waves,
  firstWave,
  onEdit,
}: {
  people: string
  waves: CampaignWaveInput[]
  firstWave: number
  onEdit: (step: number) => void
}) {
  const one = waves.length === 1 ? waves[0] : undefined
  const rows = [
    {
      label: msg('Người nhận', 'Recipients', '수신자'),
      value: msg(`${people} người`, `${people} recipients`, `${people}명`),
      step: 0,
    },
    {
      label: msg('Đợt', 'Wave', '웨이브'),
      value: one
        ? msg(
            `Đợt ${firstWave} · ${one.label}`,
            `Wave ${firstWave} · ${one.label}`,
            `웨이브 ${firstWave} · ${one.label}`,
          )
        : msg(
            `${waves.length} đợt, từ Đợt ${firstWave}`,
            `${waves.length} waves, starting with ${firstWave}`,
            `웨이브 ${firstWave}부터 총 ${waves.length}개 웨이브`,
          ),
      step: 1,
    },
    {
      label: msg('Tiêu đề', 'Subject', '제목'),
      value: one?.subject ?? waves[0]?.subject ?? msg('Chưa có', 'Not set', '미설정'),
      step: 1,
    },
    {
      label: msg('Thời gian gửi', 'Send time', '발송 시간'),
      value: !one
        ? msg('Theo lịch của từng đợt', 'Each wave schedule', '각 웨이브 일정에 따름')
        : one.scheduledAt
          ? dmhm(one.scheduledAt)
          : msg('Gửi ngay', 'Send now', '지금 발송'),
      step: 1,
    },
  ]

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <SectionTitle size="md">
        {msg('Kiểm tra lại trước khi gửi', 'Review before sending', '발송 전 내용을 확인하세요')}
      </SectionTitle>
      <GlassCard variant="b" className="min-w-0 p-4">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((row) => (
            <li
              key={row.label}
              className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-sm py-1 pl-3 pr-1"
            >
              <span className="text-muted-foreground w-20 shrink-0 text-[11.5px]">{row.label}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.value}</span>
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => onEdit(row.step)}
              >
                <Icon icon={Pencil} size={14} />
                {msg('Sửa', 'Edit', '수정')}
              </Button>
            </li>
          ))}
        </ul>
      </GlassCard>
    </section>
  )
}

/** WHO THIS WAVE REALLY REACHES — sendable first, then one group per refusal:
 *  the first question is whether the number on the button is the number meant,
 *  the second is who fell out. Reason labels are `MAS_RECIPIENT_BLOCK_LABEL`,
 *  the vocabulary the server's send report already prints. Overlap with other
 *  running campaigns is a warning line, never a group — those people still get
 *  this letter (ADR 0061 §5). No inner scroll: the modal body already scrolls. */
function WavePreflight({ report }: { report: CampaignPreflightResponse }) {
  const sendable = report.recipients.filter((r) => !r.block)
  const groups = MasRecipientBlock.options
    .map((reason) => ({ reason, rows: report.recipients.filter((r) => r.block === reason) }))
    .filter((g) => g.rows.length > 0)
  const overlap = overlapNote(report.alsoRunning)

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-5 p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">
          {msg('Kết quả kiểm tra người nhận', 'Recipient check results', '수신자 확인 결과')}
        </span>
        <span className="text-muted-foreground text-[12px]">
          <span className="tnum text-card-foreground font-semibold">
            {formatNumber(report.sendable)}
          </span>{' '}
          {msg('có thể nhận', 'can receive', '수신 가능')} ·{' '}
          <span className="tnum">{formatNumber(report.blocked)}</span>{' '}
          {msg('bị bỏ qua', 'skipped', '건너뜀')}
        </span>
      </div>
      {overlap && (
        <p className="text-warning m-0 flex gap-2 text-[12px] leading-[1.5]">
          <Icon icon={TriangleAlert} size={16} className="shrink-0" />
          {overlap}
        </p>
      )}
      <RecipientGroup
        title={msg(
          `Sẽ nhận thư (${sendable.length})`,
          `Will receive (${sendable.length})`,
          `수신 예정 (${sendable.length})`,
        )}
        rows={sendable}
      />
      {groups.map((g) => (
        <RecipientGroup
          key={g.reason}
          title={`${localizedBlockLabel(g.reason)} (${g.rows.length})`}
          rows={g.rows}
          blocked
        />
      ))}
    </GlassCard>
  )
}

type RecipientBlock = (typeof MasRecipientBlock.options)[number]

function localizedBlockLabel(reason: RecipientBlock) {
  const labels: Record<RecipientBlock, [string, string, string]> = {
    SUPPRESSED: ['Đã chặn', 'Blocked', '차단됨'],
    NO_EMAIL: ['Thiếu email', 'Missing email', '이메일 누락'],
    DUPLICATE: ['Trùng địa chỉ', 'Duplicate address', '중복 주소'],
    UNDELIVERABLE: [
      'Tên miền không nhận thư',
      'Domain cannot receive email',
      '이메일을 받을 수 없는 도메인',
    ],
  }
  const [vi, en, ko] = labels[reason]
  return msg(vi, en, ko)
}

/** One reason and the people it applies to, NAMED rather than counted: a row
 *  nobody can name is a row nobody can go and fix. Two columns from `md` — a
 *  single file of names down a 1296px panel is mostly empty space. */
function RecipientGroup({
  title,
  rows,
  blocked = false,
}: {
  title: string
  rows: readonly MasRecipient[]
  blocked?: boolean
}) {
  if (rows.length === 0) return null

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span
        className={cn(
          'text-[12px] font-semibold',
          blocked ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {title}
      </span>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.subjectCode}
            className="bg-surface-ink/5 flex min-w-0 items-center justify-between gap-3 rounded-sm p-3"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{r.contactName}</span>
              <span className="text-muted-foreground truncate text-[11px]">{r.company}</span>
            </span>
            <span className="text-muted-foreground min-w-0 truncate font-mono text-[11px]">
              {r.email ?? msg('Chưa có email', 'No email', '이메일 없음')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
