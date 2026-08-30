import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  AppShell,
  Badge,
  Button,
  Checkbox,
  Chip,
  CircleAlert,
  DataTable,
  EmptyState,
  Eye,
  GlassCard,
  Icon,
  ImagePlus,
  Inbox,
  Input,
  Kicker,
  MetaPill,
  Octagon,
  PenLine,
  Plus,
  ScreenHeader,
  ScreenLayout,
  ScreenScoreGrid,
  SearchField,
  SectionTitle,
  Select,
  SegmentedControl,
  Send,
  Skeleton,
  StatCard,
  Stepper,
  Textarea,
  Timeline,
  Trash2,
  UserPlus,
  Users,
  percent,
  type StepperStep,
} from '@pv/ui'
import type { Actor } from '@pv/engines'
import { MAS_MAX_RECIPIENTS } from '@pv/contracts'
import type {
  CampaignPatch,
  CampaignProfile,
  CampaignWaveInput,
  LeadBookQuery,
  LeadCategory,
  LeadTier,
  MailTemplateRow,
} from '@pv/contracts'
import { LEAD_CATEGORIES, LEAD_TIERS } from '@pv/engines/fixtures/das-vina'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { useCan } from '@/app/auth'
import { dm, dmhm, localSlot } from '@/lib/date'
import { useSalesPeople } from '@/data/directory'
import { salesCatalogQuery } from '@/data/sales-config'
import { leadBookQuery } from '@/data/leads'
import { MailHintList, MailPreviewCard } from '@/components/mail-compose-bits'
import { mailHints } from '@/data/mail-hints'
import { masTemplatesQuery, useMailPreview } from '@/data/mas'
import {
  CAMPAIGN_STATE_LABEL,
  CAMPAIGN_STATE_TONE,
  CampaignCreateFullError,
  campaignMembersQuery,
  campaignProfileQuery,
  useCampaignCreateFull,
  useCampaignMembers,
  useCampaignPatch,
  useCampaignStart,
  useCampaignStop,
  useCampaignWaveAdd,
} from '@/data/campaign-book'
import { MAIL_RUN_STATE_LABEL, MAIL_RUN_STATE_TONE } from '@/data/mail-runs'
import { RunWhen } from '@/components/run-when'

/** Module 1 · MỘT KHUNG, BA CỬA — tạo / sửa / xem một chiến dịch.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO BA ROUTE ĐỔ VÀO MỘT FILE
 *  ------------------------------------------------------------------
 *  Trước 29/08, "tạo" là một ô tên trong modal (`CampaignCreateDialog`), còn
 *  "sửa" là ba ô khác trong một modal khác (`CampaignEditDialog`), và "xem"
 *  là một màn thứ ba tự vẽ lại đúng những khối đó bằng dữ liệu thật. Ba nơi
 *  cho cùng bốn câu hỏi ("chiến dịch tên gì · gửi cho ai · gửi gì · đã tới
 *  đâu") là ba chỗ trôi lệch nhau mỗi lần thêm một trường. File này gộp lại
 *  thành BỐN KHỐI dùng chung — `ProfileFields` · `AudiencePicker` ·
 *  `WaveComposer` · `WaveTable` — và ba `export` dưới chỉ khác nhau ở BƯỚC
 *  MỞ ĐẦU của cùng một `CampaignForm`:
 *
 *    · `CampaignCreatePage` — `/sales/campaigns/moi`,      bước 0, đi tới bằng "Tiếp"
 *    · `CampaignEditPage`   — `/sales/campaigns/:code/sua`, bước 0, đi thẳng vào sửa
 *    · `CampaignViewPage`   — `/sales/campaigns/:code`,     bước 3 (Tổng quan)
 *
 *  ------------------------------------------------------------------
 *  STEPPER LÀ WIZARD, KHÔNG PHẢI TAB — VÀ ĐÓ LÀ LUẬT CỦA CHÍNH NÓ
 *  ------------------------------------------------------------------
 *  `Stepper` (`packages/ui/src/patterns/stepper.tsx`) khoá cứng: "bước chưa
 *  tới không bao giờ bấm được". Với chiến dịch ĐÃ CÓ, mọi bước đều đã có dữ
 *  liệu — không có "chưa tới" thật sự. Cách hoà hai luật: bước 3 (Tổng quan)
 *  là bước MỞ ĐẦU cho `edit`/`view`, nên ba bước 0-1-2 luôn là "đã qua" và
 *  bấm lùi được; muốn quay lại Tổng quan từ một trong ba bước đó thì bấm nút
 *  "Về tổng quan" cạnh tiêu đề, không đi qua Stepper. Với chiến dịch MỚI,
 *  không có gì để nhảy lùi/tới ngoài đường thẳng 0→1→2→3, đúng nghĩa gốc của
 *  component.
 *
 *  ------------------------------------------------------------------
 *  TẠO XONG KHÔNG GHI TỪNG BƯỚC — GHI MỘT LẦN Ở BƯỚC CUỐI
 *  ------------------------------------------------------------------
 *  Ba bước đầu của `create` chỉ giữ NHÁP trong state của React, không gọi
 *  mạng: bỏ dở ở bước 2 thì không để lại một chiến dịch rỗng trong sổ. Bấm
 *  "Tạo chiến dịch" ở bước 4 mới gọi `useCampaignCreateFull` — một mutation ở
 *  tầng dữ liệu gộp cả ba lệnh (tạo → gom người nhận → bắt đầu chạy) thành
 *  một chuỗi, vì `code` chỉ sinh ra sau lệnh đầu nên ba hook `useCampaign*`
 *  độc lập (mỗi cái đòi `code` ngay lúc gọi) không ghép được ở tầng màn — xem
 *  docblock của hook đó. */

type Mode = 'create' | 'existing'

const CREATE_STEPS: StepperStep[] = [
  { key: 'profile', label: 'Hồ sơ' },
  { key: 'audience', label: 'Người nhận' },
  { key: 'events', label: 'Đợt gửi' },
  { key: 'review', label: 'Soát lại' },
]

const EXISTING_STEPS: StepperStep[] = [
  { key: 'profile', label: 'Hồ sơ' },
  { key: 'audience', label: 'Người nhận' },
  { key: 'events', label: 'Đợt gửi' },
  { key: 'review', label: 'Tổng quan' },
]

type ProfileDraft = {
  name: string
  slogan: string
  thumbnailUrl: string
  ownerId: string
  sourceId: string
}

function emptyProfile(): ProfileDraft {
  return { name: '', slogan: '', thumbnailUrl: '', ownerId: '', sourceId: '' }
}

function profileFrom(c: CampaignProfile): ProfileDraft {
  return {
    name: c.name,
    slogan: c.slogan ?? '',
    thumbnailUrl: c.thumbnailUrl ?? '',
    ownerId: c.ownerId ?? '',
    sourceId: c.sourceId ?? '',
  }
}

type WaveDraft = CampaignWaveInput & { localId: string }

let waveSeq = 0
const newWaveId = () => `w${++waveSeq}`
const stripLocalId = ({ localId: _localId, ...rest }: WaveDraft): CampaignWaveInput => rest

/** State sống của `WaveComposer` — KHÔNG chỉ là mảng đợt đã khoá. `committed`
 *  là những đợt đã bấm "+ Thêm sự kiện"; tám trường còn lại là đợt ĐANG SOẠN,
 *  chưa khoá. Tách hai thứ này vì Đợt 1 không cần bấm "+" mới tồn tại — xem
 *  `effectiveWaves`. */
type ComposerState = {
  committed: WaveDraft[]
  templateCode: string
  label: string
  subject: string
  body: string
  ctaLabel: string
  ctaUrl: string
  timing: 'now' | 'later'
  at: string
}

