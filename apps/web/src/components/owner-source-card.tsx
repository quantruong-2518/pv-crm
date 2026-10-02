import { useState, type ReactNode } from 'react'
import { GlassCard, MetaPill, SectionTitle, SegmentedControl } from '@pv/ui'
import { LEAD_SIDE_LABEL, LeadSide, type LeadMotion } from '@pv/contracts'
import { OWNER_SOURCE_FIELDS, originValue, readField, type FormField } from '@/data/lead-form'
import type { LeadDraft } from '@/data/lead-draft'
import { NO_OWNER_TITLE } from '@/data/leads'
import {
  CampaignPicker,
  OriginPicker,
  PartnerPicker,
  type CampaignChoice,
  type OriginChoice,
  type PartnerChoice,
} from './lead-origin-pickers'

/** The holder-and-origin card of the create door — who will hold the lead and
 *  how it got here. The profile prints both in its header meta line and
 *  changes the holder from the bar's more menu (ADR 0078).
 *
 *  Three fields, three different write doors: the holder is a hand-over of its
 *  own, the motion is settled here at intake, and the origin is asked once. */
export function OwnerSourceCard({ draft }: { draft: LeadDraft }) {
  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-5 p-4 sm:p-5"
      aria-label="Phụ trách và nguồn"
    >
      <SectionTitle size="detail">Phụ trách và nguồn</SectionTitle>
      <CreateBody draft={draft} />
    </GlassCard>
  )
}

/** The draft boxes this card draws, read off `OWNER_SOURCE_FIELDS` — the list
 *  `data/lead-form.ts` exports FOR this card, rather than reached out of
 *  `CREATE_FIELDS` behind its back. */
const boxOf = (key: FormField['key']) => OWNER_SOURCE_FIELDS.find((field) => field.key === key)
const MOTION_BOX = boxOf('motion')
const ORIGIN_BOX = boxOf('origin')
const CAMPAIGN_BOX = boxOf('campaignCode')
const REFERRER_BOX = boxOf('refCode')

/** The create door: the holder stated, the motion, then the ONE box it asks.
 *
 *  `POST /sales/leads` IS the manual door — it takes no `kind`, because a
 *  caller that may name its own origin may claim `LANDING_PAGE`, which
 *  `CHANNEL_TRUST` reads as customer-verified. What it does take is the motion
 *  and whichever of origin · campaign · referrer its `asks` names; the server
 *  derives the origin from the other two. */
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
      {draft.asks === 'ORIGIN' && <OriginBlock draft={draft} />}
      {draft.asks === 'CAMPAIGN' && <CampaignBlock draft={draft} />}
      {draft.asks === 'REFERRER' && <ReferrerBlock draft={draft} />}
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

/** The draft holds only what goes on the wire, so each block keeps the name
 *  shown in its box and drops it once the draft moves on. */
function OriginBlock({ draft }: { draft: LeadDraft }) {
  const [origin, setOrigin] = useState<OriginChoice | null>(null)
  if (!ORIGIN_BOX) return null
  const raw = readField(draft.values, 'origin')
  const shown = origin && originValue(origin) === raw ? origin : null
  const motion = readField(draft.values, 'motion') as LeadMotion | ''
  return (
    <Block
      label="Nguồn *"
      hint="Chọn nguồn đã có; tên mới chỉ được tạo khi lưu lead."
      error={draft.fieldError('origin')}
    >
      <OriginPicker
        label="Nguồn"
        hideLabel
        value={shown}
        motion={motion === '' ? undefined : motion}
        invalid={Boolean(draft.fieldError('origin'))}
        onChange={(choice) => {
          setOrigin(choice)
          draft.set(ORIGIN_BOX, originValue(choice))
        }}
      />
    </Block>
  )
}

function CampaignBlock({ draft }: { draft: LeadDraft }) {
  const [campaign, setCampaign] = useState<CampaignChoice | null>(null)
  if (!CAMPAIGN_BOX) return null
  const raw = readField(draft.values, 'campaignCode')
  const shown = campaign && campaign.code === raw ? campaign : null
  return (
    <Block
      label="Chiến dịch *"
      hint="Chỉ chiến dịch còn nhận lead. Nguồn của lead lấy theo chiến dịch, lead vào luôn danh sách của nó."
      error={draft.fieldError('campaignCode')}
    >
      <CampaignPicker
        label="Chiến dịch"
        hideLabel
        required
        value={shown}
        invalid={Boolean(draft.fieldError('campaignCode'))}
        onChange={(choice) => {
          setCampaign(choice)
          draft.set(CAMPAIGN_BOX, choice?.code ?? '')
        }}
      />
    </Block>
  )
}

function ReferrerBlock({ draft }: { draft: LeadDraft }) {
  const [partner, setPartner] = useState<PartnerChoice | null>(null)
  if (!REFERRER_BOX) return null
  const raw = readField(draft.values, 'refCode')
  const shown = partner && partner.code === raw ? partner : null
  return (
    <Block
      label="Mã giới thiệu *"
      hint={
        shown?.originName
          ? `Nguồn lấy theo mã giới thiệu: ${shown.originName}.`
          : 'Nguồn của lead lấy theo mã giới thiệu. Chưa có trong danh sách thì nhờ quản trị thêm.'
      }
      error={draft.fieldError('refCode')}
    >
      <PartnerPicker
        label="Mã giới thiệu"
        hideLabel
        value={shown}
        invalid={Boolean(draft.fieldError('refCode'))}
        onChange={(choice) => {
          setPartner(choice)
          draft.set(REFERRER_BOX, choice.code)
        }}
      />
    </Block>
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
