import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, DataTable, GlassCard, SectionTitle } from '@pv/ui'
import type { PendingDebriefRow } from '@pv/contracts'
import { useSession } from '@/app/auth'
import { dmhm, dmy } from '@/lib/date'
import { ChannelPill, CommLateMark, CommStateBadge } from '@/components/comm-bits'
import { CommFileDrop } from '@/components/comm-files'
import { CommTimelineTrack, type CommCardItem } from '@/components/comm-timeline'
import { commCountsQuery, subjectKindLabel } from '@/data/comm-record-detail'
import { commRecordPath } from '@/data/comm-records'

/** The blocks of the my-comms queue (`/comms`): the timeline (the shared
 *  track, fed from pending rows), the selected comm's panel and the team's
 *  counts (ADR 0075). */

const itemOf = (row: PendingDebriefRow): CommCardItem => ({
  id: row.id,
  channel: row.thread.channel,
  state: row.state,
  late: row.late,
  createdAt: row.createdAt,
  title: row.subject.label,
  titleMuted: false,
  meta: `${row.subject.code} · ${dmhm(row.createdAt)} · ${row.turnsCovered} lượt`,
  step: null,
})

export function QueueTimeline({
  rows,
  selected,
  onSelect,
}: {
  rows: PendingDebriefRow[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const items = [...rows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  return (
    /* Law 8 · a long list sits on glass-b. */
    <GlassCard variant="b" className="p-4 sm:p-5" aria-label="Dòng thời gian liên hệ">
      <CommTimelineTrack items={items.map(itemOf)} selectedId={selected} onSelect={onSelect} />
    </GlassCard>
  )
}

/** The picked comm, with the one drop zone and the way into its page. */
export function SelectedComm({ row }: { row: PendingDebriefRow }) {
  const navigate = useNavigate()
  const open = () => navigate(commRecordPath(row.id))
  const target = row.stepTarget

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="comm-picked">
      <span className="flex flex-wrap items-center gap-2">
        <ChannelPill channel={row.thread.channel} />
        <CommStateBadge state={row.state} />
        <CommLateMark late={row.late} />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <h2 id="comm-picked" className="m-0 break-words text-[15px] font-semibold">
          {row.subject.label}
        </h2>
        <span className="text-muted-foreground tnum text-[11.5px]">
          <span className="font-mono">{row.subject.code}</span> · {dmhm(row.createdAt)} ·{' '}
          {row.turnsCovered} lượt
        </span>
      </span>

      <CommFileDrop id={row.id} />

      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.6]">
        {target
          ? `Bước tiếp theo sẽ đặt cho ${subjectKindLabel(row.subject.code).toLowerCase()} ${row.subject.code}.`
          : `${subjectKindLabel(row.subject.code)} ${row.subject.code} không nhận bước tiếp theo từ lượt liên hệ này.`}
      </p>

      {/* Navigates only; the real confirm is the submit on the comm page. */}
      <Button size="lg" onClick={open}>
        {row.state === 'empty' ? 'Thêm nội dung' : 'Mở để xác nhận'}
      </Button>
    </GlassCard>
  )
}

/** Pending per person — shown only when the answer covers more than the
 *  reader's own row, i.e. to a seat that sees a team. Counts only: a manager
 *  never confirms someone else's comm (ADR 0074). */
export function TeamCounts() {
  const me = useSession((s) => s.actor)
  const { data } = useQuery(commCountsQuery)
  const rows = data?.rows ?? []
  if (!rows.some((r) => r.ownerId !== me?.id)) return null

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-3 p-4 sm:p-5"
      aria-label="Liên hệ chưa hoàn thiện theo người"
    >
      <SectionTitle size="detail">Liên hệ chưa hoàn thiện theo người</SectionTitle>
      <DataTable
        columns={[
          { header: 'Người', width: '1.4fr' },
          { header: 'Số lượt liên hệ', width: '0.8fr', align: 'right' },
          { header: 'Cũ nhất', width: '1fr', align: 'right' },
        ]}
        rows={rows.map((r) => ({
          id: r.ownerId,
          cells: [
            r.name,
            <span key="n" className="tnum font-num">
              {r.pending}
            </span>,
            <span key="o" className="tnum">
              {dmy(r.oldestAt)}
            </span>,
          ],
        }))}
      />
    </GlassCard>
  )
}