function emptyComposerState(): ComposerState {
  return {
    committed: [],
    templateCode: '',
    label: '',
    subject: '',
    body: '',
    ctaLabel: '',
    ctaUrl: '',
    timing: 'now',
    at: '',
  }
}

function composerScheduleOk(s: ComposerState): boolean {
  return (
    s.timing === 'now' ||
    (s.at !== '' && !Number.isNaN(new Date(s.at).getTime()) && new Date(s.at) > new Date())
  )
}

function composerDraftValid(s: ComposerState): boolean {
  return (
    s.label.trim() !== '' &&
    s.subject.trim() !== '' &&
    s.body.trim() !== '' &&
    composerScheduleOk(s)
  )
}

function composerDraftInput(s: ComposerState): CampaignWaveInput {
  return {
    label: s.label.trim(),
    subject: s.subject.trim(),
    body: s.body.trim(),
    ...(s.templateCode === '' ? {} : { templateCode: s.templateCode }),
    ...(s.ctaLabel.trim() !== '' && s.ctaUrl.trim() !== ''
      ? { cta: { label: s.ctaLabel.trim(), url: s.ctaUrl.trim() } }
      : {}),
    ...(s.timing === 'later' ? { scheduledAt: new Date(s.at).toISOString() } : {}),
  }
}

/** Đợt đầu tiên KHÔNG cần bấm "+ Thêm sự kiện" mới có — điền đủ form bên trái
 *  là đủ để nó tính là một đợt thật. Nút "+" chỉ khoá đợt đang soạn lại (để
 *  không sửa nhầm sau khi đã coi là xong) và mở form trắng cho đợt kế tiếp.
 *  Nên danh sách THẬT SỰ sẽ gửi là mọi đợt đã khoá cộng đợt đang soạn, nếu nó
 *  đã đủ điều kiện gửi. */
function effectiveWaves(s: ComposerState): CampaignWaveInput[] {
  const locked = s.committed.map(stripLocalId)
  return composerDraftValid(s) ? [...locked, composerDraftInput(s)] : locked
}

const CATEGORY_LABEL = new Map(LEAD_CATEGORIES.map((c) => [c.key, c.label]))
const TIER_LABEL = new Map(LEAD_TIERS.map((t) => [t.key, t.label]))

/** THE CEILING NOBODY WAS TOLD ABOUT, said out loud with both numbers.
 *
 *  One wave is one MAS batch, and `MasService.send()` refuses a batch over
 *  `MAS_MAX_RECIPIENTS` with a 422. Neither `/start` nor `/waves` carries
 *  `leadCodes` — the server reads the audience itself — so nothing on the way
 *  in passes through the zod door that would have caught the size. Meanwhile
 *  `CampaignMemberPatch.add` accepts up to 500, so an audience of 201 is easy
 *  to build and impossible to fire, and until now the only news of that was the
 *  422 after the send button. */
function ceilingNote(count: number): string {
  return `Đang có ${count} người nhận, vượt trần ${MAS_MAX_RECIPIENTS} của một đợt gửi — bớt xuống rồi hãy bắn.`
}

export function CampaignCreatePage() {
  return <CampaignForm mode="create" />
}

export function CampaignEditPage() {
  const { code = '' } = useParams()
  return <CampaignForm mode="existing" code={code} initialStep={0} />
}

export function CampaignViewPage() {
  const { code = '' } = useParams()
  return <CampaignForm mode="existing" code={code} initialStep={3} />
}

