import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, EmptyState, Icon, Skeleton, cn } from '@pv/ui'
import { draftOpportunity, type OpportunityDraft } from '@pv/engines/fixtures/das-vina'
import type { LeadProfile, OpportunityContactPick, OpportunityCreateResponse } from '@pv/contracts'
import { isApiError, userMessage, type ApiError, type FieldErrors } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { useDirectory } from '@/data/directory'
import { profileForm } from '@/data/lead-profile'
import { chainPath, primaryFit, salePrimaryIn } from '@/data/opportunities'
import {
  createBodyOf,
  draftErrorsOf,
  usePromoteLead,
  withCreatorOwners,
} from '@/data/opportunities-write'
import {
  missingForOpen,
  openContextQuery,
  seededPicks,
  useDealsConfirm,
} from '@/data/opportunity-open'
import { BasicsSection } from './open-deal-basics'
import { ContactsSection } from './open-deal-contacts'
import { CreatedPanel, type Created } from './open-deal-done'
import { ExtrasSection } from './open-deal-extras'
import { LeadCard } from './open-deal-lead'
import { AfterCreate, OwnersSection } from './open-deal-owners'
import { RunningDealsBlock } from './open-deal-running'

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

/** A config category id names no fixture category, so the fixture's Sale
 *  fallback inside `draftOpportunity` sits out; the owners come from the lead. */
type FixtureCategory = Parameters<typeof draftOpportunity>[0]['category']
const seedOf = (profile: LeadProfile, staff: Parameters<typeof draftOpportunity>[1]) =>
  draftOpportunity(
    { ...profileForm(profile), headcount: null, sizeBand: null, category: '' as FixtureCategory },
    staff,
  )

const OPEN = {
  confirmDifferentNeed: message(
    'xác nhận đây là nhu cầu khác',
    'confirm this is a different need',
    '다른 수요임을 확인',
  ),
  opportunityOpened: message('Đã mở cơ hội', 'Opportunity opened', '기회를 열었습니다'),
  openOpportunity: message('Mở cơ hội', 'Open opportunity', '기회 열기'),
  prefilledFromTheLead: message(
    'Điền sẵn từ lead. Kiểm lại các ô có dấu *.',
    'Prefilled from the lead. Check the fields marked with *.',
    '리드 정보로 미리 채워져 있습니다. *가 있는 항목을 확인하세요.',
  ),
  backToOpportunities: message('Về sổ cơ hội', 'Back to opportunities', '기회 목록으로'),
  stayOnTheLead: message('Ở lại lead', 'Stay on the lead', '리드에 머물기'),
}

/** Said to a screen reader only once the deal exists: the panel then speaks for itself. */
function OpenTitle({ created }: { created: boolean }) {
  const { t } = useI18n()
  return created ? (
    <span className="sr-only">{t(OPEN.opportunityOpened)}</span>
  ) : (
    <>{t(OPEN.openOpportunity)}</>
  )
}

