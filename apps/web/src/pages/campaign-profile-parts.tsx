import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Button,
  CircleAlert,
  GlassCard,
  Icon,
  ImagePlus,
  Input,
  Modal,
  SectionTitle,
  Select,
  cn,
} from '@pv/ui'
import type { Actor } from '@pv/engines'
import type { CampaignPatch, CampaignProfile } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { useCampaignCreate, type useCampaignPatch } from '@/data/campaign-book'
import { dmhm } from '@/lib/date'
import { emptyProfile, profileFrom, type ProfileDraft } from './campaign-model'

/** Module 1 · the campaign PROFILE — the boxes naming a campaign, the modal
 *  that types a new one, and the tab that edits an existing one.
 *
 *  ONE set of boxes for both doors (`ProfileFields`), the same call the lead
 *  and deal screens make: a campaign typed in the modal and opened in the tab
 *  must not read as two different pieces of paper. */

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
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  /** On in the create modal, off in the tab: a tab that grabs the caret the
   *  moment it opens fights the reader who came to read. */
  autoFocusName?: boolean
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
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

      <ThumbnailField value={thumbnailUrl} onChange={setThumbnailUrl} />
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
        broken="Không tải được ảnh từ địa chỉ này — cần link ẢNH trực tiếp (kết thúc .jpg, .png, .webp), không phải link trang chia sẻ."
      />
    </div>
  )
}

/** THE PICTURE FRAME — the create modal's preview and the read-only profile
 *  draw the same 16:9 box over the same URL, and both have to say which of two
 *  nothings they are showing: no address yet, versus an address the browser
 *  refused.
 *
 *  `broken` is state and not a DOM mutation, and it resets whenever `url`
 *  changes — a verdict belongs to ONE address. `referrerPolicy="no-referrer"`
 *  earns its line: a number of image hosts answer 403 to a request carrying
 *  somebody else's page as referrer, and sending none is what loads them. */
function ThumbnailPreview({
  url,
  empty,
  broken: brokenNote,
  className,
}: {
  url: string
  empty: string
  broken: string
  /** The overview lays this out as a bento tile whose height comes from the
   *  tiles beside it, so it hands in `aspect-auto` — 16:9 stays the default
   *  everywhere the frame stands on its own. */
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])

  return (
    <GlassCard
      variant="a"
      className={cn('flex aspect-video items-center justify-center overflow-hidden p-0', className)}
    >
      {url === '' || broken ? (
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <Icon
            icon={broken ? CircleAlert : ImagePlus}
            size={24}
            className={broken ? 'text-warning' : 'text-muted-foreground'}
          />
          <p className="text-muted-foreground text-pretty text-[11.5px] leading-[1.6]">
            {broken ? brokenNote : empty}
          </p>
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
    </GlassCard>
  )
}

/** A NEW CAMPAIGN IS FIVE BOXES, NOT FOUR STEPS.
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
        ...(draft.slogan.trim() ? { slogan: draft.slogan.trim() } : {}),
        ...(draft.thumbnailUrl.trim() ? { thumbnailUrl: draft.thumbnailUrl.trim() } : {}),
      },
      {
        onSuccess: (row) => {
          toast(`Đã mở chiến dịch ${row.code}`, {
            tone: 'success',
            detail: 'Còn là NHÁP — gom người nhận rồi bắn đợt đầu trong hồ sơ.',
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
      subtitle="Năm ô này mở một chiến dịch NHÁP. Chưa lá thư nào rời máy ở bước này."
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

/** The profile as FACTS, for a reader who cannot write it.
 *
 *  Not the same form with every box shut: the source picker is fed by
 *  `salesCatalogQuery`, which asks `config.view` — a permission `presales`
 *  does not carry while holding `campaign.view`. That query refuses, the
 *  options come back empty, and a shut picker then reads as unassigned one row
 *  under a header naming the very source it cannot see. Printing the stored
 *  value is the call `opportunity-form-card.tsx` already made. */
function ProfileFacts({ campaign }: { campaign: CampaignProfile }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <ThumbnailPreview
        url={campaign.thumbnailUrl ?? ''}
        empty="Chiến dịch chưa gắn ảnh."
        broken="Ảnh của chiến dịch không tải được — địa chỉ có thể đã hỏng."
      />
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Fact label="Tên chiến dịch">
          <span className="font-display text-[15px] font-semibold">{campaign.name}</span>
        </Fact>
        <Fact label="Slogan">{campaign.slogan || '—'}</Fact>
        <Fact label="Chủ chiến dịch">{campaign.ownerName ?? 'Chưa gán'}</Fact>
        <Fact label="Nguồn dẫn">{campaign.sourceName ?? 'Chưa gán'}</Fact>
      </dl>
    </div>
  )
}

/** One fact — term above, value below, read as one pair by a screen reader. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="truncate text-[13px]">{children}</dd>
    </div>
  )
}

export function ProfileTab({
  campaign,
  people,
  sources,
  patch,
  canEdit,
}: {
  campaign: CampaignProfile
  people: Actor[]
  sources: { id: string; name: string; active: boolean }[]
  patch: ReturnType<typeof useCampaignPatch>
  canEdit: boolean
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
      onSuccess: () => toast('Đã lưu hồ sơ chiến dịch', { tone: 'success' }),
      onError: (err) =>
        toast('Không lưu được', {
          tone: 'danger',
          detail: isApiError(err) ? userMessage(err) : 'Vui lòng thử lại.',
        }),
    })
  }

  /* A bare section, not a card: the thumbnail frame below is itself a glass
     tile, and `.glass-a`/`.glass-b` now paint the same `--card` (law 4), so a
     tile inside a tile has nothing left to tell the two apart. */
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <SectionTitle>Hồ sơ {campaign.code}</SectionTitle>
        <span className="text-muted-foreground text-[11.5px]">
          Mở {dmhm(campaign.createdAt)} · sửa gần nhất {dmhm(campaign.updatedAt)}
        </span>
      </div>
      {!canEdit ? (
        <ProfileFacts campaign={campaign} />
      ) : (
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
            people={people}
            sources={sources}
          />
        </fieldset>
      )}
      {canEdit && (
        <div className="flex justify-end gap-2">
          {/* Undo is a reset to the stored row, not a way back to a step: this
              tab has no wizard behind it to cancel out of. */}
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setDraft(original)}
            disabled={!changed || patch.isPending}
          >
            Hoàn tác
          </Button>
          <Button size="md" className="pointer-coarse:h-12" onClick={submit} disabled={!canSave}>
            {patch.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      )}
    </section>
  )
}
