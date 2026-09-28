import { useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  CircleAlert,
  EmptyState,
  FileText,
  GlassCard,
  ScreenLayout,
  SegmentedControl,
  Send,
  Skeleton,
  Users,
} from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useSalesPeople } from '@/data/directory'
import { salesCatalogQuery } from '@/data/sales-config'
import { doorTemplatesQuery } from '@/data/mas'
import {
  campaignPreflightQuery,
  campaignProfileQuery,
  useCampaignMembers,
  useCampaignPatch,
  useCampaignStart,
  useCampaignStop,
  useCampaignWaveAdd,
} from '@/data/campaign-book'
import { parseCampaignTab, DEFAULT_CAMPAIGN_TAB, type CampaignTab } from './campaign-model'
import { ProfileTab } from './campaign-profile-parts'
import { AudienceTab } from './campaign-audience-parts'
import { StopModal, WaveTable } from './campaign-wave-parts'
import { WaveModal } from './campaign-wave-modal'
import {
  CampaignActionBar,
  CampaignIdentity,
  WaveResults,
  WavesEmpty,
} from './campaign-overview-parts'

/** Module 1 · one campaign's workspace — `/sales/campaigns/:code`.
 *
 *  NOT A WIZARD ANY MORE (20/09): a campaign that already exists is not a
 *  form being walked. The state badge names the lifecycle, a
 *  `SegmentedControl` moves between the faces of the object, a Modal holds
 *  the one act that sends real mail, and since 28/09 a bar pinned to the
 *  bottom keeps both acts in reach from every tab.
 *
 *  The tab rides on the address (`?tab=`) so an opened face can be sent to
 *  whoever has to fix it — the same ritual the book uses for its filters. */

export function CampaignDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: campaign, isPending, error } = useQuery(campaignProfileQuery(code))

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <ScreenLayout>
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
      </ScreenLayout>,
    )
  }

  if (!campaign) {
    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyState
            icon={CircleAlert}
            message={
              error && isApiError(error)
                ? userMessage(error)
                : `Không có chiến dịch nào mang mã ${code}.`
            }
            action={{ label: 'Về sổ chiến dịch', onClick: () => navigate('/sales/campaigns') }}
            className="py-12"
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  return shell(<CampaignWorkspace campaign={campaign} />)
}

export default CampaignDetailPage

/** `/sales/campaigns/:code/edit` is no longer a screen — editing is a face of
 *  the profile, not a second page with its own copy of the boxes. The path
 *  stays alive because bookmarks and links inside old mail still point at it. */
export function CampaignEditRedirectPage() {
  const { code = '' } = useParams()
  return <Navigate to={`/sales/campaigns/${encodeURIComponent(code)}?tab=profile`} replace />
}

// ---------------------------------------------------------------------------

function CampaignWorkspace({ campaign }: { campaign: CampaignProfile }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = parseCampaignTab(params.get('tab'))
  const goTab = (next: CampaignTab) =>
    setParams(next === DEFAULT_CAMPAIGN_TAB ? {} : { tab: next }, { replace: true })

  const code = campaign.code

  /* HIDE, do not grey out — the call `opportunity-detail.tsx` makes: a greyed
     button promises "this works, just not now", and for a read-only role it is
     never now. Hiding is not the fence; the api layer still refuses. */
  const canEdit = useCan('campaign.edit')
  const canFire = useCan('campaign.broadcast')

  const people = useSalesPeople()
  /* Only asked when it can be USED: the source catalogue is gated on
     `config.view`, which `presales` does not hold while holding
     `campaign.view`. Reading a campaign must not depend on it. */
  const { data: catalog } = useQuery({ ...salesCatalogQuery, enabled: canEdit })
  const sources = useMemo(() => catalog?.SOURCE ?? [], [catalog])
  const { data: templateData } = useQuery({ ...doorTemplatesQuery('campaign'), enabled: canFire })
  const templates = templateData?.rows ?? []

  const [firing, setFiring] = useState(false)
  const [stopping, setStopping] = useState(false)
  const stopped = campaign.state === 'STOPPED'

  /* THE SERVER COUNTS WHO CAN BE REACHED, nobody here — and only the fire
     dialog reads the answer, so it is asked while that dialog is open. The
     door declares `campaign.broadcast`; a read-only role would take a 403. */
  const { data: preflight, isError: preflightFailed } = useQuery({
    ...campaignPreflightQuery(code),
    enabled: firing && canFire && !stopped,
  })

  const patch = useCampaignPatch(code)
  const members = useCampaignMembers(code)
  const start = useCampaignStart(code)
  const stop = useCampaignStop(code)
  const waveAdd = useCampaignWaveAdd(code)

  const emptyWaves = campaign.waveCount === 0
  /* The empty waves tab carries its own first-wave call, and with nobody to
     send to the fire door is closed in both places — one rule for both. */
  const barFire =
    canFire && !stopped && campaign.audienceCount > 0 && !(tab === 'waves' && emptyWaves)
  const barStop = canFire && campaign.state === 'RUNNING'

  return (
    <ScreenLayout>
      <CampaignIdentity campaign={campaign} onBack={() => navigate('/sales/campaigns')} />

      {/* Above the tabs and always drawn, zeros included: the results answer
          "how is it going" whichever face is open, even before wave 1. */}
      <WaveResults campaign={campaign} />

      <SegmentedControl
        label="Phần chiến dịch"
        hideLabel
        tone="quiet"
        value={tab}
        options={[
          { value: 'profile', label: 'Thông tin chung', icon: FileText },
          { value: 'audience', label: 'Người nhận', icon: Users, count: campaign.audienceCount },
          { value: 'waves', label: 'Các đợt gửi', icon: Send, count: campaign.waveCount },
        ]}
        onChange={(next) => goTab(next as CampaignTab)}
      />

      {tab === 'waves' &&
        (emptyWaves ? (
          <WavesEmpty
            campaign={campaign}
            canFire={canFire}
            canEdit={canEdit}
            onFire={() => setFiring(true)}
            onAudience={() => goTab('audience')}
          />
        ) : (
          <WaveTable campaign={campaign} />
        ))}

      {tab === 'audience' && <AudienceTab code={code} members={members} canEdit={canEdit} />}

      {tab === 'profile' && (
        /* Keyed: the route keeps this mounted when `:code` changes, and
           `draft` is seeded once while `original` follows the query — without
           it, Back between two profiles offers to save one onto the other. */
        <ProfileTab
          key={campaign.code}
          campaign={campaign}
          people={people}
          sources={sources}
          patch={patch}
          canEdit={canEdit}
        />
      )}

      <WaveModal
        campaign={campaign}
        templates={templates}
        preflight={preflight}
        preflightFailed={preflightFailed}
        open={firing}
        onClose={() => setFiring(false)}
        start={start}
        waveAdd={waveAdd}
      />

      <StopModal
        campaign={campaign}
        open={stopping}
        onClose={() => setStopping(false)}
        stop={stop}
      />

      <CampaignActionBar
        nextWave={campaign.waveCount + 1}
        onFire={barFire ? () => setFiring(true) : undefined}
        onStop={barStop ? () => setStopping(true) : undefined}
      />
      {/* Room under the last block so the fixed bar never sits on it. */}
      {(barFire || barStop) && <div aria-hidden className="h-12 shrink-0" />}
    </ScreenLayout>
  )
}