function OpenDrawer({ profile, open, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const staff = useDirectory()
  const me = useSession((s) => s.actor)
  const navigate = useNavigate()
  const canAccept = useCan('opportunity.accept')
  /* `useMemo` so the seed keeps its reference: it is the yardstick the seed
     tags compare the draft against. The close date starts empty: only the
     seller can say it, and a guessed one gets submitted unread. */
  const seed = useMemo(
    () => ({ ...withCreatorOwners(seedOf(profile, staff), me, profile), closedDate: '' }),
    [staff, me, profile],
  )
  const [draft, setDraft] = useState<OpportunityDraft>(seed)
  const [picks, setPicks] = useState<OpportunityContactPick[]>([])
  /* Beside the draft like `picks`: the 14-cell draft has no room for it. */
  const [primaryPick, setPrimaryPick] = useState<string | null>(null)
  /* Only people the server accepts as primary; the first of them shows until another is picked. */
  const fitOwners = primaryFit(draft.saleOwners, staff)
  const salePrimary = salePrimaryIn(fitOwners, primaryPick) ?? fitOwners[0]
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
    if (key === 'saleOwners') clear('salePrimary')
  }
  const pick = (next: OpportunityContactPick[]) => {
    setPicks(next)
    clear('contacts')
  }

  const shownCodes = ctx?.runningDeals.map((d) => d.code) ?? []
  const { confirmed, confirm } = useDealsConfirm(shownCodes)
  const missing = missingForOpen(draft, picks, canAccept)
  if (!confirmed) missing.push(t(OPEN.confirmDifferentNeed))

  const submit = () => {
    if (!ctx) return
    promote.mutate(createBodyOf(profile.code, draft, picks, shownCodes, salePrimary), {
      onSuccess: (row) =>
        setCreated({
          row,
          context: ctx,
          picks,
          contactNames: Object.fromEntries(ctx.contacts.map((c) => [c.code, c.name])),
          convertsLead: profile.state !== 'converted',
          leadCode: profile.code,
        }),
      onError: (error) => {
        setErrors(draftErrorsOf(error.errors))
        /* A 409 may carry a new list of running deals: ask again, untick. */
        if (error.kind !== 'conflict') return
        confirm(false)
        void context.refetch()
      },
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
      title={<OpenTitle created={created !== null} />}
      subtitle={created ? undefined : t(OPEN.prefilledFromTheLead)}
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
          stayLabel={onCreated ? t(OPEN.backToOpportunities) : t(OPEN.stayOnTheLead)}
          onOpen={() => openDeal(created.row)}
          onStay={onClose}
        />
      ) : ctx ? (
        <div className="flex min-w-0 flex-col gap-6">
          <LeadCard profile={profile} context={ctx} />
          <RunningDealsBlock
            deals={ctx.runningDeals}
            confirmed={confirmed}
            busy={context.isFetching}
            onConfirm={(on) => {
              confirm(on)
              promote.reset()
            }}
          />
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
              salePrimary={salePrimary}
              onSalePrimary={(id) => {
                setPrimaryPick(id)
                clear('salePrimary')
              }}
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
 *  form is never drawn from a half-known context: contacts and the running
 *  deals decide what the person is about to confirm. */
function ContextGate({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useI18n()
  if (error)
    return (
      <EmptyState
        tone="danger"
        icon={TriangleAlert}
        message={`${t(message('Không mở được phiếu.', 'Could not open the form.', '양식을 열지 못했습니다.'))} ${
          isApiError(error)
            ? userMessage(error)
            : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))
        }`}
        action={{ label: t(message('Thử lại', 'Try again', '다시 시도')), onClick: onRetry }}
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
  const { t } = useI18n()
  const ready = missing.length === 0 && !pending

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <span
        className={cn(
          'flex items-center gap-2 text-[12.5px] leading-[1.5]',
          error
            ? 'text-destructive-foreground'
            : !ready && !pending
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
            ? t(message('Đang gửi phiếu…', 'Submitting the form…', '양식을 제출하는 중…'))
            : ready
              ? t(
                  message(
                    `Đủ ô bắt buộc · ${contacts} người liên hệ`,
                    `All required fields filled · ${contacts} ${contacts === 1 ? 'contact' : 'contacts'}`,
                    `필수 항목 입력 완료 · 연락처 ${contacts}명`,
                  ),
                )
              : t(
                  message(
                    `Còn thiếu ${missing.join(' · ')}.`,
                    `Missing ${missing.join(' · ')}.`,
                    `부족한 항목: ${missing.join(' · ')}.`,
                  ),
                )}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" onClick={onClose}>
          <Icon icon={X} size={16} />
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <Button size="lg" disabled={!ready} onClick={onSubmit}>
          {pending
            ? t(message('Đang tạo…', 'Creating…', '생성 중…'))
            : t(message('Tạo cơ hội', 'Create opportunity', '기회 생성'))}
          <Icon icon={ArrowRight} size={16} />
        </Button>
      </div>
    </div>
  )
}
