import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, Avatar, Badge, Button, Drawer, Icon, Skeleton, cn } from '@pv/ui'
import { OPPORTUNITY_CONTACT_ROLE_LABEL, type OpportunityProfileResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { ContactsCard } from '@/components/contacts-card'
import { NO_ROLE_LABEL } from '@/components/open-deal-contacts'
import { accountProfileQuery } from '@/data/accounts'
import { leadContactsQuery } from '@/data/contacts'
import { contractDetailQuery } from '@/data/contracts'
import { leadProfileQuery } from '@/data/lead-profile'
import { opportunityProfileQuery } from '@/data/opportunities'
import { ContactsEditDrawer } from './deal-contacts-edit'
import { RunBlock } from './run-block'
import type { RunSubject } from './run-subject'

/** The contacts block of a profile's rail (ADR 0078 §1) — one copy for the
 *  lead, the deal, the contract and, read-only, the company.
 *
 *  Lead: its own people, edited in `ContactsCard` inside a drawer. Deal: the
 *  people it is about, with role and primary, edited in its own drawer while
 *  `editDetails` allows it. Contract: its signer, then its deal's people — the
 *  ones the floating bar reaches. Company: everyone on its leads, each opening
 *  the lead that holds them. No call buttons per person: the floating bar
 *  holds those (0077 §6). A run has no people of its own: nothing is drawn. */

type Person = {
  code: string
  name: string
  primary: boolean
  /** Role and title, already worded. */
  line: string | null
  /** How to reach them — information, not an action. */
  reach?: string | null
  /** Where the name leads. */
  to?: string
}

const NOTE = 'text-muted-foreground m-0 text-[12.5px] leading-[1.6]'

/** A scope or permission cut says so; it is no failure (403 and 404 alike). */
const isCut = (error: unknown) =>
  isApiError(error) && (error.kind === 'forbidden' || error.kind === 'not-found')

export function RunContacts({
  subject,
}: {
  subject: RunSubject | { kind: 'account'; code: string }
}) {
  if (subject.kind === 'lead') return <LeadContacts code={subject.code} />
  if (subject.kind === 'opportunity') return <DealContacts code={subject.code} />
  if (subject.kind === 'contract') return <ContractContacts code={subject.code} />
  if (subject.kind === 'account') return <AccountContacts code={subject.code} />
  return null
}

const reachOf = (c: { email?: string | null; phone?: string | null }) =>
  [c.email, c.phone].filter(Boolean).join(' · ') || 'Chưa có kênh liên lạc nào'

function LeadContacts({ code }: { code: string }) {
  const canView = useCan('lead.view')
  const { data, isLoading, error } = useQuery({ ...leadContactsQuery(code), enabled: canView })
  const { data: lead } = useQuery({ ...leadProfileQuery(code), enabled: canView })
  const canEdit = useCan('lead.edit') && lead?.canEdit === true
  const [editing, setEditing] = useState(false)
  const people = data?.rows.map((c) => ({
    code: c.code,
    name: c.name,
    primary: c.isPrimary,
    line: c.title ?? null,
    reach: reachOf(c),
  }))

  return (
    <RunBlock title="Người liên hệ">
      {!canView || isCut(error) ? (
        <p className={NOTE}>Vai của bạn không xem được người liên hệ của lead này.</p>
      ) : (
        <PeopleBody
          people={people}
          loading={isLoading}
          error={error}
          onChange={canEdit ? () => setEditing(true) : undefined}
        />
      )}
      <Drawer open={editing} onClose={() => setEditing(false)} width="md" title="Người liên hệ">
        <div className="p-4 sm:p-5">
          <ContactsCard code={code} canEdit embedded hideCommActions />
        </div>
      </Drawer>
    </RunBlock>
  )
}

/** Primary first, as the profile sends them. A deal without an email address
 *  cannot be mailed, so the line says so. */
const dealPeople = (op: OpportunityProfileResponse): Person[] =>
  op.contacts.map((c) => ({
    code: c.code,
    name: c.name,
    primary: c.primary,
    line:
      [c.role && OPPORTUNITY_CONTACT_ROLE_LABEL[c.role], c.title].filter(Boolean).join(' · ') ||
      NO_ROLE_LABEL,
    reach: c.email === null ? 'chưa có email' : null,
  }))

/** `editing.session` remounts the editor per opening, so it seeds from the server's copy. */
function DealContacts({ code }: { code: string }) {
  const { data: op, isPending, error } = useQuery(opportunityProfileQuery(code))
  const [editing, setEditing] = useState({ open: false, session: 0 })
  const open = () => setEditing((prev) => ({ open: true, session: prev.session + 1 }))

  return (
    <RunBlock title="Người liên hệ">
      <PeopleBody
        people={op && dealPeople(op)}
        loading={isPending}
        error={error}
        required
        onChange={op?.acts.editDetails.ok ? open : undefined}
      />
      {op && editing.session > 0 && (
        <ContactsEditDrawer
          key={editing.session}
          op={op}
          open={editing.open}
          onClose={() => setEditing((prev) => ({ ...prev, open: false }))}
        />
      )}
    </RunBlock>
  )
}

/** The signer the contract names, then its deal's people — the ones the
 *  floating bar reaches, so rail and bar answer one question. A signer who is
 *  one of them is said on their row, not twice. No deal read: the signer alone. */
function ContractContacts({ code }: { code: string }) {
  const canView = useCan('contract.view')
  const canViewDeal = useCan('opportunity.view')
  const contract = useQuery({ ...contractDetailQuery(code), enabled: canView })
  const dealCode = contract.data?.opportunityCode ?? ''
  const deal = useQuery({
    ...opportunityProfileQuery(dealCode),
    enabled: canViewDeal && dealCode !== '',
  })

  if (!canView) {
    return (
      <RunBlock title="Người liên hệ">
        <p className={NOTE}>Vai của bạn không có quyền xem hợp đồng này.</p>
      </RunBlock>
    )
  }
  const signer: Person | undefined = contract.data && {
    code,
    name: contract.data.contact,
    primary: false,
    line: `${contract.data.contactRole} · ${SIGNER}`,
  }
  const others = deal.data ? dealPeople(deal.data) : []
  const people =
    signer &&
    (others.some((p) => p.name === signer.name)
      ? others.map((p) => (p.name === signer.name ? { ...p, line: `${p.line} · ${SIGNER}` } : p))
      : [signer, ...others])

  return (
    <RunBlock title="Người liên hệ">
      <PeopleBody
        people={people}
        loading={contract.isLoading || deal.isLoading}
        error={contract.error}
      />
    </RunBlock>
  )
}

const SIGNER = 'người ký hợp đồng'

/** Read-only: a contact hangs under a lead (see `contact.schema.ts`), so each
 *  name opens the lead holding them, where they are edited. The page has
 *  already read the profile; this shares its cache. */
function AccountContacts({ code }: { code: string }) {
  const { data, isPending, error } = useQuery(accountProfileQuery(code))
  const people = data?.contactRows.map((c) => ({
    code: c.code,
    name: c.name,
    primary: c.isPrimary,
    line: c.title ?? null,
    reach: reachOf(c),
    to: `/sales/leads/${encodeURIComponent(c.leadCode)}`,
  }))

  return (
    <RunBlock
      title="Người liên hệ"
      aside={
        people && <span className="text-muted-foreground tnum text-[12px]">{people.length}</span>
      }
    >
      <p className={NOTE}>Gộp từ mọi lead của công ty này.</p>
      <PeopleBody
        people={people}
        loading={isPending}
        error={error}
        empty="Chưa ghi được ai ở công ty này. Thêm người liên hệ ở hồ sơ lead."
      />
    </RunBlock>
  )
}

/** A deal must name at least one person (ADR 0076 §2), so an empty one warns;
 *  a failed read is said quietly — there is nothing for the reader to fix. */
function PeopleBody({
  people,
  loading,
  error,
  required = false,
  onChange,
  empty = 'Chưa có người liên hệ.',
}: {
  people: Person[] | undefined
  loading: boolean
  error: Error | null
  required?: boolean
  onChange?: (() => void) | undefined
  empty?: string
}) {
  if (loading) return <Skeleton className="h-20 w-full" />
  if (error || !people) {
    return (
      <p className={NOTE}>
        Không đọc được người liên hệ. {isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'}
      </p>
    )
  }
  if (people.length === 0) {
    return <p className={cn(NOTE, required && 'text-warning')}>{empty}</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {people.map((p, i) => (
        <li key={p.code} className="flex min-w-0 items-center gap-3">
          <Avatar name={p.name} size="md" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Name to={p.to}>{p.name}</Name>
              {p.primary && <Badge tone="running">Chính</Badge>}
            </span>
            {[p.line, p.reach].filter(Boolean).map((text) => (
              <span
                key={text}
                className="text-muted-foreground break-words text-[12px] leading-[1.5]"
              >
                {text}
              </span>
            ))}
          </span>
          {i === 0 && onChange && <ChangeButton onClick={onChange} />}
        </li>
      ))}
    </ul>
  )
}

/** Beside the first name, icon only; the words live in the label. */
function ChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="pointer-coarse:h-12 pointer-coarse:w-12 ml-auto w-8 shrink-0 px-0"
      title="Đổi người liên hệ"
      aria-label="Đổi người liên hệ"
      onClick={onClick}
    >
      <Icon icon={ArrowLeftRight} size={16} />
    </Button>
  )
}

function Name({ to, children }: { to: string | undefined; children: ReactNode }) {
  const face = 'text-foreground truncate text-[13px] font-semibold'
  return to ? (
    <Link
      to={to}
      className={cn(face, 'pointer-coarse:min-h-12 inline-flex items-center hover:underline')}
    >
      {children}
    </Link>
  ) : (
    <span className={face}>{children}</span>
  )
}
