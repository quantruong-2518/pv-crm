import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Badge,
  Button,
  ContextRail,
  DataTable,
  GlassCard,
  Icon,
  Progress,
  Loader,
  ScreenHeader,
  TriangleAlert,
  type RailObject,
} from '@pv/ui'
import type { LeadScanResponse } from '@pv/contracts'
import type { ScanRun } from '@/data/lead-scan-run'
import {
  BOOK_PATH,
  REDIRECT_MS,
  scanRail,
  countRows,
  fileRows,
  progressOf,
  type BadgeTone,
  type RowStatus,
} from './lead-scan-model'

/** Blocks of the scan screen shared by more than one step, plus step 2 and
 *  the result view. Step 3 is big enough to live in `lead-scan-preview.tsx`. */

export function ScanHeader({
  title,
  description,
  rail,
}: {
  title: ReactNode
  description: ReactNode
  rail?: RailObject[]
}) {
  const navigate = useNavigate()
  return (
    <GlassCard variant="b" className="p-4">
      <ScreenHeader
        title={title}
        description={description}
        className="gap-3"
        actions={
          <Button
            size="md"
            variant="secondary"
            className="pointer-coarse:h-12"
            onClick={() => navigate(BOOK_PATH)}
          >
            <Icon icon={ArrowLeft} size={16} />
            Quay lại sổ lead
          </Button>
        }
        context={rail && <ContextRail objects={rail} />}
      />
    </GlassCard>
  )
}

/** Something still moving: a turning glyph and words, never a pill. */
export function Moving({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Icon icon={Loader} size={14} className="text-accent-foreground motion-safe:animate-spin" />
      {children}
    </span>
  )
}

export function StatusCell({ status }: { status: RowStatus }) {
  if ('moving' in status) return <Moving>{status.moving}</Moving>
  return <Badge tone={status.tone}>{status.text}</Badge>
}

export function FailureLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-destructive-foreground flex items-center gap-2 text-[12.5px]">
        <Icon icon={TriangleAlert} size={16} />
        {children}
      </p>
      {action}
    </div>
  )
}

const COUNT_PILLS: {
  key: 'read' | 'reading' | 'queued' | 'failed'
  tone: BadgeTone
  text: string
}[] = [
  { key: 'read', tone: 'success', text: 'đã đọc' },
  { key: 'reading', tone: 'running', text: 'đang đọc' },
  { key: 'queued', tone: 'draft', text: 'chờ' },
  { key: 'failed', tone: 'danger', text: 'không đọc được' },
]

const FILE_COLUMNS = [
  { header: 'Tệp', width: 'minmax(0,2fr)' },
  { header: 'Loại', width: 'minmax(0,1fr)' },
  { header: 'Trạng thái', width: 'minmax(0,1.3fr)' },
  { header: 'Kết quả', width: 'minmax(0,1.6fr)' },
]

/** Step 2 — one progress panel, then the plain file list. */
export function ReadingStep({
  batch,
  run,
  onRestart,
}: {
  batch: LeadScanResponse | undefined
  run: ScanRun | null
  onRestart: () => void
}) {
  const navigate = useNavigate()
  const rows = fileRows(batch, run)
  const counts = countRows(rows)
  const progress = progressOf(run, counts, rows.length)
  /* Before `start` the batch lives in this tab only — saying otherwise would
     send someone off to close the one thing still carrying their files. */
  const uploading = run !== null && !run.started

  return (
    <>
      <ScanHeader
        title={`Đang đọc ${rows.length} tệp`}
        description={
          uploading
            ? 'Đang tải tệp lên — giữ trang này mở tới khi tải xong.'
            : 'Đóng trang cũng không sao — lô chạy tiếp trên máy chủ.'
        }
        rail={batch && scanRail(batch, navigate)}
      />

      <GlassCard className="flex flex-col gap-4 p-5">
        <Progress value={progress.value} label={progress.label} />
        <div className="flex flex-wrap gap-2">
          {COUNT_PILLS.map((pill) => (
            <Badge key={pill.key} tone={pill.tone} className="tnum">
              {counts[pill.key]} {pill.text}
            </Badge>
          ))}
        </div>
        {run?.failure && (
          <FailureLine
            action={
              <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onRestart}>
                Chọn lại tệp
              </Button>
            }
          >
            {run.failure}
          </FailureLine>
        )}
      </GlassCard>

      <GlassCard variant="b" className="overflow-hidden">
        <DataTable
          flush
          columns={FILE_COLUMNS}
          rows={rows.map((row) => ({
            id: row.key,
            cells: [
              <span key="name" className="block truncate" title={row.name}>
                {row.name}
              </span>,
              <span key="type" className="text-muted-foreground">
                {row.type}
              </span>,
              <StatusCell key="status" status={row.status} />,
              <span
                key="result"
                className="text-muted-foreground block truncate"
                title={row.result}
              >
                {row.result}
              </span>,
            ],
          }))}
        />
      </GlassCard>
    </>
  )
}

/** After the button: a working line until DONE, then the tally. `redirect`
 *  only for a commit made in this tab, so a reopened batch stays readable. */
export function ResultView({ batch, redirect }: { batch: LeadScanResponse; redirect: boolean }) {
  const navigate = useNavigate()
  const result = batch.state === 'DONE' ? batch.result : undefined

  useEffect(() => {
    if (!result || !redirect) return
    const timer = setTimeout(() => navigate(BOOK_PATH), REDIRECT_MS)
    return () => clearTimeout(timer)
  }, [result, redirect, navigate])

  return (
    <GlassCard className="flex flex-col items-center gap-4 px-5 py-12 text-center">
      {result ? (
        <>
          <h2 className="font-display tnum text-[26px] font-semibold tracking-[-.4px]">
            {result.created.length > 0
              ? `Đã tạo ${result.created.length} lead`
              : `Đã nhập vào ${result.mergedInto.length} lead có sẵn`}
          </h2>
          <p className="text-muted-foreground max-w-[560px] text-[12.5px] leading-[1.65]">
            Ảnh danh thiếp và hồ sơ đã nằm sẵn trong mục Tệp đính kèm của từng lead.
          </p>
          <ContextRail objects={scanRail(batch, navigate)} className="justify-center" />
          {redirect && (
            <p className="text-muted-foreground tnum text-[12px]">
              Tự chuyển về sổ lead sau {REDIRECT_MS / 1000} giây
            </p>
          )}
          <Button size="lg" onClick={() => navigate(BOOK_PATH)}>
            Về sổ lead
          </Button>
        </>
      ) : (
        <p className="font-display text-[20px] font-semibold">
          <Moving>Đang tạo…</Moving>
        </p>
      )}
    </GlassCard>
  )
}
