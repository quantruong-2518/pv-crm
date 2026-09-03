import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pin, Trash2, Users } from '@pv/ui'
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
import { ContactChannel, type ContactRow } from '@pv/contracts'
import { userMessage, type FieldErrors } from '@/app/api'
import { toast } from '@/app/toast'
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
import { Field } from './ops-fields'

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
 *  exists" is half a rule that no index can state. */
export function ContactsCard({ code, canEdit }: { code: string; canEdit: boolean }) {
  const { data, isPending } = useQuery(leadContactsQuery(code))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ContactRow | null>(null)

  const rows = data?.rows ?? []

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Người liên hệ">
      <SectionTitle
        size="sm"
        hint="Người ĐẦU danh sách là người chính — hồ sơ lead in tên và số của họ."
        actions={
          canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
              <Icon icon={Plus} size={16} />
              Thêm
            </Button>
          ) : undefined
        }
      >
        <span className="flex items-center gap-2">
          <Icon icon={Users} size={16} />
          Người liên hệ · {rows.length}
        </span>
      </SectionTitle>

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa ghi được ai ở công ty này. Người đầu tiên bạn thêm tự thành người liên hệ chính.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((c) => (
            <ContactLine
              key={c.code}
              row={c}
              leadCode={code}
              canEdit={canEdit}
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
    </GlassCard>
  )
}

function ContactLine({
  row,
  leadCode,
  canEdit,
  onEdit,
}: {
  row: ContactRow
  leadCode: string
  canEdit: boolean
  onEdit: () => void
}) {
  const promote = useSetPrimaryContact(row.code, leadCode)
  const drop = useDropContact(row.code, leadCode)

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          className="motion-std flex min-w-0 items-center gap-2 text-left text-[12px] enabled:hover:underline"
        >
          <span className="truncate font-semibold">{row.name}</span>
          {row.isPrimary && <Badge tone="success">Chính</Badge>}
        </button>

        {canEdit && (
          <span className="flex shrink-0 items-center gap-1">
            {!row.isPrimary && (
              <Button
                size="sm"
                variant="ghost"
                title="Đặt làm người liên hệ chính"
                disabled={promote.isPending}
                onClick={() =>
                  promote.mutate(undefined, {
                    onError: (e) => toast(userMessage(e), { tone: 'danger' }),
                  })
                }
              >
                <Icon icon={Pin} size={14} />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              title="Xoá người liên hệ"
              disabled={drop.isPending}
              onClick={() =>
                /* No confirmation dialog, and that is not an oversight: the
                   browser's `confirm` blocks the entire event loop, and
                   building a dedicated Modal for a four-field row is more
                   machinery than it protects. The real guard sits on the
                   server — deleting the PRIMARY contact while others remain
                   is refused with a message pointing the way. */
                drop.mutate(undefined, {
                  onError: (e) => toast(userMessage(e), { tone: 'danger' }),
                })
              }
            >
              <Icon icon={Trash2} size={14} />
            </Button>
          </span>
        )}
      </div>

      <span className="text-muted-foreground text-[11px] leading-[1.5]">
        {[row.title, row.email, row.phone].filter((x) => x !== undefined).join(' · ') ||
          'Chưa có kênh liên lạc nào'}
      </span>
    </li>
  )
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
      add.mutate(contactCreateBodyOf(draft), { onSuccess: onClose, onError })
    } else {
      edit.mutate(contactPatchBodyOf(draft), { onSuccess: onClose, onError })
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={row === null ? 'Thêm người liên hệ' : `Sửa ${row.name}`}
      subtitle={
        row === null && first
          ? 'Đây là người đầu tiên của lead này, nên hệ sẽ đặt họ làm người liên hệ chính.'
          : 'Chỉ TÊN là bắt buộc — một người mình chưa xin được số vẫn là một người đã gặp.'
      }
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button size="md" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button size="md" disabled={!ready} onClick={submit}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-5 lg:p-6">
        <Field label="Tên" required errors={errors.name}>
          <Input
            value={draft.name}
            maxLength={120}
            aria-label="Tên người liên hệ"
            aria-required
            invalid={Boolean(errors.name)}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <Field label="Chức danh" errors={errors.title}>
          <Input
            value={draft.title}
            maxLength={120}
            aria-label="Chức danh"
            invalid={Boolean(errors.title)}
            onChange={(e) => set('title', e.target.value)}
          />
        </Field>

        <Field
          label="Email"
          errors={errors.email}
          hint="Bỏ trống được — hộp thư của LEAD là thứ luồng gửi thư dựa vào, không phải ô này."
        >
          <Input
            type="email"
            value={draft.email}
            aria-label="Email người liên hệ"
            invalid={Boolean(errors.email)}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>

        <Field label="Điện thoại" errors={errors.phone}>
          <Input
            value={draft.phone}
            aria-label="Điện thoại"
            invalid={Boolean(errors.phone)}
            onChange={(e) => set('phone', e.target.value)}
          />
        </Field>

        <Field
          label="Kênh hay trả lời"
          plain
          errors={errors.channel}
          hint="Cùng bộ kênh mà một đợt gửi bắn qua — 'gặp được ở đâu' và 'gửi qua đâu' là một danh sách."
        >
          <Select
            label="Kênh hay trả lời"
            hideLabel
            value={draft.channel}
            neutralValue=""
            onChange={(v) => set('channel', v)}
            options={[
              { value: '', label: 'Chưa biết' },
              ...ContactChannel.options.map((c) => ({ value: c, label: c })),
            ]}
            className="w-full"
          />
        </Field>

        <Field label="Ghi chú" errors={errors.note}>
          <Textarea
            autoGrow
            rows={3}
            maxLength={500}
            value={draft.note}
            aria-label="Ghi chú về người liên hệ"
            invalid={Boolean(errors.note)}
            onChange={(e) => set('note', e.target.value)}
          />
        </Field>
      </div>
    </Drawer>
  )
}
