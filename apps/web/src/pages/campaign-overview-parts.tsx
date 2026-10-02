import {
  Button,
  CircleAlert,
  GlassCard,
  Icon,
  Link,
  MailOpen,
  Progress,
  Send,
  StatCard,
  UserMinus,
  Users,
} from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { CAMPAIGN_STATE_LABEL } from '@/data/campaign-book'
import { dm } from '@/lib/date'
import { RecordHeader } from '@/components/record/record-header'
import { TodoCard, type TodoRung } from '@/components/record/todo-card'
import { shareOf } from './campaign-model'
import { ThumbnailPreview } from './campaign-profile-parts'

/** Module 1 · the blocks of `campaign-detail.tsx` that are not a tab: who the
 *  campaign is, its todo card, what its waves add up to, the first-wave call.
 *
 *  The lifecycle band and the readiness band were removed on 28/09 at the
 *  owner's request; the reasons a wave cannot go are said inside the dialog
 *  that fires it. Since 02/10 the state is the todo card's ladder (ADR 0078). */

/** WHO THE CAMPAIGN IS — thumbnail, name, then one meta line. The slogan,
 *  owner and source are printed here only: the read-only profile tab leaves
 *  them out. No back button and no state badge — the nav and the ladder say it. */
export function CampaignHeader({ campaign }: { campaign: CampaignProfile }) {
  const header = (
    <RecordHeader
      title={campaign.name}
      meta={[
        campaign.slogan,
        campaign.ownerName ? `Chủ ${campaign.ownerName}` : 'Chưa có chủ',
        campaign.sourceName && `Nguồn ${campaign.sourceName}`,
        <span className="tnum">Mở {dm(campaign.createdAt)}</span>,
      ]}
    />
  )
  if (!campaign.thumbnailUrl) return header

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
      <ThumbnailPreview
        url={campaign.thumbnailUrl}
        empty="Chưa có ảnh"
        broken="Ảnh không tải được"
        className="w-[184px] shrink-0"
      />
      <div className="min-w-0 flex-1">{header}</div>
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
      caption: started ? `Đợt 1 ${dm(started)}` : null,
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

/** THE TODO CARD — the ladder and the fire act as the primary; the stop is in
 *  the floating bar's more menu. An absent handler is an absent button: the
 *  page owns the gate. */
export function CampaignTodo({
  campaign,
  onFire,
}: {
  campaign: CampaignProfile
  onFire?: (() => void) | undefined
}) {
  return (
    <TodoCard
      rungs={campaignRungs(campaign)}
      rungsLabel="Trạng thái chiến dịch"
      primary={
        onFire && (
          <Button size="lg" onClick={onFire} aria-haspopup="dialog">
            <Icon icon={Send} size={16} />
            Gửi đợt {campaign.waveCount + 1}
          </Button>
        )
      }
    />
  )
}

/** WHAT EVERY WAVE ADDS UP TO — one hero and four tiles, no number twice.
 *
 *  The hero is composed from GlassCard + Progress because `StatCard` has no
 *  2×2 size and no slot for a bar. */
export function WaveResults({ campaign }: { campaign: CampaignProfile }) {
  const t = campaign.waves.reduce(
    (acc, w) => ({
      sent: acc.sent + w.run.sent,
      delivered: acc.delivered + w.run.delivered,
      opened: acc.opened + w.run.opened,
      clicked: acc.clicked + w.run.clicked,
      unsubscribed: acc.unsubscribed + w.run.unsubscribed,
      bounced: acc.bounced + w.run.bounced,
    }),
    { sent: 0, delivered: 0, opened: 0, clicked: 0, unsubscribed: 0, bounced: 0 },
  )
  const n = (v: number) => v.toLocaleString('vi-VN')

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <GlassCard className="col-span-2 flex flex-col justify-between gap-5 p-5 lg:row-span-2">
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">
            Thư đã gửi sau {campaign.waveCount} đợt
          </span>
          <span className="tnum font-num text-[42px] font-semibold leading-none tracking-[-1.5px]">
            {n(t.sent)}
          </span>
        </div>
        <Progress
          value={t.sent > 0 ? t.delivered / t.sent : 0}
          label={`Tới nơi · ${n(t.delivered)} thư`}
        />
      </GlassCard>
      {/* Count only: `opened` is a noisy lower bound, and a share would read it
          as truth. */}
      <StatCard size="compact" icon={MailOpen} value={n(t.opened)} label="Có người mở" />
      {/* The only signal nobody fires on the reader's behalf — an open is a
          pixel proxies trip by themselves. */}
      <StatCard
        size="compact"
        icon={Link}
        value={n(t.clicked)}
        label="Đã bấm liên kết"
        hint={`${shareOf(t.clicked, t.delivered)} số tới nơi`}
      />
      {/* The audience being spent rather than worked — it never comes back. */}
      <StatCard
        size="compact"
        tone={t.unsubscribed > 0 ? 'danger' : 'default'}
        icon={UserMinus}
        value={n(t.unsubscribed)}
        label="Hủy đăng ký"
        hint={`${shareOf(t.unsubscribed, t.delivered, 1)} số tới nơi`}
      />
      <StatCard
        size="compact"
        tone={t.bounced > 0 ? 'danger' : 'default'}
        icon={CircleAlert}
        value={n(t.bounced)}
        label={`Bounce · trần ${campaign.bounceCeilingPercent}%`}
        hint={`${shareOf(t.bounced, t.sent, 1)} số đã gửi`}
      />
    </div>
  )
}

/** NO WAVE YET — the whole tab is one call, because counters of nothing and an
 *  empty table only say "zero" three times before the reader finds the button.
 *
 *  An empty audience turns the call around: a dialog that must refuse to send
 *  is a worse first door than the tab where people are added — but only for a
 *  reader who may add them; anyone else gets the fact and a way to look. */
export function WavesEmpty({
  campaign,
  canFire,
  canEdit,
  onFire,
  onAudience,
}: {
  campaign: CampaignProfile
  canFire: boolean
  canEdit: boolean
  onFire: () => void
  onAudience: () => void
}) {
  const stopped = campaign.state === 'STOPPED'
  const noAudience = campaign.audienceCount === 0
  const addFirst = noAudience && !stopped && canEdit
  const line = stopped
    ? 'Chiến dịch đã dừng trước khi gửi đợt nào — muốn gửi thì mở một chiến dịch mới.'
    : addFirst
      ? 'Chưa có ai để gửi — thêm người nhận trước, rồi chọn mẫu thư. Kết quả sẽ hiện tại đây.'
      : noAudience
        ? 'Chiến dịch chưa có người nhận nào.'
        : `Chọn mẫu thư rồi gửi cho cả ${campaign.audienceCount.toLocaleString('vi-VN')} người. Kết quả sẽ hiện tại đây.`

  return (
    <GlassCard className="flex flex-col items-center gap-5 px-5 py-12 text-center">
      <div className="flex max-w-[520px] flex-col items-center gap-2">
        <h3 className="text-[18px] font-semibold">Chưa có đợt mail nào</h3>
        <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">{line}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {canFire && !stopped && !noAudience && (
          <Button size="lg" onClick={onFire} aria-haspopup="dialog">
            <Icon icon={Send} size={16} />
            Tạo đợt mail đầu tiên
          </Button>
        )}
        <Button size="lg" variant={addFirst ? 'default' : 'ghost'} onClick={onAudience}>
          <Icon icon={Users} size={16} />
          {addFirst ? 'Thêm người nhận' : 'Xem người nhận'}
        </Button>
      </div>
    </GlassCard>
  )
}
