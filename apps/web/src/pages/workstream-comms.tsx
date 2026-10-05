import { useNavigate, useParams } from 'react-router-dom'
import { AppShell, Button, ChevronLeft, GlassCard, Icon } from '@pv/ui'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { WorkstreamComms } from '@/components/comms-card'
import { RecordHeader } from '@/components/record/record-header'
import { RecordShell } from '@/components/record/record-shell'
import { RunStrip } from '@/components/record/run-strip'

/** Every comm of one run on one axis — `/sales/workstreams/:code/comms`
 *  (ADR 0075): the horizontal timeline, the picked comm's read view under it.
 *
 *  Gated on `comm.view` alone, as the comms door is: a role without
 *  `workstream.view` reaches this from a lead, so the journey is never read
 *  as a gate and the way back to the run shows only to who may open it. The
 *  strip names the run and the customer (law 10). No rail: the read view
 *  needs the full width the axis already takes. */
export function WorkstreamCommsPage() {
  const chrome = useAppChrome()
  const { code = '' } = useParams()
  const canRun = useCan('workstream.view')
  const navigate = useNavigate()

  return (
    <AppShell {...chrome.shell}>
      <RecordShell
        strip={<RunStrip workstreamCode={code} current={{ kind: 'workstream', code }} />}
        header={<RecordHeader title="Luồng liên hệ" />}
        main={
          <>
            {canRun && (
              <Button
                size="md"
                variant="ghost"
                className="pointer-coarse:h-12 self-start"
                onClick={() => navigate(`/sales/workstreams/${encodeURIComponent(code)}`)}
              >
                <Icon icon={ChevronLeft} size={16} />
                Về hành trình
              </Button>
            )}
            {/* Law 8 · a long list sits on glass-b. */}
            <GlassCard variant="b" className="p-4 sm:p-5" aria-label="Các lượt liên hệ">
              <WorkstreamComms workstreamCode={code} />
            </GlassCard>
          </>
        }
      />
    </AppShell>
  )
}

export default WorkstreamCommsPage
