import type { ReactNode } from 'react'
import { Avatar, Button, Chip, GlassCard, Icon, Pencil, Plus, Send, Separator, cn } from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { CAMPAIGN_STATE_LABEL } from '@/data/campaign-book'
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
  const originNames = useOriginNames()
  const owner = campaign.ownerName ?? campaign.ownerEmail
  const origin = campaign.originId
    ? (originNames.get(campaign.originId) ?? campaign.originId)
    : undefined

  return (
    <GlassCard aria-label="Thông tin chung" className="flex flex-col p-0">
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        <div className="flex flex-wrap items-start gap-5">
          {/* Always drawn: a campaign without a picture keeps the same shape. */}
          <ThumbnailPreview
            url={campaign.thumbnailUrl ?? ''}
            broken="Ảnh không tải được"
            className="w-[176px] max-w-full shrink-0"
          />
          <div className="flex min-w-0 flex-1 basis-[320px] flex-col gap-2">
            {/* The code rides here since the strip above the card was removed. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Chip>{campaign.code}</Chip>
              <span className="text-muted-foreground tnum text-[12px]">
                Tạo {dmy(campaign.createdAt)} · sửa gần nhất {dmy(campaign.updatedAt)} lúc{' '}
                {timeOnly(campaign.updatedAt)}
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
              Sửa thông tin
            </Button>
          )}
        </div>

        <dl className="bg-surface-ink/5 m-0 grid grid-cols-2 gap-x-6 gap-y-4 rounded-md px-5 py-4 lg:grid-cols-4">
          <Fact label="Người phụ trách" unset={!owner}>
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
              'Chưa có'
            )}
          </Fact>
          <Fact label="Nguồn dẫn" unset={!campaign.sourceName}>
            {campaign.sourceName ?? 'Chưa gán'}
          </Fact>
          <Fact label="Nguồn của lead" unset={!origin}>
            {origin ?? 'Chưa gán'}
          </Fact>
          <Fact label="Ngày kết thúc" unset={!campaign.endsOn}>
            {campaign.endsOn ? dmy(campaign.endsOn) : 'Không đặt'}
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
function campaignRungs(campaign: CampaignProfile): TodoRung[] {
  const { state, waveCount } = campaign
  const wave = (no: number) => campaign.waves.find((w) => w.waveNo === no)?.run
  const started = wave(1)?.startedAt
  const finished = state === 'DONE' ? wave(waveCount)?.finishedAt : undefined

  return [
    {
      key: 'DRAFT',
      label: CAMPAIGN_STATE_LABEL.DRAFT,
      mark: state === 'DRAFT' ? 'current' : 'done',
      caption: null,
    },
    {
      key: 'RUNNING',
      label: CAMPAIGN_STATE_LABEL.RUNNING,
      mark:
        state === 'DRAFT'
          ? 'future'
          : state === 'RUNNING'
            ? 'current'
            : waveCount === 0
              ? 'skipped'
              : 'done',
      caption: started ? `Đợt 1 gửi ${dm(started)}` : null,
    },
    state === 'STOPPED'
      ? { key: 'STOPPED', label: CAMPAIGN_STATE_LABEL.STOPPED, mark: 'stopped', caption: null }
      : {
          key: 'DONE',
          label: CAMPAIGN_STATE_LABEL.DONE,
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
  const { state, audienceCount, waveCount } = campaign
  const sending = sendingWave(campaign)
  const n = (v: number) => v.toLocaleString('vi-VN')

  const sentence =
    state === 'STOPPED'
      ? 'Chiến dịch đã dừng. Muốn gửi tiếp thì tạo một chiến dịch mới.'
      : sending
        ? `Đợt ${sending.waveNo} đang gửi — đã gửi ${n(sending.run.sent)} trên ${n(sending.run.audienceCount)} thư.`
        : audienceCount === 0
          ? `Chiến dịch chưa có người nhận. Thêm người nhận từ sổ lead rồi mới gửi được đợt ${waveCount + 1}.`
          : state === 'DONE'
            ? `Mọi đợt đã gửi xong. Danh sách người nhận hiện có ${n(audienceCount)} người.`
            : `Danh sách người nhận hiện có ${n(audienceCount)} người.`

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4 lg:px-6">
      <TodoRungs rungs={campaignRungs(campaign)} label="Trạng thái chiến dịch" />
      <div className="flex min-w-0 flex-1 basis-[280px] flex-col gap-2">
        <p className="tnum m-0 text-pretty text-[13px] leading-[1.6]">{sentence}</p>
        {sending && (
          <SendProgress
            run={sending.run}
            label={`Tiến độ gửi đợt ${sending.waveNo}`}
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
              Dừng chiến dịch
            </Button>
          )}
          {onAddAudience && (
            <Button size="lg" onClick={onAddAudience} aria-haspopup="dialog">
              <Icon icon={Plus} size={16} />
              Thêm người nhận
            </Button>
          )}
          {onFire && (
            <Button size="lg" onClick={onFire} aria-haspopup="dialog">
              <Icon icon={Send} size={16} />
              Gửi đợt {waveCount + 1}
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
  return (
    <GlassCard className="flex flex-col items-center gap-2 px-5 py-12 text-center">
      <h3 className="m-0 text-[14px] font-semibold">Chưa có đợt gửi nào</h3>
      <p className="text-muted-foreground m-0 max-w-[440px] text-pretty text-[12px] leading-[1.6]">
        {stopped
          ? 'Chiến dịch đã dừng trước khi gửi đợt nào.'
          : 'Các đợt đã gửi và kết quả của từng đợt sẽ hiện tại đây.'}
      </p>
    </GlassCard>
  )
}
