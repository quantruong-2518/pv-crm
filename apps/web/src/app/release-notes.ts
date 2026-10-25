import { useSyncExternalStore } from 'react'
import { RELEASE_NOTES, unseenReleases } from '@/data/release-notes'

/** Open state of the what's-new drawer and which release this browser has
 *  seen last. A module store, not `useState`: the menu row that opens it and
 *  the drawer mounted beside the router are different trees.
 *
 *  `fresh` is how many releases were unseen at the moment of opening; opening
 *  marks all as seen, so the drawer needs its own copy to flag what is new. */

const SEEN_KEY = 'pv-release-seen'

type State = { open: boolean; seen: string | null; fresh: number }

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

let state: State = { open: false, seen: readSeen(), fresh: 0 }
const listeners = new Set<() => void>()

function set(next: State): void {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openReleaseNotes(): void {
  const newest = RELEASE_NOTES[0]?.id ?? null
  try {
    if (newest) localStorage.setItem(SEEN_KEY, newest)
  } catch {
    /* Storage blocked: the badge comes back next visit, nothing breaks. */
  }
  set({ open: true, seen: newest, fresh: unseenReleases(state.seen) })
}

export function closeReleaseNotes(): void {
  set({ ...state, open: false })
}

export function useReleaseNotes(): State & { unseen: number } {
  const current = useSyncExternalStore(subscribe, () => state)
  return { ...current, unseen: unseenReleases(current.seen) }
}
