import { useEffect, useMemo, useState } from 'react'
import { Button, CircleAlert, Drawer, Icon, ImageFrame, Input, Modal, Select, cn } from '@pv/ui'
import type { Actor } from '@pv/engines'
import type { CampaignPatch, CampaignProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toast } from '@/app/toast'
import { useCampaignCreate, type useCampaignPatch } from '@/data/campaign-book'
import { OriginSelect } from '@/components/lead-origin-pickers'
import { emptyProfile, profileFrom, type ProfileDraft } from './campaign-model'

const TEXT = {
  eGNorthAmericaOutreach: message(
    'Ví dụ: Tiếp cận nhà máy Bắc Ninh · quý 3',
    'e.g. North America outreach · Q3',
    '예: 북미 아웃리치 · 3분기',
  ),
  aShortLineShownBelow: message(
    'Câu mở đầu ngắn hiện dưới tên chiến dịch',
    'A short line shown below the campaign name',
    '캠페인 이름 아래에 표시할 짧은 문구',
  ),
  appliesToNewLeadsOnly: message(
    'Chỉ áp dụng cho lead mới.',
    'Applies to new leads only.',
    '새 리드에만 적용됩니다.',
  ),
  endDateOptional: message(
    'Ngày kết thúc (không bắt buộc)',
    'End date (optional)',
    '종료일 (선택 사항)',
  ),
  afterThisDateTheCampaign: message(
    'Sau ngày này, chiến dịch không còn để chọn khi tạo lead.',
    'After this date, the campaign is no longer available when creating a lead.',
    '이 날짜가 지나면 리드 생성 시 캠페인을 선택할 수 없습니다.',
  ),
}

/** Module 1 · the campaign PROFILE — the boxes naming a campaign, the modal
 *  that types a new one, and the drawer that edits an existing one.
 *
 *  ONE set of boxes for both doors (`ProfileFields`), the same call the lead
 *  and deal screens make: a campaign typed in the modal and opened in the
 *  drawer must not read as two different pieces of paper. */

