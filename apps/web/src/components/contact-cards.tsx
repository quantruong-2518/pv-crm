import { useState } from 'react'
import { Avatar, Badge, Icon, Mail, Phone, cn, type IconGlyph } from '@pv/ui'
import type { ContactBookRow } from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { phoneText } from '@/lib/phone'
import { COMMS_CHANNEL_ICON, COMMS_CHANNEL_LABEL } from '@/data/comms'
import { CommActionConfirm } from './comm-action-confirm'
import { LetterComposer } from './mail-letter/letter-composer'
import { BOOK_CARD } from './book-cards'
import { CARD_GRID, CardFoot, CardHead, CardPerson, CardTitle } from './book-card-parts'

/** The contact book as cards. A lead's primary contact takes two columns: the
 *  book's question is "who do I call at this customer", and the default sort
 *  (`best`) puts those people first, so the wide cards lead the grid.
 *
 *  The phone opens Zalo through `CommActionConfirm` — the comm is recorded on
 *  the person's lead first, as on the lead profile's action bar (ADR 0075). The
 *  mail opens the letter composer at once, addressed to that person. */

type Ask = { channel: 'zalo-oa' | 'email'; contact: ContactBookRow }

function Reach({
  icon,
  value,
  missing,
  label,
  large,
  onPress,
}: {
  icon: IconGlyph
  value?: string
  missing: string
  label: string
  large: boolean
  onPress: () => void
}) {
  if (!value) {
    return (
      <span className="text-muted-foreground flex min-w-0 items-center gap-2 py-1 text-[12px]">
        <Icon icon={icon} size={14} className="shrink-0" />
        {missing}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onPress}
      title={label}
      aria-label={label}
      className={cn(
        'hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring pointer-coarse:min-h-12 relative z-[1] -mx-2 flex min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-left outline-none transition-colors focus-visible:ring-2',
        large ? 'text-[14px] font-semibold' : 'text-[12.5px]',
      )}
    >
      <Icon icon={icon} size={large ? 16 : 14} className="text-muted-foreground shrink-0" />
      <span className="tnum min-w-0 truncate">{value}</span>
    </button>
  )
}

/** The newest time this person was reached, on every card so the book shows
 *  who has gone cold. */
function LastContact({ last }: { last: ContactBookRow['lastContact'] }) {
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-2 text-[12px]">
      {last ? (
        <>
          <Icon icon={COMMS_CHANNEL_ICON[last.channel]} size={14} className="shrink-0" />
          <span className="tnum truncate">{`${COMMS_CHANNEL_LABEL[last.channel]} · ${dmhm(last.at)}`}</span>
        </>
      ) : (
        'Chưa liên hệ lần nào'
      )}
    </span>
  )
}

function ContactCard({ contact: c, onAsk }: { contact: ContactBookRow; onAsk: (a: Ask) => void }) {
  const company = c.accountName ?? c.company
  const role = [c.title, company].filter(Boolean).join(' · ')
  const wide = c.isPrimary
  const phone = (
    <Reach
      icon={Phone}
      value={c.phone ? phoneText(c.phone) : undefined}
      missing="Chưa có số điện thoại"
      label={`Liên hệ Zalo với ${c.name}`}
      large={wide}
      onPress={() => onAsk({ channel: 'zalo-oa', contact: c })}
    />
  )
  const mail = (
    <Reach
      icon={Mail}
      value={c.email}
      missing="Chưa có email"
      label={`Gửi mail cho ${c.name}`}
      large={wide}
      onPress={() => onAsk({ channel: 'email', contact: c })}
    />
  )
  /* One reading order for both sizes — who, how to reach, who holds them; the
     wide card only lays the reach and the holder side by side. */
  return (
    <article className={cn(BOOK_CARD, wide && 'sm:col-span-2')}>
      <CardHead
        mark={<Avatar name={c.name} card={false} size="lg" />}
        title={
          <CardTitle to={`/sales/contacts/${c.code}`} title={c.name}>
            {c.name}
          </CardTitle>
        }
        badge={
          wide && (
            <Badge tone="success" className="shrink-0">
              Liên hệ chính
            </Badge>
          )
        }
        subtitle={role}
        code={c.code}
      />
      {wide ? (
        <CardFoot className="gap-x-6 gap-y-1">
          {phone}
          {mail}
          <LastContact last={c.lastContact} />
          <CardPerson name={c.ownerName} />
        </CardFoot>
      ) : (
        <>
          <span className="flex min-w-0 flex-col">
            {phone}
            {mail}
            <LastContact last={c.lastContact} />
          </span>
          <CardFoot>
            <CardPerson name={c.ownerName} />
          </CardFoot>
        </>
      )}
    </article>
  )
}

/** Dense flow fills the hole a wide card leaves at a row's end. */
export function ContactCardGrid({ rows }: { rows: ContactBookRow[] }) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [composing, setComposing] = useState<ContactBookRow | null>(null)
  return (
    <>
      <div className={CARD_GRID}>
        {rows.map((c) => (
          <ContactCard key={c.code} contact={c} onAsk={setAsk} />
        ))}
      </div>
      {ask && (
        <CommActionConfirm
          channel={ask.channel}
          subject={{ code: ask.contact.leadCode, kind: 'lead' }}
          contact={ask.contact}
          mail={{ onCompose: () => setComposing(ask.contact) }}
          onClose={() => setAsk(null)}
        />
      )}
      {composing && (
        <LetterComposer
          door="lead"
          code={composing.leadCode}
          leadCode={composing.leadCode}
          to={composing.code}
          onClose={() => setComposing(null)}
        />
      )}
    </>
  )
}