function CampaignForm({
  mode,
  code,
  initialStep = 0,
}: {
  mode: Mode
  code?: string
  initialStep?: number
}) {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm chiến dịch, đợt gửi…' })
  const navigate = useNavigate()
  const isNew = mode === 'create'

  const {
    data: campaign,
    isPending,
    error,
  } = useQuery({ ...campaignProfileQuery(code ?? ''), enabled: !isNew })

  const [step, setStep] = useState(initialStep)
  const goOverview = () => setStep(3)

  const people = useSalesPeople()
  const { data: catalog } = useQuery(salesCatalogQuery)
  const sources = useMemo(() => catalog?.SOURCE ?? [], [catalog])
  const { data: templateData } = useQuery(masTemplatesQuery)
  const templates = templateData?.rows ?? []

  // ---- create-mode draft: sống trong React, không chạm mạng tới bước cuối ----
  const [draftProfile, setDraftProfile] = useState<ProfileDraft>(emptyProfile)
  const [draftAudience, setDraftAudience] = useState<ReadonlySet<string>>(() => new Set())
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState)
  const [submitting, setSubmitting] = useState(false)

  const createFull = useCampaignCreateFull()
  const patch = useCampaignPatch(code ?? '')
  const members = useCampaignMembers(code ?? '')
  const start = useCampaignStart(code ?? '')
  const stop = useCampaignStop(code ?? '')
  const waveAdd = useCampaignWaveAdd(code ?? '')

  /* HIDE, do not grey out — same call `opportunity-detail.tsx` makes and for the
     same reason: a greyed button promises "this works, just not now", and for
     sale/bd/presales it is never now. Those three roles carry the campaign READ
     permission alone, so until today they were looking at four buttons that
     could only ever answer 403.

     `useCan` asks the same E2 function `app/api/client.ts` asks before letting a
     byte out, so the screen and the barrier cannot say opposite things — and
     hiding a button is not access control: the real gate stays at the api layer
     and the server doors still declare their own `@Need`. */
  const canEdit = useCan('chiến-dịch.sửa')
  const canFire = useCan('chiến-dịch.bắn')

  const submitCreate = () => {
    if (!draftProfile.name.trim() || submitting) return
    setSubmitting(true)
    const waves = effectiveWaves(composer)
    createFull.mutate(
      {
        name: draftProfile.name.trim(),
        ...(draftProfile.ownerId ? { ownerId: draftProfile.ownerId } : {}),
        ...(draftProfile.sourceId ? { sourceId: draftProfile.sourceId } : {}),
        ...(draftProfile.slogan.trim() ? { slogan: draftProfile.slogan.trim() } : {}),
        ...(draftProfile.thumbnailUrl.trim()
          ? { thumbnailUrl: draftProfile.thumbnailUrl.trim() }
          : {}),
        ...(draftAudience.size > 0 ? { leadCodes: [...draftAudience] } : {}),
        ...(waves.length > 0 ? { waves } : {}),
      },
      {
        onSuccess: (row) => {
          toast(`Đã tạo chiến dịch ${row.code}`, {
            tone: 'success',
            detail:
              waves.length > 0
                ? `${waves.length} đợt đã vào hàng đợi.`
                : 'Còn ở trạng thái NHÁP — vào hồ sơ để gom người nhận và bắt đầu chạy.',
          })
          navigate('/sales/campaigns')
        },
        onError: (err) => {
          if (err instanceof CampaignCreateFullError) {
            toast(`Đã tạo ${err.code} nhưng chưa xong hẳn`, {
              tone: 'danger',
              detail: isApiError(err.cause)
                ? userMessage(err.cause)
                : 'Gom người nhận hoặc bắt đầu chạy thất bại — vào hồ sơ để thử lại.',
            })
            navigate(`/sales/campaigns/${err.code}`)
          } else {
            toast('Không tạo được chiến dịch', {
              tone: 'danger',
              detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
            })
          }
        },
        onSettled: () => setSubmitting(false),
      },
    )
  }

  if (!isNew && isPending) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-40 w-full" />
        </ScreenLayout>
      </AppShell>
    )
  }

  if (!isNew && (error || !campaign)) {
    return (
      <AppShell {...chrome.shell}>
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
        </ScreenLayout>
      </AppShell>
    )
  }

  const steps = isNew ? CREATE_STEPS : EXISTING_STEPS

  /* Step 2 mirrors the server rule for POST /waves. A DRAFT with no wave yet is
     the only case that still has to go through /start; every other live state
     takes one more wave (adding one to a finished campaign reopens it, and the
     server raises it back to RUNNING by itself). A stopped campaign takes none,
     so it gets the read-only table. */
  const firstRun = !isNew && campaign?.state === 'DRAFT' && campaign.waveCount === 0
  const moreWaves = !isNew && !!campaign && campaign.state !== 'STOPPED' && !firstRun

  const headerActions = isNew ? undefined : step !== 3 ? (
    <Button size="md" variant="ghost" onClick={goOverview}>
      Về tổng quan
    </Button>
  ) : (
    <>
      {canEdit && (
        <Button size="md" variant="ghost" onClick={() => setStep(0)}>
          <Icon icon={PenLine} size={16} />
          Sửa hồ sơ
        </Button>
      )}
      {canEdit && (
        <Button size="md" variant="ghost" onClick={() => setStep(1)}>
          <Icon icon={UserPlus} size={16} />
          Thêm người nhận
        </Button>
      )}
      {canFire && campaign && firstRun && (
        <Button
          size="md"
          onClick={() => setStep(2)}
          disabled={campaign.audienceCount === 0 || campaign.audienceCount > MAS_MAX_RECIPIENTS}
          title={
            campaign.audienceCount === 0
              ? 'Thêm người nhận trước khi bắt đầu chạy'
              : campaign.audienceCount > MAS_MAX_RECIPIENTS
                ? ceilingNote(campaign.audienceCount)
                : undefined
          }
        >
          <Icon icon={Send} size={16} />
          Bắt đầu chạy
        </Button>
      )}
      {/* The only visible door to step 2 for a campaign already running: the
          Stepper chip is the other one and nobody finds it, which is how the MAS
          modal detour survived this long. */}
      {canFire && moreWaves && (
        <Button size="md" onClick={() => setStep(2)}>
          <Icon icon={Plus} size={16} />
          Thêm đợt
        </Button>
      )}
      {canFire && campaign?.state === 'RUNNING' && (
        <Button
          size="md"
          variant="ghost"
          onClick={() =>
            stop.mutate(undefined, {
              onSuccess: (res) => {
                const held = res.cancelled.reduce((n, r) => n + r.held, 0)
                toast('Đã dừng chiến dịch', {
                  tone: 'success',
                  detail:
                    res.cancelled.length === 0
                      ? 'Không đợt nào còn thư để giữ lại.'
                      : `${res.cancelled.length} đợt bị huỷ · ${held} thư chưa gửi đã được giữ lại.`,
                })
              },
              onError: (err) =>
                toast('Không dừng được chiến dịch', {
                  tone: 'danger',
                  detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
                }),
            })
          }
          disabled={stop.isPending}
        >
          <Icon icon={Octagon} size={16} />
          {stop.isPending ? 'Đang dừng…' : 'Dừng chiến dịch'}
        </Button>
      )}
    </>
  )

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          back={{ label: 'Sổ chiến dịch', onClick: () => navigate('/sales/campaigns') }}
          title={isNew ? 'Chiến dịch mới' : (campaign?.name ?? '')}
          description={isNew ? undefined : campaign?.slogan}
          actions={headerActions}
        />

        {!isNew && campaign && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{campaign.code}</Chip>
            <Badge tone={CAMPAIGN_STATE_TONE[campaign.state]}>
              {CAMPAIGN_STATE_LABEL[campaign.state]}
            </Badge>
            <Kicker>
              {campaign.ownerName ?? 'Chưa có chủ'}
              {campaign.sourceName ? ` · nguồn ${campaign.sourceName}` : ''} · mở{' '}
              {dm(campaign.createdAt)}
            </Kicker>
          </div>
        )}

        <Stepper steps={steps} current={step} onGo={setStep} />

        {step === 0 &&
          (isNew ? (
            <ProfileCreateStep
              draft={draftProfile}
              setDraft={setDraftProfile}
              people={people}
              sources={sources}
              onNext={() => setStep(1)}
            />
          ) : (
            campaign && (
              <ProfileEditStep
                campaign={campaign}
                people={people}
                sources={sources}
                patch={patch}
                canEdit={canEdit}
                onDone={goOverview}
                onCancel={goOverview}
              />
            )
          ))}

        {step === 1 &&
          (isNew ? (
            <AudienceCreateStep
              selected={draftAudience}
              setSelected={setDraftAudience}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          ) : (
            <AudienceEditStep
              code={code ?? ''}
              members={members}
              canEdit={canEdit}
              onDone={goOverview}
              onCancel={goOverview}
            />
          ))}

        {step === 2 &&
          (isNew ? (
            <EventsCreateStep
              composer={composer}
              setComposer={setComposer}
              templates={templates}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          ) : (
            campaign &&
            (!canFire || campaign.state === 'STOPPED' ? (
              <WaveTable campaign={campaign} />
            ) : firstRun ? (
              <EventsEditStep
                templates={templates}
                start={start}
                audienceCount={campaign.audienceCount}
                onDone={goOverview}
                onCancel={goOverview}
              />
            ) : (
              <WaveAddStep
                campaign={campaign}
                templates={templates}
                waveAdd={waveAdd}
                onDone={goOverview}
                onCancel={goOverview}
              />
            ))
          ))}

        {step === 3 &&
          (isNew ? (
            <ReviewCreateStep
              draft={draftProfile}
              audienceCount={draftAudience.size}
              waves={effectiveWaves(composer)}
              people={people}
              sources={sources}
              canEdit={canEdit}
              onBack={() => setStep(2)}
              onSubmit={submitCreate}
              submitting={submitting}
            />
          ) : (
            campaign && <OverviewStep campaign={campaign} />
          ))}
      </ScreenLayout>
    </AppShell>
  )
}

// ---------------------------------------------------------------------------
// Bước 1 · Hồ sơ
// ---------------------------------------------------------------------------

