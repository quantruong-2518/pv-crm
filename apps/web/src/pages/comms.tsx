import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ContextRail,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  PenLine,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  SegmentedControl,
  Skeleton,
} from '@pv/ui'
import { COMM_RECORD_STATE_LABEL, type CommRecordState } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { pendingCommsQuery, subjectPath } from '@/data/comm-record-detail'
import { QueueTimeline, SelectedComm, TeamCounts } from './comms-parts'

/** The my-comms queue — `/comms` (ADR 0075).
 *
 *  My open records, one tab per open state, on a 3:1 grid: the timeline left,
 *  the picked record and the team's counts right. `done` has no tab:
 *  `GET /comms/debriefs/pending` returns open records only, and a done one is
 *  read on its subject's timeline.
 *
 *  A late record (server flag, unconfirmed past the deadline) carries the
 *  late mark on its card. The rail follows the picked record's subject (law 10). */

type Tab = Exclude<CommRecordState, 'done'>
const TABS: Tab[] = ['empty', 'unconfirmed']

export function CommsPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { data, isPending, error } = useQuery(pendingCommsQuery())
  const rows = data?.rows ?? []
  const count = (tab: Tab) => rows.filter((r) => r.state === tab).length

  /* Open on the tab that has work in it; the reader's own pick wins after that. */
  const [chosen, setChosen] = useState<Tab | null>(null)
  const tab = chosen ?? (count('unconfirmed') > 0 ? 'unconfirmed' : 'empty')
  const shown = rows.filter((r) => r.state === tab)
  const [picked, setPicked] = useState<string | null>(null)
  const newest = shown.reduce<(typeof shown)[number] | null>(
    (best, r) => (!best || r.createdAt > best.createdAt ? r : best),
    null,
  )
  const selected = shown.find((r) => r.id === picked) ?? newest
  const path = selected ? subjectPath(selected.subject.code) : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title="Comm của tôi"
          description="Comm tạo từ lịch gặp đã kết thúc, từ nút Gọi · Zalo · Gửi mail và từ Ghi liên hệ. Thêm nội dung, đính kèm tệp rồi xác nhận."
          actions={
            <Button
              size="md"
              className="pointer-coarse:h-12"
              onClick={() => navigate('/comms/log')}
            >
              <Icon icon={PenLine} size={16} />
              Ghi liên hệ
            </Button>
          }
        />

        <SegmentedControl
          label="Trạng thái comm"
          hideLabel
          tone="quiet"
          value={tab}
          onChange={(v) => {
            setChosen(v as Tab)
            setPicked(null)
          }}
          options={TABS.map((t) => ({
            value: t,
            label: COMM_RECORD_STATE_LABEL[t],
            count: count(t),
          }))}
          className="self-start"
        />

        <ContextRail
          objects={
            selected
              ? [
                  {
                    code: selected.subject.code,
                    source: true,
                    ...(path ? { onOpen: () => navigate(path) } : {}),
                  },
                ]
              : []
          }
        />

        <ScreenDetailGrid
          sideLabel="Comm đang chọn"
          main={
            isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : error ? (
              <GlassCard className="p-5">
                <p role="alert" className="text-warning m-0 text-[12.5px]">
                  Không đọc được danh sách comm. {isApiError(error) ? userMessage(error) : ''}
                </p>
              </GlassCard>
            ) : shown.length === 0 ? (
              <GlassCard variant="b" className="p-6">
                <EmptyState
                  icon={Inbox}
                  message={`Không có comm nào ở trạng thái “${COMM_RECORD_STATE_LABEL[tab]}”.`}
                  action={{ label: 'Ghi liên hệ', onClick: () => navigate('/comms/log') }}
                />
              </GlassCard>
            ) : (
              <>
                <QueueTimeline rows={shown} selected={selected?.id ?? null} onSelect={setPicked} />
                {data && data.total > rows.length && (
                  <p className="text-muted-foreground tnum m-0 text-[11.5px]">
                    Đang hiện {rows.length}/{data.total} comm chưa hoàn thiện.
                  </p>
                )}
              </>
            )
          }
          side={
            <>
              {selected && <SelectedComm key={selected.id} row={selected} />}
              {/* Counts stand even when my own queue is empty: that is a manager's view. */}
              <TeamCounts />
            </>
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}

export default CommsPage
