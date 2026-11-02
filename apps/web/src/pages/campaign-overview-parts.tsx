import type { ReactNode } from 'react'
import { Avatar, Button, Chip, GlassCard, Icon, Pencil, Plus, Send, Separator, cn } from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { campaignStateText } from '@/data/campaign-i18n'
import { useI18n, message, translate } from '@/app/i18n'
import { useOriginNames } from '@/data/lead-origins'
import { dm, dmy } from '@/lib/date'
import { TodoRungs, type TodoRung } from '@/components/record/todo-card'
import { sendingWave, timeOnly } from './campaign-model'
import { ThumbnailPreview } from './campaign-profile-parts'
import { SendProgress } from './campaign-wave-parts'

/** Module 1 · the first card of `campaign-detail.tsx`, plus the waves tab's
 *  empty state.
 *
 *  ONE card, as the owner approved it on the canvas: who the campaign is on
 *  top, and under a rule where it stands — the ladder, one sentence, and
 *  every button that changes its state. Each fact and each act is printed
 *  once on the page. */

type Act = (() => void) | undefined

/** An absent handler is an absent button: the page owns every gate. */
export function CampaignSummary({
  campaign,
  onEdit,
  onFire,
  onAddAudience,
  onStop,
}: {
  campaign: CampaignProfile
  onEdit?: Act
  onFire?: Act
  onAddAudience?: Act
  onStop?: Act
}) {
  const { t, date } = useI18n()
  const originNames = useOriginNames()
  const owner = campaign.ownerName ?? campaign.ownerEmail
  const origin = campaign.originId
    ? (originNames.get(campaign.originId) ?? campaign.originId)
    : undefined

  return (
    <GlassCard
      aria-label={t(message('Thông tin chung', 'Overview', '개요'))}
      className="flex flex-col p-0"
    >
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        <div className="flex flex-wrap items-start gap-5">
          {/* Always drawn: a campaign without a picture keeps the same shape. */}
          <ThumbnailPreview
            url={campaign.thumbnailUrl ?? ''}
            broken={t(
              message(
                'Ảnh không tải được',
                'Image could not be loaded',
                '이미지를 불러오지 못했습니다',
              ),
            )}
            className="w-[176px] max-w-full shrink-0"
          />
          <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-2">
            {/* The code rides here since the strip above the card was removed. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Chip>{campaign.code}</Chip>
              <span className="text-muted-foreground tnum text-[12px]">
                {t(message('Tạo', 'Created', '생성'))} {dmy(campaign.createdAt)} ·{' '}
                {t(message('Sửa gần nhất', 'Updated', '최근 수정'))} {dmy(campaign.updatedAt)}{' '}
                {t(message('lúc', 'at', ''))} {timeOnly(campaign.updatedAt)}
              </span>
            </div>
            <h1 className="font-display m-0 break-words text-[26px] font-semibold leading-[1.2] tracking-[-.45px] lg:text-[30px]">
              {campaign.name}
            </h1>
            {campaign.slogan && (
              <p className="text-muted-foreground m-0 text-[15px] leading-[1.5]">
                {campaign.slogan}
              </p>
            )}
          </div>
          {onEdit && (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12 shrink-0"
              aria-haspopup="dialog"
              onClick={onEdit}
            >
              <Icon icon={Pencil} size={16} />
              {t(message('Sửa thông tin', 'Edit details', '정보 수정'))}
            </Button>
          )}
        </div>

        <dl className="bg-surface-ink/5 m-0 grid grid-cols-2 gap-x-6 gap-y-4 rounded-md px-5 py-4 lg:grid-cols-4">
          <Fact label={t(message('Người phụ trách', 'Owner', '담당자'))} unset={!owner}>
            {owner ? (
              <span className="flex min-w-0 items-center gap-2">
                <Avatar
                  name={owner}
                  email={campaign.ownerName ? campaign.ownerEmail : undefined}
                  size="sm"
                />
                <span className="truncate">{owner}</span>
              </span>
            ) : (
              t(message('Chưa có', 'Not assigned', '지정되지 않음'))
            )}
          </Fact>
          <Fact label={t(message('Nguồn dẫn', 'Source', '유입 경로'))} unset={!campaign.sourceName}>
            {campaign.sourceName ?? t(message('Chưa gán', 'Not assigned', '지정되지 않음'))}
          </Fact>
          <Fact label={t(message('Nguồn của lead', 'Lead source', '리드 출처'))} unset={!origin}>
            {origin ?? t(message('Chưa gán', 'Not assigned', '지정되지 않음'))}
          </Fact>
          <Fact label={t(message('Ngày kết thúc', 'End date', '종료일'))} unset={!campaign.endsOn}>
            {campaign.endsOn
              ? date(campaign.endsOn)
              : t(message('Không đặt', 'Not set', '설정 안 됨'))}
          </Fact>
        </dl>
      </div>

      <Separator />
      <CampaignStanding
        campaign={campaign}
        onFire={onFire}
        onAddAudience={onAddAudience}
        onStop={onStop}
      />
    </GlassCard>
  )
}

/** One fact — term above, value below, read as one pair by a screen reader.
 *  A value nobody set reads quieter than one that was. */
function Fact({ label, unset, children }: { label: string; unset: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-[11.5px]">{label}</dt>
      <dd
        className={cn(
          'tnum m-0 flex h-6 items-center truncate text-[14px]',
          unset ? 'text-muted-foreground' : 'font-semibold',
        )}
      >
        {children}
      </dd>
    </div>
  )
}

/** DRAFT → RUNNING → DONE. A stop takes the last rung's place, and a campaign
 *  stopped before any wave skipped RUNNING. Dates are the waves' own. */
function campaignRungs(
  campaign: CampaignProfile,
  lang: ReturnType<typeof useI18n>['lang'],
): TodoRung[] {
  const { state, waveCount } = campaign
  const wave = (no: number) => campaign.waves.find((w) => w.waveNo === no)?.run
  const started = wave(1)?.startedAt
  const finished = state === 'DONE' ? wave(waveCount)?.finishedAt : undefined

  return [
    {
      key: 'DRAFT',
      label: campaignStateText('DRAFT', lang),
      mark: state === 'DRAFT' ? 'current' : 'done',
      caption: null,
    },
    {
      key: 'RUNNING',
      label: campaignStateText('RUNNING', lang),
      mark:
        state === 'DRAFT'
          ? 'future'
          : state === 'RUNNING'
            ? 'current'
            : waveCount === 0
              ? 'skipped'
              : 'done',
      caption: started
        ? translate(
            message(
              `Đợt 1 gửi ${dm(started)}`,
              `Wave 1 sent ${dm(started)}`,
              `웨이브 1 발송 ${dm(started)}`,
            ),
            lang,
          )
        : null,
    },
    state === 'STOPPED'
      ? {
          key: 'STOPPED',
          label: campaignStateText('STOPPED', lang),
          mark: 'stopped',
          caption: null,
        }
      : {
          key: 'DONE',
          label: campaignStateText('DONE', lang),
          mark: state === 'DONE' ? 'done' : 'future',
          caption: finished ? dm(finished) : null,
        },
  ]
}

/** WHERE THE CAMPAIGN STANDS — the ladder, one sentence, and the acts. */
function CampaignStanding({
  campaign,
  onFire,
  onAddAudience,
  onStop,
}: {
  campaign: CampaignProfile
  onFire: Act
  onAddAudience: Act
  onStop: Act
}) {
  const { t, number } = useI18n()
  const { state, audienceCount, waveCount } = campaign
  const sending = sendingWave(campaign)
  const n = (v: number) => number(v)

  const sentence =
    state === 'STOPPED'
      ? t(
          message(
            'Chiến dịch đã dừng. Muốn gửi tiếp, tạo chiến dịch mới.',
            'This campaign has stopped. Create a new campaign to send again.',
            '캠페인이 중지되었습니다. 다시 보내려면 새 캠페인을 만드세요.',
          ),
        )
      : sending
        ? t(
            message(
              `Đợt ${sending.waveNo} đang gửi: ${n(sending.run.sent)} trên ${n(sending.run.audienceCount)} thư.`,
              `Wave ${sending.waveNo} is sending: ${n(sending.run.sent)} of ${n(sending.run.audienceCount)} emails.`,
              `웨이브 ${sending.waveNo} 발송 중: 이메일 ${n(sending.run.audienceCount)}개 중 ${n(sending.run.sent)}개.`,
            ),
          )
        : audienceCount === 0
          ? t(
              message(
                `Chưa có người nhận. Thêm người nhận để gửi đợt ${waveCount + 1}.`,
                `No recipients yet. Add recipients to send wave ${waveCount + 1}.`,
                `수신자가 없습니다. 웨이브 ${waveCount + 1} 발송을 위해 수신자를 추가하세요.`,
              ),
            )
          : state === 'DONE'
            ? t(
                message(
                  `Mọi đợt đã gửi xong. Có ${n(audienceCount)} người nhận.`,
                  `All waves sent. ${n(audienceCount)} recipients.`,
                  `모든 웨이브 발송 완료. 수신자 ${n(audienceCount)}명.`,
                ),
              )
            : t(
                message(
                  `Có ${n(audienceCount)} người nhận.`,
                  `${n(audienceCount)} recipients.`,
                  `수신자 ${n(audienceCount)}명.`,
                ),
              )

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4 lg:px-6">
      <TodoRungs
        rungs={campaignRungs(campaign, useI18n().lang)}
        label={t(message('Trạng thái chiến dịch', 'Campaign status', '캠페인 상태'))}
        className="w-full sm:w-auto"
      />
      <div className="flex min-w-0 flex-1 basis-[280px] flex-col gap-2">
        <p className="tnum m-0 text-pretty text-[13px] leading-[1.6]">{sentence}</p>
        {sending && (
          <SendProgress
            run={sending.run}
            label={t(
              message(
                `Tiến độ gửi đợt ${sending.waveNo}`,
                `Wave ${sending.waveNo} progress`,
                `웨이브 ${sending.waveNo} 진행 상황`,
              ),
            )}
            className="max-w-[420px]"
          />
        )}
      </div>
      {(onStop || onFire || onAddAudience) && (
        <div className="flex flex-wrap items-center gap-2">
          {onStop && (
            <Button
              size="lg"
              variant="ghost"
              className="text-destructive-foreground"
              onClick={onStop}
              aria-haspopup="dialog"
            >
              {t(message('Dừng chiến dịch', 'Stop campaign', '캠페인 중지'))}
            </Button>
          )}
          {onAddAudience && (
            <Button size="lg" onClick={onAddAudience} aria-haspopup="dialog">
              <Icon icon={Plus} size={16} />
              {t(message('Thêm người nhận', 'Add recipients', '수신자 추가'))}
            </Button>
          )}
          {onFire && (
            <Button size="lg" onClick={onFire} aria-haspopup="dialog">
              <Icon icon={Send} size={16} />
              {t(
                message(
                  `Gửi đợt ${waveCount + 1}`,
                  `Send wave ${waveCount + 1}`,
                  `웨이브 ${waveCount + 1} 발송`,
                ),
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** NO WAVE YET — text only: the acts that lead to a first wave live in the
 *  first card, and a second copy here would be the same button twice. */
export function WavesEmpty({ stopped }: { stopped: boolean }) {
  const { t } = useI18n()
  return (
    <GlassCard className="flex flex-col items-center gap-2 px-5 py-12 text-center">
      <h3 className="m-0 text-[14px] font-semibold">
        {t(message('Chưa có đợt gửi nào', 'No waves yet', '아직 발송 웨이브가 없습니다'))}
      </h3>
      <p className="text-muted-foreground m-0 max-w-[440px] text-pretty text-[12px] leading-[1.6]">
        {stopped
          ? t(
              message(
                'Chiến dịch đã dừng trước khi gửi đợt nào.',
                'The campaign stopped before any waves were sent.',
                '발송 웨이브가 시작되기 전에 캠페인이 중지되었습니다.',
              ),
            )
          : t(
              message(
                'Kết quả từng đợt sẽ hiện ở đây.',
                'Results for each wave will appear here.',
                '각 웨이브의 결과가 여기에 표시됩니다.',
              ),
            )}
      </p>
    </GlassCard>
  )
}
