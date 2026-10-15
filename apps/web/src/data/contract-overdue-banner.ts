import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { vnd, type ActionBannerItem } from '@pv/ui'
import { useSession } from '@/app/auth'
import { dm } from '@/lib/date'
import {
  notificationListQuery,
  overdueInstallment,
  useMarkNotificationsRead,
  useNotificationPath,
  type OverdueInstallment,
} from './notifications'

/** The bottom-centre popup for an overdue installment (ADR 0096), fed by the
 *  bell's own list (same key as the chrome's preload, so no extra read; the
 *  SSE stream refreshes it). Only an important row the reader may open pops;
 *  the action marks it read as a toast's "Xem" does, closing leaves it unread.
 *
 *  `localStorage` only remembers which rows this browser has already popped,
 *  written the moment one is shown so an F5 does not pop it again. It is a
 *  courtesy, not dedup: the server writes one row per installment and due day.
 *
 *  The showing list sits in a module store, not `useState`: `useAppChrome`
 *  runs per screen, and a row already marked shown would vanish on the next
 *  navigation. */

const SHOWN_KEY = 'pv-overdue-banner-shown'
/** Ids are uuids, one per row; the oldest fall off so the key cannot grow. */
const SHOWN_MAX = 200
/** One at a time: three stacked, non-dismissing banners would cover most of a
 *  phone screen. The rest wait their turn behind this one. */
const SHOWING_MAX = 1

function readShown(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function rememberShown(ids: string[]): void {
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify([...readShown(), ...ids].slice(-SHOWN_MAX)))
  } catch {
    /* Storage blocked: the popup still shows for this visit. */
  }
}

type BannerState = {
  owner: string | undefined
  showing: OverdueInstallment[]
}

const useBanners = create<BannerState>()(() => ({ owner: undefined, showing: [] }))

const dismiss = (id: string) =>
  useBanners.setState((s) => ({ showing: s.showing.filter((row) => row.id !== id) }))

export function useOverdueBanners(): {
  items: ActionBannerItem[]
  dismiss: (id: string) => void
} {
  const navigate = useNavigate()
  const pathOf = useNotificationPath()
  const { mutate: markRead } = useMarkNotificationsRead()
  const userId = useSession((s) => (s.status === 'signed-in' ? s.actor?.id : undefined))
  const { data } = useInfiniteQuery({ ...notificationListQuery(), enabled: Boolean(userId) })
  const { owner, showing } = useBanners()

  useEffect(() => {
    /* Another person signed in on this tab: the last one's popups are not theirs. */
    if (owner !== userId) {
      useBanners.setState({ owner: userId, showing: [] })
      return
    }
    if (showing.length >= SHOWING_MAX) return
    const shown = new Set(readShown())
    const next = (data?.rows ?? [])
      .filter((row) => row.readAt === null && row.important && !shown.has(row.id) && pathOf(row))
      .map(overdueInstallment)
      .filter((row): row is OverdueInstallment => row !== null)
      .slice(0, SHOWING_MAX - showing.length)
    if (next.length === 0) return
    rememberShown(next.map((row) => row.id))
    useBanners.setState({ showing: [...showing, ...next] })
  }, [data, owner, pathOf, showing, userId])

  /* `owner` lags `userId` by one render right after a sign-in swap on the same
     tab — the effect above has not cleared `showing` yet. Gate the read here
     too, or that one frame draws the previous person's banner. */
  const items = (owner === userId ? showing : []).map((row): ActionBannerItem => ({
    id: row.id,
    title: `Đợt ${row.no} hợp đồng ${row.code} đã quá hạn thu`,
    detail:
      [
        row.company,
        row.amount === null ? null : vnd(row.amount),
        row.due === null ? null : `hạn ${dm(row.due)}`,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    action: {
      label: 'Xem đợt thanh toán',
      onClick: () => {
        markRead({ ids: [row.id] })
        navigate(row.path)
      },
    },
  }))

  return { items, dismiss }
}
