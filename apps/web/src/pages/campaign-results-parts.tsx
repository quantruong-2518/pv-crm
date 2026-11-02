import type { ReactNode } from 'react'
import { CircleCheck, GlassCard, Icon, TriangleAlert, cn, type IconGlyph } from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { formatNumber, message, useI18n } from '@/app/i18n'
import {
  bounceOver,
  shareOf,
  waveRisks,
  waveTotals,
  wavesInOrder,
  type WaveRisk,
} from './campaign-model'

/** Module 1 · what a campaign's waves add up to — the bento above the tabs,
 *  one row: the funnel, then a column chart per measure.
 *
 *  Drawn only once a wave has sent something: a block of zeros reads as a
 *  result when it is an absence. Bars are plain divs on tokens, and every bar
 *  has its figure printed beside it. No gradient on the big tile (law 15). */

/** The per-wave tiles compare the newest waves; older ones are in the tab. */
const CHART_WAVES = 5
/** How far past the ceiling the bounce scale runs, so a bar at the ceiling
 *  still has room to be seen crossing it. */
const BOUNCE_SCALE = 1.2
/** The best click rate shown fills this much of its track, leaving headroom. */
const TOP_CLICK_FILL = 0.85

const n = (v: number) => formatNumber(v)
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

const TEXT = {
  noEmailsHaveBeenSent: message(
    'Chưa gửi thư nào. Kết quả sẽ hiện sau khi đợt đầu bắt đầu gửi.',
    'No emails have been sent yet. Results will appear once the first wave starts.',
    '아직 발송된 이메일이 없습니다. 첫 웨이브가 시작되면 결과가 표시됩니다.',
  ),
  clicksAsAShareOf: message(
    'Số người bấm trên số thư tới nơi',
    'Clicks as a share of delivered emails',
    '도착 이메일 중 클릭 비율',
  ),
  theActiveWaveStopsAutomatically: message(
    'Vượt ngưỡng sẽ tự dừng đợt đang gửi',
    'The active wave stops automatically when it exceeds the limit',
    '한도를 초과하면 진행 중인 웨이브가 자동으로 중지됩니다',
  ),
}

export function CampaignResults({ campaign }: { campaign: CampaignProfile }) {
  const { t, number } = useI18n()
  const n = number
  /* Waves that are only scheduled have sent nothing: still an absence. */
  const gone = wavesInOrder(campaign).filter((w) => w.run.sent > 0)
  if (gone.length === 0) {
    /* A named, empty place rather than nothing: the owner looked for the
       charts on a campaign that had not sent yet and could not find them. */
    return (
      <GlassCard className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <h2 className="m-0 text-[14px] font-semibold">
          {t(message('Hiệu quả chiến dịch', 'Campaign performance', '캠페인 성과'))}
        </h2>
        <p className="text-muted-foreground m-0 max-w-[480px] text-pretty text-[12px] leading-[1.6]">
          {t(TEXT.noEmailsHaveBeenSent)}
        </p>
      </GlassCard>
    )
  }

  const recent = gone.slice(-CHART_WAVES)
  const total = waveTotals(gone)
  const risks = campaign.state === 'STOPPED' ? [] : waveRisks(campaign)
  const title = t(
    message(
      `Hiệu quả sau ${gone.length} đợt gửi`,
      `Performance across ${gone.length} waves`,
      `웨이브 ${gone.length}개 성과`,
    ),
  )

  const topRate = Math.max(...recent.map((w) => ratio(w.run.clicked, w.run.delivered)))
  const bounceScale = (campaign.bounceCeilingPercent / 100) * BOUNCE_SCALE
  const ceiling = t(
    message(
      `Ngưỡng ${campaign.bounceCeilingPercent}%`,
      `${campaign.bounceCeilingPercent}% limit`,
      `${campaign.bounceCeilingPercent}% 한도`,
    ),
  )

  return (
    <section aria-label={title} className="grid gap-4 lg:grid-cols-12">
      <FunnelCard title={title} total={total} />

      <Tile
        title={t(message('Tỉ lệ bấm theo đợt', 'Click rate by wave', '웨이브별 클릭률'))}
        subtitle={t(TEXT.clicksAsAShareOf)}
        className="lg:col-span-3"
      >
        <Columns
          items={recent.map(({ waveNo, run }) => ({
            key: waveNo,
            label: t(message(`Đợt ${waveNo}`, `Wave ${waveNo}`, `웨이브 ${waveNo}`)),
            value: shareOf(run.clicked, run.delivered, 1),
            /* Scaled to the best wave shown: click rates are a few percent,
               and on a 0–100 scale every column would be the same sliver. */
            fill: topRate > 0 ? (ratio(run.clicked, run.delivered) / topRate) * TOP_CLICK_FILL : 0,
            caption: t(
              message(
                `${n(run.clicked)} trên ${n(run.delivered)}`,
                `${n(run.clicked)} of ${n(run.delivered)}`,
                `${n(run.delivered)}개 중 ${n(run.clicked)}개`,
              ),
            ),
          }))}
        />
      </Tile>

      <Tile
        title={t(message('Thư bị trả lại theo đợt', 'Bounces by wave', '웨이브별 반송'))}
        subtitle={t(TEXT.theActiveWaveStopsAutomatically)}
        aside={
          <span className="text-muted-foreground flex shrink-0 items-center gap-2 text-[12px]">
            <span aria-hidden="true" className="bg-destructive h-0.5 w-4" />
            {ceiling}
          </span>
        }
        className="lg:col-span-3"
      >
        <Columns
          ceiling={1 / BOUNCE_SCALE}
          items={recent.map(({ waveNo, run }) => {
            const over = bounceOver(run, campaign) === true
            return {
              key: waveNo,
              label: t(message(`Đợt ${waveNo}`, `Wave ${waveNo}`, `웨이브 ${waveNo}`)),
              value: shareOf(run.bounced, run.sent, 1),
              fill: bounceScale > 0 ? ratio(run.bounced, run.sent) / bounceScale : 0,
              tone: over ? 'bg-destructive' : 'bg-warning',
              caption: t(
                message(
                  `${n(run.bounced)} trên ${n(run.sent)}${over ? ' · vượt ngưỡng' : ''}`,
                  `${n(run.bounced)} of ${n(run.sent)}${over ? ' · over limit' : ''}`,
                  `${n(run.sent)}개 중 ${n(run.bounced)}개${over ? ' · 한도 초과' : ''}`,
                ),
              ),
            }
          })}
        />
      </Tile>

      {risks.length > 0 && <RiskTile waveCount={campaign.waveCount} risks={risks} />}
    </section>
  )
}

