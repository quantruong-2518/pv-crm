import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pin, Trash2 } from '@pv/ui'
import {
  Badge,
  Button,
  Drawer,
  GlassCard,
  Icon,
  Input,
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
} from '@pv/ui'
import { ContactChannel, ContactPatch, type ContactRow } from '@pv/contracts'
import { type FieldErrors } from '@/app/api'
import { toastDone } from '@/app/toast'
import { fieldErrorsOf } from '@/data/lead-patch'
import { CHANNEL_LABEL } from '@/data/sales-config'
import {
  BLANK_CONTACT,
  changedContactFields,
  contactCreateBodyOf,
  contactDraftOf,
  contactPatchBodyOf,
  leadContactsQuery,
  useAddContact,
  useDropContact,
  useEditContact,
  useSetPrimaryContact,
  type ContactDraft,
} from '@/data/contacts'
import { CommActions, type CommMail } from './comm-actions'
import { Field } from './ops-fields'
import { message, useI18n } from '@/app/i18n'
import { QUIET } from './run/run-person'

/** The "Contacts" card on the lead profile — who we know at this company.
 *
 *  ------------------------------------------------------------------
 *  THE FIVE CONTACT COLUMNS ON `sales.lead` STILL EXIST, AND THIS CARD IS
 *  WHAT WRITES THEM
 *  ------------------------------------------------------------------
 *  Before this sweep, one lead = one person = one mailbox, five flat columns
 *  on the lead table. They are NOT being dropped: `lead.required_filled` and
 *  `optional_filled` are `GENERATED ALWAYS AS … STORED` columns reading
 *  straight from three of those five, and a generated column cannot read
 *  another table — dropping them would kill the init-data gate stone dead
 *  right inside SQL.
 *
 *  What changes is WHO writes them: from now on only one person writes, and
 *  that is the lead's PRIMARY contact. Every write on this card flows down
 *  into those five columns in the same transaction
 *  (`ContactRepository.mirrorOntoLead`). That is why `useAddContact` & co.
 *  also invalidate the lead profile cache — otherwise the screen would print
 *  the old phone number on the main form right next to the new one on this
 *  card.
 *
 *  ------------------------------------------------------------------
 *  "PRIMARY" IS A PROPERTY OF THE WHOLE SET, NOT OF ONE ROW
 *  ------------------------------------------------------------------
 *  So it gets its OWN BUTTON, not a checkbox in the edit form: the operation
 *  touches two rows (demote whoever holds it, promote this one) and only runs
 *  in exactly one order. The contract also cuts `isPrimary` out of
 *  `ContactPatch` entirely so that wrong call cannot even compile.
 *
 *  The FIRST person on a lead automatically becomes primary, decided by the
 *  server — the screen does not guess, because "at least one once someone
 *  exists" is half a rule that no index can state.
 *
 *  Two hints on the form say only what the seller must DO; the reason is here.
 *  A contact's email may be left blank because a mail run reads the LEAD's
 *  mailbox, not this box. The reply-channel field offers the same channel set a
 *  send goes out on — where we reach them and where we write are one list. */
export function ContactsCard({
  code,
  canEdit,
  /** Drawn INSIDE another card's tab: no glass of its own and no title of its
   *  own, because the tab already named it and a card inside a card is the
   *  fifth background layer (law 12). */
  embedded,
  mail,
  hideCommActions = false,
}: {
  code: string
  canEdit: boolean
  embedded?: boolean
  /** The page's mail composer; absent = no mail button on the rows. */
  mail?: CommMail
  /** No call/Zalo/mail per row — the screen's floating bar already holds them. */
  hideCommActions?: boolean
}) {
  const { data, isPending } = useQuery(leadContactsQuery(code))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ContactRow | null>(null)

  const rows = data?.rows ?? []
  const Shell = embedded ? EmbeddedShell : CardShell

  return (
    <Shell>
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => setAdding(true)}
            >
              <Icon icon={Plus} size={16} />
              Thêm người liên hệ
            </Button>
          )}
        </div>
      ) : (
        /* Named like every other card in this column: short noun, count in
           brackets only once there is something to count. */
        <SectionTitle
          size="detail"
          actions={
            canEdit ? (
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => setAdding(true)}
              >
                <Icon icon={Plus} size={16} />
                Thêm
              </Button>
            ) : undefined
          }
        >
          Người liên hệ {rows.length > 0 && `(${rows.length})`}
        </SectionTitle>
      )}

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có người liên hệ. Người đầu tiên là người liên hệ chính.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <ContactLine
              key={c.code}
              row={c}
              leadCode={code}
              canEdit={canEdit}
              mail={mail}
              commActions={!hideCommActions}
              onEdit={() => setEditing(c)}
            />
          ))}
        </ul>
      )}

      <ContactDrawer
        open={adding}
        onClose={() => setAdding(false)}
        leadCode={code}
        row={null}
        first={rows.length === 0}
      />
      <ContactDrawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        leadCode={code}
        row={editing}
        first={false}
      />
    </Shell>
  )
}

