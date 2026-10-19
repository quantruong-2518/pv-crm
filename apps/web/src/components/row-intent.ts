import { useRef, type PointerEvent } from 'react'
import { useQueryClient, type FetchQueryOptions, type QueryKey } from '@tanstack/react-query'

/** A pointer sweeping across a book crosses dozens of rows; only the one it
 *  rests on this long is worth a request. */
const HOVER_REST_MS = 150

/** Warms a detail screen on pointer intent over a row: its main record query
 *  and its route chunk, so the click lands on data already in flight. Fresh
 *  cache makes repeats free. Returns row pointer props to spread: enter for
 *  mouse (after a short rest), down for touch (no hover). `onEnter` keeps a
 *  row's own enter handler, e.g. drag-select painting. */
export function useRowIntent<TData, TKey extends QueryKey>(
  query: (code: string) => FetchQueryOptions<TData, Error, TData, TKey>,
  load: () => Promise<unknown>,
) {
  const client = useQueryClient()
  const resting = useRef<string | null>(null)
  return (code: string, onEnter?: (event: PointerEvent<HTMLElement>) => void) => {
    const warm = () => {
      void client.prefetchQuery(query(code))
      void load()
    }
    return {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse') {
          resting.current = code
          setTimeout(() => {
            if (resting.current === code) warm()
          }, HOVER_REST_MS)
        }
        onEnter?.(event)
      },
      onPointerDown: warm,
    }
  }
}
