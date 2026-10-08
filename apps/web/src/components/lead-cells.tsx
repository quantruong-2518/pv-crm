import { Icon, TriangleAlert } from '@pv/ui'
import type { LeadRow } from '@pv/contracts'

/** Lead-row cells shared by the lead book and the campaign audience picker.
 *  Here rather than in `pages/leads-parts.tsx` because ADR 0078 lets campaign
 *  code import from `components/`, never from another module's `pages/`. */

/** Company over `contact · email`, small and italic. With `onEmail` the address
 *  is a button that opens the system's mail composer for this lead (not the
 *  visitor's mail client); it stops the click, or the row would open the lead
 *  as well. Without it — no `lead.send-email`, or a lead mail is refused for —
 *  the address is plain text. */
export function CompanyCell({ lead, onEmail }: { lead: LeadRow; onEmail?: () => void }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[13px] font-semibold" title={lead.company}>
        {lead.company}
      </span>
      <span className="text-muted-foreground flex min-w-0 gap-1 text-[11.5px] italic">
        <span className="max-w-[45%] shrink-0 truncate" title={lead.contactName}>
          {lead.contactName}
        </span>
        <span aria-hidden>·</span>
        {onEmail ? (
          <button
            type="button"
            title={`Soạn email gửi ${lead.email}`}
            onClick={(event) => {
              event.stopPropagation()
              onEmail()
            }}
            className="hover:text-foreground truncate underline-offset-2 hover:underline"
          >
            {lead.email}
          </button>
        ) : (
          <span className="truncate" title={lead.email}>
            {lead.email}
          </span>
        )}
      </span>
      {lead.duplicateOf && lead.duplicateOf.length > 0 && (
        <DuplicateWarning codes={lead.duplicateOf} />
      )}
    </span>
  )
}

/** Other LIVE leads sharing this mailbox — flagged on the row, not refused at
 *  write time (ADR 0067 §9, carried out end to end by ADR 0070): the book
 *  dropped its per-email uniqueness, so a row a reader must notice is marked
 *  here instead. `null` entries are leads OUTSIDE this reader's scope — the
 *  count is right, the name just is not this reader's to see. */
function DuplicateWarning({ codes }: { codes: readonly (string | null)[] }) {
  const names = codes.map((code) => code ?? 'một lead khác')
  const text = `Trùng email với ${names.join(', ')}`

  return (
    <span
      className="text-warning flex min-w-0 items-center gap-1 text-[11px] leading-[1.5]"
      title={text}
    >
      <Icon icon={TriangleAlert} size={14} className="shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  )
}

/* Pinned to Vietnam time so two machines in two zones print the same day, and
   `createdFrom`/`createdTo` filter on the very day printed. */
const ENTRY_DAY = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const ENTRY_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** A day over its hour; "—" when the moment is absent or unreadable. */
export function MomentCell({ iso }: { iso?: string }) {
  const at = new Date(iso ?? '')
  if (Number.isNaN(at.getTime())) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex min-w-0 flex-col gap-1" title={iso}>
      <span className="truncate text-[13px] font-semibold">{ENTRY_DAY.format(at)}</span>
      <span className="text-muted-foreground truncate text-[11.5px] italic">
        {ENTRY_TIME.format(at)}
      </span>
    </span>
  )
}
