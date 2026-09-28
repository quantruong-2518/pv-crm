import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AppShell,
  Button,
  EmptyState,
  GlassCard,
  Inbox,
  ScreenLayout,
  Skeleton,
  Stepper,
  TriangleAlert,
  cn,
  type IconGlyph,
} from '@pv/ui'
import { SCAN_MAX_FILES } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useAppChrome } from '@/app/chrome'
import { toastFail, toastOf } from '@/app/toast'
import { useCommitScan, useScanBatch } from '@/data/lead-scan'
import {
  ACCEPT_ATTR,
  ACCEPT_LABEL,
  CAPTURE_ACCEPT_ATTR,
  MAX_RAW_MB,
  screenPicked,
} from '@/data/lead-scan-prep'
import { inFlight, useBeginScan, useScanRun } from '@/data/lead-scan-run'
import { CampaignPicker, type CampaignChoice } from '@/components/lead-origin-pickers'
import { ScanDropZone } from '@/components/scan-drop-zone'
import { BOOK_PATH, SCAN_STEPS, STEP_OF, viewOf, type ScanView } from './lead-scan-model'
import { ReadingStep, ResultView, ScanHeader } from './lead-scan-parts'
import { PreviewStep } from './lead-scan-preview'

/** Module 2 · the scan door, as a page — `/sales/leads/scan[/:code]`.
 *
 *  One page, three steps (drop · AI reads · preview & create), then a result
 *  view. Which step shows is DERIVED from the batch state (`viewOf`), so a
 *  resumed `/scan/:code` opens where the batch stands, from any device.
 *
 *  Reads live API only — no fixture, no scenario. The heavy libraries
 *  (heic2any, pdf.js) and the prep worker load on the first drop, never with
 *  the route. Step 1 has no ContextRail (law 10 debt, as on `/leads/new`):
 *  there is no object yet; the rail starts with the batch code at step 2. */

const WIDE = 'max-w-[1120px]'
const NARROW = 'max-w-[880px]'
const toastWarn = toastOf('warning')

export function LeadScanPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const run = useScanRun((s) => s.run)
  const batch = useScanBatch(code)
  const commit = useCommitScan(code)

  /* On the bare path, a run still working (or one that failed before the
     server gave it a code) is shown; a finished one is history. */
  const local =
    code === ''
      ? run && (run.code === null || inFlight(run))
        ? run
        : null
      : run?.code === code
        ? run
        : null

  const newCode = code === '' && inFlight(run) ? run.code : null
  useEffect(() => {
    if (newCode) navigate(`/sales/leads/scan/${newCode}`, { replace: true })
  }, [newCode, navigate])

  const restart = () => {
    useScanRun.setState({ run: null })
    navigate('/sales/leads/scan')
  }
  const onCommit = () =>
    commit.mutate(undefined, {
      onError: (error) =>
        toastFail('Chưa tạo được lead', isApiError(error) ? userMessage(error) : undefined),
    })

  const view: ScanView | 'loading' | 'missing' =
    code === '' || (batch.isPending && local)
      ? local
        ? 'reading'
        : 'drop'
      : batch.data
        ? viewOf(batch.data.state, commit.isPending || commit.isSuccess)
        : batch.isPending
          ? 'loading'
          : 'missing'
  const step = view in STEP_OF ? STEP_OF[view as ScanView] : undefined

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout className={cn('mx-auto', view === 'drop' || view === 'result' ? NARROW : WIDE)}>
        {step !== undefined && <Stepper steps={SCAN_STEPS} current={step} reached={step} />}
        {view === 'drop' && <DropStep />}
        {view === 'reading' && <ReadingStep batch={batch.data} run={local} onRestart={restart} />}
        {view === 'preview' && batch.data && <PreviewStep batch={batch.data} onCommit={onCommit} />}
        {view === 'result' && batch.data && (
          <ResultView batch={batch.data} redirect={commit.isSuccess} />
        )}
        {view === 'loading' && <Skeleton className="h-40 w-full" />}
        {view === 'failed' && (
          <Dead
            icon={TriangleAlert}
            message="Lô này dừng lại, không đọc tiếp được."
            onRestart={restart}
          />
        )}
        {view === 'missing' && (
          <Dead
            icon={Inbox}
            message={
              isApiError(batch.error) && batch.error.kind !== 'not-found'
                ? userMessage(batch.error)
                : `Không tìm thấy lô ${code}.`
            }
            onRestart={restart}
          />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

export default LeadScanPage

function DropStep() {
  const begin = useBeginScan()
  const [campaign, setCampaign] = useState<CampaignChoice | null>(null)

  const onFiles = (files: File[]) => {
    const { accepted, rejected } = screenPicked(files)
    if (rejected.length > 0) toastWarn('Có tệp không nhận', rejected.join(' · '))
    if (accepted.length > 0) begin(accepted, campaign?.code)
  }

  return (
    <>
      <ScanHeader
        title="Nạp lead từ ảnh & hồ sơ"
        description="AI đọc từng tệp, gom theo công ty, cho bạn xem trước rồi mới tạo."
      />
      <GlassCard className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[280px] flex-1">
            <CampaignPicker label="Chiến dịch" value={campaign} onChange={setCampaign} />
          </div>
          <p className="text-muted-foreground pb-3 text-[12.5px]">
            Người phụ trách: <span className="text-foreground font-semibold">bạn</span>
          </p>
        </div>
        <ScanDropZone
          accept={ACCEPT_ATTR}
          captureAccept={CAPTURE_ACCEPT_ATTR}
          footnote={`${ACCEPT_LABEL} · tối đa ${SCAN_MAX_FILES} tệp mỗi lô, ${MAX_RAW_MB} MB mỗi tệp`}
          onFiles={onFiles}
        />
      </GlassCard>
    </>
  )
}

function Dead({
  icon,
  message,
  onRestart,
}: {
  icon: IconGlyph
  message: string
  onRestart: () => void
}) {
  const navigate = useNavigate()
  return (
    <GlassCard className="flex flex-col items-center gap-4 p-5 py-12">
      <EmptyState
        icon={icon}
        message={message}
        action={{ label: 'Nạp lô mới', onClick: onRestart }}
      />
      <Button
        size="sm"
        variant="ghost"
        className="pointer-coarse:h-12"
        onClick={() => navigate(BOOK_PATH)}
      >
        Về sổ lead
      </Button>
    </GlassCard>
  )
}
