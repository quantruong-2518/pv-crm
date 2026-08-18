import { Bell, Orbit } from 'lucide-react'
import { SearchField, type SearchFieldProps } from '../patterns/search-field'
import { Avatar } from '../ui/avatar'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** O-02 · TopBar — h-16.
 *  SearchField + nút Trợ lý (ẩn dưới lg — BottomNav đã có mục Trợ lý) + chuông
 *  (chấm 7px destructive) + Avatar.
 *  Icon trợ lý là `orbit` — không `sparkles`, không `bot` (luật 15 · CLAUDE.md). */
export type TopBarProps = {
  user: { name: string; initials?: string }
  /** có thông báo chưa đọc → chấm đỏ trên chuông */
  unread?: boolean
  assistantLabel?: string
  search?: Pick<SearchFieldProps, 'placeholder' | 'meta'>
  onOpenAssistant?: () => void
  onOpenNotifications?: () => void
  className?: string
}

export function TopBar({
  user,
  unread,
  assistantLabel = 'Trợ lý',
  search,
  onOpenAssistant,
  onOpenNotifications,
  className,
}: TopBarProps) {
  return (
    <header className={cn('glass-a flex items-center gap-3.5 rounded-lg px-4 py-3', className)}>
      <SearchField className="flex-1" {...search} />

      <button
        type="button"
        onClick={onOpenAssistant}
        className="motion-std text-accent-foreground hidden h-10 items-center gap-2 rounded-md bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_30%,transparent),color-mix(in_srgb,var(--primary)_12%,transparent))] px-4 text-[12.5px] font-semibold shadow-[var(--shadow-assistant),inset_0_1px_0_var(--sheen-ai)] hover:brightness-[1.12] lg:flex"
      >
        <Icon icon={Orbit} size={16} />
        {assistantLabel}
      </button>

      <button
        type="button"
        onClick={onOpenNotifications}
        aria-label={unread ? 'Thông báo — có tin chưa đọc' : 'Thông báo'}
        className="motion-std bg-input text-muted-foreground relative flex size-10 items-center justify-center rounded-md hover:bg-white/10"
      >
        <Icon icon={Bell} size={17} />
        {unread && (
          <span className="bg-destructive absolute right-2.5 top-[9px] size-[7px] rounded-full" />
        )}
      </button>

      <Avatar name={user.name} initials={user.initials} />
    </header>
  )
}
