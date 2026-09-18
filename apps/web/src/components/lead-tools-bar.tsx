import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarClock,
  Mail,
  Phone,
  Pin,
  RotateCcw,
  Timer,
  TriangleAlert,
  type IconGlyph,
} from '@pv/ui'
import { Avatar, Badge, Button, GlassCard, Icon } from '@pv/ui'
import type { LeadProfile, OpportunityLiveDeal } from '@pv/contracts'
import type { Lead } from '@pv/engines/fixtures/das-vina'
import { userMessage } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import { useContactLead, useReopenLead } from '@/data/lead-exit'
import { readField } from '@/data/lead-form'
import type { LeadDraft } from '@/data/lead-draft'
import { EXIT_REASON_LABEL } from '@/data/leads'
import { isOpenState } from '@/data/lead-state'
import { AssignMenu } from './assign-menu'
import { LeadStepButton } from './lead-state-actions'

/** The sticky bottom bar — WHO the customer is on the left, WHAT TO DO on the right.
 *
 *  The left half is drawn at EVERY width. The old bar hid it below `lg`, and so
 *  nothing worth reading could be put there — hiding the contact from tablet and
 *  phone hides it from the two devices law 3 says the product must run on.
 *
 *  The three everyday actions stand in the open (call · mail · meeting); the
 *  rest sits behind `…`, because a bar of ten buttons has no first button.
 *
 *  The convert button stands on every open or converted lead: a lead may hold
 *  several deals, so an open deal never blocks one more. A disqualified or
 *  archived lead has no convert button at all — the door refuses those.
 *
 *  STICKY rather than fixed: it stays in the content flow so it cannot cover the
 *  sidebar, and below `lg` it leaves room for AppShell's 84px BottomNav. */
export function LeadToolsBar(
  props:
    | {
        mode: 'edit'
        lead: LeadProfile
        /** The fixture's `Lead` shape. `AssignMenu` takes it ONLY to order its
         *  suggestions — every value it writes comes from `lead`. */
        legacy: Lead
        pinned: boolean
        /** Every open deal this lead holds — information, never a block. */
        liveDeal: OpportunityLiveDeal
        canDisqualify: boolean
        /** `lead.edit`, scoped — the need `data/meetings.ts` posts a booking
         *  under. The meeting button in the activity card asks the same one,
         *  and two buttons opening ONE drawer must not answer differently. */
        canEdit: boolean
        /** `lead.send-email`, scoped (`data/mas.ts`). */
        canSendEmail: boolean
        /** `opportunity.edit` (`data/opportunities-write.ts`) — the need the
         *  convert dialog writes under. NOT `lead.convert`: no door asks it. */
        canConvert: boolean
        onPin: () => void
        onExit: () => void
        /** The PIC's lifecycle steps (ADR 0058), gated by `canEdit`. */
        onVerify: () => void
        onNurture: () => void
        onConvert: () => void
        onOpenOp: (code: string) => void
        onCompose: () => void
        composeBlocked?: string
        onSchedule: () => void
      }
    | { mode: 'create'; draft: LeadDraft },
) {
  return (
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel grid gap-3 p-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center"
        aria-label="Thanh công cụ"
      >
        {props.mode === 'edit' ? <EditBar {...props} /> : <CreateBar draft={props.draft} />}
      </GlassCard>
    </div>
  )
}

type EditBarProps = Extract<Parameters<typeof LeadToolsBar>[0], { mode: 'edit' }>

