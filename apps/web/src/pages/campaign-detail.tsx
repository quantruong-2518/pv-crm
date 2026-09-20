import { useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  CircleAlert,
  ContextRail,
  EmptyState,
  GlassCard,
  Icon,
  Octagon,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  SegmentedControl,
  Send,
  Skeleton,
} from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dm } from '@/lib/date'
import { useSalesPeople } from '@/data/directory'
import { salesCatalogQuery } from '@/data/sales-config'
import { masTemplatesQuery } from '@/data/mas'
import {
  CAMPAIGN_STATE_LABEL,
  CAMPAIGN_STATE_TONE,
  campaignPreflightQuery,
  campaignProfileQuery,
  useCampaignMembers,
  useCampaignPatch,
  useCampaignStart,
  useCampaignStop,
  useCampaignWaveAdd,
} from '@/data/campaign-book'
import {
  campaignReadiness,
  parseCampaignTab,
  DEFAULT_CAMPAIGN_TAB,
  type CampaignTab,
} from './campaign-model'
import { ProfileTab } from './campaign-profile-parts'
import { AudienceTab } from './campaign-audience-parts'
import { StopDrawer, WaveDrawer, WaveTable } from './campaign-wave-parts'
import { CampaignStageBand, ReadinessBand, WaveTotals } from './campaign-overview-parts'

/** Module 1 · one campaign's workspace — `/sales/campaigns/:code`.
 *
 *  NOT A WIZARD ANY MORE (20/09). `Stepper` was carrying three jobs at once
 *  here, and the patches proved it: `initialStep = 3` for a campaign that
 *  already exists, a high-water `reached` hack, and a back-to-overview button
 *  that existed only because the stepper could not walk forward. What replaces
 *  it splits those jobs — `StageTrack` for the lifecycle position, a
 *  `SegmentedControl` for moving between the faces of an object that already
 *  exists, and a Drawer for the one act that sends real mail.
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
  const { data: templateData } = useQuery(masTemplatesQuery)
  const templates = templateData?.rows ?? []

  /* THE SERVER COUNTS WHO CAN BE REACHED, nobody here. Gated twice: the door
     declares `campaign.broadcast` (a read-only role would take a 403 on load),
     and a STOPPED campaign shows nothing the answer could fill. */
  const { data: preflight, isError: preflightFailed } = useQuery({
    ...campaignPreflightQuery(code),
    enabled: canFire && campaign.state !== 'STOPPED',
  })

  const patch = useCampaignPatch(code)
  const members = useCampaignMembers(code)
  const start = useCampaignStart(code)
  const stop = useCampaignStop(code)
  const waveAdd = useCampaignWaveAdd(code)

  const [firing, setFiring] = useState(false)
  const [stopping, setStopping] = useState(false)
  const stopped = campaign.state === 'STOPPED'

  return (
    <ScreenLayout>
      <ScreenHeader
        back={{ label: 'Sổ chiến dịch', onClick: () => navigate('/sales/campaigns') }}
        title={campaign.name}
        description={campaign.slogan}
        /* Law 10 · ONE chip, the object open right now, and that is everything
           E1 can say here — see the same call in `source-detail.tsx`. */
        context={<ContextRail objects={[{ code: campaign.code, source: true }]} />}
        meta={
          <>
            <Badge tone={CAMPAIGN_STATE_TONE[campaign.state]}>
              {CAMPAIGN_STATE_LABEL[campaign.state]}
            </Badge>
            {/* Not `Kicker`: that is a short GROUP LABEL in mono caps, and law 6
                bans caps plus letter-spacing on Vietnamese — a person's name in
                it stops reading. */}
            <span className="text-muted-foreground text-[11.5px]">
              {campaign.ownerName ?? 'Chưa có chủ'}
              {campaign.sourceName ? ` · nguồn ${campaign.sourceName}` : ''} · mở{' '}
              {dm(campaign.createdAt)}
            </span>
          </>
        }
        actions={
          <>
            {canFire && !stopped && (
              <Button
                size="md"
                className="pointer-coarse:h-12"
                onClick={() => setFiring(true)}
                aria-haspopup="dialog"
              >
                <Icon icon={Send} size={16} />
                Bắn đợt {campaign.waveCount + 1}
              </Button>
            )}
            {canFire && campaign.state === 'RUNNING' && (
              <Button
                size="md"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => setStopping(true)}
                aria-haspopup="dialog"
              >
                <Icon icon={Octagon} size={16} />
                Dừng chiến dịch
              </Button>
            )}
          </>
        }
      />

      <CampaignStageBand campaign={campaign} />

      {!stopped && (
        <ReadinessBand
          rows={campaignReadiness(campaign, preflight)}
          onFix={(next) => goTab(next)}
        />
      )}

      <SegmentedControl
        label="Phần chiến dịch"
        hideLabel
        tone="quiet"
        value={tab}
        options={[
          { value: 'waves', label: 'Chuỗi đợt' },
          { value: 'audience', label: 'Tệp nhận', count: campaign.audienceCount },
          { value: 'profile', label: 'Hồ sơ' },
        ]}
        onChange={(next) => goTab(next as CampaignTab)}
      />

      {tab === 'waves' && (
        <div className="flex flex-col gap-5">
          <WaveTotals campaign={campaign} />
          <div className="flex flex-col gap-1">
            <SectionTitle>Chuỗi đợt</SectionTitle>
            <span className="text-muted-foreground text-[11px]">
              Bấm một đợt để xem thư của từng người nhận đi tới đâu.
            </span>
          </div>
          <WaveTable campaign={campaign} />
        </div>
      )}

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

      <WaveDrawer
        campaign={campaign}
        templates={templates}
        preflight={preflight}
        preflightFailed={preflightFailed}
        open={firing}
        onClose={() => setFiring(false)}
        start={start}
        waveAdd={waveAdd}
      />

      <StopDrawer
        campaign={campaign}
        open={stopping}
        onClose={() => setStopping(false)}
        stop={stop}
      />
    </ScreenLayout>
  )
}
