import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, EmptyState, Icon, Skeleton, cn } from '@pv/ui'
import { draftOpportunity, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { LeadProfile, OpportunityContactPick, OpportunityCreateResponse } from '@pv/contracts'
import { isApiError, userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useDirectory } from '@/data/directory'
import { profileForm } from '@/data/lead-profile'
import { chainPath } from '@/data/opportunities'
import {
  createBodyOf,
  draftErrorsOf,
  usePromoteLead,
  withCreatorOwners,
} from '@/data/opportunities-write'
import { missingForOpen, openContextQuery, seededPicks } from '@/data/opportunity-open'
import { BasicsSection } from './open-deal-basics'
import { ContactsSection } from './open-deal-contacts'
import { CreatedPanel, type Created } from './open-deal-done'
import { ExtrasSection } from './open-deal-extras'
import { LeadCard, StandingDealNote } from './open-deal-lead'
import { AfterCreate, OwnersSection } from './open-deal-owners'

/** Open an opportunity from a lead — a panel over the profile it reads from.
 *
 *  A panel and not a screen because the person filling this in is HALF WAY
 *  through the profile behind it. The sections live in `open-deal-*.tsx`; this
 *  file owns the state they share, the footer, and the swap to the success view
 *  once the server accepts.
 *
 *  `onCreated` fires when the person presses the open-deal button of the success view,
 *  not on the 201 itself: the drawer stays up to show what was made first. The
 *  lead profile passes nothing and lands on the deal by the chain path; the
 *  deal book and `/new` pass their own way in. */

type Props = {
  profile: LeadProfile
  open: boolean
  onClose: () => void
  onCreated?: (row: OpportunityCreateResponse) => void
}

/** A fresh state per opening: the inner drawer is re-keyed when `open` turns
 *  true, so nothing typed or refused last time survives into this one, and the
 *  exit animation of the old session is never cut short. */
export function ConvertDialog(props: Props) {
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(props.open)
  if (props.open !== wasOpen) {
    setWasOpen(props.open)
    if (props.open) setSession((n) => n + 1)
  }
  return <OpenDrawer key={session} {...props} />
}

function OpenDrawer({ profile, open, onClose, onCreated }: Props) {
  const staff = useDirectory()
  const me = useSession((s) => s.actor)
  const navigate = useNavigate()
  const canAccept = useCan('opportunity.accept')
  /* `useMemo` so the seed keeps its reference: it is the yardstick the seed
     tags compare the draft against. The close date starts empty: only the
     seller can say it, and a guessed one gets submitted unread. */
  const seed = useMemo(
    () => ({
      ...withCreatorOwners(draftOpportunity(profileForm(profile), staff), me, profile),
      closedDate: '',
    }),
    [staff, me, profile],
  )
  const [draft, setDraft] = useState<OpportunityDraft>(seed)
  const [picks, setPicks] = useState<OpportunityContactPick[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [created, setCreated] = useState<Created | null>(null)
  const [ready, setReady] = useState(false)

  const context = useQuery(openContextQuery(profile.code, open))
  const ctx = ready ? context.data : undefined
  const promote = usePromoteLead()

  /* Seeded once, from an answer that is not a cached leftover of the last
     opening: a refetch landing later must not undo ticks already made. */
  useEffect(() => {
    if (ready || !context.data || context.isFetching) return
    setPicks(seededPicks(context.data))
    setReady(true)
  }, [ready, context.data, context.isFetching])

  /* Typing into a box the server just refused clears that refusal — a red mark
     surviving the fix reads as "still wrong", and people stop believing the
     other red marks. */
  const clear = (key: string) =>
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  const set = <K extends keyof OpportunityDraft>(key: K, value: OpportunityDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    clear(key)
  }
  const pick = (next: OpportunityContactPick[]) => {
    setPicks(next)
    clear('contacts')
  }

  const missing = missingForOpen(draft, picks, canAccept)

  const submit = () => {
    if (!ctx) return
    promote.mutate(createBodyOf(profile.code, draft, picks), {
      onSuccess: (row) =>
        setCreated({
          row,
          context: ctx,
          picks,
          contactNames: Object.fromEntries(ctx.contacts.map((c) => [c.code, c.name])),
          convertsLead: profile.state !== 'converted',
          leadCode: profile.code,
        }),
      onError: (error) => setErrors(draftErrorsOf(error.errors)),
    })
  }

  const openDeal = (row: OpportunityCreateResponse) =>
    onCreated
      ? onCreated(row)
      : navigate(chainPath('OP', row.code) ?? `/sales/opportunities/${row.code}`)

  const openLead = () => {
    onClose()
    navigate(`/sales/leads/${profile.code}`)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={created ? <span className="sr-only">Đã mở cơ hội</span> : 'Mở cơ hội'}
      subtitle={created ? undefined : 'Phiếu đã mồi sẵn từ lead — kiểm lại các ô có dấu * rồi tạo.'}
      footer={
        created ? undefined : (
          <OpenBar
            missing={missing}
            contacts={picks.length}
            pending={promote.isPending}
            error={promote.error}
            onClose={onClose}
            onSubmit={submit}
          />
        )
      }
    >
      {created ? (
        <CreatedPanel
          created={created}
          stayLabel={onCreated ? 'Về sổ cơ hội' : 'Ở lại lead'}
          onOpen={() => openDeal(created.row)}
          onStay={onClose}
        />
      ) : ctx ? (
        <div className="flex min-w-0 flex-col gap-6">
          <LeadCard profile={profile} context={ctx} />
          <StandingDealNote context={ctx} />
          <BasicsSection draft={draft} seed={seed} errors={errors} onSet={set} />
          <ContactsSection
            contacts={ctx.contacts}
            picks={picks}
            errors={errors.contacts}
            onPicks={pick}
            onOpenLead={openLead}
          />
          <div className="flex flex-col gap-4">
            <OwnersSection
              draft={draft}
              errors={errors}
              me={me}
              canAccept={canAccept}
              accountOwner={ctx.account?.owner}
              onSet={set}
            />
            <AfterCreate
              canAccept={canAccept}
              wsCode={ctx.workstream?.code}
              limitDays={ctx.newStageLimitDays}
            />
          </div>
          <ExtrasSection draft={draft} seed={seed} errors={errors} onSet={set} />
        </div>
      ) : (
        <ContextGate error={ready ? null : context.error} onRetry={() => void context.refetch()} />
      )}
    </Drawer>
  )
}

/** Skeleton while the context loads; a refusal with a retry when it cannot. The
 *  form is never drawn from a half-known context: contacts and the standing
 *  deal decide what the person is about to confirm. */
function ContextGate({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  if (error)
    return (
      <EmptyState
        icon={TriangleAlert}
        message={`Không mở được phiếu. ${isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}`}
        action={{ label: 'Thử lại', onClick: onRetry }}
        className="py-12"
      />
    )
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

/** The bottom bar — one sentence. The server's refusal outranks everything
 *  else: someone who just pressed the button and was turned down needs the
 *  reason, not a progress report. */
function OpenBar({
  missing,
  contacts,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  missing: string[]
  contacts: number
  pending: boolean
  error: ApiError | null
  onClose: () => void
  onSubmit: () => void
}) {
  const ready = missing.length === 0 && !pending

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'flex items-center gap-2 text-[12.5px] leading-[1.5]',
          error || (!ready && !pending)
            ? 'text-on-tint-warning'
            : ready
              ? 'text-on-tint-success-strong'
              : '',
        )}
        aria-live="polite"
      >
        {ready && !error && <Icon icon={Check} size={16} />}
        {error
          ? userMessage(error)
          : pending
            ? 'Đang gửi phiếu…'
            : ready
              ? `Đủ ô bắt buộc · ${contacts} người liên hệ`
              : `Còn thiếu ${missing.join(' · ')}.`}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" onClick={onClose}>
          <Icon icon={X} size={16} />
          Huỷ
        </Button>
        <Button size="lg" disabled={!ready} onClick={onSubmit}>
          {pending ? 'Đang tạo…' : 'Tạo cơ hội'}
          <Icon icon={ArrowRight} size={16} />
        </Button>
      </div>
    </div>
  )
}