function FunnelCard({ title, total }: { title: string; total: ReturnType<typeof waveTotals> }) {
  const { t, number: n } = useI18n()
  return (
    <GlassCard className="flex min-w-0 flex-col gap-5 p-5 lg:col-span-6">
      <div className="flex flex-col gap-3">
        <h2 className="m-0 text-[16px] font-semibold">{title}</h2>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum font-num text-[48px] font-semibold leading-none tracking-[-1.5px]">
            {n(total.clicked)}
          </span>
          <span className="text-muted-foreground tnum text-[13px]">
            {t(message('người đã bấm liên kết', 'recipients clicked a link', '명이 링크를 클릭함'))}{' '}
            · {shareOf(total.clicked, total.delivered, 1)}{' '}
            {t(message('số thư tới nơi', 'of delivered emails', '도착한 이메일 중'))}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        <span className="text-muted-foreground text-[11.5px]">
          {t(message('Từ lúc gửi đến lượt bấm', 'From sent to clicked', '발송부터 클릭까지'))}
        </span>
        <ul className="m-0 flex flex-1 list-none flex-col justify-between gap-3 p-0">
          <FunnelRow
            label={t(message('Đã gửi', 'Sent', '발송'))}
            value={total.sent}
            note={t(message('thư', 'emails', '이메일'))}
            fill={1}
          />
          <FunnelRow
            label={t(message('Tới nơi', 'Delivered', '도착'))}
            value={total.delivered}
            note={`${shareOf(total.delivered, total.sent, 1)} ${t(message('số đã gửi', 'of sent emails', '발송된 이메일 중'))}`}
            fill={ratio(total.delivered, total.sent)}
          />
          {/* No share for opens: `opened` is a lower bound, and the note says so. */}
          <FunnelRow
            label={t(message('Có người mở', 'Opened', '열람'))}
            value={total.opened}
            note={t(message('mức tối thiểu', 'minimum', '최소치'))}
            fill={ratio(total.opened, total.sent)}
          />
          <FunnelRow
            label={t(message('Đã bấm', 'Clicked', '클릭'))}
            value={total.clicked}
            note={`${shareOf(total.clicked, total.delivered, 1)} ${t(message('số tới nơi', 'of delivered emails', '도착한 이메일 중'))}`}
            fill={ratio(total.clicked, total.sent)}
            tone="bg-success"
          />
        </ul>
      </div>
    </GlassCard>
  )
}

