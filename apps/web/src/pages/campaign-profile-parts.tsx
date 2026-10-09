import { useEffect, useMemo, useState } from 'react'
import { Button, CircleAlert, Drawer, Icon, ImageFrame, Input, Modal, Select, cn } from '@pv/ui'
import type { Actor } from '@pv/engines'
import type { CampaignPatch, CampaignProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { useCampaignCreate, type useCampaignPatch } from '@/data/campaign-book'
import { OriginSelect } from '@/components/lead-origin-pickers'
import { emptyProfile, profileFrom, type ProfileDraft } from './campaign-model'

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
  return (
    <div className="@container">
      {/* Split on the room it is given, not the viewport: the same boxes sit
          in a wide modal and in a 760px drawer. */}
      <div className="@3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start grid gap-6">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Tên chiến dịch</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Ví dụ: Tiếp cận nhà máy Bắc Ninh · quý 3"
              autoFocus={autoFocusName}
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
                size="lg"
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
                size="lg"
                value={sourceId}
                onChange={setSourceId}
                options={[
                  { value: '', label: 'Chưa gán' },
                  ...sources.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Nguồn của lead</span>
            <OriginSelect
              label="Nguồn của lead"
              hideLabel
              value={originId}
              onChange={setOriginId}
              emptyLabel="Chưa gán"
            />
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              Lead mới gắn vào chiến dịch này qua phương án hỏi chiến dịch mang nguồn này; lead đã
              vào sổ giữ nguồn cũ.
            </span>
          </div>
          <label className="flex flex-col gap-2 sm:max-w-[240px]">
            <span className="text-muted-foreground text-[11px]">
              Ngày kết thúc (không bắt buộc)
            </span>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            <span className="text-muted-foreground text-[11px] leading-[1.5]">
              Qua ngày này, chiến dịch thôi hiện ở ô chọn chiến dịch khi tạo lead.
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
  const [settled, setSettled] = useState(value.trim())

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value.trim()), THUMBNAIL_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [value])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">
        Thumbnail — dán URL ảnh (không bắt buộc)
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…/anh.jpg"
      />

      <ThumbnailPreview
        url={settled}
        empty="Chưa có ảnh. Dán link ảnh trực tiếp để xem trước ngay tại đây."
        broken="Không tải được ảnh từ địa chỉ này — cần link ảnh trực tiếp (kết thúc .jpg, .png, .webp), không phải link trang chia sẻ."
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
            className={broken ? 'text-warning' : 'text-muted-foreground'}
          />
          {(broken || empty) && (
            <p className="text-muted-foreground m-0 text-pretty text-[11.5px] leading-[1.6]">
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
          toast(`Đã mở chiến dịch ${row.code}`, {
            tone: 'success',
            detail: 'Chiến dịch đang là bản nháp — thêm người nhận rồi gửi đợt đầu trong hồ sơ.',
          })
          onCreated(row.code)
        },
        onError: (err) =>
          toast('Không tạo được chiến dịch', {
            tone: 'danger',
            detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
          }),
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chiến dịch mới"
      subtitle="Bảy ô này mở một chiến dịch nháp. Chưa lá thư nào rời máy ở bước này."
      footer={
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <span className="text-muted-foreground min-w-0 max-w-[560px] text-[11.5px] leading-[1.5]">
            {name === ''
              ? 'Cần ít nhất tên chiến dịch.'
              : 'Tạo xong sẽ mở thẳng hồ sơ để gom người nhận.'}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" onClick={onClose} disabled={create.isPending}>
              Huỷ
            </Button>
            <Button size="lg" onClick={submit} disabled={!canCreate}>
              {create.isPending ? 'Đang tạo…' : 'Tạo chiến dịch nháp'}
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
        toast('Đã lưu thông tin chiến dịch', { tone: 'success' })
        onClose()
      },
      onError: (err) =>
        toast('Không lưu được', {
          tone: 'danger',
          detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
        }),
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Sửa thông tin chiến dịch"
      subtitle={campaign.code}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="lg" variant="ghost" onClick={onClose} disabled={patch.isPending}>
            Huỷ
          </Button>
          <Button size="lg" onClick={submit} disabled={!canSave}>
            {patch.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
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