/** The two skins of this card, as components rather than a ternary around the
 *  whole body: one JSX tree, two frames. */
function CardShell({ children }: { children: ReactNode }) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Người liên hệ">
      {children}
    </GlassCard>
  )
}

function EmbeddedShell({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4">{children}</div>
}

function ContactLine({
  row,
  leadCode,
  canEdit,
  mail,
  commActions,
  onEdit,
}: {
  row: ContactRow
  leadCode: string
  canEdit: boolean
  mail?: CommMail
  commActions: boolean
  onEdit: () => void
}) {
  const { t } = useI18n()
  const promote = useSetPrimaryContact(row.code, leadCode)
  const drop = useDropContact(row.code, leadCode)

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          className="motion-std pointer-coarse:min-h-12 flex min-w-0 items-center gap-2 text-left text-[12px] enabled:hover:underline"
        >
          <span className="truncate font-semibold">{row.name}</span>
          {row.isPrimary && (
            <Badge tone="success">{t(message('Chính', 'Primary', '주 연락처'))}</Badge>
          )}
        </button>

        {canEdit && (
          <span className="flex shrink-0 items-center gap-1">
            {!row.isPrimary && (
              <Button
                size="sm"
                variant="ghost"
                className={QUIET}
                title={t(
                  message(
                    'Đặt làm người liên hệ chính',
                    'Set as primary contact',
                    '주 연락처로 설정',
                  ),
                )}
                disabled={promote.isPending}
                onClick={() => promote.mutate()}
              >
                <Icon icon={Pin} size={16} />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className={QUIET}
              title={t(message('Xoá người liên hệ', 'Delete contact', '연락처 삭제'))}
              disabled={drop.isPending}
              onClick={() =>
                /* No confirmation dialog, and that is not an oversight: the
                   browser's `confirm` blocks the entire event loop, and
                   building a dedicated Modal for a four-field row is more
                   machinery than it protects. The real guard sits on the
                   server — deleting the PRIMARY contact while others remain
                   is refused with a message pointing the way. */
                drop.mutate()
              }
            >
              <Icon icon={Trash2} size={16} />
            </Button>
          </span>
        )}
      </div>

      <span className="text-muted-foreground text-[11px] leading-[1.5]">
        {[row.title, row.email, row.phone].filter((x) => x !== undefined).join(' · ') ||
          t(
            message(
              'Chưa có kênh liên lạc nào',
              'No contact details yet',
              '연락처 정보가 없습니다',
            ),
          )}
      </span>

      {/* Not gated on `canEdit`: a reader who only reaches the lead through a
          deal still calls and mails it; the server checks reach on the POST. */}
      {commActions && (
        <CommActions
          subject={{ code: leadCode, kind: 'lead' }}
          contact={row}
          mail={mail}
          className="pt-1"
        />
      )}
    </li>
  )
}

const TEXT = {
  theFirstContactIsThe: message(
    'Người đầu tiên là người liên hệ chính.',
    'The first contact is the primary contact.',
    '첫 번째 연락처가 주 연락처가 됩니다.',
  ),
  onlyTheNameIsRequired: message(
    'Chỉ tên là bắt buộc.',
    'Only the name is required.',
    '이름만 필수 항목입니다.',
  ),
  messagesAreSentToThe: message(
    'Thư gửi theo hộp thư của lead.',
    'Messages are sent to the lead’s email address.',
    '메시지는 리드의 이메일 주소로 전송됩니다.',
  ),
}

/** One Drawer for BOTH adding and editing.
 *
 *  Two near-identical popups are two places for the same form to drift apart
 *  — the same reasoning `ops-fields.tsx` exists for. `row === null` is add
 *  mode; the only differences between the two modes are the title, which
 *  mutation runs, and a hint about the primary contact. */
function ContactDrawer({
  open,
  onClose,
  leadCode,
  row,
  first,
}: {
  open: boolean
  onClose: () => void
  leadCode: string
  row: ContactRow | null
  first: boolean
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<ContactDraft>(BLANK_CONTACT)
  const [errors, setErrors] = useState<FieldErrors>({})

  const add = useAddContact(leadCode)
  const edit = useEditContact(row?.code ?? 'CT-0000', leadCode)
  const busy = add.isPending || edit.isPending

  useEffect(() => {
    if (!open) return
    setDraft(row === null ? BLANK_CONTACT : contactDraftOf(row))
    setErrors({})
  }, [open, row])

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const dirty = row === null ? true : changedContactFields(contactDraftOf(row), draft).length > 0
  const ready = draft.name.trim() !== '' && dirty && !busy

  const submit = () => {
    const onError = (e: { errors?: FieldErrors }) => setErrors(e.errors ?? {})
    if (row === null) {
      add.mutate(contactCreateBodyOf(draft), {
        onSuccess: () => {
          toastDone(t(message('Đã thêm người liên hệ', 'Contact added', '연락처를 추가했습니다')))
          onClose()
        },
        onError,
      })
      return
    }
    /* Checked here because the drawer closes before the server answers. */
    const parsed = ContactPatch.safeParse(contactPatchBodyOf(draft))
    if (!parsed.success) return setErrors(fieldErrorsOf(parsed.error.issues))
    edit.mutate(parsed.data)
    onClose()
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={
        row === null
          ? t(message('Thêm người liên hệ', 'Add contact', '연락처 추가'))
          : t(message(`Sửa ${row.name}`, `Edit ${row.name}`, `${row.name} 수정`))
      }
      subtitle={
        row === null && first ? t(TEXT.theFirstContactIsThe) : t(TEXT.onlyTheNameIsRequired)
      }
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button size="md" variant="ghost" onClick={onClose}>
            {t(message('Đóng', 'Close', '닫기'))}
          </Button>
          <Button size="md" disabled={!ready} onClick={submit}>
            {busy
              ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
              : t(message('Lưu', 'Save', '저장'))}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <Field label={t(message('Tên', 'Name', '이름'))} required errors={errors.name}>
          <Input
            value={draft.name}
            maxLength={120}
            aria-label={t(message('Tên người liên hệ', 'Contact name', '연락처 이름'))}
            aria-required
            invalid={Boolean(errors.name)}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <Field label={t(message('Chức danh', 'Job title', '직함'))} errors={errors.title}>
          <Input
            value={draft.title}
            maxLength={120}
            aria-label={t(message('Chức danh', 'Job title', '직함'))}
            invalid={Boolean(errors.title)}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>

        <Field label="Email" errors={errors.email} hint={t(TEXT.messagesAreSentToThe)}>
          <Input
            type="email"
            value={draft.email}
            aria-label={t(message('Email người liên hệ', 'Contact email', '연락처 이메일'))}
            invalid={Boolean(errors.email)}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <Field label={t(message('Điện thoại', 'Phone', '전화번호'))} errors={errors.phone}>
          <Input
            value={draft.phone}
            aria-label={t(message('Điện thoại', 'Phone', '전화번호'))}
            invalid={Boolean(errors.phone)}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>

        <Field
          label={t(message('Kênh hay trả lời', 'Preferred channel', '선호 연락 채널'))}
          plain
          errors={errors.channel}
        >
          <Select
            label={t(message('Kênh hay trả lời', 'Preferred channel', '선호 연락 채널'))}
            hideLabel
            value={draft.channel}
            neutralValue=""
            onChange={(v) => set('channel', v)}
            options={[
              { value: '', label: t(message('Chưa biết', 'Not known', '알 수 없음')) },
              /* The wire key is not a label: `zalo-oa` and `in-app` are stored
                 keys. One table for every channel name in the app. */
              ...ContactChannel.options.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
            ]}
            className="w-full"
          />
        </Field>

        <Field label={t(message('Ghi chú', 'Notes', '메모'))} errors={errors.note}>
          <Textarea
            autoGrow
            rows={3}
            maxLength={500}
            value={draft.note}
            aria-label={t(message('Ghi chú về người liên hệ', 'Contact notes', '연락처 메모'))}
            invalid={Boolean(errors.note)}
            onChange={(e) => set('note', e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  )
}

/** The edit drawer alone, for screens outside the lead card. Same form, so a
 *  person is edited in one place; `row` is always a stored person, never add mode. */
export function ContactEditDrawer({
  open,
  onClose,
  leadCode,
  row,
}: {
  open: boolean
  onClose: () => void
  leadCode: string
  row: ContactRow
}) {
  return <ContactDrawer open={open} onClose={onClose} leadCode={leadCode} row={row} first={false} />
}
