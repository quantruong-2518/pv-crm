import { useRef, type ReactNode } from 'react'
import { Button, ChevronLeft, ChevronRight, Icon, cn } from '@pv/ui'

/** A row of selectable cards that scrolls sideways, with a heading, an "i / n"
 *  counter and prev/next buttons. Built generic so it can move to `@pv/ui`
 *  unchanged. Prev/next move the pick and bring that card into view; the cards
 *  are buttons, so the keyboard reaches each one. Selection lifts by shadow
 *  (law 4: no border). */

export type CarouselItem = {
  key: string
  /** Flat tint of the card by status. */
  tone: 'plain' | 'ok' | 'run' | 'late'
  children: ReactNode
}

const TINT: Record<CarouselItem['tone'], string> = {
  plain: 'bg-surface-ink/6',
  ok: 'bg-success/10',
  run: 'bg-primary/10',
  late: 'bg-destructive/14',
}

const SELECTED = 'shadow-[0_0_0_2px_var(--primary),var(--shadow-primary)]'

export function PaperCarousel({
  heading,
  label,
  items,
  selectedKey,
  onSelect,
}: {
  heading: ReactNode
  label: string
  items: CarouselItem[]
  selectedKey: string | undefined
  onSelect: (key: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const at = Math.max(
    items.findIndex((i) => i.key === selectedKey),
    0,
  )

  const go = (delta: number) => {
    const next = items[at + delta]
    if (!next) return
    onSelect(next.key)
    const card = scroller.current?.children.item(at + delta)
    if (card instanceof HTMLElement) {
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.current?.scrollTo({ left: card.offsetLeft - 8, behavior: calm ? 'auto' : 'smooth' })
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {heading}
        {items.length > 1 && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-muted-foreground tnum text-[12px]" aria-live="polite">
              {at + 1} / {items.length}
            </span>
            <Button
              size="md"
              variant="ghost"
              aria-label="Hợp đồng trước"
              className="pointer-coarse:size-12 size-10 px-0"
              disabled={at === 0}
              onClick={() => go(-1)}
            >
              <Icon icon={ChevronLeft} size={16} />
            </Button>
            <Button
              size="md"
              variant="ghost"
              aria-label="Hợp đồng sau"
              className="pointer-coarse:size-12 size-10 px-0"
              disabled={at === items.length - 1}
              onClick={() => go(1)}
            >
              <Icon icon={ChevronRight} size={16} />
            </Button>
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div
          ref={scroller}
          role="group"
          aria-label={label}
          /* Padding keeps a selected card's ring from being clipped by the scroller. */
          className="relative flex snap-x scroll-px-2 gap-3 overflow-x-auto px-2 pb-5 pt-2 [scrollbar-width:none]"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={item.key === selectedKey}
              onClick={() => onSelect(item.key)}
              className={cn(
                'motion-std focus-visible:outline-ring flex w-[min(288px,85%)] min-w-[min(288px,85%)] shrink-0 snap-start flex-col gap-3 rounded-lg p-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2',
                TINT[item.tone],
                item.key === selectedKey ? SELECTED : 'shadow-control',
              )}
            >
              {item.children}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
