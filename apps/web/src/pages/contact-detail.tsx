import { Factory, Mail, Phone } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, GlassCard, Icon, SectionTitle, type RailObject } from '@pv/ui'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toast } from '@/app/toast'
import { dm } from '@/lib/date'
import { contactProfileQuery, useSetPrimaryContact } from '@/data/contacts'
import { ActionBar } from '@/components/record/action-bar'
import { RecordShell } from '@/components/record/record-shell'
import { RecordHeader } from '@/components/record/record-header'
import { ContextStrip } from '@/components/record/run-strip'

/** A contact's profile — `/sales/contacts/:code`, on the record shell without
 *  the run parts (ADR 0078): the body says how to reach them, the rail where.
 *
 *  NO EDIT FORM, ON PURPOSE. Editing a contact has exactly one place: the
 *  contacts card on the lead profile, next to the company's whole set of
 *  people. A second form here would be two forms for one row — the thing
 *  `ops-fields.tsx` exists to avoid. The edit path is the lead chip in the strip.
 *
 *  So this is a READ screen plus one operation that needs no form, "set as
 *  primary". A contact has no ladder to climb, so it sits in the floating
 *  bar's more menu rather than as a todo card's primary. */
export default function ContactDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const canEdit = useCan('lead.edit')

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
            notFound: `Không mở được ${code}: mã này không có trong sổ, hoặc thuộc một lead không đứng tên bạn.`,
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
            meta={[contact.title, contact.isPrimary && 'Người liên hệ chính', contact.channel]}
          />
        }
        main={
          <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Liên lạc">
            <SectionTitle
              size="sm"
              hint="Hộp thư ở đây là của người này. Luồng gửi thư của hệ dựa vào hộp thư của lead, không phải ô này."
            >
              Gọi thế nào
            </SectionTitle>

            {reach.length === 0 ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Chưa xin được email hay số điện thoại. Một người mình đã gặp mà chưa có kênh liên
                lạc vẫn là một dòng đáng giữ — đó là lý do cả hai ô đều không bắt buộc.
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
            <SectionTitle size="sm" hint="Người liên hệ treo dưới lead; công ty suy ra từ lead đó.">
              Ở đâu
            </SectionTitle>

            {contact.accountCode !== undefined ? (
              <p className="flex items-center gap-2 text-[12px] leading-[1.5]">
                <Icon icon={Factory} size={16} className="text-muted-foreground" />
                {contact.accountName ?? contact.company}
              </p>
            ) : (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                Lead này chưa được gắn vào công ty nào trong sổ khách, nên chỉ có tên công ty ghi
                trên chính lead: {contact.company}.
              </p>
            )}

            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Ghi vào sổ {dm(contact.createdAt)} · {contact.by}
            </p>
          </GlassCard>
        }
        actionBar={
          <ActionBar
            label="Thao tác người liên hệ"
            more={
              canEdit && !contact.isPrimary
                ? [
                    {
                      key: 'primary',
                      label: 'Đặt làm người chính',
                      ...(promote.isPending ? { blocked: 'Đang lưu…' } : {}),
                      onSelect: () =>
                        promote.mutate(undefined, {
                          onSuccess: () =>
                            toast('Đã đổi người liên hệ chính', {
                              tone: 'success',
                              detail: contact.name,
                            }),
                          onError: (e) => toast(userMessage(e), { tone: 'danger' }),
                        }),
                    },
                  ]
                : []
            }
          />
        }
      />
    </AppShell>
  )
}