function ProfileFields({
  name,
  setName,
  slogan,
  setSlogan,
  thumbnailUrl,
  setThumbnailUrl,
  ownerId,
  setOwnerId,
  sourceId,
  setSourceId,
  people,
  sources,
}: {
  name: string
  setName: (v: string) => void
  slogan: string
  setSlogan: (v: string) => void
  thumbnailUrl: string
  setThumbnailUrl: (v: string) => void
  ownerId: string
  setOwnerId: (v: string) => void
  sourceId: string
  setSourceId: (v: string) => void
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Tên chiến dịch</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Ví dụ: Tiếp cận nhà máy Bắc Ninh · quý 3"
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Slogan (không bắt buộc)</span>
          <Input
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            maxLength={200}
            placeholder="Câu mở đầu ngắn hiện dưới tên chiến dịch"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Chủ chiến dịch</span>
            <Select
              label="Chủ chiến dịch"
              hideLabel
              value={ownerId}
              onChange={setOwnerId}
              options={[
                { value: '', label: 'Chưa gán' },
                ...people.map((p) => ({ value: p.id, label: `${p.name} · ${p.role}` })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Nguồn dẫn</span>
            <Select
              label="Nguồn dẫn"
              hideLabel
              value={sourceId}
              onChange={setSourceId}
              options={[
                { value: '', label: 'Chưa gán' },
                ...sources.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px]">
          Thumbnail — dán URL ảnh (không bắt buộc)
        </span>
        <Input
          value={thumbnailUrl}
          onChange={(e) => setThumbnailUrl(e.target.value)}
          placeholder="https://…"
        />
        <GlassCard
          variant="a"
          className="flex aspect-video items-center justify-center overflow-hidden p-0"
        >
          {thumbnailUrl.trim() ? (
            <img
              src={thumbnailUrl.trim()}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
              }}
            />
          ) : (
            <Icon icon={ImagePlus} size={24} className="text-muted-foreground" />
          )}
        </GlassCard>
      </div>
    </div>
  )
}

function ProfileCreateStep({
  draft,
  setDraft,
  people,
  sources,
  onNext,
}: {
  draft: ProfileDraft
  setDraft: Dispatch<SetStateAction<ProfileDraft>>
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  onNext: () => void
}) {
  const canNext = draft.name.trim().length > 0

  return (
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6">
      <SectionTitle>Chiến dịch này tên gì, ai chạy</SectionTitle>
      <ProfileFields
        name={draft.name}
        setName={(v) => setDraft((d) => ({ ...d, name: v }))}
        slogan={draft.slogan}
        setSlogan={(v) => setDraft((d) => ({ ...d, slogan: v }))}
        thumbnailUrl={draft.thumbnailUrl}
        setThumbnailUrl={(v) => setDraft((d) => ({ ...d, thumbnailUrl: v }))}
        ownerId={draft.ownerId}
        setOwnerId={(v) => setDraft((d) => ({ ...d, ownerId: v }))}
        sourceId={draft.sourceId}
        setSourceId={(v) => setDraft((d) => ({ ...d, sourceId: v }))}
        people={people}
        sources={sources}
      />
      <div className="flex justify-end">
        <Button size="md" onClick={onNext} disabled={!canNext}>
          Tiếp
          <Icon icon={ArrowRight} size={16} />
        </Button>
      </div>
    </GlassCard>
  )
}

/** One field's contribution to the PATCH body, in the contract's three states.
 *
 *  Absent = leave it, `null` = CLEAR it, a value = set it. So `''` only means
 *  "clear" when something was there to clear; `''` over an already-empty field
 *  is nobody touching anything, and sending `null` for it would be a write with
 *  no edit behind it. */
function patchField(next: string, original: string): string | null | undefined {
  if (next === original) return undefined
  return next === '' ? null : next
}

function ProfileEditStep({
  campaign,
  people,
  sources,
  patch,
  canEdit,
  onDone,
  onCancel,
}: {
  campaign: CampaignProfile
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  patch: ReturnType<typeof useCampaignPatch>
  canEdit: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ProfileDraft>(() => profileFrom(campaign))
  const original = useMemo(() => profileFrom(campaign), [campaign])

  const changed =
    draft.name.trim() !== original.name ||
    draft.slogan.trim() !== original.slogan ||
    draft.thumbnailUrl.trim() !== original.thumbnailUrl ||
    draft.ownerId !== original.ownerId ||
    draft.sourceId !== original.sourceId

  const canSave = draft.name.trim().length > 0 && changed && !patch.isPending

  const submit = () => {
    if (!canSave) return
    const slogan = patchField(draft.slogan.trim(), original.slogan)
    const thumbnailUrl = patchField(draft.thumbnailUrl.trim(), original.thumbnailUrl)
    const ownerId = patchField(draft.ownerId, original.ownerId)
    const sourceId = patchField(draft.sourceId, original.sourceId)
    const body: CampaignPatch = {
      ...(draft.name.trim() === original.name ? {} : { name: draft.name.trim() }),
      ...(slogan === undefined ? {} : { slogan }),
      ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
      ...(ownerId === undefined ? {} : { ownerId }),
      ...(sourceId === undefined ? {} : { sourceId }),
    }
    patch.mutate(body, {
      onSuccess: () => {
        toast('Đã lưu hồ sơ chiến dịch', { tone: 'success' })
        onDone()
      },
      onError: (err) =>
        toast('Không lưu được', {
          tone: 'danger',
          detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
        }),
    })
  }

  return (
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6">
      <SectionTitle>Sửa hồ sơ {campaign.code}</SectionTitle>
      <ProfileFields
        name={draft.name}
        setName={(v) => setDraft((d) => ({ ...d, name: v }))}
        slogan={draft.slogan}
        setSlogan={(v) => setDraft((d) => ({ ...d, slogan: v }))}
        thumbnailUrl={draft.thumbnailUrl}
        setThumbnailUrl={(v) => setDraft((d) => ({ ...d, thumbnailUrl: v }))}
        ownerId={draft.ownerId}
        setOwnerId={(v) => setDraft((d) => ({ ...d, ownerId: v }))}
        sourceId={draft.sourceId}
        setSourceId={(v) => setDraft((d) => ({ ...d, sourceId: v }))}
        people={people}
        sources={sources}
      />
      <div className="flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        {canEdit && (
          <Button size="md" onClick={submit} disabled={!canSave}>
            {patch.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        )}
      </div>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Bước 2 · Người nhận — chọn từ Sổ lead, "bôi đen" bằng rê chuột qua nhiều dòng
// ---------------------------------------------------------------------------

const AUDIENCE_PAGE_SIZE = 100

/** Same 300ms the lead and opportunity books use. The query object below IS the
 *  `queryKey`, so one keystroke would otherwise be one new key and one round
 *  trip: eight characters, eight requests, and the answer to the first seven
 *  arriving after the eighth. No address bar to keep in step here, so the letters
 *  stay in state (typing shows up at once) and only drip into the query. */
const SEARCH_DELAY_MS = 300

function AudiencePicker({
  selected,
  onSetOne,
  onSetMany,
}: {
  selected: ReadonlySet<string>
  onSetOne: (code: string, on: boolean) => void
  onSetMany: (codes: string[], on: boolean) => void
}) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [tier, setTier] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text])

  const query: LeadBookQuery = useMemo(
    () => ({
      page: 1,
      size: AUDIENCE_PAGE_SIZE,
      status: 'running',
      sort: 'createdAt',
      dir: 'desc',
      ...(search === '' ? {} : { q: search }),
      ...(category === '' ? {} : { category: category as LeadCategory }),
      ...(tier === '' ? {} : { tier: tier as LeadTier }),
    }),
    [search, category, tier],
  )

  const { data, isPending } = useQuery(leadBookQuery(query))
  const rows = data?.rows ?? []
  /* Read the DEBOUNCED word, not the live one: the table is answering `search`,
     so asking `text` makes the empty-state describe a query the rows are not
     from — clearing the box would flip this to false 300ms before the rows come
     back, and the reader would be told the whole book is empty. */
  const filtered = search !== '' || category !== '' || tier !== ''
  const clearFilters = () => {
    setText('')
    setCategory('')
    setTier('')
  }

  const dragIntent = useRef<'select' | 'deselect' | null>(null)
  const suppressClick = useRef<string | null>(null)

  const activate = (code: string) => {
    if (suppressClick.current === code) return
    onSetOne(code, !selected.has(code))
  }

  const beginDrag = (code: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0) return
    event.preventDefault()
    const intent = selected.has(code) ? 'deselect' : 'select'
    dragIntent.current = intent
    suppressClick.current = code
    onSetOne(code, intent === 'select')
  }

  const paintSelection = (code: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.buttons !== 1 || dragIntent.current === null) return
    onSetOne(code, dragIntent.current === 'select')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.6fr)_repeat(2,minmax(140px,1fr))_auto] xl:items-center">
        <SearchField
          size="topbar"
          placeholder="Tìm theo công ty, người liên hệ hoặc mã lead…"
          value={text}
          onChange={setText}
          className="w-full"
        />
        <Select
          label="Ngành"
          value={category}
          onChange={setCategory}
          options={[
            { value: '', label: 'Mọi ngành' },
            ...LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
          ]}
        />
        <Select
          label="Bậc"
          value={tier}
          onChange={setTier}
          options={[
            { value: '', label: 'Mọi bậc' },
            ...LEAD_TIERS.map((t) => ({ value: t.key, label: t.label })),
          ]}
        />
        <Button
          size="md"
          variant="ghost"
          onClick={() =>
            onSetMany(
              rows.map((r) => r.code),
              true,
            )
          }
          disabled={rows.length === 0}
          className="w-full xl:w-auto"
        >
          Chọn tất cả {rows.length} đang hiện
        </Button>
      </div>

      <GlassCard variant="b" className="max-h-[50vh] select-none overflow-y-auto p-0">
        {isPending ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            message={
              filtered
                ? 'Không có lead nào khớp bộ lọc đang chọn.'
                : 'Sổ lead đang mở (trạng thái ĐANG CHẠY) hiện chưa có dòng nào.'
            }
            action={{ label: 'Bỏ hết bộ lọc', onClick: clearFilters }}
            className="py-8"
          />
        ) : (
          <DataTable
            columns={[
              { header: 'Chọn', width: '48px' },
              { header: 'Mã', width: '0.8fr' },
              { header: 'Account', width: '1.7fr' },
              { header: 'Người liên hệ', width: '1.4fr' },
              { header: 'Ngành · Bậc', width: '1.2fr' },
            ]}
            rows={rows.map((l) => ({
              id: l.code,
              state: selected.has(l.code) ? ('selected' as const) : undefined,
              onOpen: () => activate(l.code),
              onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => beginDrag(l.code, event),
              onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) =>
                paintSelection(l.code, event),
              cells: [
                <span
                  key="chk"
                  className="flex w-full justify-center"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selected.has(l.code)}
                    onChange={(on) => onSetOne(l.code, on)}
                    label={<span className="sr-only">Chọn {l.company}</span>}
                    className="w-full justify-center gap-0 p-0"
                  />
                </span>,
                <Chip key="c">{l.code}</Chip>,
                <span key="n" className="block truncate" title={l.company}>
                  {l.company}
                </span>,
                <span key="ct" className="block truncate">
                  {l.contactName}
                </span>,
                <span key="cat" className="text-muted-foreground">
                  {l.category ? (CATEGORY_LABEL.get(l.category) ?? l.category) : '—'} ·{' '}
                  {l.tier ? (TIER_LABEL.get(l.tier) ?? l.tier) : '—'}
                </span>,
              ],
            }))}
          />
        )}
      </GlassCard>
      <p className="text-muted-foreground text-[11px]">
        Hiện tới {AUDIENCE_PAGE_SIZE} lead khớp lọc, mới nhất trước. Bấm từng dòng để chọn — chạm
        cũng vậy. Riêng với chuột, giữ nút trái rồi rê qua nhiều dòng để bôi đen hàng loạt.
      </p>
    </div>
  )
}

