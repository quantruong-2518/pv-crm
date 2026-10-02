import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Save, X } from '@pv/ui'
import { Button, Drawer, Icon, cn } from '@pv/ui'
import type {
  OpportunityContactPick,
  OpportunityOpenContext,
  OpportunityProfileResponse,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { leadContactsQuery } from '@/data/contacts'
import { useSaveDealContacts } from '@/data/opportunities-write'
import { ContactsSection } from '@/components/open-deal-contacts'

/** Module 3 · edit who on the customer's side the deal is about —
 *  `PUT …/:code/contacts` (ADR 0076 §2): at least one, exactly one primary,
 *  the same pick rules and list as the open-deal drawer.
 *
 *  Candidates are the deal's own people plus the lead's; account-wide people
 *  are offered only by the create door's context read (`opportunity.create`),
 *  so they are not here yet. Remounted per opening by the parent (`key`). */

type Candidate = OpportunityOpenContext['contacts'][number]

export function ContactsEditDrawer({
  op,
  open,
  onClose,
}: {
  op: OpportunityProfileResponse
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const save = useSaveDealContacts(op.code)
  const { data: leadPeople } = useQuery({ ...leadContactsQuery(op.leadCode), enabled: open })
  const [picks, setPicks] = useState<OpportunityContactPick[]>(() =>
    op.contacts.map((c) => ({ contactCode: c.code, role: c.role, primary: c.primary })),
  )

  const candidates = useMemo<Candidate[]>(() => {
    const own = op.contacts.map((c) => ({
      code: c.code,
      name: c.name,
      title: c.title,
      source: 'lead' as const,
    }))
    const more = (leadPeople?.rows ?? [])
      .filter((row) => !own.some((c) => c.code === row.code))
      .map((row) => ({
        code: row.code,
        name: row.name,
        title: row.title ?? null,
        source: 'lead' as const,
      }))
    return [...own, ...more]
  }, [op.contacts, leadPeople])

  const bare = picks.length === 0
  const refusal = op.acts.editDetails.ok ? null : op.acts.editDetails.reason
  const line = save.error
    ? userMessage(save.error)
    : (refusal ?? (bare ? 'Chọn ít nhất một người liên hệ.' : 'Đúng một người là liên hệ chính.'))

  const submit = () =>
    save.mutate(
      { contacts: picks },
      {
        onSuccess: () => {
          toastDone(`Đã lưu người liên hệ của ${op.code}.`)
          onClose()
        },
      },
    )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Sửa người liên hệ"
      subtitle={
        <>
          <span className="font-mono">{op.code}</span> · {op.account}
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            aria-live="polite"
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              save.error || refusal || bare
                ? 'text-destructive-foreground'
                : 'text-muted-foreground',
            )}
          >
            {line}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" disabled={save.isPending} onClick={onClose}>
              <Icon icon={X} size={16} />
              Huỷ
            </Button>
            <Button
              size="lg"
              disabled={bare || refusal !== null || save.isPending}
              onClick={submit}
            >
              <Icon icon={Save} size={16} />
              {save.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </div>
      }
    >
      <ContactsSection
        contacts={candidates}
        picks={picks}
        errors={save.error?.errors?.contacts}
        onPicks={setPicks}
        onOpenLead={() => navigate(`/sales/leads/${op.leadCode}`)}
      />
    </Drawer>
  )
}
