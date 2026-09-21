import { useState, type ReactNode } from 'react'
import { Chip, GlassCard, MetaPill, SectionTitle, SegmentedControl } from '@pv/ui'
import {
  LEAD_SIDE_LABEL,
  LeadSide,
  campaignLabel,
  sourceKindLabel,
  type LeadMotion,
  type LeadProfile,
} from '@pv/contracts'
import type { Lead } from '@pv/engines/fixtures/das-vina'
import { OWNER_SOURCE_FIELDS, originValue, readField, type FormField } from '@/data/lead-form'
import type { LeadDraft } from '@/data/lead-draft'
import { NO_OWNER_TITLE } from '@/data/leads'
import { useMotionLabel } from '@/data/sales-motions'
import { AssignMenu } from './assign-menu'
import {
  CampaignPicker,
  OriginPicker,
  type CampaignChoice,
  type OriginChoice,
} from './lead-origin-pickers'

/** The holder-and-origin card — who holds this lead and how it got here.
 *
 *  The two blocks used to sit in the right half of the page header. They are
 *  not identity, they are the two answers a seller checks before touching the
 *  lead: whose call this is, and whether we were called or did the calling.
 *
 *  PIC STANDS ABOVE ORIGIN: "who holds it" is asked on every open — dialling a
 *  lead that is not yours is cutting in — while "how did it get here" is looked
 *  up once. The block read more often stands first.
 *
 *  Three fields, three different write doors, and that is the whole shape of
 *  this card: the holder writes through the assignment door, the motion is
 *  settled at intake, and the origin has no rewrite door at all. */
export function OwnerSourceCard(
  props:
    { mode: 'edit'; profile: LeadProfile; legacy: Lead } | { mode: 'create'; draft: LeadDraft },
) {
  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-5 p-4 sm:p-5"
      aria-label="Phụ trách và nguồn"
    >
      <SectionTitle size="detail">Phụ trách và nguồn</SectionTitle>
      {props.mode === 'edit' ? (
        <EditBody profile={props.profile} legacy={props.legacy} />
      ) : (
        <CreateBody draft={props.draft} />
      )}
    </GlassCard>
  )
}

const PIC_HINT = 'PIC nhận việc tiếp theo và thông báo của lead này.'

/** The draft boxes this card draws, read off `OWNER_SOURCE_FIELDS` — the list
 *  `data/lead-form.ts` exports FOR this card, rather than reached out of
 *  `CREATE_FIELDS` behind its back. */
const boxOf = (key: FormField['key']) => OWNER_SOURCE_FIELDS.find((field) => field.key === key)
const MOTION_BOX = boxOf('motion')
const ORIGIN_BOX = boxOf('origin')
const CAMPAIGN_BOX = boxOf('campaignCode')

function EditBody({ profile, legacy }: { profile: LeadProfile; legacy: Lead }) {
  const motionLabel = useMotionLabel()
  return (
    <>
      <Block label="Lead PIC" hint={PIC_HINT}>
        {/* The NAME, with the mailbox on the pill's tooltip — the same thing
            the lead book's PIC column prints, because a table and a profile of
            one row must not read out differently. */}
        <div className="flex flex-wrap items-center gap-2">
          {profile.ownerName ? (
            <MetaPill avatar={profile.ownerName} title={profile.ownerEmail}>
              {profile.ownerName}
            </MetaPill>
          ) : (
            <MetaPill title={NO_OWNER_TITLE}>Chưa ai nhận</MetaPill>
          )}
          {/* NOT wrapped in a permission of this card's own: `AssignMenu` asks
              `lead.assign` for itself, and the toolbar draws the same menu
              unwrapped — two gates on one action are two answers. */}
          <AssignMenu lead={legacy} profile={profile} buttonVariant="secondary" />
        </div>
      </Block>

      <Block label="Phương án tiếp cận" hint="Chốt lúc lead vào sổ — sửa lại phải qua sổ nguồn.">
        {/* Printed, not drawn as a control: `LeadPatch` carries no `motion`, and
            the repo's own rule for a read-only field is text rather than a
            greyed-out box nobody can use (`FieldKind.read`). */}
        <div className="flex flex-wrap items-center gap-2">
          {profile.motion ? (
            <MetaPill>{motionLabel(profile.motion)}</MetaPill>
          ) : (
            <MetaPill title="Lead vào sổ trước khi cột này được ghi.">Chưa rõ</MetaPill>
          )}
        </div>
      </Block>

      <Block
        label="Nguồn · Chi tiết nguồn"
        hint="Xuất xứ của một lead đã vào sổ không ghi lại được."
      >
        <div className="flex flex-wrap items-center gap-2">
          {profile.source.origin && <MetaPill>{profile.source.origin.name}</MetaPill>}
          <MetaPill>{campaignLabel(profile.source)}</MetaPill>
          <Chip variant="source">{sourceKindLabel(profile.source)}</Chip>
        </div>
      </Block>
    </>
  )
}

