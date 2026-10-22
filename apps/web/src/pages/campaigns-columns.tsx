import type { ReactNode } from 'react'
import { Badge, cn, type TableColumn } from '@pv/ui'
import type { CampaignBookRow } from '@pv/contracts'
import { dmy } from '@/lib/date'
import { BADGE_INK } from '@/data/opportunities'
import { CAMPAIGN_STATE_LABEL, CAMPAIGN_STATE_TONE } from '@/data/campaign-book'
import { COL } from '@/components/book-columns'
import { CodeCell, DateCell, Missing, PicCell } from '@/components/book-cells'
import { nextTask, shareOf } from './campaign-model'
import { NO_OWNER } from './campaigns-filters'
import { Thumbnail } from './campaign-thumbnail'

/** The campaign book's columns and the cells under them. Header filters come
 *  in as nodes so the address wiring stays in `campaigns-filters.tsx`. */

const MUTED_LINE = 'text-muted-foreground block truncate text-[11px]'

type Can = Record<'campaign.edit' | 'campaign.broadcast', boolean>

export function campaignColumns(filters: {
  source: ReactNode
  created: ReactNode
  owner: ReactNode
}): TableColumn[] {
  return [
    { header: 'Chiến dịch', width: COL.name, sortKey: 'name', filter: filters.source },
    { header: 'Trạng thái', width: COL.status },
    { header: 'Việc tiếp theo', width: COL.text },
    { header: 'Người nhận', width: COL.number, align: 'right', sortKey: 'audienceCount' },
    { header: 'Đợt gửi', width: COL.text, align: 'right', sortKey: 'waveCount' },
    { header: 'Đã bấm', width: COL.number, align: 'right' },
    { header: 'Ngày tạo', width: COL.date, sortKey: 'createdAt', filter: filters.created },
    { header: 'Người phụ trách', width: COL.person, filter: filters.owner },
  ]
}

/** `can` decides the amber: a next task reads as a call only to a reader who
 *  may answer it. */
export function campaignCells(c: CampaignBookRow, can: Can) {
  const task = nextTask(c)
  /* Scheduled-only waves have sent nothing: still an absence, not a zero. */
  const totals = c.waveTotals && c.waveTotals.sent > 0 ? c.waveTotals : undefined
  const lastWaveAt = c.waveTotals?.lastWaveAt
  return [
    <div key="n" className="flex min-w-0 items-center gap-3">
      <Thumbnail key={c.thumbnailUrl} url={c.thumbnailUrl} />
      <div className="min-w-0">
        <span className="block truncate" title={c.name}>
          {c.name}
        </span>
        <span className={MUTED_LINE}>
          <CodeCell code={c.code} /> · {c.sourceName ?? 'chưa gán nguồn dẫn'}
        </span>
      </div>
    </div>,
    <Badge key="s" tone={CAMPAIGN_STATE_TONE[c.state]} className={BADGE_INK}>
      {CAMPAIGN_STATE_LABEL[c.state]}
    </Badge>,
    <span
      key="t"
      className={cn('block truncate', task?.needs && can[task.needs] && 'text-warning')}
    >
      {task?.label ?? <Missing why="Chưa có việc tiếp theo" />}
    </span>,
    <span key="a" className="tnum font-num">
      {c.audienceCount > 0 ? (
        c.audienceCount.toLocaleString('vi-VN')
      ) : (
        <Missing why="Chưa có người nhận" />
      )}
    </span>,
    c.waveCount > 0 ? (
      <div key="w" className="min-w-0">
        <span className="tnum block truncate">{c.waveCount} đợt</span>
        {lastWaveAt && <span className={cn(MUTED_LINE, 'tnum')}>gần nhất {dmy(lastWaveAt)}</span>}
      </div>
    ) : (
      <Missing key="w" why="Chưa gửi đợt nào" />
    ),
    totals ? (
      <div key="c" className="min-w-0">
        <span className="tnum font-num block">{totals.clicked.toLocaleString('vi-VN')}</span>
        <span className={cn(MUTED_LINE, 'tnum')}>
          {shareOf(totals.clicked, totals.delivered, 1)} trên số thư đã tới
        </span>
      </div>
    ) : (
      <Missing key="c" why="Chưa gửi thư nào" />
    ),
    <DateCell key="d" day={c.createdAt} empty="Chưa ghi nhận ngày tạo" />,
    <PicCell
      key="o"
      people={[{ id: c.ownerId, name: c.ownerName, email: c.ownerEmail }]}
      empty={NO_OWNER}
    />,
  ]
}
