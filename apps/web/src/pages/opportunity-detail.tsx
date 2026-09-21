import { useMemo, useState, type ReactNode } from 'react'
import { Inbox, Lock, TriangleAlert } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, GlassCard, ScreenLayout, Skeleton } from '@pv/ui'
import type { OpportunityProfileResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { openMasMail } from '@/app/mas-mail-composer'
import { masRecipientsOf } from '@/data/mas-mail-draft'
import { leadProfileQuery, NO_TOUCHES } from '@/data/lead-profile'
import { NO_STEPS, opportunityTouchesQuery, opportunityVectorQuery } from '@/data/touches'
import type { TouchFocus } from '@/data/touches'
import { opportunityProfileQuery, railOf } from '@/data/opportunities'
import { draftOf } from '@/data/opportunities-write'
import { useDealDraft } from '@/data/deal-draft'
import { SignDrawer } from '@/components/sign-drawer'
import { DealFormCard } from './opportunity-form-card'
import { DealHeader, DealHistoryTab, DealToolsBar, EmptyOp } from './opportunity-parts'

/** Module 3 · one deal's profile — `/sales/opportunities/:code`.
 *
 *  ONE COLUMN, ONE CARD (17/09). The side column is gone and with it the six
 *  blocks that only restated the row: stage picker, origin lead, holders. What a reader looked them up for now sits where they were
 *  already looking — provenance in the header, holders and column inside the
 *  form, everything that HAPPENED behind the history tab.
 *
 *  Same card on the create door (`opportunity-new.tsx`), same reason the lead
 *  screens share `LeadForm`: a deal typed on one door and opened on the other
 *  must not read as two different pieces of paper.
 *
 *  Four ways the screen fails to draw say four different things — each is a
 *  different next step. `DealScreen` is split out so that every hook of the
 *  profile runs only once there IS a profile. */

export function OpportunityDetailPage() {
  const chrome = useAppChrome({ searchPlaceholder: 'Tìm khách hàng, cơ hội, báo giá, hồ sơ…' })
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const { data: op, isPending, error } = useQuery(opportunityProfileQuery(code))

  const shell = (children: ReactNode) => <AppShell {...chrome.shell}>{children}</AppShell>

  if (isPending) {
    return shell(
      <ScreenLayout>
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </ScreenLayout>,
    )
  }

  if (!op) {
    /* One `kind`, one sentence. The screen reads no numeric status and matches
       no substring of `message`: `app/api/errors.ts` classified it once for
       the whole app, and a second classifier here is a second wording. */
    const failure = isApiError(error) ? error : null
    const missing = failure?.kind === 'not-found'
    const denied = failure?.kind === 'forbidden'

    return shell(
      <ScreenLayout>
        <GlassCard className="p-5 lg:p-6">
          <EmptyOp
            icon={missing ? Inbox : denied ? Lock : TriangleAlert}
            note={
              missing ? (
                <>
                  Sổ của bạn không có đơn nào mang mã <span className="font-mono">{code}</span>. Có
                  thể mã sai, hoặc đơn không đứng tên bạn — hỏi người giữ đơn, hoặc mở lại từ sổ.
                </>
              ) : (
                (failure && userMessage(failure)) || 'Không đọc được hồ sơ cơ hội này.'
              )
            }
            onBack={() => navigate('/sales/opportunities')}
          />
        </GlassCard>
      </ScreenLayout>,
    )
  }

  return shell(<DealScreen op={op} />)
}

export default OpportunityDetailPage

// ---------------------------------------------------------------------------

function DealScreen({ op }: { op: OpportunityProfileResponse }) {
  const navigate = useNavigate()
  const me = useSession((s) => s.actor)

  /* The origin lead, read for real. A failure here does NOT break the screen:
     a deal stays readable when its lead is out of the reader's scope, and the
     header says so rather than going quiet. */
  const { data: lead = null } = useQuery({
    ...leadProfileQuery(op.leadCode),
    enabled: Boolean(op.leadCode),
  })

  /* The DEAL's timeline, not the lead's — decision 5 of ADR
     `docs/decisions/0018-opportunity-module-decisions.md`: the deal was born
     after the lead had travelled, so the two chains do not mix. */
  const { data: touches = NO_TOUCHES } = useQuery(opportunityTouchesQuery(op.code))
  /* The holder chain, off the SAME query key — one fetch, two questions. */
  const { data: vector = NO_STEPS } = useQuery(opportunityVectorQuery(op.code))

  /* Which timeline row a vector face last pointed at — the wire between the
     two blocks of the history tab. */
  const [focusTouch, setFocusTouch] = useState<TouchFocus | null>(null)
  const [signing, setSigning] = useState(false)

  /* Asked HERE and handed to the toolbar, the same call the lead screen makes:
     a button that opens a panel ending in a 403 is worse than a locked one. */
  const canSendEmail = useCan('lead.send-email')
  /* The deal writes to its ORIGIN LEAD's mailbox, so the three gaps that stop a
     lead mail stop this one — said on the button, not after composing. */
  const mailBlocker = !lead
    ? 'Chưa đọc được lead gốc của đơn này.'
    : !lead.email
      ? 'Lead gốc chưa có địa chỉ email.'
      : !lead.contactName
        ? 'Lead gốc chưa có người liên hệ.'
        : undefined
  const composeMail = () =>
    openMasMail({
      recipients: masRecipientsOf(lead, { code: op.code, label: op.name }),
      ...(lead && !mailBlocker ? { initialCode: op.code } : {}),
      subjectType: 'opportunity',
      defaultLabel: `Gửi email · ${op.name}`,
    })

  /* The stored row as the form sees it. Through `useMemo` so the seed keeps
     its reference between renders — react-query hands back the same `op`, so
     the draft must not re-seed over a box being typed into. */
  const saved = useMemo(() => draftOf(op), [op])
  const draft = useDealDraft({ saved, op, leadCode: op.leadCode })

  return (
    <ScreenLayout>
      {/* THE OBJECT CHAIN rides in the header's meta row (law 10), built by
          `E1.story()` ON THE SERVER and already cut by permission. A strip of
          its own printed the lead code twice, one row under itself. */}
      <DealHeader
        op={op}
        lead={lead}
        rail={railOf(op.chain, op.code, navigate)}
        onBack={() => navigate('/sales/opportunities')}
        onOpenLead={() => navigate(`/sales/leads/${op.leadCode}`)}
      />

      <DealFormCard
        draft={draft}
        history={{
          count: touches.length,
          node: (
            <DealHistoryTab
              op={op}
              touches={touches}
              vector={vector}
              me={me?.id}
              focus={focusTouch}
              onFocusStep={(id) => setFocusTouch((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }))}
            />
          ),
        }}
      />

      <DealToolsBar
        draft={draft}
        op={op}
        onSign={() => setSigning(true)}
        canSendEmail={canSendEmail}
        composeBlocked={mailBlocker}
        onCompose={composeMail}
      />

      <SignDrawer op={op} open={signing} onClose={() => setSigning(false)} />
    </ScreenLayout>
  )
}
