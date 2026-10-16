import { Link } from 'react-router-dom'
import { Avatar, Badge, Chip, Icon, Mail, Phone, cn, type IconGlyph } from '@pv/ui'
import type { ContactBookRow } from '@pv/contracts'
import { BOOK_CARD } from './book-cards'

/** The contact book as cards. A lead's primary contact takes two columns: the
 *  book's question is "who do I call at this customer", and the default sort
 *  (`best`) puts those people first, so the wide cards lead the grid.
 *
 *  Phone and mail are plain text, not `tel:`/`mailto:` links: the whole card is
 *  already a link to the profile, and a link inside a link is invalid HTML. */

function Reach({ icon, value, missing }: { icon: IconGlyph; value?: string; missing: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon icon={icon} size={16} className="text-muted-foreground shrink-0" />
      <span
        className={cn(
          'min-w-0 truncate text-[13px]',
          value ? 'tnum' : 'text-muted-foreground text-[12px]',
        )}
        title={value}
      >
        {value ?? missing}
      </span>
    </span>
  )
}

/** The wide card has room to name each channel and print it large. */
function ReachLarge({ label, value, missing }: { label: string; value?: string; missing: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate',
          value ? 'tnum text-[15px] font-semibold' : 'text-muted-foreground text-[13px]',
        )}
        title={value}
      >
        {value ?? missing}
      </span>
    </span>
  )
}

function ContactCard({ contact: c }: { contact: ContactBookRow }) {
  const company = c.accountName ?? c.company
  const role = [c.title, company].filter(Boolean).join(' · ')
  const owner = (
    <span className="text-muted-foreground mt-auto flex min-w-0 items-center gap-2 text-[12px]">
      {c.ownerName ? (
        <>
          Phụ trách
          <Avatar name={c.ownerName} card={false} size="sm" />
          <span className="text-foreground truncate">{c.ownerName}</span>
        </>
      ) : (
        'Chưa có người phụ trách'
      )}
    </span>
  )
  return (
    <Link
      to={`/sales/contacts/${c.code}`}
      className={cn(BOOK_CARD, c.isPrimary && 'md:col-span-2 md:grid md:grid-cols-2 md:gap-5')}
    >
      <span className="flex min-w-0 flex-col gap-3">
        <span className="flex min-w-0 items-start gap-3">
          <Avatar name={c.name} card={false} size={c.isPrimary ? 'lg' : 'md'} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[14px] font-semibold" title={c.name}>
                {c.name}
              </span>
              <Chip className="shrink-0">{c.code}</Chip>
            </span>
            <span className="text-muted-foreground truncate text-[12px]" title={role}>
              {role}
            </span>
          </span>
        </span>
        {c.isPrimary && (
          <span className="mt-auto flex min-w-0 flex-wrap items-center gap-3">
            <Badge tone="success">Liên hệ chính</Badge>
            {owner}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-3">
        <span
          className={cn(
            'bg-card flex min-w-0 flex-col gap-2 rounded-sm p-3',
            c.isPrimary && 'flex-1 justify-center gap-4 p-4',
          )}
        >
          {c.isPrimary ? (
            <>
              <ReachLarge label="Điện thoại" value={c.phone} missing="Chưa có số điện thoại" />
              <ReachLarge label="Email" value={c.email} missing="Chưa có email" />
            </>
          ) : (
            <>
              <Reach icon={Phone} value={c.phone} missing="Chưa có số điện thoại" />
              <Reach icon={Mail} value={c.email} missing="Chưa có email" />
            </>
          )}
        </span>
        {!c.isPrimary && owner}
      </span>
    </Link>
  )
}

/** Dense flow fills the hole a wide card leaves at a row's end. */
export function ContactCardGrid({ rows }: { rows: ContactBookRow[] }) {
  return (
    <div className="grid grid-flow-row-dense grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((c) => (
        <ContactCard key={c.code} contact={c} />
      ))}
    </div>
  )
}
