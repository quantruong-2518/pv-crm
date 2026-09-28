import {
  ArrowLeft,
  Badge,
  Button,
  CalendarDays,
  CircleAlert,
  ContextRail,
  GlassCard,
  Icon,
  Link,
  MailOpen,
  MetaPill,
  Octagon,
  Progress,
  Route,
  ScreenHeader,
  Send,
  StatCard,
  UserMinus,
  Users,
} from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { CAMPAIGN_STATE_LABEL, CAMPAIGN_STATE_TONE } from '@/data/campaign-book'
import { dm } from '@/lib/date'
import { shareOf } from './campaign-model'
import { ThumbnailPreview } from './campaign-profile-parts'

/** Module 1 · the blocks of `campaign-detail.tsx` that are not a tab: who the
 *  campaign is, what its waves add up to, the first-wave call, and the bar that
 *  carries the two acts.
 *
 *  The lifecycle band and the readiness band were removed on 28/09 at the
 *  owner's request: the state badge already names the lifecycle, and the
 *  reasons a wave cannot go are said inside the dialog that fires it. */

/** WHO THE CAMPAIGN IS — thumbnail, name and state, slogan, one row of pills.
 *
 *  Not `ScreenHeader`'s own `back`: it would sit right of the thumbnail, and
 *  the way out belongs above everything. The code rides in the pill row as the
 *  ContextRail chip (law 10) rather than as a second, plain pill. */
export function CampaignIdentity({
  campaign,
  onBack,
}: {
  campaign: CampaignProfile
  onBack: () => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12 self-start" onClick={onBack}>
        <Icon icon={ArrowLeft} size={16} />
        Sổ chiến dịch
      </Button>
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
        <ThumbnailPreview
          url={campaign.thumbnailUrl ?? ''}
          empty="Chưa có ảnh"
          broken="Ảnh không tải được"
          className="w-[184px] shrink-0"
        />
        <ScreenHeader
          className="min-w-0 flex-1"
          title={
            <span className="flex flex-wrap items-center gap-3">
              {campaign.name}
              {/* `font-sans`: the badge sits inside the `h2`, which carries
                  `font-display` — a badge is body text (law 6). */}
              <Badge tone={CAMPAIGN_STATE_TONE[campaign.state]} className="font-sans">
                {CAMPAIGN_STATE_LABEL[campaign.state]}
              </Badge>
            </span>
          }
          description={campaign.slogan}
          meta={
            <>
              <ContextRail objects={[{ code: campaign.code, source: true }]} />
              {campaign.ownerName ? (
                <MetaPill avatar={campaign.ownerName}>{campaign.ownerName}</MetaPill>
              ) : (
                <MetaPill icon={Users}>Chưa có chủ</MetaPill>
              )}
              {campaign.sourceName && <MetaPill icon={Route}>Nguồn {campaign.sourceName}</MetaPill>}
              <MetaPill icon={CalendarDays} mono>
                Mở {dm(campaign.createdAt)}
              </MetaPill>
            </>
          }
        />
      </div>
    </div>
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
      <GlassCard className="relative isolate col-span-2 flex flex-col justify-between gap-5 overflow-hidden p-5 lg:row-span-2">
        <Icon
          icon={Send}
          size={64}
          className="text-muted-foreground pointer-events-none absolute -bottom-1 -right-2 rotate-[-22deg] scale-[1.4] opacity-20"
        />
        <div className="relative z-10 flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">
            Thư đã gửi sau {campaign.waveCount} đợt
          </span>
          <span className="tnum font-num text-[42px] font-semibold leading-none tracking-[-1.5px]">
            {n(t.sent)}
          </span>
        </div>
        <Progress
          className="relative z-10"
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

/** THE TWO ACTS, PINNED — reachable from any tab and any scroll depth.
 *
 *  Fixed, not sticky: the tabs change the page height under it, and a sticky
 *  bar would jump with each one. The offsets are `BookSelectionBar`'s, so it
 *  clears the BottomNav below `lg`. No `shadow-*` utility: it would override
 *  `.glass-overlay`'s theme-aware `--shadow-pop`. An absent handler is an
 *  absent button. */
export function CampaignActionBar({
  nextWave,
  onFire,
  onStop,
}: {
  nextWave: number
  onFire?: () => void
  onStop?: () => void
}) {
  if (!onFire && !onStop) return null

  return (
    <div
      role="region"
      aria-label="Thao tác chiến dịch"
      className="glass-overlay fixed bottom-[calc(84px+env(safe-area-inset-bottom)+8px)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg p-2 lg:bottom-6"
    >
      {onStop && (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={onStop}
          aria-haspopup="dialog"
        >
          <Icon icon={Octagon} size={16} />
          Dừng chiến dịch
        </Button>
      )}
      {onFire && (
        <Button size="md" className="pointer-coarse:h-12" onClick={onFire} aria-haspopup="dialog">
          <Icon icon={Send} size={16} />
          Bắn đợt {nextWave}
        </Button>
      )}
    </div>
  )
}