function AudienceCreateStep({
  selected,
  setSelected,
  onBack,
  onNext,
}: {
  selected: ReadonlySet<string>
  setSelected: Dispatch<SetStateAction<ReadonlySet<string>>>
  onBack: () => void
  onNext: () => void
}) {
  const setOne = (code: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  const setMany = (codes: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      for (const code of codes) {
        if (on) next.add(code)
        else next.delete(code)
      }
      return next
    })

  const overCeiling = selected.size > MAS_MAX_RECIPIENTS

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Thư đi tới ai</SectionTitle>
        {selected.size > 0 && <Chip>{selected.size} đã chọn</Chip>}
      </div>
      <AudiencePicker selected={selected} onSetOne={setOne} onSetMany={setMany} />
      {overCeiling && <p className="text-warning text-[12px]">{ceilingNote(selected.size)}</p>}
      <div className="flex justify-between gap-2">
        <Button size="md" variant="ghost" onClick={onBack}>
          <Icon icon={ArrowLeft} size={16} />
          Lùi
        </Button>
        <Button size="md" onClick={onNext} disabled={overCeiling}>
          Tiếp
          <Icon icon={ArrowRight} size={16} />
        </Button>
      </div>
    </GlassCard>
  )
}

/** WHO IS ALREADY IN, and who among them cannot be written to.
 *
 *  The missing-address count is read from the member list itself, not from
 *  `masPreflight`: that door runs `audience(..., scoped = true)`, so on a
 *  campaign holding somebody else's leads it reports them MISSING when they are
 *  merely out of this reader's scope. Counting absent `email` here answers the
 *  real question — which rows are certain to be skipped at send time — and needs
 *  no new endpoint. Until now that number only showed up as `skipped`, after the
 *  mail had gone. */
function CampaignMemberList({
  code,
  members,
  canEdit,
}: {
  code: string
  members: ReturnType<typeof useCampaignMembers>
  canEdit: boolean
}) {
  const { data, isPending } = useQuery(campaignMembersQuery(code))
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  /* Counted over the rows ON SCREEN, and the sentence says so. The query asks
     for one page while `add` takes 500 a round, so an audience past that page is
     ordinary — a count worded as if it covered the whole audience would be
     wrong exactly on the screens built to prevent surprises at send time. */
  const noEmail = rows.filter((m) => !m.email).length

  const removeOne = (leadCode: string) =>
    members.mutate(
      { remove: [leadCode] },
      {
        onSuccess: (res) =>
          toast('Đã gỡ khỏi tệp nhận', {
            tone: 'success',
            detail: `Tệp nhận nay có ${res.audienceCount} người.`,
          }),
        onError: (err) =>
          toast('Không gỡ được người nhận', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Đang trong tệp nhận</SectionTitle>
        <Chip>{total} người</Chip>
      </div>

      {noEmail > 0 && (
        <p className="text-warning text-[12px]">
          {noEmail} trong {rows.length} dòng đang hiện chưa có email — những dòng này chắc chắn bị
          bỏ qua lúc bắn.
        </p>
      )}

      {rows.length < total && (
        <p className="text-muted-foreground text-[12px]">
          Đang hiện {rows.length} trên {total} người trong tệp — {total - rows.length} dòng còn lại
          chưa nạp ở màn này.
        </p>
      )}

      <GlassCard variant="b" className="max-h-[40vh] overflow-y-auto p-0">
        {isPending ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Icon icon={Users} size={26} className="text-muted-foreground" />
            <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">
              Tệp nhận còn rỗng — chọn lead ở bảng dưới rồi bấm thêm.
            </p>
          </div>
        ) : (
          <DataTable
            columns={[
              { header: 'Mã', width: '0.8fr' },
              { header: 'Account', width: '1.7fr' },
              { header: 'Người liên hệ', width: '1.3fr' },
              { header: 'Email', width: '1.6fr' },
              { header: 'Gỡ', width: '96px', align: 'right' },
            ]}
            rows={rows.map((m) => ({
              id: m.leadCode,
              cells: [
                <Chip key="c">{m.leadCode}</Chip>,
                <span key="n" className="block truncate" title={m.company}>
                  {m.company}
                </span>,
                <span key="ct" className="block truncate">
                  {m.contactName}
                </span>,
                m.email ? (
                  <span key="e" className="block truncate" title={m.email}>
                    {m.email}
                  </span>
                ) : (
                  <span key="e" className="text-warning">
                    Chưa có email
                  </span>
                ),
                canEdit ? (
                  <Button
                    key="rm"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOne(m.leadCode)}
                    disabled={members.isPending}
                  >
                    <Icon icon={Trash2} size={14} />
                    Gỡ
                  </Button>
                ) : (
                  <span key="rm" className="text-muted-foreground">
                    —
                  </span>
                ),
              ],
            }))}
          />
        )}
      </GlassCard>
    </GlassCard>
  )
}

