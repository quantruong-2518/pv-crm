import { createAvatar } from '@dicebear/core'
import * as glass from '@dicebear/glass'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/cn'
import { InfoTip } from './info-tip'

/** A-05 · Avatar — rounded-full (design law 5, docs/design-system/laws.md):
 *  a person reads as a circle, not a card, so this is the third exception
 *  alongside StatusDot and the AI Assistant FAB.
 *  DiceBear "glass" seeded by name, generated locally (no request leaves the
 *  app; names are internal). Three sizes: 38 · 30 · 24. */
const avatarVariants = cva('inline-flex shrink-0 overflow-hidden rounded-full', {
  variants: {
    size: {
      lg: 'size-[38px]',
      md: 'size-[30px]',
      sm: 'size-6',
    },
  },
  defaultVariants: { size: 'lg' },
})

export type AvatarProps = VariantProps<typeof avatarVariants> & {
  /** Tên đầy đủ — làm seed cho hình và aria-label */
  name: string
  email?: string
  role?: string
  /** Hover/focus card with avatar, name, role and email. Off where the avatar
   *  already sits inside a menu or a button that owns the hover. */
  card?: boolean
  className?: string
}

/** "Nguyễn Văn Thắng" → "NT" — chữ cái đầu của họ và của tên gọi. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return ''
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  const last = parts[parts.length - 1] ?? first
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

const cache = new Map<string, string>()

function glassUri(seed: string) {
  let uri = cache.get(seed)
  if (!uri) {
    uri = createAvatar(glass, { seed }).toDataUri()
    cache.set(seed, uri)
  }
  return uri
}

function PersonCard({ name, email, role }: Pick<AvatarProps, 'name' | 'email' | 'role'>) {
  return (
    <span className="flex items-center gap-3">
      <Avatar name={name} size="lg" card={false} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-foreground break-words text-[13px] font-semibold">{name}</span>
        {role && <span className="text-muted-foreground">{role}</span>}
        {email && <span className="text-muted-foreground break-all">{email}</span>}
      </span>
    </span>
  )
}

export function Avatar({ name, email, role, card = true, size, className }: AvatarProps) {
  const face = (
    <span role="img" aria-label={name} className={cn(avatarVariants({ size }), className)}>
      <img src={glassUri(name)} alt="" className="size-full" draggable={false} />
    </span>
  )
  if (!card) return face
  return (
    <InfoTip width={280} content={<PersonCard name={name} email={email} role={role} />}>
      {face}
    </InfoTip>
  )
}

export { avatarVariants }
