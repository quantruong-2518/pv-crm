import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  ContextRail,
  GlassCard,
  Icon,
  Inbox,
  Lock,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Skeleton,
  TriangleAlert,
  cn,
} from '@pv/ui'
import type { DebriefView, MessageRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dmhm } from '@/lib/date'
import { ChannelPill, CommLateMark, CommStateBadge } from '@/components/comm-bits'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { threadMessagesQuery } from '@/data/comms'
import {
  COMM_CARD_SURFACE,
  commRecordQuery,
  subjectKindLabel,
  subjectPath,
} from '@/data/comm-record-detail'
import { CommRecordRead } from '@/components/comm-record-bits'
import { ConfirmForm } from './comm-record-parts'

/** One comm record — `/comms/:id` (ADR 0075).
 *
 *  Left: what was recorded — the turns of the conversation and the files, in
 *  two columns (drop zone · list). Right: the confirm form for the owner while
 *  the record is open, the read view once done, and for anybody else a line
 *  saying whose it is — only the creator confirms (ADR 0075 §1 + 0074).
 *
 *  The subject is fixed at creation, so it is printed, never picked. A record
 *  mints no object code, so the rail carries the subject alone, as the story's
 *  open object (law 10). */

export function CommRecordPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const { data: record, isPending, error } = useQuery(commRecordQuery(id))
  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <ScreenLayout>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </ScreenLayout>,
    )
  }

  if (!record) {
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'not-found'
    const denied = failure?.kind === 'forbidden'
    return shell(
      <ScreenLayout>
        <GlassCard className="flex flex-col items-center gap-3 p-6 py-12 text-center">
          <Icon
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            size={24}
            className="text-muted-foreground"
          />
          <p className="text-muted-foreground text-[12.5px] leading-[1.6]">
            {missing
              ? 'Không tìm thấy lượt liên hệ này. Có thể đường dẫn đã cũ.'
              : (failure && userMessage(failure)) || 'Không đọc được lượt liên hệ này.'}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => navigate('/comms')}
          >
            Về Liên hệ của tôi
          </Button>
        </GlassCard>
      </ScreenLayout>,
    )
  }

  return shell(<RecordBody record={record} />)
}

export default CommRecordPage

function RecordBody({ record }: { record: DebriefView }) {
  const navigate = useNavigate()
  const me = useSession((s) => s.actor)
  const mine = me?.id === record.owner.id
  const open = record.state !== 'done'
  const path = subjectPath(record.subject.code)

  return (
    <ScreenLayout>
      <GlassCard variant="b" className="p-4">
        <ScreenHeader
          back={{ label: 'Liên hệ của tôi', onClick: () => navigate('/comms') }}
          title={record.subject.label}
          meta={
            <>
              <CommStateBadge state={record.state} />
              <CommLateMark late={record.late && open} />
              <ChannelPill channel={record.channel} />
              <MetaPill mono>Tạo {dmhm(record.createdAt)}</MetaPill>
              <MetaPill avatar={record.owner.name}>
                {record.owner.name}
                {mine && ' · bạn'}
              </MetaPill>
              <MetaPill>
                Gắn với {subjectKindLabel(record.subject.code)} {record.subject.code}
              </MetaPill>
            </>
          }
        />
      </GlassCard>

      <ContextRail
        objects={[
          {
            code: record.subject.code,
            source: true,
            ...(path ? { onOpen: () => navigate(path) } : {}),
          },
        ]}
      />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Turns threadId={record.threadId} />
          {/* Law 8 · a list sits on glass-b. */}
          <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Tệp">
            <SectionTitle size="detail">Tệp đính kèm</SectionTitle>
            <div className={cn('grid gap-4', mine && open && 'lg:grid-cols-2')}>
              {mine && open && <CommFileDrop id={record.id} />}
              <CommFileList id={record.id} canDelete={mine && open} />
            </div>
          </GlassCard>
        </div>

        <aside className="flex min-w-0 flex-col gap-6" aria-label="Xác nhận liên hệ">
          {!open ? (
            <CommRecordRead row={record} as="page" />
          ) : mine ? (
            <ConfirmForm key={record.id} record={record} />
          ) : (
            <GlassCard className="p-5 lg:p-6">
              <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
                Chỉ {record.owner.name}, người ghi lại lượt liên hệ này, xác nhận được nó.
              </p>
            </GlassCard>
          )}
        </aside>
      </div>
    </ScreenLayout>
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
