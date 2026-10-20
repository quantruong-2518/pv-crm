import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MasRecipient } from '@/data/mas-mail-draft'
import { searchableText } from '@/lib/search-box'

const DEBOUNCE_MS = 250

/** Recipients found by typing, for books too long to hand over whole.
 *
 *  `known` only grows: a person picked from one search must stay resolvable
 *  after the next search replaces the visible `hits`. */
export function useRecipientSearch(
  recipients: readonly MasRecipient[],
  search?: (text: string) => Promise<MasRecipient[]>,
) {
  const [found, setFound] = useState<ReadonlyMap<string, MasRecipient>>(new Map())
  const [hits, setHits] = useState<readonly MasRecipient[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef(0)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onSearch = useCallback(
    (text: string) => {
      if (!search) return
      clearTimeout(timer.current)
      const turn = ++latest.current
      const typed = searchableText(text)
      if (typed === undefined) return setHits(null)
      timer.current = setTimeout(() => {
        search(typed)
          .then((rows) => {
            if (turn !== latest.current) return
            setHits(rows)
            setFound((current) => new Map([...current, ...rows.map((r) => [r.code, r] as const)]))
          })
          .catch(() => turn === latest.current && setHits([]))
      }, DEBOUNCE_MS)
    },
    [search],
  )

  const known = useMemo(
    () => [...new Map([...found, ...recipients.map((r) => [r.code, r] as const)]).values()],
    [found, recipients],
  )
  return { known, suggestions: hits ?? recipients, onSearch: search ? onSearch : undefined }
}