function EditBar({
  lead,
  legacy,
  pinned,
  liveDeal,
  canDisqualify,
  canEdit,
  canSendEmail,
  canConvert,
  onPin,
  onExit,
  onVerify,
  onNurture,
  onConvert,
  onOpenOp,
  onCompose,
  composeBlocked,
  onSchedule,
}: EditBarProps) {
  /* The server answers with the exit reason's KEY (`unreachable`); the screen
     prints the LABEL. */
  const exitLabel = lead.exitReason
    ? (EXIT_REASON_LABEL[lead.exitReason] ?? lead.exitReason)
    : undefined
  const convertible = isOpenState(lead.state) || lead.state === 'converted'
  const nurturable = lead.state === 'verifying' || lead.state === 'working'
  /* A converted lead may still be dropped while it holds no open deal and has
     not signed — the same two refusals the exit door answers 409 with. */
  const noDeal = liveDeal.codes.length === 0 && liveDeal.hidden === 0 && !lead.signed
  const droppable = isOpenState(lead.state) || (lead.state === 'converted' && noDeal)

  return (
    <>
      <ContactFace name={lead.contactName} title={lead.contactTitle} phone={lead.phone} />

      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
        <CallButton lead={lead} canEdit={canEdit} />
        {/* Locked buttons say WHY on the title, the same way the activity card
            does: a drawer filled in and then refused with a 403 is the one
            outcome a disabled button is here to prevent. */}
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={!canSendEmail || Boolean(composeBlocked)}
          title={canSendEmail ? composeBlocked : 'Cần quyền gửi email cho lead.'}
          onClick={onCompose}
        >
          <Icon icon={Mail} size={16} />
          Email
        </Button>
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={!canEdit}
          title={canEdit ? undefined : 'Cần quyền sửa lead để đặt lịch.'}
          onClick={onSchedule}
        >
          <Icon icon={CalendarClock} size={16} />
          Đặt lịch
        </Button>

        <LeadStepButton lead={lead} canEdit={canEdit} onVerify={onVerify} />

        <OverflowMenu>
          {(close) => (
            <>
              <MenuRow
                icon={Pin}
                label={pinned ? 'Bỏ ghim' : 'Ghim lead'}
                pressed={pinned}
                onClick={() => {
                  onPin()
                  close()
                }}
              />
              {/* Assigning does NOT close the menu: `AssignMenu` opens a drawer
                  of its own, and closing here would tear that drawer out from
                  under the user's hand. */}
              <AssignMenu
                lead={legacy}
                profile={lead}
                buttonVariant="ghost"
                className="w-full [&>button]:min-h-12 [&>button]:w-full [&>button]:justify-start [&>button]:bg-transparent [&>button]:shadow-none"
              />
              {nurturable && (
                <MenuRow
                  icon={Timer}
                  label="Nuôi dài hạn"
                  disabled={!canEdit}
                  title={canEdit ? undefined : 'Cần quyền sửa lead.'}
                  onClick={() => {
                    onNurture()
                    close()
                  }}
                />
              )}
              <ExitRow
                code={lead.code}
                dropped={lead.state === 'disqualified'}
                droppable={droppable}
                exitLabel={exitLabel}
                canDisqualify={canDisqualify}
                onExit={() => {
                  onExit()
                  close()
                }}
              />
              <LiveDealRows
                liveDeal={liveDeal}
                onOpenOp={(code) => {
                  onOpenOp(code)
                  close()
                }}
              />
            </>
          )}
        </OverflowMenu>

        {convertible && (
          <Button
            size="lg"
            disabled={!canConvert}
            title={canConvert ? undefined : 'Cần quyền sửa cơ hội để chuyển lead.'}
            onClick={onConvert}
          >
            <Icon icon={ArrowRight} size={16} />
            Chuyển thành cơ hội
          </Button>
        )}

        {/* Room for the floating AI Assistant button (60px, AppShell's
            `bottom-8 right-8`): the bar reaches the right edge at the same
            point, so without this the button covers the last action. */}
        <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
      </div>
    </>
  )
}

/** Dial first, confirm second. The browser cannot know whether leaving through
 *  `tel:` produced a real call, so only the short confirmation press writes
 *  the touch and advances an assigned lead to `verifying`. */
