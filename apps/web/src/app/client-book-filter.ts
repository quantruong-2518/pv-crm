import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SEARCH_DELAY_MS } from './book-query'

/** Address-backed filter state for a book that loads its WHOLE list and filters
 *  in the browser (the sibling of `book-query.ts`, which serves server books).
 *
 *  Same contract: the URL is the source of truth, so Back, F5 and shared links
 *  keep the filter; typing in `q` trickles into the address with `replace`;
 *  a hand-edited bad value falls back to the field's empty value, never throws.
 *  Rows are NOT filtered here — each book keeps its own pure function. */

/** One address key: how to read it, how to write it, and what "no filter" is. */
export type Field<V> = {
  empty: V
  read: (raw: string | null) => V
  write: (value: V) => string | undefined
}

/** One value out of a closed set. `empty` is the tab that means "no filter". */
export const oneOf = <T extends string, E extends T | undefined>(
  values: readonly T[],
  empty: E,
): Field<T | E> => ({
  empty,
  read: (raw) => (values.find((v) => v === raw) ?? empty) as T | E,
  write: (value) => (value === undefined || value === empty ? undefined : value),
})

/** Several values, carried as one comma list — the shape `ColumnFilterList` hands back. */
export const listField = (): Field<string[]> => ({
  empty: [],
  read: (raw) => (raw ? raw.split(',').filter((v) => v !== '') : []),
  write: (value) => (value.length > 0 ? value.join(',') : undefined),
})

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** A `YYYY-MM-DD` day, for `ColumnFilterRange`. Anything else reads as unset. */
export const dayField = (): Field<string | undefined> => ({
  empty: undefined,
  read: (raw) => (raw !== null && ISO_DAY.test(raw) ? raw : undefined),
  write: (value) => value,
})

/** `write` takes `never` so any `Field<V>` fits a spec; `asField` re-opens it. */
type AnyField = {
  empty: unknown
  read: (raw: string | null) => unknown
  write: (v: never) => string | undefined
}
type Spec = Record<string, AnyField>
type FieldValue<F> = F extends Field<infer V> ? V : never

/** The parsed address. `q` is built in — do not name a spec field `q`. */
export type BookFilters<S extends Spec> = { q: string } & { [K in keyof S]: FieldValue<S[K]> }

const asField = (f: AnyField) => f as Field<unknown>

function readFilters<S extends Spec>(spec: S, params: URLSearchParams): BookFilters<S> {
  const out: Record<string, unknown> = { q: (params.get('q') ?? '').trim() }
  for (const [key, field] of Object.entries(spec)) out[key] = asField(field).read(params.get(key))
  return out as BookFilters<S>
}

/** Start from the current address so a key this hook does not own survives. */
function writeFilters<S extends Spec>(
  spec: S,
  current: URLSearchParams,
  filters: BookFilters<S>,
): URLSearchParams {
  const next = new URLSearchParams(current)
  const values = filters as Record<string, unknown>
  const set = (key: string, wire: string | undefined) =>
    wire === undefined || wire === '' ? next.delete(key) : next.set(key, wire)
  set('q', filters.q)
  for (const [key, field] of Object.entries(spec)) set(key, asField(field).write(values[key]))
  return next
}

/** `spec` must be a module-level constant: it keys the memo that parses the address. */
export function useClientBookFilter<S extends Spec>(spec: S) {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => readFilters(spec, params), [spec, params])

  const [text, setText] = useState(filters.q)
  /* Follow the address only when it differs from what was typed, so a trailing space survives the debounce. */
  useEffect(() => setText((now) => (now.trim() === filters.q ? now : filters.q)), [filters.q])

  useEffect(() => {
    const wanted = text.trim()
    if (wanted === filters.q) return
    const timer = setTimeout(
      () => setParams(writeFilters(spec, params, { ...filters, q: wanted }), { replace: true }),
      SEARCH_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [text, filters, spec, params, setParams])

  /* Filter changes push a history entry: Back undoes the last click, not the last letter. */
  const patch = (next: Partial<BookFilters<S>>) =>
    setParams(writeFilters(spec, params, { ...filters, ...next }))

  const clear = () => {
    setText('')
    const emptied: Record<string, unknown> = { q: '' }
    for (const [key, field] of Object.entries(spec)) emptied[key] = asField(field).empty
    patch(emptied as Partial<BookFilters<S>>)
  }

  /* Reads `text`, not `filters.q`: the button must show from the first keystroke, not after the debounce. */
  const dirty =
    text.trim() !== '' ||
    Object.entries(spec).some(([key, field]) => {
      const value = (filters as Record<string, unknown>)[key]
      return asField(field).write(value) !== asField(field).write(asField(field).empty)
    })

  return { filters, text, setText, patch, clear, dirty }
}
