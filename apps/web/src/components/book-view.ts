import { useState } from 'react'

/** The Grid / Table choice of a card book (`book-cards.tsx`), kept apart so
 *  that file exports components only. */
export type BookView = 'grid' | 'table'

/** Cards per page: a card is several rows tall, and 24 fills 2, 3 or 4 columns evenly. */
export const GRID_PAGE_SIZE = 24

/** The choice is the reader's own habit, not part of the book's address. */
export function useBookView(storageKey: string) {
  const [view, setView] = useState<BookView>(() => {
    try {
      return localStorage.getItem(storageKey) === 'table' ? 'table' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const choose = (next: BookView) => {
    setView(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      /* private window: the choice lasts until reload */
    }
  }
  return [view, choose] as const
}

/** The menu stays open after an apply; its sections are applied one at a time. */
export const noop = () => {}
