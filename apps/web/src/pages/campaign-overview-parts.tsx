import {
  Badge,
  Button,
  Check,
  CircleAlert,
  GlassCard,
  Icon,
  Inbox,
  Link,
  Octagon,
  SectionTitle,
  Send,
  StageTrack,
  StatCard,
  TriangleAlert,
  UserMinus,
  UserPlus,
  percent,
} from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { CAMPAIGN_STATE_LABEL, CAMPAIGN_STATE_TONE } from '@/data/campaign-book'
import { CAMPAIGN_STAGES, stageIndexOf, type CampaignTab, type ReadyRow } from './campaign-model'

/** Module 1 · WHERE THE CAMPAIGN STANDS — the lifecycle band, the readiness
 *  band, and what every wave adds up to.
 *
 *  These three sit between the header and the tabs of `campaign-detail.tsx`,
 *  above whichever face is open, because all three answer questions a reader
 *  has before choosing a tab: where it is, why it cannot fire yet, what the
 *  letters have done so far. */

/** THE LIFECYCLE, AND THE ONE STATE THAT HAS NO PLACE ON IT.
 *
 *  `StageTrack` takes a plain index on purpose — read its docblock: an object
 *  off the board stands in no column, so the caller draws something else. A
 *  stopped campaign is exactly that, and permanently: `/start` refuses
 *  anything that is not a DRAFT and `/waves` refuses a STOPPED campaign by
 *  name, so there is no door back. The pill says so instead of leaving a grey
 *  bar that reads like "not there yet". */
export function CampaignStageBand({ campaign }: { campaign: CampaignProfile }) {
  const at = stageIndexOf(campaign.state)

  if (at === null) {
    return (
      <GlassCard className="flex flex-wrap items-center gap-3 p-4 lg:p-5">
        <Icon icon={Octagon} size={18} className="text-warning shrink-0" />
        <Badge tone={CAMPAIGN_STATE_TONE[campaign.state]}>
          {CAMPAIGN_STATE_LABEL[campaign.state]}
        </Badge>
        <span className="text-[12.5px] leading-[1.6]">
          Dừng là vĩnh viễn — máy chủ từ chối cả bắt đầu chạy lẫn thêm đợt cho một chiến dịch đã
          dừng. Muốn gửi tiếp thì mở chiến dịch mới.
        </span>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="flex flex-col gap-2 p-4 lg:p-5">
      <StageTrack steps={CAMPAIGN_STAGES} current={at} caption />
    </GlassCard>
  )
}

/** WHY THE NEXT WAVE CANNOT GO — as sentences beside the button, not inside a
 *  `title`. A tooltip shows for one element, after the reader already suspects
 *  something is wrong; these three lines are read before the fire button is
 *  aimed at. Each gap carries the door that closes it. */
export function ReadinessBand({
  rows,
  onFix,
}: {
  rows: ReadyRow[]
  onFix: (tab: CampaignTab) => void
}) {
  return (
    <GlassCard className="flex flex-col gap-3 p-4 lg:p-5">
      <SectionTitle>Sẵn sàng bắn chưa</SectionTitle>
      <ul className="flex flex-col gap-2">
        {rows.map(({ fix, ...row }) => (
          <li key={row.key} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Icon
              icon={row.ok ? Check : TriangleAlert}
              size={16}
              className={row.ok ? 'text-success shrink-0' : 'text-warning shrink-0'}
            />
            <span className="text-[12.5px] font-medium">{row.label}</span>
            <span className="text-muted-foreground min-w-0 flex-1 text-[12px] leading-[1.6]">
              {row.note}
            </span>
            {fix && (
              <Button
                size="md"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => onFix(fix)}
              >
                {fix === 'audience' ? 'Mở tệp nhận' : 'Mở hồ sơ'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

/** WHAT EVERY WAVE ADDS UP TO — six counters, siblings of the wave table
 *  rather than tiles inside a card (law 4). Name, slogan, audience and wave
 *  count are absent: each is already in the header or the band above. */
export function WaveTotals({ campaign }: { campaign: CampaignProfile }) {
  const totals = campaign.waves.reduce(
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

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        size="compact"
        icon={Inbox}
        value={campaign.audienceCount.toLocaleString('vi-VN')}
        label="Người nhận trong tệp"
        hint={`${campaign.waveCount} đợt đã bắn`}
      />
      <StatCard
        size="compact"
        icon={Send}
        value={totals.sent.toLocaleString('vi-VN')}
        label="Thư đã rời máy"
        hint="cộng mọi đợt"
      />
      <StatCard
        size="compact"
        icon={UserPlus}
        value={totals.opened.toLocaleString('vi-VN')}
        label="Có người mở"
        hint={totals.delivered > 0 ? percent(totals.opened / totals.delivered) : '—'}
      />
      {/* The only signal nobody fires on the reader's behalf — an open is a
          pixel proxies trip by themselves. The composer writes a CTA and a
          booking link, so measuring without this measures the wrong thing. */}
      <StatCard
        size="compact"
        icon={Link}
        value={totals.clicked.toLocaleString('vi-VN')}
        label="Đã bấm liên kết"
        hint={totals.delivered > 0 ? percent(totals.clicked / totals.delivered) : '—'}
      />
      {/* The one number that says the LIST is being spent rather than worked.
          Bounce costs the Resend account; this costs the audience itself, and
          it never comes back. */}
      <StatCard
        size="compact"
        icon={UserMinus}
        value={totals.unsubscribed.toLocaleString('vi-VN')}
        label="Hủy đăng ký"
        hint={totals.delivered > 0 ? percent(totals.unsubscribed / totals.delivered) : '—'}
      />
      <StatCard
        size="compact"
        icon={CircleAlert}
        value={totals.bounced.toLocaleString('vi-VN')}
        label="Bounce"
        hint={
          totals.sent > 0
            ? `${percent(totals.bounced / totals.sent)} · trần ${campaign.bounceCeilingPercent}%`
            : `trần ${campaign.bounceCeilingPercent}%`
        }
      />
    </div>
  )
}
