import { Factory, Inbox, Mail, Phone, Pin } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  Kicker,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Skeleton,
} from '@pv/ui'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { toast } from '@/app/toast'
import { dm } from '@/lib/date'
import { contactProfileQuery, useSetPrimaryContact } from '@/data/contacts'

/** A contact's profile — `/sales/contacts/:code`.
 *
 *  ------------------------------------------------------------------
 *  THIS SCREEN DELIBERATELY HAS NO EDIT FORM
 *  ------------------------------------------------------------------
 *  Editing a contact already has exactly one place: the "Contacts" card on
 *  the lead profile, where the form sits next to the company's whole set of
 *  people. Building a second edit form here would be two forms for one row —
 *  the exact thing `ops-fields.tsx` exists to avoid — and the user would edit
 *  on this screen then open the other one to find a different sheet of paper.
 *
 *  So this is a READ screen, plus exactly one operation that needs no form
 *  ("set as primary", which is a button rather than a field), plus three
 *  onward paths. It answers "who is this person, where are they, how do we
 *  reach them" — a question one row in the book has no room to answer.
 *
 *  The edit path still exists, and it goes through exactly the place holding
 *  the form: the "Open lead profile" button. */
export default function ContactDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const canEdit = useCan('lead.sửa')

  const { data: contact, isPending, error } = useQuery(contactProfileQuery(code))
  const promote = useSetPrimaryContact(code, contact?.leadCode)

  if (isPending) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-64 w-full" />
        </ScreenLayout>
      </AppShell>
    )
  }

  if (!contact) {
    /* A code that does not exist and a code outside scope produce the SAME
       404 from the server — deliberate, see `LeadService.guardByContact`. So
       the screen has only one message for both: telling them apart here
       would leak exactly what the server just hid. */
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <ScreenHeader
            kicker="Kinh doanh · Khách hàng"
            title={`Không mở được ${code}`}
            description={
              isApiError(error)
                ? userMessage(error)
                : 'Mã này không có trong sổ, hoặc thuộc một lead không đứng tên bạn.'
            }
            actions={
              <Button size="md" onClick={() => navigate('/sales/contacts')}>
                Về sổ người liên hệ
              </Button>
            }
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  const reach = [
    contact.email !== undefined ? { icon: Mail, label: contact.email } : null,
    contact.phone !== undefined ? { icon: Phone, label: contact.phone } : null,
  ].filter((x) => x !== null)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Kinh doanh · Khách hàng"
          title={contact.name}
          description={contact.title ?? undefined}
          back={{ label: 'Sổ người liên hệ', onClick: () => navigate('/sales/contacts') }}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{contact.code}</Chip>
              {contact.isPrimary && <Badge tone="success">Người liên hệ chính</Badge>}
              {contact.channel !== undefined && <MetaPill>{contact.channel}</MetaPill>}
            </div>
          }
          actions={
            canEdit && !contact.isPrimary ? (
              <Button
                size="md"
                variant="ghost"
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
                <Icon icon={Pin} size={16} />
                Đặt làm người chính
              </Button>
            ) : undefined
          }
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Liên lạc">
            <SectionTitle
              size="sm"
              hint="Hộp thư ở đây là của NGƯỜI này. Luồng gửi thư của hệ dựa vào hộp thư của LEAD, không phải ô này."
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
                <Kicker tone="muted">Ghi chú</Kicker>
                <p className="text-[12px] leading-[1.6]">{contact.note}</p>
              </>
            )}
          </GlassCard>

          <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Bối cảnh">
            <SectionTitle size="sm" hint="Người liên hệ treo dưới LEAD; công ty suy ra từ lead đó.">
              Ở đâu
            </SectionTitle>

            <div className="flex flex-col gap-3">
              <Button
                size="md"
                variant="ghost"
                className="justify-start"
                onClick={() => navigate(`/sales/leads/${contact.leadCode}`)}
              >
                <Icon icon={Inbox} size={16} />
                Hồ sơ lead {contact.leadCode}
              </Button>

              {contact.accountCode !== undefined ? (
                <Button
                  size="md"
                  variant="ghost"
                  className="justify-start"
                  onClick={() => navigate(`/sales/accounts/${contact.accountCode ?? ''}`)}
                >
                  <Icon icon={Factory} size={16} />
                  {contact.accountName ?? contact.company}
                </Button>
              ) : (
                <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                  Lead này chưa được gắn vào công ty nào trong sổ khách, nên chỉ có tên công ty ghi
                  trên chính lead: {contact.company}.
                </p>
              )}
            </div>

            <Kicker tone="muted">Ghi vào sổ</Kicker>
            <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
              {dm(contact.createdAt)} · {contact.by}
            </p>
          </GlassCard>
        </div>
      </ScreenLayout>
    </AppShell>
  )
}
