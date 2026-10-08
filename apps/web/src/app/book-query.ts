import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pageIndexFromQueryPage, queryPageFromPageIndex } from './url'

/** Address-backed filter state for any server-paged book whose query schema
 *  extends `PageQuery`. The URL is the source of truth (Back, F5 and shared
 *  links keep the filter); keys are the schema's own, so the address cannot
 *  drift from the contract. A hand-edited bad address falls back to defaults
 *  as a whole, never throws. */

export const SEARCH_DELAY_MS = 300

type BookQueryShape = { q?: string; page: number; size: number }

/** The slice of a zod object schema this hook needs — `apps/web` does not
 *  depend on zod itself, the contracts do. */
type BookSchema<Q> = {
  shape: Record<string, unknown>
  parse: (input: unknown) => Q
  safeParse: (input: unknown) => { success: true; data: Q } | { success: false }
}

/** A query as the server reads it: every set field, `size` included — the
 *  address omits defaults, the wire does not. */
export function bookQueryParams(query: object): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  return params
}

export function useBookQuery<Q extends BookQueryShape>(
  schema: BookSchema<Q>,
  options: { size?: number; filterKeys: readonly (keyof Q)[] },
) {
  const keys = useMemo(() => Object.keys(schema.shape), [schema])
  const defaults = useMemo(() => schema.parse({}), [schema])
  const [params, setParams] = useSearchParams()

  const urlQuery = useMemo(() => {
    const raw: Record<string, string> = {}
    for (const key of keys) {
      const value = params.get(key)
      if (value !== null) raw[key] = value
    }
    const result = schema.safeParse(raw)
    return result.success ? result.data : defaults
  }, [params, keys, schema, defaults])

  const toParams = useCallback(
    (query: Q) => {
      const next = new URLSearchParams()
      for (const key of keys) {
        const value = (query as Record<string, unknown>)[key]
        if (value === undefined || value === (defaults as Record<string, unknown>)[key]) continue
        next.set(key, String(value))
      }
      return next
    },
    [keys, defaults],
  )

  /* `size` is the screen's row count, applied on top and kept off the address. */
  const query = useMemo<Q>(
    () => ({ ...urlQuery, size: options.size ?? urlQuery.size }),
    [urlQuery, options.size],
  )

  const [text, setText] = useState(urlQuery.q ?? '')
  /* Follow the address only when it differs from what was typed, so a trailing space survives the debounce. */
  useEffect(
    () => setText((now) => (now.trim() === (urlQuery.q ?? '') ? now : (urlQuery.q ?? ''))),
    [urlQuery.q],
  )

  /* Typing trickles into the address with `replace`, so Back is not undo. */
  useEffect(() => {
    const wanted = text.trim() === '' ? undefined : text.trim()
    if (wanted === urlQuery.q) return
    const timer = setTimeout(() => {
      const next = toParams({ ...urlQuery, q: wanted, page: defaults.page })
      /* A query the schema rejects (q too long) would reset the whole address: keep the last good one. */
      if (!schema.safeParse(Object.fromEntries(next)).success) return
      setParams(next, { replace: true })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, urlQuery, setParams, toParams, defaults, schema])

  /* A filter change always returns to page 1: page 3 of a narrower book is empty. */
  const patch = (next: Partial<Q>) =>
    setParams(toParams({ ...urlQuery, ...next, page: defaults.page }))

  const goPage = (index: number) =>
    setParams(toParams({ ...urlQuery, page: queryPageFromPageIndex(index) }))

  const clear = () => {
    setText('')
    const cleared = { q: undefined } as Partial<Q>
    for (const key of options.filterKeys) cleared[key] = undefined
    patch(cleared)
  }

  /* A key counts only when it departs from its default: `status` always has a
     value, and an "all" tab is no filter. */
  const activeCount = options.filterKeys.filter(
    (key) => urlQuery[key] !== undefined && urlQuery[key] !== defaults[key],
  ).length
  const dirty = text.trim() !== '' || activeCount > 0

  const resetPage = () =>
    setParams(toParams({ ...urlQuery, page: defaults.page }), { replace: true })

  return {
    urlQuery,
    query,
    text,
    setText,
    patch,
    goPage,
    clear,
    dirty,
    resetPage,
  }
}

/** A page past the end (a stale `?page=3` link) is fixed in the ADDRESS, not
 *  only clamped for the footer — else the server keeps answering an empty
 *  page. Waits for data: before it, `total` is unknown and must not bounce. */
export function useBookPageClamp(
  book: { query: BookQueryShape; resetPage: () => void },
  total: number | undefined,
) {
  const pageCount = Math.max(1, Math.ceil((total ?? 0) / book.query.size))
  const index = pageIndexFromQueryPage(book.query.page)
  const stale = total !== undefined && index > pageCount - 1
  const { resetPage } = book
  useEffect(() => {
    if (stale) resetPage()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on the stale edge only
  }, [stale])
  return { pageCount, pageIndex: Math.min(index, pageCount - 1) }
}
