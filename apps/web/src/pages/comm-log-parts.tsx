import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Check,
  GlassCard,
  Icon,
  Paperclip,
  SearchField,
  Skeleton,
  Textarea,
  X,
  cn,
} from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  MESSAGE_BODY_MAX,
  type CommActionChannel,
  type CommAttachmentMime,
  type PendingDebriefRow,
  type WorkstreamRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dmhm } from '@/lib/date'
import { ChannelPill, CommStateBadge } from '@/components/comm-bits'
import { Field } from '@/components/field-bits'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import {
  COMM_CARD_SURFACE,
  COMM_FILE_EXTENSIONS,
  COMM_FOCUS,
  checkCommFile,
  fileSizeLabel,
  pendingCommsQuery,
  subjectKindLabel,
} from '@/data/comm-record-detail'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQuery } from '@/data/workstreams'

/** Steps 1–3 of the manual log on a phone, plus the collapsed line a finished
 *  step folds into. Step 4 and the save live in `comm-log.tsx`.
 *
 *  Everything pressable is 48px tall (law 13); nothing guesses the customer —
 *  the person picks the sales run, and the run names its live object. */

/** The same 300 ms every search box in the app waits. */
const SEARCH_DELAY_MS = 300
const PICK_LIMIT = 20

export type PickedFile = { key: string; file: File; mime: CommAttachmentMime }

/** The channels a person logs by hand. `meeting` is absent: booking a meeting
 *  opens its comm at once (`scheduled`), closed out on its own record page.
 *  Five in three columns wrap 3 + 2: five across a phone is too narrow for "WhatsApp". */
const LOG_CHANNELS: CommActionChannel[] = ['phone', 'zalo-oa', 'telegram', 'whatsapp', 'email']

/** One finished step, folded to a line with a way back. */
export function StepDone({
  no,
  label,
  value,
  onEdit,
}: {
  no: number
  label: string
  value: ReactNode
  onEdit: () => void
}) {
  return (
    <GlassCard className="flex min-h-12 items-center gap-3 p-3">
      <StepNo no={no} done />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-muted-foreground text-[11px]">{label}</span>
        <span className="truncate text-[12.5px] font-medium">{value}</span>
      </span>
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onEdit}>
        Sửa
      </Button>
    </GlassCard>
  )
}

export function StepNo({ no, done = false }: { no: number; done?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'tnum flex size-6 shrink-0 items-center justify-center rounded-md text-[11.5px] font-semibold',
        done ? 'bg-success/20 text-on-tint-success' : 'bg-primary/24 text-accent-foreground',
      )}
    >
      {done ? <Icon icon={Check} size={14} /> : no}
    </span>
  )
}