function AudienceEditStep({
  code,
  members,
  canEdit,
  onDone,
  onCancel,
}: {
  code: string
  members: ReturnType<typeof useCampaignMembers>
  canEdit: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const setOne = (code: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  const setMany = (codes: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      for (const code of codes) {
        if (on) next.add(code)
        else next.delete(code)
      }
      return next
    })

  const submit = () => {
    if (selected.size === 0) return
    members.mutate(
      { add: [...selected] },
      {
        onSuccess: (res) => {
          toast(`Tệp nhận nay có ${res.audienceCount} người`, {
            tone: 'success',
            detail: `Đã thêm ${res.added} lead.`,
          })
          onDone()
        },
        onError: (err) =>
          toast('Không thêm được người nhận', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <CampaignMemberList code={code} members={members} canEdit={canEdit} />

      {/* The whole picker goes, not just the send button: a reader who may only
          look can still search, tick forty leads and drag-paint over the table
          before finding out there is nothing to press. The list above stays —
          seeing who is in the audience is what the read permission buys. */}
      {canEdit && (
        <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Thêm người nhận</SectionTitle>
            {selected.size > 0 && <Chip>{selected.size} đã chọn</Chip>}
          </div>
          <AudiencePicker selected={selected} onSetOne={setOne} onSetMany={setMany} />
          <div className="flex justify-end gap-2">
            <Button size="md" variant="ghost" onClick={onCancel}>
              Huỷ
            </Button>
            <Button size="md" onClick={submit} disabled={selected.size === 0 || members.isPending}>
              {members.isPending ? 'Đang thêm…' : `Thêm ${selected.size || ''} người nhận`}
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bước 3 · Luồng sự kiện — soạn mail bên trái, chuỗi đợt bên phải
// ---------------------------------------------------------------------------

function WaveComposer({
  state,
  setState,
  templates,
  showAdd = true,
}: {
  state: ComposerState
  setState: Dispatch<SetStateAction<ComposerState>>
  templates: MailTemplateRow[]
  /** Off for a running campaign: see `WaveAddStep`, one wave per round. */
  showAdd?: boolean
}) {
  const pickTemplate = (value: string) => {
    const found = templates.find((t) => t.code === value)
    setState((s) => ({
      ...s,
      templateCode: value,
      ...(found ? { subject: found.subject, body: found.body } : {}),
      ...(found && s.label.trim() === '' ? { label: found.name } : {}),
      ...(found?.cta ? { ctaLabel: found.cta.label, ctaUrl: found.cta.url } : {}),
    }))
  }

  const [previewOpen, setPreviewOpen] = useState(false)
  /* The button travels only when the pair is COMPLETE and the URL parses —
     `MailCta` in the contract refuses a half-typed address, and somebody in the
     middle of typing `https://` has a half-typed address on every keystroke.
     Without the pair the letter renders with no button, exactly as it would be
     sent. */
  const previewCta =
    state.ctaLabel.trim() !== '' && /^https?:\/\/\S+$/.test(state.ctaUrl.trim())
      ? { label: state.ctaLabel.trim(), url: state.ctaUrl.trim() }
      : undefined
  const preview = useMailPreview(
    { subject: state.subject, body: state.body, ...(previewCta ? { cta: previewCta } : {}) },
    previewOpen,
  )
  const hints = mailHints({
    subject: state.subject,
    body: state.body,
    missing: preview.letter?.missing,
  })

  const draftValid = composerDraftValid(state)
  const canAdd = draftValid && state.committed.length < 20
  const nextIndex = state.committed.length + 1
  const totalCount = effectiveWaves(state).length
  const draftTouched =
    state.label.trim() !== '' || state.subject.trim() !== '' || state.body.trim() !== ''

  const addEvent = () => {
    if (!canAdd) return
    const wave: WaveDraft = { localId: newWaveId(), ...composerDraftInput(state) }
    setState((s) => ({ ...emptyComposerState(), committed: [...s.committed, wave] }))
  }

  const removeCommitted = (localId: string) =>
    setState((s) => ({ ...s, committed: s.committed.filter((w) => w.localId !== localId) }))

  const clearDraft = () =>
    setState((s) => ({
      ...s,
      templateCode: '',
      label: '',
      subject: '',
      body: '',
      ctaLabel: '',
      ctaUrl: '',
      timing: 'now',
      at: '',
    }))

  return (
    <div className="grid gap-4 md:grid-cols-[7fr_5fr] md:items-start">
      <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
        <SectionTitle>Soạn Đợt {nextIndex}</SectionTitle>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Mẫu thư (không bắt buộc)</span>
          <Select
            label="Mẫu thư"
            hideLabel
            value={state.templateCode}
            onChange={pickTemplate}
            options={[
              { value: '', label: 'Tự soạn' },
              ...templates.map((t) => ({ value: t.code, label: t.name })),
            ]}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Tên đợt</span>
          <Input
            value={state.label}
            onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
            placeholder="Ví dụ: Đợt 1 · giới thiệu"
            maxLength={200}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            Tiêu đề email · {state.subject.length}/200
          </span>
          <Input
            value={state.subject}
            onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))}
            maxLength={200}
            placeholder="Tiêu đề người nhận đọc thấy trong hộp thư"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Nội dung</span>
          <Textarea
            value={state.body}
            onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
            rows={6}
            placeholder="Thân thư. Dùng {{company}} và {{contactName}} để điền tên từng người nhận."
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">
              Nút CTA · nhãn (không bắt buộc)
            </span>
            <Input
              value={state.ctaLabel}
              onChange={(e) => setState((s) => ({ ...s, ctaLabel: e.target.value }))}
              maxLength={80}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Nút CTA · URL</span>
            <Input
              value={state.ctaUrl}
              onChange={(e) => setState((s) => ({ ...s, ctaUrl: e.target.value }))}
              placeholder="https://…"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <SegmentedControl
            label="Thời điểm gửi"
            value={state.timing}
            /* Switching to the scheduled option fills the field with a real slot.
               An empty `<input type="datetime-local">` is not a neutral start:
               the send button stays locked and the reason is written nowhere, so
               the user faces a control that refuses without a word. */
            onChange={(v) =>
              setState((s) => ({
                ...s,
                timing: v as 'now' | 'later',
                ...(v === 'later' && s.at === '' ? { at: localSlot() } : {}),
              }))
            }
            options={[
              { value: 'now', label: 'Gửi ngay' },
              { value: 'later', label: 'Đặt lịch gửi' },
            ]}
          />
          {state.timing === 'later' && (
            <label className="flex flex-col gap-2">
              <span className="text-muted-foreground text-[11px]">Giờ gửi (giờ máy bạn)</span>
              <Input
                type="datetime-local"
                value={state.at}
                onChange={(e) => setState((s) => ({ ...s, at: e.target.value }))}
              />
            </label>
          )}
        </div>

        {/* THE SAME TWO BLOCKS THE MAS COMPOSE PANEL SHOWS, and the same
            components rather than a second pair: a campaign wave leaves through
            the identical send path (`mail_run` → `mas-v1`), so a preview built
            separately here would be a second rendering of one letter, and two
            renderings are two things that drift apart.

            No lead to merge against — a campaign's audience is
            `campaign_member`, frozen when it starts running rather than while
            it is being written — so the preview goes without `leadCode` and the
            server fills in sample values. The shell, footer and button are the
            real ones either way. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-[11px]">Kiểm lại thư trước khi thêm đợt</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={state.subject.trim() === '' || state.body.trim() === ''}
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((current) => !current)}
          >
            <Icon icon={Eye} size={14} />
            {previewOpen ? 'Đóng xem trước' : 'Xem trước'}
          </Button>
        </div>

        <MailHintList hints={hints} />

        {previewOpen && (
          <MailPreviewCard
            letter={preview.letter}
            pending={preview.pending}
            error={preview.error}
          />
        )}
      </GlassCard>

      <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Chuỗi đợt · {totalCount}/20</SectionTitle>
          {showAdd && (
            <Button size="sm" variant="ghost" onClick={addEvent} disabled={!canAdd}>
              <Icon icon={Plus} size={14} />
              Thêm đợt
            </Button>
          )}
        </div>

        <Timeline
          items={[
            ...state.committed.map((w, i) => ({
              id: w.localId,
              state: 'next' as const,
              marker: `Đợt ${i + 1}`,
              title: w.label,
              meta: (
                <MetaPill>
                  {w.scheduledAt ? `Hẹn · ${dmhm(w.scheduledAt)}` : 'Gửi ngay khi bắt đầu chạy'}
                </MetaPill>
              ),
              children: <span className="line-clamp-1">{w.subject}</span>,
              actions: (
                <Button size="sm" variant="ghost" onClick={() => removeCommitted(w.localId)}>
                  <Icon icon={Trash2} size={14} />
                  Xoá
                </Button>
              ),
            })),
            {
              id: 'live-draft',
              state: 'current' as const,
              marker: `Đợt ${nextIndex}`,
              title: state.label.trim() || (
                <span className="text-muted-foreground">(đang soạn…)</span>
              ),
              meta: (
                <MetaPill>
                  {draftValid ? 'Đang soạn — sẽ gửi' : 'Chưa đủ để gửi — điền tiêu đề và nội dung'}
                </MetaPill>
              ),
              children: state.subject.trim() ? (
                <span className="line-clamp-1">{state.subject}</span>
              ) : (
                <span className="text-muted-foreground">Chưa có tiêu đề</span>
              ),
              actions: draftTouched ? (
                <Button size="sm" variant="ghost" onClick={clearDraft}>
                  <Icon icon={Trash2} size={14} />
                  Xoá
                </Button>
              ) : undefined,
            },
          ]}
        />
      </GlassCard>
    </div>
  )
}

function EventsCreateStep({
  composer,
  setComposer,
  templates,
  onBack,
  onNext,
}: {
  composer: ComposerState
  setComposer: Dispatch<SetStateAction<ComposerState>>
  templates: MailTemplateRow[]
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <WaveComposer state={composer} setState={setComposer} templates={templates} />
      <div className="flex justify-between gap-2">
        <Button size="md" variant="ghost" onClick={onBack}>
          <Icon icon={ArrowLeft} size={16} />
          Lùi
        </Button>
        <Button size="md" onClick={onNext}>
          Tiếp
          <Icon icon={ArrowRight} size={16} />
        </Button>
      </div>
    </div>
  )
}

function EventsEditStep({
  templates,
  start,
  audienceCount,
  onDone,
  onCancel,
}: {
  templates: MailTemplateRow[]
  start: ReturnType<typeof useCampaignStart>
  audienceCount: number
  onDone: () => void
  onCancel: () => void
}) {
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState)
  const waves = effectiveWaves(composer)
  const overCeiling = audienceCount > MAS_MAX_RECIPIENTS
  /* The same bar the header button holds. Steps 0-1-2 are all reachable on an
     existing campaign, so a draft with an empty audience can be composed for
     here; without this the button lights up and /start answers 409. */
  const noAudience = audienceCount === 0

  const submit = () => {
    if (waves.length === 0 || overCeiling || noAudience) return
    start.mutate(
      { waves },
      {
        onSuccess: (res) => {
          const first = res.waves[0]
          toast('Chiến dịch đã bắt đầu chạy', {
            tone: 'success',
            detail: first
              ? `${first.queued} thư vào hàng đợi${first.skipped > 0 ? `, ${first.skipped} bị bỏ qua` : ''}.`
              : undefined,
          })
          onDone()
        },
        onError: (err) =>
          toast('Không bắt đầu được', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <WaveComposer state={composer} setState={setComposer} templates={templates} />
      {overCeiling && <p className="text-warning text-[12px]">{ceilingNote(audienceCount)}</p>}
      {noAudience && (
        <p className="text-warning text-[12px]">
          Tệp nhận còn rỗng — thêm người nhận trước khi bắt đầu chạy.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button
          size="md"
          onClick={submit}
          disabled={waves.length === 0 || overCeiling || noAudience || start.isPending}
        >
          {start.isPending ? 'Đang bắn…' : `Bắt đầu chạy · ${waves.length} đợt`}
        </Button>
      </div>
    </div>
  )
}

/** WAVE TWO ONWARDS — composed on top, the waves already fired sit below.
 *
 *  A running campaign used to be a dead end here: a read-only table and a Stop
 *  button. Adding wave two meant leaving for the lead book and re-picking the
 *  whole audience by hand through the MAS modal — the exact work
 *  `campaign_member` was frozen to avoid, and a hand-picked set is a DIFFERENT
 *  set. `POST /sales/campaigns/:code/waves` reads the campaign's own audience,
 *  so nothing is picked twice.
 *
 *  ONE WAVE PER ROUND, and that is why the add-wave button is hidden here rather
 *  than merely unused: every add is a real, unrecallable send. A loop over
 *  several waves that dies halfway leaves no honest sentence about which went —
 *  `CampaignStartResponse` can say it because the server runs that loop and
 *  reports each result; a loop in the browser cannot. Sending the one wave on
 *  screen is a thing the sender can see before pressing, and read afterwards in
 *  the table below. */
function WaveAddStep({
  campaign,
  templates,
  waveAdd,
  onDone,
  onCancel,
}: {
  campaign: CampaignProfile
  templates: MailTemplateRow[]
  waveAdd: ReturnType<typeof useCampaignWaveAdd>
  onDone: () => void
  onCancel: () => void
}) {
  const [composer, setComposer] = useState<ComposerState>(emptyComposerState)
  const ready = composerDraftValid(composer)
  const overCeiling = campaign.audienceCount > MAS_MAX_RECIPIENTS
  /* An emptied audience reaches this button too: a DRAFT that already fired,
     or a campaign whose members were all removed after the last wave. The
     server answers 409 either way, so ask here instead of spending a composed
     letter to find out. */
  const noAudience = campaign.audienceCount === 0

  const submit = () => {
    if (!ready || overCeiling || noAudience) return
    waveAdd.mutate(
      { wave: composerDraftInput(composer) },
      {
        onSuccess: (res) => {
          toast(`Đã thêm đợt ${campaign.waveCount + 1}`, {
            tone: 'success',
            detail: `${res.queued} thư vào hàng đợi${res.skipped > 0 ? `, ${res.skipped} bị bỏ qua` : ''}.`,
          })
          onDone()
        },
        onError: (err) =>
          toast('Không thêm được đợt', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <WaveComposer state={composer} setState={setComposer} templates={templates} showAdd={false} />
      {overCeiling && (
        <p className="text-warning text-[12px]">{ceilingNote(campaign.audienceCount)}</p>
      )}
      {noAudience && (
        <p className="text-warning text-[12px]">
          Tệp nhận còn rỗng — thêm người nhận trước khi bắn đợt mới.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="md" variant="ghost" onClick={onCancel}>
          Huỷ
        </Button>
        <Button
          size="md"
          onClick={submit}
          disabled={!ready || overCeiling || noAudience || waveAdd.isPending}
        >
          {waveAdd.isPending ? 'Đang bắn…' : `Bắn đợt ${campaign.waveCount + 1}`}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle>Đợt đã bắn</SectionTitle>
        <WaveTable campaign={campaign} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bảng đợt đã bắn — dùng chung giữa bước 3 (khi đã RUNNING/STOPPED/DONE) và
// Tổng quan, cùng khuôn với `campaign-detail.tsx` cũ.
// ---------------------------------------------------------------------------

function WaveTable({ campaign }: { campaign: CampaignProfile }) {
  return (
    <GlassCard variant="b" className="p-0">
      <div className="overflow-x-auto">
        {campaign.waves.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Icon icon={Inbox} size={26} className="text-muted-foreground" />
            <p className="text-muted-foreground text-pretty text-[12.5px] leading-[1.65]">
              {campaign.audienceCount === 0
                ? 'Chưa có đợt nào, và tệp nhận cũng còn rỗng.'
                : 'Chưa có đợt nào — chiến dịch còn ở trạng thái NHÁP.'}
            </p>
          </div>
        ) : (
          <DataTable
            className="min-w-[940px]"
            columns={[
              { header: 'Đợt', width: '0.5fr' },
              { header: 'Tên · tiêu đề', width: '2.2fr' },
              { header: 'Trạng thái', width: '1fr' },
              { header: 'Lúc', width: '1.1fr' },
              { header: 'Đã gửi', width: '0.8fr', align: 'right' },
              { header: 'Tới nơi', width: '0.8fr', align: 'right' },
              { header: 'Mở', width: '0.7fr', align: 'right' },
              { header: 'Bounce', width: '0.8fr', align: 'right' },
            ]}
            rows={campaign.waves.map((w) => ({
              id: String(w.waveNo),
              cells: [
                <Chip key="n">#{w.waveNo}</Chip>,
                <div key="l" className="min-w-0">
                  <span className="block truncate" title={w.run.label}>
                    {w.run.label}
                  </span>
                  <span
                    className="text-muted-foreground block truncate text-[11px]"
                    title={w.run.subject}
                  >
                    {w.run.subject}
                  </span>
                </div>,
                <Badge key="s" tone={MAIL_RUN_STATE_TONE[w.run.state]}>
                  {MAIL_RUN_STATE_LABEL[w.run.state]}
                </Badge>,
                <RunWhen key="w" run={w.run} />,
                <span key="sent">{w.run.sent.toLocaleString('vi-VN')}</span>,
                <span key="d">{w.run.delivered.toLocaleString('vi-VN')}</span>,
                <span key="o">{w.run.opened.toLocaleString('vi-VN')}</span>,
                <span key="b" className={w.run.bounced > 0 ? 'text-warning' : undefined}>
                  {w.run.bounced.toLocaleString('vi-VN')}
                </span>,
              ],
            }))}
          />
        )}
      </div>
    </GlassCard>
  )
}

// ---------------------------------------------------------------------------
// Bước 4 · Soát lại (create) / Tổng quan (existing)
// ---------------------------------------------------------------------------

function ReviewCreateStep({
  draft,
  audienceCount,
  waves,
  people,
  sources,
  canEdit,
  onBack,
  onSubmit,
  submitting,
}: {
  draft: ProfileDraft
  audienceCount: number
  waves: CampaignWaveInput[]
  people: Actor[]
  sources: { id: string; name: string }[]
  canEdit: boolean
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
}) {
  const ownerName = people.find((p) => p.id === draft.ownerId)?.name
  const sourceName = sources.find((s) => s.id === draft.sourceId)?.name
  const overCeiling = audienceCount > MAS_MAX_RECIPIENTS

  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="flex flex-col gap-4 p-5 lg:p-6">
        <SectionTitle>Soát lại trước khi tạo</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">Tên chiến dịch</span>
            <span className="font-display text-[15px] font-semibold">{draft.name || '—'}</span>
            {draft.slogan.trim() && (
              <span className="text-muted-foreground text-[12px]">{draft.slogan}</span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[11px]">Chủ · Nguồn dẫn</span>
            {/* An empty owner box is not an unowned campaign: the server falls
                back to the caller, so leaving it blank signs the campaign over
                to whoever is creating it. */}
            <span className="text-[13px]">
              {draft.ownerId === '' ? 'Bạn — mặc định' : (ownerName ?? 'Chưa gán')} ·{' '}
              {sourceName ?? 'Chưa gán nguồn'}
            </span>
          </div>
        </div>
      </GlassCard>

      <GlassCard variant="b" className="flex items-center gap-3 p-5">
        <Icon icon={Users} size={18} className="text-muted-foreground" />
        <span className="text-[13px]">
          Gửi cho <strong className="tnum">{audienceCount}</strong> người nhận đã chọn
        </span>
      </GlassCard>

      {overCeiling && <p className="text-warning text-[12px]">{ceilingNote(audienceCount)}</p>}

      <GlassCard variant="b" className="flex flex-col gap-3 p-5 lg:p-6">
        <SectionTitle>{waves.length} đợt sẽ vào hàng đợi ngay sau khi tạo</SectionTitle>
        {waves.length === 0 ? (
          <p className="text-muted-foreground text-[12px]">
            Chưa soạn đợt nào — chiến dịch sẽ ở trạng thái NHÁP, bắt đầu chạy sau trong hồ sơ.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {waves.map((w, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span>
                  Đợt {i + 1} · {w.label}
                </span>
                <span className="text-muted-foreground">
                  {w.scheduledAt ? `Hẹn ${dmhm(w.scheduledAt)}` : 'Gửi ngay'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </GlassCard>

      <div className="flex justify-between gap-2">
        <Button size="md" variant="ghost" onClick={onBack} disabled={submitting}>
          <Icon icon={ArrowLeft} size={16} />
          Lùi
        </Button>
        {canEdit && (
          <Button
            size="md"
            onClick={onSubmit}
            disabled={submitting || overCeiling || !draft.name.trim()}
          >
            {submitting ? 'Đang tạo…' : 'Tạo chiến dịch'}
          </Button>
        )}
      </div>
    </div>
  )
}

function OverviewStep({ campaign }: { campaign: CampaignProfile }) {
  const totals = campaign.waves.reduce(
    (acc, w) => ({
      sent: acc.sent + w.run.sent,
      delivered: acc.delivered + w.run.delivered,
      opened: acc.opened + w.run.opened,
      bounced: acc.bounced + w.run.bounced,
    }),
    { sent: 0, delivered: 0, opened: 0, bounced: 0 },
  )

  return (
    <div className="flex flex-col gap-6">
      <ScreenScoreGrid>
        <StatCard
          size="compact"
          icon={Inbox}
          value={campaign.audienceCount.toLocaleString('vi-VN')}
          label="Người nhận trong tệp"
          hint={`${campaign.waveCount} đợt đã bắn`}
        />
        <StatCard
          size="compact"
          icon={Send}
          value={totals.sent.toLocaleString('vi-VN')}
          label="Thư đã rời máy"
          hint="cộng mọi đợt"
        />
        <StatCard
          size="compact"
          icon={UserPlus}
          value={totals.opened.toLocaleString('vi-VN')}
          label="Có người mở"
          hint={totals.delivered > 0 ? percent(totals.opened / totals.delivered) : '—'}
        />
        <StatCard
          size="compact"
          icon={CircleAlert}
          value={totals.bounced.toLocaleString('vi-VN')}
          label="Bounce"
          hint={totals.sent > 0 ? `${percent(totals.bounced / totals.sent)} · trần 4%` : 'trần 4%'}
        />
      </ScreenScoreGrid>

      <div className="flex flex-col gap-3">
        <SectionTitle>Chuỗi đợt</SectionTitle>
        <WaveTable campaign={campaign} />
      </div>
    </div>
  )
}
