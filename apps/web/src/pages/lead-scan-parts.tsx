import { useEffect, useState, type ReactNode } from 'react'
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
import { message, translate, useI18n, type Message } from '@/app/i18n'
import { toastOf } from '@/app/toast'
import { ACCEPT_ATTR, CAPTURE_ACCEPT_ATTR, screenPicked } from '@/data/lead-scan-prep'
import { useReplaceScanFile, useScanReplaces, type ReplaceJob } from '@/data/lead-scan-replace'
import type { ScanRun } from '@/data/lead-scan-run'
import { ScanReplacePicker } from '@/components/scan-drop-zone'
import {
  BOOK_PATH,
  REDIRECT_MS,
  scanRail,
  countRows,
  failedRows,
  fileRows,
  progressOf,
  rowStatus,
  type BadgeTone,
  type FileRow,
  type RowStatus,
} from './lead-scan-model'

/** Blocks of the scan screen shared by more than one step, plus step 2 and
 *  the result view. Step 3 is big enough to live in `lead-scan-preview.tsx`. */

const toastWarn = toastOf('warning')

/** The page owns the write, as it does for commit — see `useCancelScan`. */
export type CancelProps = { onConfirm: () => void; pending: boolean }

export function ScanHeader({
  title,
  description,
  rail,
  cancel,
}: {
  title: ReactNode
  description: ReactNode
  rail?: RailObject[]
  /** Absent until the server has a batch to cancel. */
  cancel?: CancelProps
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <ScreenHeader
        title={title}
        description={description}
        className="gap-3"
        actions={
          <>
            {cancel && !asking && (
              <Button
                size="md"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => setAsking(true)}
              >
                {t(message('Huỷ lô', 'Cancel batch', '묶음 취소'))}
              </Button>
            )}
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              onClick={() => navigate(BOOK_PATH)}
            >
              <Icon icon={ArrowLeft} size={16} />
              {t(message('Quay lại sổ lead', 'Back to leads', '리드 목록으로'))}
            </Button>
          </>
        }
        context={rail && <ContextRail objects={rail} />}
      />
      {cancel && asking && <CancelConfirm {...cancel} onKeep={() => setAsking(false)} />}
    </GlassCard>
  )
}

/** Asked in place, as the campaign form asks before dropping a draft — no
 *  `window.confirm`, which sits outside the design system and blocks the tab.
 *  Its own row: inside the header's shrink-0 actions it squeezes the title at tablet widths. */
function CancelConfirm({ onConfirm, pending, onKeep }: CancelProps & { onKeep: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-foreground text-[12.5px]">
        {t(
          message(
            'Huỷ lô này? Chưa lead nào được tạo.',
            'Cancel this batch? No lead has been created yet.',
            '이 묶음을 취소할까요? 아직 생성된 리드가 없습니다.',
          ),
        )}
      </span>
      <Button
        size="md"
        variant="destructive"
        disabled={pending}
        className="pointer-coarse:h-12"
        onClick={onConfirm}
      >
        {pending
          ? t(message('Đang huỷ…', 'Cancelling…', '취소하는 중…'))
          : t(message('Huỷ lô', 'Cancel batch', '묶음 취소'))}
      </Button>
      <Button
        size="md"
        variant="ghost"
        disabled={pending}
        className="pointer-coarse:h-12"
        onClick={onKeep}
      >
        {t(message('Giữ lô', 'Keep batch', '묶음 유지'))}
      </Button>
    </div>
  )
}

/** Something still moving: a turning glyph and words, never a pill. */
export function Moving({ children }: { children: ReactNode }) {
  return (
    <span className="tnum flex items-center gap-2">
      <Icon icon={Loader} size={14} className="text-accent-foreground motion-safe:animate-spin" />
      {children}
    </span>
  )
}

export function StatusCell({ status }: { status: RowStatus }) {
  const { t } = useI18n()
  if ('moving' in status) return <Moving>{t(status.moving)}</Moving>
  return <Badge tone={status.tone}>{t(status.text)}</Badge>
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
  text: Message
}[] = [
  { key: 'read', tone: 'success', text: message('đã đọc', 'read', '읽음') },
  { key: 'reading', tone: 'running', text: message('đang đọc', 'reading', '읽는 중') },
  { key: 'queued', tone: 'draft', text: message('chờ', 'waiting', '대기') },
  { key: 'failed', tone: 'danger', text: message('không đọc được', 'unreadable', '읽지 못함') },
]