/** The create door: the holder stated, then the three origin boxes.
 *
 *  `POST /sales/leads` IS the manual door — it takes no `kind`, because a
 *  caller that may name its own origin may claim `LANDING_PAGE`, which
 *  `CHANNEL_TRUST` reads as customer-verified. What it does take is the motion,
 *  the catalog origin and — when the motion's policy says so — a campaign. */
function CreateBody({ draft }: { draft: LeadDraft }) {
  return (
    <>
      {/* Stated, not asked: `LeadCreate` names its holder by `ownerId` and this
          draft carries no box that speaks it, so a picker here would swallow
          whoever was picked. Handing the lead over is its own door. */}
      <Block
        label="Lead PIC"
        hint="Lead mới nằm ở kho chung. Giao người phụ trách là một việc riêng."
      >
        <MetaPill title={NO_OWNER_TITLE}>Chưa ai nhận</MetaPill>
      </Block>

      <MotionBlock draft={draft} />
      <OriginBlocks draft={draft} />
    </>
  )
}

/** Six motions in two halves — who moved first reads before which channel. */
function MotionBlock({ draft }: { draft: LeadDraft }) {
  if (!MOTION_BOX) return null
  const value = readField(draft.values, 'motion')
  return (
    <Block label="Phương án tiếp cận *" hint={MOTION_BOX.hint} error={draft.fieldError('motion')}>
      {LeadSide.options.map((side) => {
        const options = draft.motions.filter((m) => m.side === side)
        if (options.length === 0) return null
        return (
          <SegmentedControl
            key={side}
            label={LEAD_SIDE_LABEL[side]}
            value={value}
            options={options.map((m) => ({ value: m.motion, label: m.label }))}
            onChange={(raw) => write(draft, MOTION_BOX, raw)}
            className="flex-wrap"
          />
        )
      })}
    </Block>
  )
}

/** Origin and campaign. The draft holds only what goes on the wire, so the
 *  names shown in the boxes are kept here and dropped once the draft moves on. */
function OriginBlocks({ draft }: { draft: LeadDraft }) {
  const [origin, setOrigin] = useState<OriginChoice | null>(null)
  const [campaign, setCampaign] = useState<CampaignChoice | null>(null)
  if (!ORIGIN_BOX || !CAMPAIGN_BOX) return null

  const originRaw = readField(draft.values, 'origin')
  const shownOrigin = origin && originValue(origin) === originRaw ? origin : null
  const campaignRaw = readField(draft.values, 'campaignCode')
  const shownCampaign = campaign && campaign.code === campaignRaw ? campaign : null
  const motion = readField(draft.values, 'motion') as LeadMotion | ''

  return (
    <>
      <Block
        label="Nguồn *"
        hint="Chọn nguồn đã có; tên mới chỉ được tạo khi lưu lead."
        error={draft.fieldError('origin')}
      >
        <OriginPicker
          label="Nguồn"
          hideLabel
          value={shownOrigin}
          motion={motion === '' ? undefined : motion}
          invalid={Boolean(draft.fieldError('origin'))}
          onChange={(choice) => {
            setOrigin(choice)
            draft.set(ORIGIN_BOX, originValue(choice))
          }}
        />
      </Block>

      <Block
        label={draft.campaignRequired ? 'Chiến dịch *' : 'Chiến dịch'}
        hint={
          draft.campaignRequired
            ? 'Phương án tiếp cận này bắt buộc gắn chiến dịch — lead vào luôn danh sách của nó.'
            : 'Không bắt buộc. Gắn vào thì lead vào luôn danh sách của chiến dịch.'
        }
        error={draft.fieldError('campaignCode')}
      >
        <CampaignPicker
          label="Chiến dịch"
          hideLabel
          required={draft.campaignRequired}
          value={shownCampaign}
          invalid={Boolean(draft.fieldError('campaignCode'))}
          onChange={(choice) => {
            setCampaign(choice)
            draft.set(CAMPAIGN_BOX, choice?.code ?? '')
          }}
        />
      </Block>
    </>
  )
}

/** Type into a box, then hand it to the door at once. Both boxes here are a
 *  pick rather than typing, so there is no blur to wait for. */
function write(draft: LeadDraft, field: FormField, raw: string) {
  draft.set(field, raw)
  draft.commit(field)
}

/** One labelled block: what it is, why it matters, the value, the complaint. */
function Block({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[12.5px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-[11.5px] leading-[1.5]">{hint}</span>}
      {error && (
        <span className="text-destructive-foreground text-[11.5px] leading-[1.5]" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