export function StepCard({
  no,
  title,
  children,
}: {
  no: number
  title: string
  children: ReactNode
}) {
  return (
    /* Law 8 · every step card holds a list or a form row list, so glass-b. */
    <GlassCard variant="b" className="flex flex-col gap-4 p-4" role="group" aria-label={title}>
      <span className="flex items-center gap-3 text-[13px] font-semibold">
        <StepNo no={no} />
        {title}
      </span>
      {children}
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------

export function PickWorkstream({ onPick }: { onPick: (ws: WorkstreamRow) => void }) {
  const canRead = useCan('workstream.view')
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const { data, isPending, error } = useQuery({
    ...workstreamBookQuery({
      ...DEFAULT_WORKSTREAM_BOOK_QUERY,
      size: PICK_LIMIT,
      ...(q ? { q } : {}),
    }),
    enabled: canRead,
  })

  if (!canRead) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Vai của bạn không mở được sổ lượt bán, nên không chọn được lượt để ghi liên hệ.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        size="page"
        value={typed}
        onChange={setTyped}
        placeholder="Tìm công ty, mã lượt bán"
      />
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : error ? (
        <p role="alert" className="text-warning m-0 text-[12px]">
          {isApiError(error) ? userMessage(error) : 'Không đọc được sổ lượt bán.'}
        </p>
      ) : data.rows.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12.5px]">
          Không có lượt bán đang mở nào khớp.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.rows.map((ws) => (
            <li key={ws.code}>
              <button
                type="button"
                onClick={() => onPick(ws)}
                className={cn(
                  'motion-std flex min-h-12 w-full items-center gap-3 rounded-md p-3 text-left',
                  COMM_CARD_SURFACE,
                  COMM_FOCUS,
                )}
              >
                <span className="text-muted-foreground font-mono text-[11px]">{ws.code}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13px] font-semibold">{ws.customer}</span>
                  <span className="text-muted-foreground truncate text-[11.5px]">
                    {subjectKindLabel(ws.stand.code)} {ws.stand.code} · {ws.stand.phaseLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PickChannel({
  workstreamCode,
  onNew,
  onJoin,
}: {
  workstreamCode: string
  onNew: (channel: CommActionChannel) => void
  onJoin: (row: PendingDebriefRow) => void
}) {
  const { data } = useQuery(pendingCommsQuery(workstreamCode))
  const pending = data?.rows ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {LOG_CHANNELS.map((channel) => (
          <button
            key={channel}
            type="button"
            onClick={() => onNew(channel)}
            className={cn(
              'motion-std flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg p-3 text-[12.5px] font-medium',
              COMM_CARD_SURFACE,
              COMM_FOCUS,
            )}
          >
            <span className="bg-primary/24 text-accent-foreground flex size-10 items-center justify-center rounded-md">
              <Icon icon={COMMS_CHANNEL_ICON[channel]} size={20} />
            </span>
            {COMMS_CHANNEL_LABEL[channel]}
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11.5px]">
            Liên hệ đang chờ của lượt bán này
          </span>
          {pending.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onJoin(row)}
              className={cn(
                'motion-std flex min-h-12 flex-wrap items-center gap-2 rounded-md p-3 text-left',
                COMM_CARD_SURFACE,
                COMM_FOCUS,
              )}
            >
              <ChannelPill channel={row.thread.channel} />
              <span className="tnum min-w-0 flex-1 text-[12px]">{dmhm(row.createdAt)}</span>
              <CommStateBadge state={row.state} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Step 3's text and its optional files. Files are held here and uploaded only
 *  after the record exists, because a file needs the record's id. */
export function ContentFields({
  text,
  onText,
  files,
  onFiles,
}: {
  text: string
  onText: (text: string) => void
  files: PickedFile[]
  onFiles: (files: PickedFile[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string>()

  const take = (list: FileList | null) => {
    const next: PickedFile[] = []
    const refused: string[] = []
    for (const file of Array.from(list ?? [])) {
      const verdict = checkCommFile(file)
      if ('problem' in verdict) refused.push(verdict.problem)
      else
        next.push({
          key: `${file.name}:${file.size}:${file.lastModified}`,
          file,
          mime: verdict.mime,
        })
    }
    setProblem(refused.length > 0 ? refused.join(' ') : undefined)
    onFiles([...files, ...next.filter((n) => !files.some((f) => f.key === n.key))])
  }

  return (
    <div className="flex flex-col gap-3">
      {/* No hard stop at the summary cap: a pasted long text is shortened by
          the person, and the page says by how much (`contentBlockerOf`). */}
      <Field label="Nội dung" note={`${text.length}/${DEBRIEF_SUMMARY_MAX}`}>
        <Textarea
          value={text}
          rows={5}
          autoGrow
          maxLength={MESSAGE_BODY_MAX}
          aria-label="Nội dung đã trao đổi"
          placeholder="Hai bên đã trao đổi gì, khách cần gì tiếp theo."
          onChange={(e) => onText(e.target.value)}
        />
      </Field>
      <input
        ref={input}
        type="file"
        multiple
        accept={COMM_FILE_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ''
        }}
      />
      <Button
        size="lg"
        variant="ghost"
        className="justify-start"
        onClick={() => input.current?.click()}
      >
        <Icon icon={Paperclip} size={16} />
        Đính kèm ghi âm, biên bản, ảnh chat
      </Button>
      {problem && (
        <p role="alert" className="text-warning m-0 text-[12px] leading-[1.6]">
          {problem}
        </p>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li
              key={f.key}
              className={cn('flex min-h-12 items-center gap-3 rounded-md px-3', COMM_CARD_SURFACE)}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{f.file.name}</span>
              <span className="text-muted-foreground tnum text-[11.5px]">
                {fileSizeLabel(f.file.size)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Bỏ tệp ${f.file.name}`}
                className="size-12 px-0"
                onClick={() => onFiles(files.filter((x) => x.key !== f.key))}
              >
                <Icon icon={X} size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
