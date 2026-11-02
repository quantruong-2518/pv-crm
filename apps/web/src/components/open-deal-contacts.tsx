import { Check } from '@pv/ui'
import { Button, Checkbox, Icon, Select, cn } from '@pv/ui'
import {
  OpportunityContactRole,
  type OpportunityContactPick,
  type OpportunityOpenContext,
} from '@pv/contracts'
import { primaryPick, rolePick, toggledPick } from '@/data/opportunity-open'
import { useI18n, message } from '@/app/i18n'
import { opportunityContactRoleLabel } from '@/data/sales-labels-i18n'
import { SectionHead } from './open-deal-basics'

/** The customer-side section: who on the customer's side this deal is about.
 *
 *  Required, at least one, exactly one primary. The list is read-only context
 *  from the server (the lead's own people and the account's); creating a
 *  contact is a different door and stays on the lead profile. */

const NO_ROLE = ''
/** Also the run rail's line for a deal contact with no role. */
export const NO_ROLE_LABEL = 'Chưa nêu vai' // i18n-ignore
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
  const { t, lang } = useI18n()
  const roleOptions = [
    { value: NO_ROLE, label: t(message(NO_ROLE_LABEL, 'Role not specified', '역할 미지정')) },
    ...OpportunityContactRole.options.map((role) => ({
      value: role,
      label: opportunityContactRoleLabel(role, lang),
    })),
  ]
  const refusal = errors?.join(' · ')
  const bare = picks.length === 0 && contacts.length > 0

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t(message('Phía khách', 'Customer side', '고객 측'))}
    >
      <SectionHead
        note={
          refusal ? (
            <span className="text-destructive-foreground">{refusal}</span>
          ) : bare ? (
            <span className="text-destructive-foreground">
              {t(
                message(
                  'chưa chọn người liên hệ nào',
                  'no contact selected',
                  '선택한 연락처가 없습니다',
                ),
              )}
            </span>
          ) : (
            t(message('ít nhất một người liên hệ', 'at least one contact', '연락처 한 명 이상'))
          )
        }
      >
        {t(message('Phía khách', 'Customer side', '고객 측'))}
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
                    [
                      contact.title,
                      contact.source === 'account'
                        ? t(message('từ công ty', 'from company', '회사 소속'))
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  className="pointer-coarse:min-h-12 min-w-[12rem] flex-1"
                />
                {pick && (
                  <PickControls
                    pick={pick}
                    roleOptions={roleOptions}
                    primaryLabel={t(message('Chính', 'Primary', '주 담당'))}
                    roleAria={t(
                      message(
                        `Vai của ${contact.name}`,
                        `Role for ${contact.name}`,
                        `${contact.name} 역할`,
                      ),
                    )}
                    primaryAria={t(
                      message(
                        `Đặt ${contact.name} làm người liên hệ chính`,
                        `Set ${contact.name} as the primary contact`,
                        `${contact.name}님을 주 연락처로 지정`,
                      ),
                    )}
                    setPrimaryLabel={t(message('Đặt chính', 'Set primary', '주 담당 지정'))}
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
  pick,
  roleOptions,
  primaryLabel,
  roleAria,
  primaryAria,
  setPrimaryLabel,
  onRole,
  onPrimary,
}: {
  pick: OpportunityContactPick
  roleOptions: { value: string; label: string }[]
  primaryLabel: string
  roleAria: string
  primaryAria: string
  setPrimaryLabel: string
  onRole: (role: OpportunityContactPick['role']) => void
  onPrimary: () => void
}) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      <Select
        label={roleAria}
        hideLabel
        value={pick.role ?? NO_ROLE}
        neutralValue={NO_ROLE}
        options={roleOptions}
        onChange={(v) => onRole(v === NO_ROLE ? null : OpportunityContactRole.parse(v))}
        className="pointer-coarse:[&>button]:h-12 w-44"
      />
      {pick.primary ? (
        <span className="text-success flex w-24 items-center gap-1 text-[12px] font-medium">
          <Icon icon={Check} size={16} />
          {primaryLabel}
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12 w-24"
          aria-label={primaryAria}
          onClick={onPrimary}
        >
          {setPrimaryLabel}
        </Button>
      )}
    </span>
  )
}

/** Submit stays blocked while this shows. The way out is the lead's own
 *  contact card, one step away — never a second contact form in the drawer. */
function NoContacts({ onOpenLead }: { onOpenLead: () => void }) {
  const { t } = useI18n()
  return (
    <div className="bg-surface-ink/9 flex flex-wrap items-center gap-3 rounded-md px-4 py-3">
      <p className="text-muted-foreground m-0 min-w-0 flex-1 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Lead này chưa có người liên hệ. Thêm người ở thẻ Người liên hệ trong hồ sơ lead.',
            'This lead has no contacts yet. Add one in the Contacts card of the lead profile.',
            '이 리드에는 아직 연락처가 없습니다. 리드 프로필의 연락처 카드에서 추가하세요.',
          ),
        )}
      </p>
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onOpenLead}>
        {t(message('Mở hồ sơ lead', 'Open lead profile', '리드 프로필 열기'))}
      </Button>
    </div>
  )
}
