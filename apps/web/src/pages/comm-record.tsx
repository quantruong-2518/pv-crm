import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, GlassCard, SectionTitle, Skeleton, cn } from '@pv/ui'
import type { DebriefView, MessageRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dmhm } from '@/lib/date'
import { ChannelPill, CommLateMark, CommStateBadge } from '@/components/comm-bits'
import { CommFileList } from '@/components/comm-files'
import { threadMessagesQuery } from '@/data/comms'
import { COMM_CARD_SURFACE, commRecordQuery, subjectPath } from '@/data/comm-record-detail'
import { CommRecordRead } from '@/components/comm-record-bits'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { ContextStrip } from '@/components/record/run-strip'
import { ConfirmWorkspace } from './comm-record-parts'

/** One comm record — `/comms/:id` (ADR 0075).
 *
 *  On the record shell. The owner of an open comm gets the working screen
 *  (`ConfirmWorkspace`); once done it is the read view, and anybody else sees a
 *  line saying whose it is — only the creator confirms (ADR 0075 §1 + 0074).
 *
 *  The subject is fixed at creation, so it is printed, never picked. A record
 *  mints no object code, so the strip carries the subject alone (law 10). */

export function CommRecordPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const { data: record, isPending, error } = useQuery(commRecordQuery(id))

  return (
    <AppShell {...chrome.shell}>
      {record ? (
        <RecordBody record={record} />
      ) : (
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: 'Không tìm thấy lượt liên hệ này. Có thể đường dẫn đã cũ.',
            fallback: 'Không đọc được lượt liên hệ này.',
            back: { label: 'Quay lại', onClick: () => navigate(-1) },
          }}
        />
      )}
    </AppShell>
  )
}

export default CommRecordPage

function RecordBody({ record }: { record: DebriefView }) {
  const navigate = useNavigate()
  const me = useSession((s) => s.actor)
  const mine = me?.id === record.owner.id
  const open = record.state !== 'done'
  const path = subjectPath(record.subject.code)

  const strip = (
    <ContextStrip
      objects={[
        {
          code: record.subject.code,
          source: true,
          ...(path ? { onOpen: () => navigate(path) } : {}),
        },
      ]}
    />
  )
  const header = (
    <RecordHeader
      title={record.title ?? record.subject.label}
      meta={[
        <CommStateBadge key="state" state={record.state} />,
        record.late && open && <CommLateMark key="late" late />,
        <ChannelPill key="channel" channel={record.channel} />,
        <span key="at" className="tnum">
          Tạo {dmhm(record.createdAt)}
        </span>,
        `${record.owner.name}${mine ? ' · bạn' : ''}`,
      ]}
    />
  )
  const turns = <Turns threadId={record.threadId} />

  if (open && mine) {
    return (
      <ConfirmWorkspace
        key={record.id}
        record={record}
        strip={strip}
        header={header}
        turns={turns}
      />
    )
  }

  return (
    <RecordShell
      strip={strip}
      header={header}
      main={
        <>
          {turns}
          {/* Law 8 · a list sits on glass-b. */}
          <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Tệp">
            <SectionTitle size="detail">Tệp đính kèm</SectionTitle>
            <CommFileList id={record.id} canDelete={false} />
          </GlassCard>
        </>
      }
      rail={
        open ? (
          <GlassCard className="p-5 lg:p-6">
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              Chỉ {record.owner.name}, người ghi lại lượt liên hệ này, xác nhận được nó.
            </p>
          </GlassCard>
        ) : (
          <CommRecordRead row={record} as="page" />
        )
      }
      railLabel="Xác nhận liên hệ"
    />
  )
}

/** The conversation's turns, newest first. Reading bodies writes an audit
 *  line server-side, which is the point: this screen is where they are read. */
function Turns({ threadId }: { threadId: string }) {
  const { data, isPending, error } = useQuery(threadMessagesQuery(threadId))
  const rows = data ? [...data.rows].reverse() : []

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Nội dung đã ghi">
      <SectionTitle size="detail">Nội dung đã ghi</SectionTitle>
      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-warning text-[12.5px]">
          Không đọc được các lượt trao đổi. {isApiError(error) ? userMessage(error) : ''}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[12.5px]">Chưa có lượt nào.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <Turn key={row.id} row={row} />
          ))}
        </ul>
      )}
    </GlassCard>
  )
}

function Turn({ row }: { row: MessageRow }) {
  const body =
    row.content.state === 'visible'
      ? row.content.bodyText
      : row.content.state === 'hidden'
        ? 'Vai của bạn không đọc được nội dung lượt này.'
        : 'Lượt này chưa có nội dung chữ.'
  return (
    <li className={cn('flex flex-col gap-2 rounded-md p-3', COMM_CARD_SURFACE)}>
      <span className="text-muted-foreground tnum text-[11.5px]">
        {dmhm(row.at)}
        {row.durationSec !== null && ` · ${Math.round(row.durationSec / 60)} phút`}
      </span>
      <p
        className={cn(
          'm-0 whitespace-pre-wrap break-words text-[12.5px] leading-[1.6]',
          row.content.state !== 'visible' && 'text-muted-foreground',
        )}
      >
        {body}
      </p>
    </li>
  )
}
