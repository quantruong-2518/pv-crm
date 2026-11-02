import { useState } from 'react'
import { Check, Factory, Mail, Phone, Pencil } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell, Button, GlassCard, Icon, SectionTitle, type RailObject } from '@pv/ui'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import { ContactEditDrawer } from '@/components/contacts-card'
import type { ContactBookRow } from '@pv/contracts'
import { contactProfileQuery, useSetPrimaryContact } from '@/data/contacts'
import { RecordShell } from '@/components/record/record-shell'
import { RecordHeader } from '@/components/record/record-header'
import { ContextStrip } from '@/components/record/run-strip'

const TEXT = {
  setAsPrimaryContact: message('Đặt làm người chính', 'Set as primary contact', '주 연락처로 설정'),
  emailIsSentToThe: message(
    'Thư gửi tới email của lead.',
    'Email is sent to the lead email address.',
    '이메일은 리드의 이메일 주소로 전송됩니다.',
  ),
  noEmailOrPhoneNumber: message(
    'Chưa có email hay số điện thoại.',
    'No email or phone number yet.',
    '아직 이메일이나 전화번호가 없습니다.',
  ),
  companyInformationComesFromThe: message(
    'Công ty lấy theo lead.',
    'Company information comes from the lead.',
    '회사 정보는 리드에서 가져옵니다.',
  ),
}

/** Shown when the read fails or the code is not in scope. */
function ContactNotFound(props: { code: string; pending: boolean; error: unknown }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { code, pending, error } = props
  return (
    <RecordShell
      pending={pending}
      failure={{
        error,
        notFound: t(
          message(
            `Không mở được ${code}. Mã không có trong sổ, hoặc lead không do bạn phụ trách.`,
            `Could not open ${code}. It is missing or its lead is outside your scope.`,
            `${code}을(를) 열 수 없습니다. 목록에 없거나 담당 리드 범위 밖입니다.`,
          ),
        ),
        fallback: t(
          message(
            `Không mở được ${code}.`,
            `Could not open ${code}.`,
            `${code}을(를) 열 수 없습니다.`,
          ),
        ),
        back: {
          label: t(message('Về sổ người liên hệ', 'Back to contacts', '연락처 목록으로')),
          onClick: () => navigate('/sales/contacts'),
        },
      }}
    />
  )
}

/** The rail card: which company the contact belongs to and when it was added. */
function ContactRail({ contact }: { contact: ContactBookRow }) {
  const { t } = useI18n()
  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-5 lg:p-6"
      aria-label={t(message('Bối cảnh', 'Context', '정보'))}
    >
      <SectionTitle size="sm" hint={t(TEXT.companyInformationComesFromThe)}>
        {t(message('Công ty', 'Company', '회사'))}
      </SectionTitle>

      {contact.accountCode !== undefined ? (
        <p className="flex items-center gap-2 text-[12px] leading-[1.5]">
          <Icon icon={Factory} size={16} className="text-muted-foreground" />
          {contact.accountName ?? contact.company}
        </p>
      ) : (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {t(
            message(
              `Lead chưa gắn với công ty trong sổ. Tên công ty ghi trên lead: ${contact.company}.`,
              `This lead is not linked to a company record. Company name on the lead: ${contact.company}.`,
              `리드가 회사 정보와 연결되지 않았습니다. 리드에 입력된 회사명: ${contact.company}.`,
            ),
          )}
        </p>
      )}

      <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
        {t(
          message(
            `Thêm vào sổ ngày ${dm(contact.createdAt)} · ${contact.by}`,
            `Added ${dm(contact.createdAt)} · ${contact.by}`,
            `${dm(contact.createdAt)} 추가 · ${contact.by}`,
          ),
        )}
      </p>
    </GlassCard>
  )
}

/** A contact's profile — `/sales/contacts/:code`, on the record shell without
 *  the run parts (ADR 0078): the body says how to reach them, the rail where.
 *
 *  ONE EDIT FORM, REUSED. The form is the lead card's drawer (`ContactDrawer`
 *  in contacts-card.tsx), opened here through `ContactEditDrawer`: a second
 *  form would be two forms for one row. The header holds the two moves, edit
 *  and "set as primary"; the second needs no form (ADR 0078, amendment 14/10).
 *  No floating bar: nobody is reached from here. */
export default function ContactDetailPage() {
  const { t } = useI18n()
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
        <ContactNotFound code={code} pending={isPending} error={error} />
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
                    {t(message('Sửa', 'Edit', '수정'))}
                  </Button>
                  {!contact.isPrimary && (
                    <Button size="lg" disabled={promote.isPending} onClick={() => promote.mutate()}>
                      <Icon icon={Check} size={16} />
                      {promote.isPending
                        ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
                        : t(TEXT.setAsPrimaryContact)}
                    </Button>
                  )}
                </>
              )
            }
          />
        }
        main={
          <GlassCard
            className="flex flex-col gap-4 p-5 lg:p-6"
            aria-label={t(message('Thông tin liên hệ', 'Contact information', '연락처 정보'))}
          >
            <SectionTitle size="sm" hint={t(TEXT.emailIsSentToThe)}>
              {t(message('Liên hệ', 'Contact', '연락처'))}
            </SectionTitle>

            {reach.length === 0 ? (
              <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
                {t(TEXT.noEmailOrPhoneNumber)}
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
                <span className="text-muted-foreground text-[12px] leading-[1.5]">
                  {t(message('Ghi chú', 'Note', '메모'))}
                </span>
                <p className="text-[12px] leading-[1.6]">{contact.note}</p>
              </>
            )}
          </GlassCard>
        }
        rail={<ContactRail contact={contact} />}
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