function CallButton({ lead, canEdit }: { lead: LeadProfile; canEdit: boolean }) {
  const contact = useContactLead(lead.code)
  const [dialed, setDialed] = useState(false)

  useEffect(() => {
    setDialed(false)
    contact.reset()
    // `reset` is stable for one mutation observer; the lead code starts a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.code])

  const canConfirm = canEdit && lead.state !== 'disqualified' && lead.state !== 'archived'

  const press = () => {
    if (!lead.phone) return
    if (!dialed) {
      if (canConfirm) setDialed(true)
      window.location.href = `tel:${lead.phone}`
      return
    }
    contact.mutate(undefined, {
      onSuccess: () => {
        toastDone('Đã ghi cuộc gọi.')
        setDialed(false)
      },
      onError: (error) => toastFail('Chưa ghi được.', userMessage(error)),
    })
  }

  return (
    <Button
      size="md"
      variant={dialed ? 'default' : 'secondary'}
      className="pointer-coarse:h-12"
      disabled={!lead.phone || contact.isPending}
      title={dialed ? 'Xác nhận cuộc gọi đã diễn ra' : (lead.phone ?? 'Chưa có số điện thoại')}
      onClick={press}
    >
      <Icon icon={Phone} size={16} />
      {contact.isPending ? 'Đang ghi…' : dialed ? 'Đã gọi' : 'Gọi'}
    </Button>
  )
}

/** The create door: the person being typed into the draft on the left, that
 *  same draft's two buttons on the right. */
function CreateBar({ draft }: { draft: LeadDraft }) {
  const name = readField(draft.values, 'contactName')

  return (
    <>
      <ContactFace
        name={name}
        title={readField(draft.values, 'contactTitle')}
        phone={readField(draft.values, 'phone')}
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={draft.dirty.length === 0 || draft.pending}
          onClick={draft.reset}
        >
          Xoá hết
        </Button>
        <Button size="lg" disabled={draft.pending} onClick={draft.submit}>
          {draft.pending ? 'Đang tạo…' : 'Tạo lead'}
        </Button>
        <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
      </div>
    </>
  )
}

/** Who we are calling: face, name, title, number. The number is mono because
 *  it is read character by character, out loud, while somebody dials it. */
function ContactFace({
  name,
  title,
  phone,
}: {
  name: string | null | undefined
  title: string | null | undefined
  phone: string | null | undefined
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name || 'Chưa rõ'} size="md" className="shrink-0" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[13px] font-semibold">
          {name || 'Chưa có người liên hệ'}
        </span>
        <span className="text-muted-foreground truncate text-[11.5px] leading-[1.5]">
          {title || 'Chưa rõ chức danh'}
          {phone ? ' · ' : ''}
          {phone && <span className="font-mono">{phone}</span>}
        </span>
      </span>
    </div>
  )
}

/** On a disqualified lead this row reopens it; on a `droppable` one (open, or
 *  converted with no open deal and no signature) it drops it. One row, because
 *  those are two ways of one switch. Anything else — archived, or converted
 *  with a live deal — gets neither: the server refuses both from there. */
function ExitRow({
  code,
  dropped,
  droppable,
  exitLabel,
  canDisqualify,
  onExit,
}: {
  code: string
  dropped: boolean
  droppable: boolean
  exitLabel: string | undefined
  canDisqualify: boolean
  onExit: () => void
}) {
  const reopen = useReopenLead(code)

  if (!canDisqualify) {
    return dropped ? (
      <div className="px-3 py-2">
        <Badge tone="danger">Đã loại{exitLabel ? ` · ${exitLabel}` : ''}</Badge>
      </div>
    ) : null
  }

  if (dropped) {
    return (
      <MenuRow
        icon={RotateCcw}
        label={
          reopen.isPending ? 'Đang mở lại…' : `Mở lại lead${exitLabel ? ` · ${exitLabel}` : ''}`
        }
        onClick={() =>
          reopen.mutate(undefined, {
            onSuccess: () => toastDone(`Đã mở lại ${code}.`),
            onError: (error) => toastFail('Không mở lại được lead.', userMessage(error)),
          })
        }
      />
    )
  }

  if (!droppable) return null
  return <MenuRow icon={TriangleAlert} label="Loại lead" onClick={onExit} />
}

/** The deals this lead holds — a pressable row for each one this reader may
 *  open, a count for a colleague's. None of them locks the convert button. */
function LiveDealRows({
  liveDeal,
  onOpenOp,
}: {
  liveDeal: OpportunityLiveDeal
  onOpenOp: (code: string) => void
}) {
  if (liveDeal.codes.length === 0 && liveDeal.hidden === 0) return null

  return (
    <>
      <span className="text-muted-foreground px-3 pt-2 text-[11px]">Cơ hội đang mở</span>
      {liveDeal.codes.map((code) => (
        <MenuRow key={code} label={code} mono onClick={() => onOpenOp(code)} />
      ))}
      {liveDeal.hidden > 0 && (
        <span className="text-muted-foreground px-3 pb-1 text-[11px]">
          +{liveDeal.hidden} cơ hội của người khác
        </span>
      )}
    </>
  )
}

function MenuRow({
  icon,
  label,
  mono,
  pressed,
  disabled,
  title,
  onClick,
}: {
  icon?: IconGlyph
  label: string
  mono?: boolean
  pressed?: boolean
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <Button
      size="md"
      variant="ghost"
      aria-pressed={pressed}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="min-h-12 w-full justify-start bg-transparent shadow-none"
    >
      {icon && <Icon icon={icon} size={16} />}
      <span className={mono ? 'font-mono' : undefined}>{label}</span>
    </Button>
  )
}

/** The `…` button and its panel — the same pattern the lead book's filter menu
 *  uses: one `relative` wrapper, one `glass-overlay` sheet opening UPWARDS
 *  (this bar sits at the bottom), closed by a press outside or by Escape. No
 *  new popup primitive for this.
 *
 *  48px on a coarse pointer (law 13): this is the smallest control in the bar,
 *  so it is the first one to fall under the floor if nobody looks. */
function OverflowMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      /* `AssignMenu`'s drawer portals to `body`: a press in there is still a
         press inside this menu, and closing would unmount the open drawer. */
      const target = event.target as Element
      if (root.current?.contains(target) || target.closest('[aria-modal="true"]')) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <Button
        size="md"
        variant="secondary"
        aria-label="Thêm hành động"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Thêm hành động"
        className="pointer-coarse:size-12 size-10 px-0 text-[16px]"
        onClick={() => setOpen((shown) => !shown)}
      >
        <span aria-hidden>…</span>
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Thêm hành động với lead"
          className="glass-overlay absolute bottom-[calc(100%+8px)] right-0 z-30 flex w-[min(280px,calc(100vw-32px))] flex-col gap-1 rounded-lg p-2"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
