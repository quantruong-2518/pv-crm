import { useCallback, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, SegmentedControl, Send, Users } from '@pv/ui'
import type { CampaignProfile } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
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
import { RecordShell } from '@/components/record/record-shell'
import { defaultCampaignTab, parseCampaignTab, type CampaignTab } from './campaign-model'
import { ProfileDrawer } from './campaign-profile-parts'
import { AudienceTab } from './campaign-audience-parts'
import { StopModal, WaveList } from './campaign-wave-parts'
import { WaveModal } from './campaign-wave-modal'
import { CampaignSummary, WavesEmpty } from './campaign-overview-parts'
import { CampaignResults } from './campaign-results-parts'

/** Module 1 · one campaign's workspace — `/sales/campaigns/:code`, on the
 *  record shell without the run parts (ADR 0078): a campaign is no run.
 *
 *  One column, read top to bottom: who the campaign is, what to do next,
 *  what the waves add up to, then the two lists behind those numbers. Every
 *  act lives in the first card, so there is no floating bar; no rail either —
 *  the campaign's people are its audience tab. Editing is a drawer over the
 *  page, and a Modal holds the one act that sends real mail.
 *
 *  The tab rides on the address (`?tab=`) so an opened face can be sent to
 *  whoever has to fix it — the same ritual the book uses for its filters. */

export function CampaignDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: campaign, isPending, error } = useQuery(campaignProfileQuery(code))

  return (
    <AppShell {...chrome.shell}>
      {campaign ? (
        <CampaignWorkspace campaign={campaign} />
      ) : (
        <RecordShell
          pending={isPending}
          skeleton={{ rail: false }}
          failure={{
            error,
            notFound: `Không có chiến dịch nào mang mã ${code}.`,
            fallback: 'Không đọc được hồ sơ chiến dịch này.',
            back: { label: 'Về sổ chiến dịch', onClick: () => navigate('/sales/campaigns') },
          }}
        />
      )}
    </AppShell>
  )
}

export default CampaignDetailPage

/** `/sales/campaigns/:code/edit` is no longer a screen — editing is a drawer
 *  on the profile, not a second page with its own copy of the boxes. The path
 *  stays alive because bookmarks and links inside old mail still point at it. */
export function CampaignEditRedirectPage() {
  const { code = '' } = useParams()
  return <Navigate to={`/sales/campaigns/${encodeURIComponent(code)}`} replace />
}

// ---------------------------------------------------------------------------

function CampaignWorkspace({ campaign }: { campaign: CampaignProfile }) {
  const [params, setParams] = useSearchParams()
  const { code, state } = campaign
  const tab = parseCampaignTab(params.get('tab'), state)
  const goTab = (next: CampaignTab) =>
    setParams(next === defaultCampaignTab(state) ? {} : { tab: next }, { replace: true })

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
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  /* Stable identity: the Drawer re-focuses its panel whenever `onClose` changes. */
  const closeEdit = useCallback(() => setEditing(false), [])
  const stopped = state === 'STOPPED'

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

  const noAudience = campaign.audienceCount === 0
  /* A DONE campaign keeps its fire door: the server's sweeper files a campaign
     DONE as soon as its waves settle, and `POST /waves` reopens it. */
  const showFire = canFire && !stopped && !noAudience
  const showStop = canFire && state === 'RUNNING'
  const showAdd = canEdit && !stopped && noAudience

  /* The default face stands first, and a count of nothing is not printed. */
  const tabOptions = [
    { value: 'waves', label: 'Các đợt gửi', icon: Send, count: campaign.waveCount || '' },
    { value: 'audience', label: 'Người nhận', icon: Users, count: campaign.audienceCount || '' },
  ]
  if (defaultCampaignTab(state) === 'audience') tabOptions.reverse()

  return (
    <RecordShell
      main={
        <>
          <CampaignSummary
            campaign={campaign}
            onEdit={canEdit ? () => setEditing(true) : undefined}
            onFire={showFire ? () => setFiring(true) : undefined}
            onStop={showStop ? () => setStopping(true) : undefined}
            onAddAudience={
              showAdd
                ? () => {
                    goTab('audience')
                    setAdding(true)
                  }
                : undefined
            }
          />

          <CampaignResults campaign={campaign} />

          <SegmentedControl
            label="Phần chiến dịch"
            hideLabel
            tone="quiet"
            value={tab}
            options={tabOptions}
            onChange={(next) => goTab(next as CampaignTab)}
          />

          {tab === 'waves' &&
            (campaign.waveCount === 0 ? (
              <WavesEmpty stopped={stopped} />
            ) : (
              <WaveList campaign={campaign} />
            ))}

          {tab === 'audience' && (
            <AudienceTab
              code={code}
              members={members}
              canEdit={canEdit && !stopped}
              adding={adding}
              onAdding={setAdding}
            />
          )}
        </>
      }
    >
      {canEdit && (
        <ProfileDrawer
          campaign={campaign}
          open={editing}
          onClose={closeEdit}
          people={people}
          sources={sources}
          patch={patch}
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
    </RecordShell>
  )
}