const FILE_COLUMNS = [
  { header: message('Tệp', 'File', '파일'), width: 'minmax(0,2fr)' },
  { header: message('Loại', 'Type', '유형'), width: 'minmax(0,1fr)' },
  { header: message('Trạng thái', 'Status', '상태'), width: 'minmax(0,1.3fr)' },
  { header: message('Kết quả', 'Result', '결과'), width: 'minmax(0,1.6fr)' },
]

/** The error line, plus the replace-file picker on a row that read FAILED and is not already being replaced. */
function ResultCell({
  row,
  job,
  onFile,
}: {
  row: FileRow
  job: ReplaceJob | undefined
  onFile: (id: string, file: File) => void
}) {
  const failedId = row.failedId
  return (
    <span className="pointer-coarse:flex-col pointer-coarse:items-start flex min-w-0 items-center gap-2">
      <span
        className="text-muted-foreground pointer-coarse:line-clamp-2 pointer-coarse:whitespace-normal min-w-0 flex-1 truncate"
        title={row.result}
      >
        {row.result}
      </span>
      {failedId && !job && (
        <ScanReplacePicker
          accept={ACCEPT_ATTR}
          captureAccept={CAPTURE_ACCEPT_ATTR}
          name={row.name}
          onFile={(file) => onFile(failedId, file)}
        />
      )}
    </span>
  )
}

/** The replace wiring both step 2 and step 3 hang on their FAILED rows. */
function useRowReplace(batch: LeadScanResponse | undefined) {
  const replace = useReplaceScanFile()
  const jobs = useScanReplaces((s) => s.jobs)
  /* Screened exactly as a step-1 drop, so a replacement meets the same caps. */
  const onReplace = (id: string, file: File) => {
    const { accepted, rejected } = screenPicked([file])
    if (rejected.length > 0) {
      const title = message(
        'Có tệp không nhận',
        'Some files were not accepted',
        '일부 파일은 받을 수 없습니다',
      )
      toastWarn(translate(title), rejected.join(' · '))
    }
    const picked = accepted[0]
    if (batch && picked) replace(batch.code, id, picked)
  }
  return { jobs, onReplace }
}

const FAILED_COLUMNS = [
  { header: message('Tệp', 'File', '파일'), width: 'minmax(0,1.3fr)' },
  { header: message('Trạng thái', 'Status', '상태'), width: 'minmax(0,1fr)' },
  { header: message('Lý do', 'Reason', '사유'), width: 'minmax(0,2fr)' },
]

/** Step 3 — the files that read FAILED, each replaceable in place. Starting a
 *  replace puts the batch back to READING, which returns the page to step 2. */
export function FailedFiles({ batch }: { batch: LeadScanResponse }) {
  const { t } = useI18n()
  const { jobs, onReplace } = useRowReplace(batch)
  const rows = failedRows(batch)
  if (rows.length === 0) return null
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 overflow-hidden pt-4">
      <h3 className="px-5 text-[13px] font-semibold">
        {t(message('Tệp không đọc được', 'Files that could not be read', '읽지 못한 파일'))}
      </h3>
      <DataTable
        flush
        columns={FAILED_COLUMNS.map((c) => ({ ...c, header: t(c.header) }))}
        rows={rows.map((row) => ({
          id: row.key,
          cells: [
            <span key="name" className="block truncate" title={row.name}>
              {row.name}
            </span>,
            <StatusCell key="status" status={rowStatus(row, jobs[row.key])} />,
            <ResultCell key="result" row={row} job={jobs[row.key]} onFile={onReplace} />,
          ],
        }))}
      />
    </GlassCard>
  )
}