function RiskTile({ waveCount, risks }: { waveCount: number; risks: WaveRisk[] }) {
  const { t } = useI18n()
  return (
    <Tile
      title={t(
        message(
          `Rủi ro trước đợt ${waveCount + 1}`,
          `Risks before wave ${waveCount + 1}`,
          `웨이브 ${waveCount + 1} 발송 전 위험 요소`,
        ),
      )}
      className="lg:col-span-12"
    >
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-8 gap-y-5 p-0">
        {risks.map((risk) => (
          <li key={risk.key} className="flex min-w-0 gap-3">
            <Icon
              icon={RISK_ICON[risk.sign]}
              size={20}
              className={cn('shrink-0', RISK_TONE[risk.sign])}
            />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-[11.5px]">{risk.tag}</span>
              <span className="text-[13px] font-semibold">{risk.title}</span>
              <span className="text-muted-foreground tnum text-pretty text-[12px] leading-[1.5]">
                {risk.text}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  )
}

const RISK_ICON: Record<WaveRisk['sign'], IconGlyph> = {
  ok: CircleCheck,
  watch: TriangleAlert,
  over: TriangleAlert,
}

/* The tag line carries the verdict in words; the tint only repeats it. */
const RISK_TONE: Record<WaveRisk['sign'], string> = {
  ok: 'text-success',
  watch: 'text-warning',
  over: 'text-destructive-foreground',
}

function Tile({
  title,
  subtitle,
  aside,
  className,
  children,
}: {
  title: string
  subtitle?: string
  /** Top right of the tile — the bounce legend. */
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <GlassCard className={cn('flex min-w-0 flex-col gap-3 p-5', className)}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="m-0 text-[14px] font-semibold">{title}</h3>
          {subtitle && <p className="text-muted-foreground m-0 text-[12px]">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </GlassCard>
  )
}

const fillStyle = (fill: number) => ({ width: `${Math.min(Math.max(fill, 0), 1) * 100}%` })

/** One step of the funnel on one line: name, bar, then the figure and what it
 *  is a share of. The bar is hidden from a screen reader, which gets the text. */
function FunnelRow({
  label,
  value,
  note,
  fill,
  tone = 'bg-primary',
}: {
  label: string
  value: number
  note: string
  /** 0–1 of the track, clamped. */
  fill: number
  tone?: string
}) {
  return (
    <li className="grid grid-cols-[96px_minmax(0,1fr)_150px] items-center gap-3">
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      <span aria-hidden="true" className="bg-surface-ink/10 block h-5 rounded-sm">
        <span className={cn('block h-full min-w-1 rounded-sm', tone)} style={fillStyle(fill)} />
      </span>
      <span className="min-w-0">
        <span className="tnum font-num text-[15px] font-semibold">{n(value)}</span>{' '}
        <span className="text-muted-foreground tnum text-[12px]">{note}</span>
      </span>
    </li>
  )
}

type Column = {
  key: number
  label: string
  value: string
  /** 0–1 of the plot height, clamped. */
  fill: number
  tone?: string
  /** The counts behind the rate, under the wave's name. */
  caption: string
}

/** A column per wave, oldest on the left, so a trend reads left to right.
 *  The plot is hidden from a screen reader; the list under it says the same.
 *  `ceiling` draws the limit across the plot at that share of its height. */
function Columns({ items, ceiling }: { items: Column[]; ceiling?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <div aria-hidden="true" className="relative flex min-h-36 flex-1 items-end gap-6">
        {items.map((c) => (
          <div key={c.key} className="flex h-full max-w-24 flex-1 flex-col justify-end gap-1">
            <span className="tnum font-num text-center text-[15px] font-semibold">{c.value}</span>
            <span
              className={cn('mx-auto block min-h-1 w-12 rounded-t-sm', c.tone ?? 'bg-primary')}
              style={{ height: `${Math.min(Math.max(c.fill, 0), 1) * 78}%` }}
            />
          </div>
        ))}
        {ceiling !== undefined && (
          <span
            className="bg-destructive absolute inset-x-0 h-0.5"
            style={{ bottom: `${ceiling * 78}%` }}
          />
        )}
      </div>
      <span aria-hidden="true" className="bg-surface-ink/10 -mt-2 block h-px" />
      <ul className="m-0 flex list-none gap-6 p-0">
        {items.map((c) => (
          <li key={c.key} className="flex max-w-24 flex-1 flex-col items-center gap-1 text-center">
            <span className="text-[12px] font-semibold">{c.label}</span>
            <span className="sr-only">{c.value}</span>
            <span className="text-muted-foreground tnum text-[11px] leading-[1.4]">
              {c.caption}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
