import type { ReactNode } from 'react'
import { Badge, cn, type TableColumn } from '@pv/ui'
import type { CampaignBookRow } from '@pv/contracts'
import { dm } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { CAMPAIGN_STATE_TONE } from '@/data/campaign-book'
import { COL } from '@/components/book-columns'
import { CodeCell, DateCell, Missing, PicCell } from '@/components/book-cells'
import { shareOf } from './campaign-model'
import { NO_OWNER } from './campaigns-filters'
import { Thumbnail } from './campaign-thumbnail'
import { formatNumber, message, translate, type Lang } from '@/app/i18n'
import { campaignStateText } from '@/data/campaign-i18n'

/** The campaign book's columns and the cells under them. Header filters come
 *  in as nodes so the address wiring stays in `campaigns-filters.tsx`. */

const MUTED_LINE = 'text-muted-foreground block truncate text-[11px]'
const FIGURE = 'tnum font-num block text-[15px] font-semibold'

const count = (n: number, lang: Lang) => formatNumber(n, lang)

/** One figure per cell — the header carries the unit, the tooltip the raw
 *  counts behind a rate. A plain function: this file exports builders only. */
function figure(key: string, value: string, why?: string, warn = false) {
  return (
    <span key={key} className={cn(FIGURE, warn && 'text-warning')} title={why}>
      {value}
    </span>
  )
}

export function campaignColumns(
  filters: {
    source: ReactNode
    created: ReactNode
    owner: ReactNode
  },
  lang: Lang,
): TableColumn[] {
  const t = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  return [
    {
      header: t('Chiến dịch', 'Campaign', '캠페인'),
      width: COL.name,
      sortKey: 'name',
      filter: filters.source,
    },
    { header: t('Trạng thái', 'Status', '상태'), width: COL.status },
    {
      header: t('Số người nhận', 'Recipients', '수신자'),
      width: COL.status,
      align: 'right',
      sortKey: 'audienceCount',
    },
    {
      header: t('Số đợt đã gửi', 'Mail runs', '발송 횟수'),
      width: COL.status,
      align: 'right',
      sortKey: 'waveCount',
    },
    {
      header: t('Số thư đã gửi', 'Emails sent', '발송한 이메일'),
      width: COL.status,
      align: 'right',
    },
    {
      header: t('Tỉ lệ thư đến nơi', 'Delivery rate', '전달률'),
      width: COL.status,
      align: 'right',
    },
    { header: t('Tỉ lệ bấm link', 'Click rate', '클릭률'), width: COL.status, align: 'right' },
    {
      header: t('Ngày tạo', 'Created', '생성일'),
      width: COL.date,
      sortKey: 'createdAt',
      filter: filters.created,
    },
    { header: t('Người phụ trách', 'Owner', '담당자'), width: COL.person, filter: filters.owner },
  ]
}

export function campaignCells(c: CampaignBookRow, lang: Lang) {
  const t = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  /* Scheduled-only waves have sent nothing: still an absence, not a zero. */
  const totals = c.waveTotals && c.waveTotals.sent > 0 ? c.waveTotals : undefined
  const lastWaveAt = c.waveTotals?.lastWaveAt
  return [
    <div key="n" className="flex min-w-0 items-center gap-4">
      <Thumbnail key={c.thumbnailUrl} url={c.thumbnailUrl} />
      <div className="min-w-0">
        <span className="block truncate font-medium" title={c.name}>
          {c.name}
        </span>
        <span className={MUTED_LINE}>
          <CodeCell code={c.code} /> ·{' '}
          {c.sourceName ?? t('chưa gán nguồn dẫn', 'No source assigned', '유입 경로 없음')}
        </span>
      </div>
    </div>,
    <Badge key="s" tone={CAMPAIGN_STATE_TONE[c.state]} className={BADGE_INK}>
      {campaignStateText(c.state, lang)}
    </Badge>,
    c.audienceCount > 0 ? (
      figure('a', count(c.audienceCount, lang))
    ) : (
      <Missing key="a" why={t('Chưa có người nhận', 'No recipients yet', '수신자 없음')} />
    ),
    c.waveCount > 0 ? (
      figure(
        'w',
        count(c.waveCount, lang),
        lastWaveAt &&
          t(
            `Đợt cuối gửi ngày ${dm(lastWaveAt)}`,
            `Last sent ${dm(lastWaveAt)}`,
            `${dm(lastWaveAt)}에 마지막 발송`,
          ),
      )
    ) : (
      <Missing key="w" why={t('Chưa gửi đợt nào', 'No mail runs yet', '발송 내역 없음')} />
    ),
    totals ? (
      figure('m', count(totals.sent, lang))
    ) : (
      <Missing key="m" why={t('Chưa gửi thư nào', 'No emails sent yet', '발송한 이메일 없음')} />
    ),
    totals ? (
      figure(
        'r',
        shareOf(totals.delivered, totals.sent),
        t(
          `${count(totals.delivered, lang)} trên ${count(totals.sent, lang)} thư đến hộp thư`,
          `${count(totals.delivered, lang)} of ${count(totals.sent, lang)} emails delivered`,
          `${count(totals.sent, lang)}개 중 ${count(totals.delivered, lang)}개 전달`,
        ) +
          (totals.bounced > 0
            ? t(
                ` · ${count(totals.bounced, lang)} thư bị trả lại`,
                ` · ${count(totals.bounced, lang)} bounced`,
                ` · 반송 ${count(totals.bounced, lang)}개`,
              )
            : ''),
        totals.bounced > 0,
      )
    ) : (
      <Missing key="r" why={t('Chưa gửi thư nào', 'No emails sent yet', '발송한 이메일 없음')} />
    ),
    totals ? (
      figure(
        'c',
        shareOf(totals.clicked, totals.delivered),
        t(
          `${count(totals.clicked, lang)} trên ${count(totals.delivered, lang)} thư đến nơi có bấm link`,
          `${count(totals.clicked, lang)} of ${count(totals.delivered, lang)} delivered emails had a link click`,
          `전달된 이메일 ${count(totals.delivered, lang)}개 중 ${count(totals.clicked, lang)}개에서 링크 클릭`,
        ),
      )
    ) : (
      <Missing key="c" why={t('Chưa gửi thư nào', 'No emails sent yet', '발송한 이메일 없음')} />
    ),
    <DateCell
      key="d"
      day={c.createdAt}
      empty={t('Chưa ghi nhận ngày tạo', 'No creation date', '생성일 없음')}
    />,
    <PicCell
      key="o"
      people={[{ id: c.ownerId, name: c.ownerName, email: c.ownerEmail }]}
      empty={t(NO_OWNER, 'No owner', '담당자 없음')}
    />,
  ]
}