export function ProfileFields({
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
  originId,
  setOriginId,
  endsOn,
  setEndsOn,
  people,
  sources,
  autoFocusName = false,
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
  originId: string
  setOriginId: (v: string) => void
  endsOn: string
  setEndsOn: (v: string) => void
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  /** On in the create modal only: the edit drawer opens on a filled sheet, and
   *  the reader has not said which box they came for. */
  autoFocusName?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="@container">
      {/* Split on the room it is given, not the viewport: the same boxes sit
          in a wide modal and in a 760px drawer. */}
      <div className="@3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start grid gap-6">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">
              {t(message('Tên chiến dịch', 'Campaign name', '캠페인 이름'))}
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder={t(TEXT.eGNorthAmericaOutreach)}
              autoFocus={autoFocusName}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">
              {t(message('Slogan (không bắt buộc)', 'Tagline (optional)', '슬로건 (선택 사항)'))}
            </span>
            <Input
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              maxLength={200}
              placeholder={t(TEXT.aShortLineShownBelow)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-muted-foreground text-[11px]">
                {t(message('Chủ chiến dịch', 'Campaign owner', '캠페인 담당자'))}
              </span>
              <Select
                label={t(message('Chủ chiến dịch', 'Campaign owner', '캠페인 담당자'))}
                hideLabel
                size="lg"
                value={ownerId}
                onChange={setOwnerId}
                options={[
                  { value: '', label: t(message('Chưa gán', 'Unassigned', '미지정')) },
                  ...people.map((p) => ({ value: p.id, label: `${p.name} · ${p.role}` })),
                ]}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-muted-foreground text-[11px]">
                {t(message('Nguồn dẫn', 'Source', '유입 경로'))}
              </span>
              <Select
                label={t(message('Nguồn dẫn', 'Source', '유입 경로'))}
                hideLabel
                size="lg"
                value={sourceId}
                onChange={setSourceId}
                options={[
                  { value: '', label: t(message('Chưa gán', 'Unassigned', '미지정')) },
                  ...sources.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">
              {t(message('Nguồn của lead', 'Lead source', '리드 출처'))}
            </span>
            <OriginSelect
              label={t(message('Nguồn của lead', 'Lead source', '리드 출처'))}
              hideLabel
              value={originId}
              onChange={setOriginId}
              emptyLabel={t(message('Chưa gán', 'Unassigned', '미지정'))}
            />
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              {t(TEXT.appliesToNewLeadsOnly)}
            </span>
          </div>
          <label className="flex flex-col gap-2 sm:max-w-[240px]">
            <span className="text-muted-foreground text-[11px]">{t(TEXT.endDateOptional)}</span>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              {t(TEXT.afterThisDateTheCampaign)}
            </span>
          </label>
        </div>

        <ThumbnailField value={thumbnailUrl} onChange={setThumbnailUrl} />
      </div>
    </div>
  )
}

/** How long a half-typed address is left alone before the browser tries to
 *  fetch it. Long enough to paste and stop; short enough that the picture
 *  appears while the pasting hand is still on the mouse. */
const THUMBNAIL_SETTLE_MS = 500

/** THE URL BOX AND ITS PICTURE — and the bug that made every URL look broken.
 *
 *  The failure lives in React state keyed on the SETTLED address, never on the
 *  `<img>` node. Pointing `src` straight at the box and hiding the element on
 *  error fails twice over: typing fires `onError` for `h`, `ht`, `htt`…, and
 *  React reuses the same node, so the inline `visibility: hidden` from the
 *  first bad keystroke outlives every later one — the finished, valid URL then
 *  loads invisible, which is what "the thumbnail doesn't work" looked like.
 *
 *  A broken picture is said out loud rather than left as an empty box. There
 *  is no file store yet (`CampaignBookRow.thumbnailUrl` is a URL), so a link
 *  the browser cannot load — a share page, a host refusing hotlinks — is a
 *  normal thing to type, and a grey rectangle reads as "still loading". The
 *  frame and the verdict belong to `ThumbnailPreview`; this field owns only
 *  the settling. */
function ThumbnailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const [settled, setSettled] = useState(value.trim())

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value.trim()), THUMBNAIL_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">
        {t(message('Link ảnh (không bắt buộc)', 'Image URL (optional)', '이미지 URL (선택 사항)'))}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…/anh.jpg"
      />

      <ThumbnailPreview
        url={settled}
        empty={t(message('Chưa có ảnh.', 'No image yet.', '아직 이미지가 없습니다.'))}
        broken={t(
          message(
            'Không tải được ảnh. Hãy dùng liên kết trực tiếp tới tệp .jpg, .png hoặc .webp.',
            'Image could not be loaded. Use a direct link to a .jpg, .png, or .webp file.',
            '이미지를 불러올 수 없습니다. .jpg, .png 또는 .webp 파일의 직접 링크를 사용하세요.',
          ),
        )}
      />
    </div>
  )
}

/** THE PICTURE FRAME — the form's preview and the profile's info card draw
 *  the same 16:9 box over the same URL, and say which of two nothings they
 *  show: no address yet, versus an address the browser refused. A tinted box,
 *  not glass: every caller already sits on a glass surface.
 *
 *  `broken` is state and not a DOM mutation, and it resets whenever `url`
 *  changes — a verdict belongs to ONE address. `referrerPolicy="no-referrer"`
 *  earns its line: a number of image hosts answer 403 to a request carrying
 *  somebody else's page as referrer, and sending none is what loads them. */
