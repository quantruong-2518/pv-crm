import { useEffect, useState } from 'react'
import { Factory } from '@pv/ui'
import { Button, Drawer, Icon, cn } from '@pv/ui'
import type { AccountRow } from '@pv/contracts'
import { userMessage, type FieldErrors } from '@/app/api'
import { accountBodyOf, BLANK_ACCOUNT, useCreateAccount, type AccountDraft } from '@/data/accounts'
import { AccountFields } from './account-fields'

/** Open a new company by hand.
 *
 *  ------------------------------------------------------------------
 *  THIS IS THE LEAST-USED DOOR, AND IT IS DELIBERATELY LEAST-USED
 *  ------------------------------------------------------------------
 *  Almost every company that enters this book does NOT come through here:
 *  every lead that enters the book resolves its own company inside its own
 *  transaction (`AccountService.resolveForLead`), so the customer book grows
 *  with the lead book without anyone typing anything. This door is for the
 *  remaining case — knowing a company before any enquiry exists, usually
 *  after a trade fair or an outbound call.
 *
 *  Worth noting: typing in a company that is already in the book under a
 *  different name gets refused by `account_identity_uniq`, and that rejection
 *  (`account.constraints.ts`) says outright to open the existing row instead
 *  of creating a second one. That is the correct path: merging two companies
 *  after one was created by mistake is a different operation, and it has not
 *  been built. */
export function AccountCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated?: (row: AccountRow) => void
}) {
  const [draft, setDraft] = useState<AccountDraft>(BLANK_ACCOUNT)
  const [errors, setErrors] = useState<FieldErrors>({})
  const create = useCreateAccount()
  const { reset } = create

  /* Opening the popup is a fresh start each time — same convention
     `ConvertDialog` keeps: keeping the old draft would show the second
     opening whatever was half-typed last time, and keeping the old
     rejection would open a fresh form already red on fields from a
     different submit. */
  useEffect(() => {
    if (!open) return
    setDraft(BLANK_ACCOUNT)
    setErrors({})
    reset()
  }, [open, reset])

  const set = <K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const ready = draft.name.trim() !== '' && !create.isPending

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Mở công ty mới"
      subtitle="Một dòng ở đây là MỘT khách. Lead, đơn và hợp đồng của họ đều treo về dòng này."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={cn(
              'text-[11.5px] leading-[1.5]',
              ready ? 'text-muted-foreground' : 'text-warning',
            )}
            aria-live="polite"
          >
            {create.error
              ? userMessage(create.error)
              : draft.name.trim() === ''
                ? 'Còn thiếu tên công ty.'
                : 'Chỉ tên là bắt buộc — tám ô còn lại điền được lúc nào cũng được.'}
          </span>
          <div className="flex items-center gap-3">
            <Button size="md" variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            <Button
              size="md"
              disabled={!ready}
              onClick={() =>
                create.mutate(accountBodyOf(draft), {
                  onSuccess: (row) => {
                    onCreated?.(row)
                    onClose()
                  },
                  onError: (error) => setErrors(error.errors ?? {}),
                })
              }
            >
              <Icon icon={Factory} size={16} />
              {create.isPending ? 'Đang mở…' : 'Mở công ty'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="p-5 lg:p-6">
        <AccountFields draft={draft} onSet={set} errors={errors} />
      </div>
    </Drawer>
  )
}
