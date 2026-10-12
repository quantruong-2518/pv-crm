import type { ReactNode } from 'react'
import { Avatar, Button, Icon, Modal, Textarea, cn, type IconGlyph } from '@pv/ui'
import { OPPORTUNITY_SALE_PRIMARY_REASON_MAX, isSellerRole } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { useSalesPeople } from '@/data/directory'
import { SALE_PRIMARY_LABEL, toggled } from '@/data/opportunities'
import { PersonTokenField } from './person-token-field'
import { SalePrimaryPick } from './sale-primary-pick'
import { Field } from './ops-fields'

/** Module 3 · the seller picker in a modal — shared by the accept act (adds to
 *  the SALE lane) and the assign act (replaces it), ADR 0071.
 *
 *  Suggests only `isSellerRole` people, the ones the server takes on that lane.
 *  A token already on the lane stays drawn even when its owner is not a seller
 *  (a migrated head), so nobody is dropped without a visible tap. The caller
 *  owns the list, the door and the sentence under it; this owns the shape.
 *  `primary` adds the lane's primary choice (ADR 0086) under the picker.
 *  `pending` is a deal with a sign request waiting: the people are shown but
 *  frozen, and the primary change carries a reason (ADR 0086 §2). */

export function SellerModal({
  open,
  onClose,
  title,
  subtitle,
  fieldLabel,
  fieldHint,
  sellers,
  onChange,
  names,
  primary,
  pending,
  note,
  error,
  busy,
  submitDisabled = false,
  icon,
  submitLabel,
  busyLabel,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle: ReactNode
  fieldLabel: string
  fieldHint: string
  sellers: string[]
  onChange: (next: string[]) => void
  /** Names for ids the directory may not know any more (locked-out owners). */
  names?: ReadonlyMap<string, string>
  /** The people the primary is chosen from: those the server accepts as one. */
  primary: { lane: readonly string[]; value: string | undefined; onChange: (id: string) => void }
  /** Set while a sign request waits: the list is read-only, a reason is asked. */
  pending?: { reason: string; onReason: (reason: string) => void }
  /** The sentence under the field when nothing failed and nothing is pending. */
  note: string
  error: ApiError | null
  busy: boolean
  /** Shut with the reason in `note` — the footer line says why. */
  submitDisabled?: boolean
  icon: IconGlyph
  submitLabel: string
  busyLabel: string
  onSubmit: () => void
}) {
  const people = useSalesPeople()
  const sellerPool = people.filter((a) => isSellerRole(a.roleIds))
  const toggle = (id: string) => onChange(toggled(sellers, id))
  const nameOf = (id: string) => people.find((a) => a.id === id)?.name ?? names?.get(id) ?? id

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px]"
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={cn(
              'min-w-0 flex-1 text-[11.5px] leading-[1.5]',
              error ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {error ? userMessage(error) : busy ? busyLabel : note}
          </span>
          <div className="flex shrink-0 gap-3">
            <Button size="lg" variant="ghost" disabled={busy} onClick={onClose}>
              Quay lại
            </Button>
            <Button size="lg" disabled={busy || submitDisabled} onClick={onSubmit}>
              <Icon icon={icon} size={16} />
              {busy ? busyLabel : submitLabel}
            </Button>
          </div>
        </div>
      }
    >
      <Field label={fieldLabel} hint={fieldHint} plain>
        {pending ? (
          <ul aria-label={fieldLabel} className="m-0 flex list-none flex-wrap gap-2 p-0">
            {sellers.map((id) => (
              <li
                key={id}
                className="bg-surface-ink/9 flex items-center gap-2 rounded-sm p-1 pr-3 text-[12px] font-medium"
              >
                <Avatar size="sm" name={nameOf(id)} />
                {nameOf(id)}
              </li>
            ))}
          </ul>
        ) : (
          <PersonTokenField
            variant="inline"
            label={fieldLabel}
            placeholder="Gõ tên để tìm…"
            tokens={sellers.map((id) => {
              const person = people.find((a) => a.id === id)
              return {
                id,
                name: nameOf(id),
                ...(person && { note: person.role }),
                ...(primary.lane.length > 1 && id === primary.value && { tag: SALE_PRIMARY_LABEL }),
              }
            })}
            suggestions={sellerPool
              .filter((a) => !sellers.includes(a.id))
              .map((a) => ({ id: a.id, name: a.name, note: a.role }))}
            onPick={toggle}
            onRemove={toggle}
            emptyNote="Không còn Sale nào để thêm."
          />
        )}
      </Field>
      <div className="pt-4 empty:hidden">
        <SalePrimaryPick
          people={primary.lane.map((id) => ({ id, name: nameOf(id) }))}
          value={primary.value}
          errors={error?.errors?.salePrimary}
          onChange={primary.onChange}
        />
      </div>
      {pending && (
        <div className="pt-4">
          <Field label="Lý do đổi Sale chính" required errors={error?.errors?.reason}>
            <Textarea
              autoGrow
              rows={3}
              value={pending.reason}
              aria-label="Lý do đổi Sale chính"
              aria-required
              maxLength={OPPORTUNITY_SALE_PRIMARY_REASON_MAX}
              onChange={(e) => pending.onReason(e.target.value)}
            />
          </Field>
        </div>
      )}
    </Modal>
  )
}