export function ThumbnailPreview({
  url,
  empty,
  broken: brokenNote,
  className,
}: {
  url: string
  /** Said while there is no address; a caller that never passes `''` omits it. */
  empty?: string
  broken: string
  /** Placement only — the header fixes a width beside the title. The frame
   *  keeps its 16:9 in every caller. */
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])

  return (
    <div
      className={cn(
        'bg-surface-ink/5 flex aspect-video items-center justify-center overflow-hidden rounded-md',
        className,
      )}
    >
      {url === '' || broken ? (
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <Icon
            icon={broken ? CircleAlert : ImageFrame}
            size={24}
            className={broken ? 'text-destructive-foreground' : 'text-muted-foreground'}
          />
          {(broken || empty) && (
            <p
              className={cn(
                broken ? 'text-destructive-foreground' : 'text-muted-foreground',
                'm-0 text-pretty text-[11.5px] leading-[1.6]',
              )}
            >
              {broken ? brokenNote : empty}
            </p>
          )}
        </div>
      ) : (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  )
}

/** A NEW CAMPAIGN IS ONE FORM, NOT FOUR STEPS.
 *
 *  The wizard held three of its four steps in React state so the book would
 *  never show an empty campaign — a promise its own create mutation had
 *  already broken (a failed step two left the row in the book), and its last
 *  button sent real mail under the most harmless label on the screen. One
 *  `POST /sales/campaigns` instead: the row lands as a DRAFT,
 *  the caller walks into its profile, and the audience and the waves are done
 *  there, where they can also be undone.
 *
 *  Opened from the book with React state, not a route: `/sales/campaigns/new`
 *  was a screen whose only content was this form. */
export function CampaignCreateModal({
  open,
  onClose,
  people,
  sources,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  onCreated: (code: string) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile)
  const create = useCampaignCreate()

  /* A fresh sheet on every opening — the panel stays mounted while it slides
     out, so clearing on close would empty it mid-animation. */
  useEffect(() => {
    if (open) setDraft(emptyProfile())
  }, [open])

  const name = draft.name.trim()
  const canCreate = name !== '' && !create.isPending

  const submit = () => {
    if (!canCreate) return
    create.mutate(
      {
        name,
        ...(draft.ownerId ? { ownerId: draft.ownerId } : {}),
        ...(draft.sourceId ? { sourceId: draft.sourceId } : {}),
        ...(draft.originId ? { originId: draft.originId } : {}),
        ...(draft.slogan.trim() ? { slogan: draft.slogan.trim() } : {}),
        ...(draft.thumbnailUrl.trim() ? { thumbnailUrl: draft.thumbnailUrl.trim() } : {}),
        ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
      },
      {
        onSuccess: (row) => {
          toast(
            t(
              message(
                `Đã mở chiến dịch ${row.code}`,
                `Campaign ${row.code} created`,
                `캠페인 ${row.code} 생성 완료`,
              ),
            ),
            {
              tone: 'success',
              detail: t(
                message(
                  'Chiến dịch đang ở trạng thái nháp. Thêm người nhận để gửi đợt đầu.',
                  'The campaign is a draft. Add recipients to send the first wave.',
                  '캠페인이 초안 상태입니다. 수신자를 추가해 첫 발송 차수를 보내세요.',
                ),
              ),
            },
          )
          onCreated(row.code)
        },
        onError: (err) =>
          toast(
            t(
              message(
                'Không tạo được chiến dịch',
                'Could not create campaign',
                '캠페인을 만들 수 없습니다',
              ),
            ),
            {
              tone: 'danger',
              detail: isApiError(err)
                ? userMessage(err)
                : t(message('Hãy thử lại.', 'Please try again.', '다시 시도해 주세요.')),
            },
          ),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(message('Chiến dịch mới', 'New campaign', '새 캠페인'))}
      subtitle={t(
        message(
          'Chiến dịch được tạo ở trạng thái nháp. Bạn có thể thêm người nhận và chuẩn bị đợt gửi sau.',
          'The campaign will be created as a draft. Add recipients and prepare a wave afterward.',
          '캠페인은 초안으로 생성됩니다. 수신자를 추가하고 발송 차수를 준비할 수 있습니다.',
        ),
      )}
      footer={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <span className="text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]">
            {name === ''
              ? t(
                  message(
                    'Nhập tên chiến dịch để tiếp tục.',
                    'Enter a campaign name to continue.',
                    '계속하려면 캠페인 이름을 입력하세요.',
                  ),
                )
              : t(
                  message(
                    'Sau khi tạo, hồ sơ chiến dịch sẽ mở.',
                    'The campaign profile will open after creation.',
                    '생성 후 캠페인 프로필이 열립니다.',
                  ),
                )}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" onClick={onClose} disabled={create.isPending}>
              {t(message('Huỷ', 'Cancel', '취소'))}
            </Button>
            <Button size="lg" onClick={submit} disabled={!canCreate}>
              {create.isPending
                ? t(message('Đang tạo…', 'Creating…', '만드는 중…'))
                : t(message('Tạo chiến dịch nháp', 'Create draft campaign', '캠페인 초안 만들기'))}
            </Button>
          </div>
        </div>
      }
    >
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
        originId={draft.originId}
        setOriginId={(v) => setDraft((d) => ({ ...d, originId: v }))}
        endsOn={draft.endsOn}
        setEndsOn={(v) => setDraft((d) => ({ ...d, endsOn: v }))}
        people={people}
        sources={sources}
        autoFocusName
      />
    </Modal>
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

/** THE EDIT DRAWER — the one place an existing campaign's boxes are typed.
 *
 *  Mounted only for a reader who may write: the source picker is fed by a
 *  catalogue gated on `config.view`, which a read-only role does not hold. */
export function ProfileDrawer({
  campaign,
  open,
  onClose,
  people,
  sources,
  patch,
}: {
  campaign: CampaignProfile
  open: boolean
  onClose: () => void
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  patch: ReturnType<typeof useCampaignPatch>
}) {
  const { t } = useI18n()
  const original = useMemo(() => profileFrom(campaign), [campaign])
  const [draft, setDraft] = useState<ProfileDraft>(original)

  /* Seeded on every opening, during render rather than in an effect: a
     refetch while the drawer is open must not wipe what is being typed. */
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(original)
  }

  const changed =
    draft.name.trim() !== original.name ||
    draft.slogan.trim() !== original.slogan ||
    draft.thumbnailUrl.trim() !== original.thumbnailUrl ||
    draft.ownerId !== original.ownerId ||
    draft.sourceId !== original.sourceId ||
    draft.originId !== original.originId ||
    draft.endsOn !== original.endsOn

  const canSave = draft.name.trim().length > 0 && changed && !patch.isPending

  const submit = () => {
    if (!canSave) return
    const slogan = patchField(draft.slogan.trim(), original.slogan)
    const thumbnailUrl = patchField(draft.thumbnailUrl.trim(), original.thumbnailUrl)
    const ownerId = patchField(draft.ownerId, original.ownerId)
    const sourceId = patchField(draft.sourceId, original.sourceId)
    const originId = patchField(draft.originId, original.originId)
    const endsOn = patchField(draft.endsOn, original.endsOn)
    const body: CampaignPatch = {
      ...(draft.name.trim() === original.name ? {} : { name: draft.name.trim() }),
      ...(slogan === undefined ? {} : { slogan }),
      ...(thumbnailUrl === undefined ? {} : { thumbnailUrl }),
      ...(ownerId === undefined ? {} : { ownerId }),
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(originId === undefined ? {} : { originId }),
      ...(endsOn === undefined ? {} : { endsOn }),
    }
    patch.mutate(body, {
      onSuccess: () => {
        toast(
          t(
            message(
              'Đã lưu thông tin chiến dịch',
              'Campaign details saved',
              '캠페인 정보 저장 완료',
            ),
          ),
          { tone: 'success' },
        )
        onClose()
      },
      onError: (err) =>
        toast(
          t(message('Không lưu được', 'Could not save changes', '변경 사항을 저장할 수 없습니다')),
          {
            tone: 'danger',
            detail: isApiError(err)
              ? userMessage(err)
              : t(message('Hãy thử lại.', 'Please try again.', '다시 시도해 주세요.')),
          },
        ),
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t(message('Sửa thông tin chiến dịch', 'Edit campaign details', '캠페인 정보 수정'))}
      subtitle={campaign.code}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="lg" variant="ghost" onClick={onClose} disabled={patch.isPending}>
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
          <Button size="lg" onClick={submit} disabled={!canSave}>
            {patch.isPending
              ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
              : t(message('Lưu thay đổi', 'Save changes', '변경 사항 저장'))}
          </Button>
        </div>
      }
    >
      <fieldset disabled={patch.isPending} className="contents">
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
          originId={draft.originId}
          setOriginId={(v) => setDraft((d) => ({ ...d, originId: v }))}
          endsOn={draft.endsOn}
          setEndsOn={(v) => setDraft((d) => ({ ...d, endsOn: v }))}
          people={people}
          sources={sources}
        />
      </fieldset>
    </Drawer>
  )
}
