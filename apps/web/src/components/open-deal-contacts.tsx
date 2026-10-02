import { Check } from '@pv/ui'
import { Button, Checkbox, Icon, Select, cn } from '@pv/ui'
import {
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  OpportunityContactRole,
  type OpportunityContactPick,
  type OpportunityOpenContext,
} from '@pv/contracts'
import { primaryPick, rolePick, toggledPick } from '@/data/opportunity-open'
import { SectionHead } from './open-deal-basics'

/** The customer-side section: who on the customer's side this deal is about.
 *
 *  Required, at least one, exactly one primary. The list is read-only context
 *  from the server (the lead's own people and the account's); creating a
 *  contact is a different door and stays on the lead profile. */

const NO_ROLE = ''
/** Also the run rail's line for a deal contact with no role. */
export const NO_ROLE_LABEL = 'Chưa nêu vai'
const ROLE_OPTIONS = [
  { value: NO_ROLE, label: NO_ROLE_LABEL },
  ...Object.entries(OPPORTUNITY_CONTACT_ROLE_LABEL).map(([value, label]) => ({ value, label })),
]

export function ContactsSection({
  contacts,
  picks,
  errors,
  onPicks,
  onOpenLead,
}: {
  contacts: OpportunityOpenContext['contacts']
  picks: OpportunityContactPick[]
  errors?: string[]
  onPicks: (next: OpportunityContactPick[]) => void
  onOpenLead: () => void
}) {
  const refusal = errors?.join(' · ')
  const bare = picks.length === 0 && contacts.length > 0

  return (
    <section className="flex flex-col gap-3" aria-label="Phía khách">
      <SectionHead
        note={
          refusal ? (
            <span className="text-destructive-foreground">{refusal}</span>
          ) : bare ? (
            <span className="text-destructive-foreground">chưa chọn người liên hệ nào</span>
          ) : (
            'ít nhất một người liên hệ'
          )
        }
      >
        Phía khách
      </SectionHead>

      {contacts.length === 0 ? (
        <NoContacts onOpenLead={onOpenLead} />
      ) : (
        <ul
          className={cn(
            'm-0 flex list-none flex-col gap-1 rounded-md p-0',
            (bare || refusal) &&
              'shadow-[0_0_0_2px_color-mix(in_srgb,var(--destructive)_50%,transparent)]',
          )}
        >
          {contacts.map((contact) => {
            const pick = picks.find((p) => p.contactCode === contact.code)
            return (
              <li key={contact.code} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Checkbox
                  checked={Boolean(pick)}
                  onChange={() => onPicks(toggledPick(picks, contact.code))}
                  label={contact.name}
                  hint={
                    [contact.title, contact.source === 'account' ? 'từ công ty' : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  className="pointer-coarse:min-h-12 min-w-[12rem] flex-1"
                />
                {pick && (
                  <PickControls
                    name={contact.name}
                    pick={pick}
                    onRole={(role) => onPicks(rolePick(picks, contact.code, role))}
                    onPrimary={() => onPicks(primaryPick(picks, contact.code))}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PickControls({
  name,
  pick,
  onRole,
  onPrimary,
}: {
  name: string
  pick: OpportunityContactPick
  onRole: (role: OpportunityContactPick['role']) => void
  onPrimary: () => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      <Select
        label={`Vai của ${name}`}
        hideLabel
        value={pick.role ?? NO_ROLE}
        neutralValue={NO_ROLE}
        options={ROLE_OPTIONS}
        onChange={(v) => onRole(v === NO_ROLE ? null : OpportunityContactRole.parse(v))}
        className="pointer-coarse:[&>button]:h-12 w-44"
      />
      {pick.primary ? (
        <span className="text-success flex w-24 items-center gap-1 text-[12px] font-medium">
          <Icon icon={Check} size={16} />
          Chính
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12 w-24"
          aria-label={`Đặt ${name} làm người liên hệ chính`}
          onClick={onPrimary}
        >
          Đặt chính
        </Button>
      )}
    </span>
  )
}

/** Submit stays blocked while this shows. The way out is the lead's own
 *  contact card, one step away — never a second contact form in the drawer. */
function NoContacts({ onOpenLead }: { onOpenLead: () => void }) {
  return (
    <div className="bg-surface-ink/9 flex flex-wrap items-center gap-3 rounded-md px-4 py-3">
      <p className="text-muted-foreground m-0 min-w-0 flex-1 text-[12.5px] leading-[1.6]">
        Lead này chưa có người liên hệ nào, và công ty cũng chưa có ai để chọn. Thêm người ở thẻ
        Người liên hệ trên hồ sơ lead, rồi mở lại phiếu.
      </p>
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onOpenLead}>
        Mở hồ sơ lead
      </Button>
    </div>
  )
}
