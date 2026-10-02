import type { ReactNode } from 'react'
import { Paperclip, Pencil, TriangleAlert } from '@pv/ui'
import { Avatar, Badge, Button, GlassCard, Icon, SectionTitle } from '@pv/ui'
import { OPPORTUNITY_CONTACT_ROLE_LABEL, type OpportunityProfileResponse } from '@pv/contracts'
import { acceptorText } from '@/data/deal-sale'
import { bdOwnersOf, saleOwnersOf } from '@/data/opportunities'

/** Module 3 · the profile's right column: who on the customer's side, who on
 *  ours, and what the deal is about (ADR 0077 §6).
 *
 *  No call buttons per person: call, Zalo and mail live on the action bar and
 *  ask which contact. Each edit button shows only while `acts.editDetails`
 *  opens it; the owners' one edits the BD lane (ADR 0077 §5).
 *  Each panel is a list, so `.glass-b` (law 8). */

type Profile = OpportunityProfileResponse
type Someone = { id: string; name: string }

function Panel({
  title,
  onEdit,
  editLabel,
  grow = false,
  children,
}: {
  title: string
  /** Absent = no edit door for this reader. */
  onEdit?: () => void
  editLabel?: string
  grow?: boolean
  children: ReactNode
}) {
  return (
    <GlassCard
      variant="b"
      className={grow ? 'flex flex-1 flex-col gap-3 p-4 sm:p-5' : 'flex flex-col gap-3 p-4 sm:p-5'}
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-3">
        <SectionTitle size="detail">{title}</SectionTitle>
        {onEdit && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            aria-label={editLabel}
            onClick={onEdit}
          >
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>
        )}
      </div>
      {children}
    </GlassCard>
  )
}

export function ContactsPanel({ op, onEdit }: { op: Profile; onEdit: () => void }) {
  return (
    <Panel
      title="Người liên hệ"
      editLabel="Sửa người liên hệ của cơ hội"
      onEdit={op.acts.editDetails.ok ? onEdit : undefined}
    >
      {op.contacts.length === 0 ? (
        <p className="text-warning m-0 text-[12.5px] leading-[1.6]">
          Cơ hội chưa có người liên hệ.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {op.contacts.map((c) => (
            <li key={c.code} className="flex min-w-0 items-start gap-3">
              <Avatar name={c.name} size="sm" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground truncate text-[13px] font-semibold">
                    {c.name}
                  </span>
                  {c.primary && <Badge tone="running">Chính</Badge>}
                </span>
                <span className="text-muted-foreground text-[12px] leading-[1.5]">
                  {[c.role && OPPORTUNITY_CONTACT_ROLE_LABEL[c.role], c.title]
                    .filter(Boolean)
                    .join(' · ') || 'Chưa nêu vai'}
                </span>
                {c.email === null && (
                  <span className="text-muted-foreground text-[12px] leading-[1.5]">
                    chưa có email
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** BD who opened the door, the head who accepted, the seller on the deal.
 *  No assign button here: the action bar holds the one assign button. */
export function OwnersPanel({ op, onEdit }: { op: Profile; onEdit: () => void }) {
  const sellers = saleOwnersOf(op)
  const pic = acceptorText(op)

  return (
    <Panel
      title="Người chịu trách nhiệm"
      editLabel="Sửa người chịu trách nhiệm"
      onEdit={op.acts.editDetails.ok ? onEdit : undefined}
    >
      <dl className="m-0 flex flex-col gap-3">
        <Role term="BD mở cửa">
          <People people={bdOwnersOf(op)} none="Chưa có" />
        </Role>
        <Role term="PIC">
          {pic && op.acceptedBy ? (
            <Person who={op.acceptedBy} text={pic} />
          ) : (
            <span className="text-muted-foreground">Chưa nhận PIC</span>
          )}
        </Role>
        <Role term="Sale đứng đơn">
          {sellers.length > 0 ? (
            <People people={sellers} none="" />
          ) : op.state === 'open' ? (
            <span className="text-warning flex items-start gap-2">
              <Icon icon={TriangleAlert} size={16} className="mt-1 shrink-0" />
              Chưa có. Cần có trước khi chốt thắng
            </span>
          ) : (
            <span className="text-muted-foreground">Chưa có</span>
          )}
        </Role>
      </dl>
    </Panel>
  )
}

function Role({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-[12px] leading-[1.5]">{term}</dt>
      <dd className="text-foreground m-0 text-[13px] leading-[1.5]">{children}</dd>
    </div>
  )
}

function People({ people, none }: { people: Someone[]; none: string }) {
  if (people.length === 0) return <span className="text-muted-foreground">{none}</span>
  return (
    <span className="flex flex-col gap-2">
      {people.map((p) => (
        <Person key={p.id} who={p} text={p.name} />
      ))}
    </span>
  )
}

function Person({ who, text }: { who: Someone; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={who.name} size="sm" />
      <span className="min-w-0 break-words">{text}</span>
    </span>
  )
}

/** Attachments are names only until storage is decided (ADR 0077, out of scope). */
export function DescriptionPanel({ op, onEdit }: { op: Profile; onEdit: () => void }) {
  return (
    <Panel
      title="Mô tả và tệp"
      editLabel="Sửa mô tả và tệp"
      onEdit={op.acts.editDetails.ok ? onEdit : undefined}
      grow
    >
      <p className="text-foreground m-0 whitespace-pre-line break-words text-[13px] leading-[1.6]">
        {op.description?.trim() ? (
          op.description
        ) : (
          <span className="text-muted-foreground">Chưa có mô tả.</span>
        )}
      </p>
      {op.attachments.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {op.attachments.map((f) => (
            <li
              key={f.name}
              className="text-foreground flex min-w-0 items-center gap-2 text-[12.5px]"
            >
              <Icon icon={Paperclip} size={16} className="text-muted-foreground shrink-0" />
              <span className="min-w-0 break-words">{f.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
