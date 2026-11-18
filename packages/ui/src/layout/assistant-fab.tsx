import { useEffect, useRef, useState } from 'react'
import { CrmAgentMark } from '../icons'
import { Icon } from '../ui/icon'
import { cn } from '../lib/cn'

/** Floating CRM Agent mark. Hover lets the face blink and turn. A click plays
 *  the reverse turn before the caller opens the assistant panel. */
export function AssistantFab({
  onClick,
  label = 'Mở Trợ lý AI',
  className,
}: {
  onClick?: () => void
  label?: string
  className?: string
}) {
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const open = () => {
    if (openingRef.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClick?.()
      return
    }
    openingRef.current = true
    setOpening(true)
    timer.current = setTimeout(() => {
      openingRef.current = false
      setOpening(false)
      onClick?.()
    }, 420)
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      data-opening={opening ? 'true' : undefined}
      className={cn(
        'pv-agent-fab focus-visible:outline-ring fixed bottom-8 right-8 z-10 flex size-14 items-center justify-center rounded-full bg-transparent p-0 lg:bottom-[88px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        className,
      )}
    >
      <Icon icon={CrmAgentMark} size={56} />
    </button>
  )
}