/** Step 2 — one progress panel, then the plain file list. */
export function ReadingStep({
  batch,
  run,
  onRestart,
  cancel,
}: {
  batch: LeadScanResponse | undefined
  run: ScanRun | null
  onRestart: () => void
  cancel?: CancelProps
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { jobs, onReplace } = useRowReplace(batch)
  const rows = fileRows(batch, run)
  const counts = countRows(rows)
  const progress = progressOf(run, counts, rows.length)
  /* Before `start` the batch lives in this tab only — saying otherwise would
     send someone off to close the one thing still carrying their files. */
  const uploading = run !== null && !run.started

  return (
    <>
      <ScanHeader
        title={t(
          message(
            `Đang đọc ${rows.length} tệp`,
            `Reading ${rows.length} ${rows.length === 1 ? 'file' : 'files'}`,
            `파일 ${rows.length}개 읽는 중`,
          ),
        )}
        description={
          uploading
            ? t(
                message(
                  'Đang tải tệp lên. Giữ trang mở tới khi xong.',
                  'Uploading files. Keep this page open until it finishes.',
                  '파일을 업로드하는 중입니다. 끝날 때까지 이 페이지를 열어 두세요.',
                ),
              )
            : t(
                message(
                  'Có thể đóng trang, lô vẫn chạy.',
                  'You can close this page; the batch keeps running.',
                  '페이지를 닫아도 묶음은 계속 진행됩니다.',
                ),
              )
        }
        rail={batch && scanRail(batch, navigate)}
        cancel={cancel}
      />

      <GlassCard className="flex flex-col gap-4 p-5">
        <Progress value={progress.value} label={t(progress.label)} />
        <div className="flex flex-wrap gap-2">
          {COUNT_PILLS.map((pill) => (
            <Badge key={pill.key} tone={pill.tone} className="tnum">
              {counts[pill.key]} {t(pill.text)}
            </Badge>
          ))}
        </div>
        {run?.failure && (
          <FailureLine
            action={
              <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onRestart}>
                {t(message('Chọn lại tệp', 'Choose files again', '파일 다시 선택'))}
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
          columns={FILE_COLUMNS.map((c) => ({ ...c, header: t(c.header) }))}
          rows={rows.map((row) => ({
            id: row.key,
            cells: [
              <span key="name" className="block truncate" title={row.name}>
                {row.name}
              </span>,
              <span key="type" className="text-muted-foreground">
                {t(row.type)}
              </span>,
              <StatusCell key="status" status={rowStatus(row, jobs[row.key])} />,
              <ResultCell key="result" row={row} job={jobs[row.key]} onFile={onReplace} />,
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
  const { t } = useI18n()
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
              ? t(
                  message(
                    `Đã tạo ${result.created.length} lead`,
                    `Created ${result.created.length} ${result.created.length === 1 ? 'lead' : 'leads'}`,
                    `리드 ${result.created.length}개를 생성했습니다`,
                  ),
                )
              : t(
                  message(
                    `Đã nhập vào ${result.mergedInto.length} lead có sẵn`,
                    `Merged into ${result.mergedInto.length} existing ${result.mergedInto.length === 1 ? 'lead' : 'leads'}`,
                    `기존 리드 ${result.mergedInto.length}개에 병합했습니다`,
                  ),
                )}
          </h2>
          <p className="text-muted-foreground max-w-[560px] text-[12.5px] leading-[1.65]">
            {t(
              message(
                'Ảnh và hồ sơ nằm trong mục Tệp đính kèm của từng lead.',
                'Images and files are in the Attachments section of each lead.',
                '이미지와 파일은 각 리드의 첨부 파일 항목에 있습니다.',
              ),
            )}
          </p>
          <ContextRail objects={scanRail(batch, navigate)} className="justify-center" />
          {redirect && (
            <p className="text-muted-foreground tnum text-[12px]">
              {t(
                message(
                  `Tự chuyển về sổ lead sau ${REDIRECT_MS / 1000} giây`,
                  `Returning to the leads list in ${REDIRECT_MS / 1000} seconds`,
                  `${REDIRECT_MS / 1000}초 후 리드 목록으로 이동합니다`,
                ),
              )}
            </p>
          )}
          <Button size="lg" onClick={() => navigate(BOOK_PATH)}>
            {t(message('Về sổ lead', 'Back to leads', '리드 목록으로'))}
          </Button>
        </>
      ) : (
        <p className="font-display text-[20px] font-semibold">
          <Moving>{t(message('Đang tạo…', 'Creating…', '생성 중…'))}</Moving>
        </p>
      )}
    </GlassCard>
  )
}
