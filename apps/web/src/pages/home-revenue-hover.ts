import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SalesMoneyFigureKind } from '@pv/contracts'
import { salesMoneyEntriesQuery } from '@/data/home-charts'

/** The hover card of the revenue chart: which money zone it shows, where, and
 *  whether it is pinned. A mouse opens it on a zone after a short delay and may
 *  cross into it; a click or a tap pins it until a press outside or Escape.
 *  Keyboard focus opens it without moving focus; a keyboard pin moves focus in.
 *
 *  Its place is kept in the chart content's own coordinates, so the card rides
 *  with the chart when it scrolls instead of being re-measured against the page. */

const DELAY_MS = 150
export const CARD_WIDTH = 360
const CARD_MAX = 440
const GAP = 8

/** Every zone opener carries this, so pressing one is not "outside". */
export const ZONE = 'data-money-zone'

/** `arrow` is the zone's centre in the card's own x, where its pointer sits; `below` flips it to the top edge. */
export type Place = {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
  arrow: number
  below: boolean
}

export type MoneyCard = {
  period: string
  key: string
  zone: string
  kinds: SalesMoneyFigureKind[]
  pinned: boolean
  /** A keyboard pin moves focus into the card; every other open leaves it on the zone. */
  focus: boolean
  opener: HTMLElement
  place: Place
}

/** Above the zone; inside a scroll box (coarse pointer) the card cannot overflow
 *  the box, so it takes the side with more room and scrolls inside itself. */
function placeOf(content: HTMLElement, zone: HTMLElement): Place {
  const box = content.getBoundingClientRect()
  const z = zone.getBoundingClientRect()
  const top = z.top - box.top
  const bottom = z.bottom - box.top
  const centred = z.left - box.left + z.width / 2 - CARD_WIDTH / 2
  const left = Math.max(0, Math.min(centred, box.width - CARD_WIDTH))
  const clipped = content.parentElement
    ? getComputedStyle(content.parentElement).overflowX !== 'visible'
    : false
  const arrow = Math.max(24, Math.min(z.left - box.left + z.width / 2 - left, CARD_WIDTH - 24))
  const above = { left, bottom: box.height - top + GAP, arrow, below: false }
  if (!clipped) return { ...above, maxHeight: CARD_MAX }
  const roomAbove = top - GAP
  const roomBelow = box.height - bottom - GAP
  return roomAbove >= Math.min(CARD_MAX, roomBelow)
    ? { ...above, maxHeight: Math.min(CARD_MAX, roomAbove) }
    : { left, top: bottom + GAP, arrow, below: true, maxHeight: Math.min(CARD_MAX, roomBelow) }
}

export function useMoneyCard(period: string, content: RefObject<HTMLDivElement | null>) {
  const client = useQueryClient()
  const id = useId()
  const [card, setCard] = useState<MoneyCard | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const clear = () => window.clearTimeout(timer.current)
  const later = (fn: () => void) => {
    clear()
    timer.current = window.setTimeout(fn, DELAY_MS)
  }
  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    setCard(null)
  }, [])
  const dropUnpinned = () => later(() => setCard((c) => (c?.pinned ? c : null)))
  const shown = card?.period === period ? card : null

  useEffect(() => {
    if (!shown) return
    const outside = (e: PointerEvent) => {
      const target = e.target as Element
      if (!target.closest(`#${CSS.escape(id)}`) && !target.closest(`[${ZONE}]`)) close()
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.getElementById(id)?.contains(document.activeElement)) shown.opener.focus()
      close()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [shown, close, id])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const zoneProps = (key: string, zone: string, kinds: SalesMoneyFigureKind[]) => {
    const make = (opener: HTMLElement, pinned: boolean, focus: boolean): MoneyCard | null =>
      content.current && {
        period,
        key,
        zone,
        kinds,
        pinned,
        focus,
        opener,
        place: placeOf(content.current, opener),
      }
    const mine = shown?.key === key && shown.zone === zone
    return {
      [ZONE]: '',
      'aria-expanded': mine,
      'aria-controls': mine ? id : undefined,
      onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
        for (const kind of kinds)
          void client.prefetchQuery(salesMoneyEntriesQuery(period, key, kind))
        if (e.pointerType !== 'mouse') return
        const opener = e.currentTarget
        later(() => setCard((c) => (c?.pinned ? c : make(opener, false, false))))
      },
      onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse') dropUnpinned()
      },
      onFocus: (e: ReactFocusEvent<HTMLElement>) => {
        if (!e.currentTarget.matches(':focus-visible')) return
        const opener = e.currentTarget
        clear()
        setCard((c) => (c?.pinned ? c : make(opener, false, false)))
      },
      onBlur: dropUnpinned,
      onClick: (e: ReactMouseEvent<HTMLElement>) => {
        const next = make(e.currentTarget, true, e.detail === 0)
        clear()
        setCard((c) => (c?.pinned && c.key === key && c.zone === zone ? null : next))
      },
    }
  }

  /** Crossing from the zone into the card keeps it; leaving both lets it go. */
  const cardProps = {
    id,
    onPointerEnter: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') clear()
    },
    onPointerLeave: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse') dropUnpinned()
    },
  }

  return { card: shown, zoneProps, cardProps, close }
}

export type ZoneProps = ReturnType<ReturnType<typeof useMoneyCard>['zoneProps']>
