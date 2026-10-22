import { useState } from 'react'
import { Check, Factory, Mail, Phone, Pencil } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, GlassCard, Icon, SectionTitle, type RailObject } from '@pv/ui'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toast } from '@/app/toast'
import { dm } from '@/lib/date'
import { ContactEditDrawer } from '@/components/contacts-card'
import { contactProfileQuery, useSetPrimaryContact } from '@/data/contacts'
import { RecordShell } from '@/components/record/record-shell'
import { RecordHeader } from '@/components/record/record-header'
import { ContextStrip } from '@/components/record/run-strip'

/** A contact's profile — `/sales/contacts/:code`, on the record shell without
 *  the run parts (ADR 0078): the body says how to reach them, the rail where.
 *
 *  ONE EDIT FORM, REUSED. The form is the lead card's drawer (`ContactDrawer`
 *  in contacts-card.tsx), opened here through `ContactEditDrawer`: a second
 *  form would be two forms for one row. The header holds the two moves, edit
 *  and "set as primary"; the second needs no form (ADR 0078, amendment 14/10).
 *  No floating bar: nobody is reached from here. */
export default function ContactDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const canEdit = useCan('lead.edit')
  const [editing, setEditing] = useState(false)

  const { data: contact, isPending, error } = useQuery(contactProfileQuery(code))
  const promote = useSetPrimaryContact(code, contact?.leadCode)

  if (!contact) {
    /* A code that does not exist and a code outside scope produce the SAME
       404 from the server (`LeadService.guardByContact`), so one sentence
       covers both: telling them apart would leak what the server just hid. */
    return (
      <AppShell {...chrome.shell}>
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: `Không mở được ${code}. Mã không có trong sổ, hoặc lead không do bạn phụ trách.`,
            fallback: `Không mở được ${code}.`,
            back: { label: 'Về sổ người liên hệ', onClick: () => navigate('/sales/contacts') },
          }}
        />
      </AppShell>
    )
  }

  const reach = [
    contact.email !== undefined ? { icon: Mail, label: contact.email } : null,
    contact.phone !== undefined ? { icon: Phone, label: contact.phone } : null,
  ].filter((x) => x !== null)
  /* Company → lead → this contact: the lead holds the person, the company the lead. */
  const chain: RailObject[] = [
    ...(contact.accountCode !== undefined
      ? [
          {
            code: contact.accountCode,
            onOpen: () => navigate(`/sales/accounts/${contact.accountCode ?? ''}`),
          },
        ]
      : []),
    { code: contact.leadCode, onOpen: () => navigate(`/sales/leads/${contact.leadCode}`) },
    { code: contact.code, source: true },
  ]

  return (
    <AppShell {...chrome.shell}>
      <RecordShell
        strip={<ContextStrip objects={chain} />}
        header={
          <RecordHeader
            title={contact.name}
            actions={
              canEdit && (
                <>
                  <Button size="lg" variant="ghost" onClick={() => setEditing(true)}>
                    <Icon icon={Pencil} size={16} />
                    Sửa
                  </Button>
                  {!contact.isPrimary && (
                    <Button
                      size="lg"
                      disabled={promote.isPending}
                      onClick={() =>
                        promote.mutate(undefined, {
                          onSuccess: () =>
                            toast('Đã đổi người liên hệ chính', {
                              tone: 'success',
                              detail: contact.name,
                            }),
                          onError: (e) => toast(userMessage(e), { tone: 'danger' }),
                        })
                      }
                    >
                      <Icon icon={Check} size={16} />
                      {promote.isPending ? 'Đang lưu…' : 'Đặt làm người chính'}
                    </Button>
                  )}
                </>
              )
            }
          />
        }
        main={
          <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Liên lạc">
            <SectionTitle size="sm" hint="Thư gửi tới email của lead.">
              Gọi thế nào
            </SectionTitle>

            {reach.length === 0 ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chưa có email hay số điện thoại.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {reach.map((r) => (
                  <li key={r.label} className="flex items-center gap-2 text-[12px]">
                    <Icon icon={r.icon} size={16} className="text-muted-foreground" />
                    <span className="truncate">{r.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {contact.note !== undefined && (
              <>
                <span className="text-muted-foreground text-[12px] leading-[1.5]">Ghi chú</span>
                <p className="text-[12px] leading-[1.6]">{contact.note}</p>
              </>
            )}
          </GlassCard>
        }
        rail={
          <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Bối cảnh">
            <SectionTitle size="sm" hint="Công ty lấy theo lead.">
              Ở đâu
            </SectionTitle>

            {contact.accountCode !== undefined ? (
              <p className="flex items-center gap-2 text-[12px] leading-[1.5]">
                <Icon icon={Factory} size={16} className="text-muted-foreground" />
                {contact.accountName ?? contact.company}
              </p>
            ) : (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Lead chưa gắn với công ty trong sổ. Tên công ty ghi trên lead: {contact.company}.
              </p>
            )}

            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Ghi vào sổ {dm(contact.createdAt)} · {contact.by}
            </p>
          </GlassCard>
        }
      />
      <ContactEditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        leadCode={contact.leadCode}
        row={contact}
      />
    </AppShell>
  )
}
