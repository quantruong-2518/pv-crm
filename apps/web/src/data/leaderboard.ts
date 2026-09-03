import { queryOptions } from '@tanstack/react-query'
import type { SalesLeaderboard } from '@pv/contracts'
import { api } from '@/app/api'

/** The sales desk side by side — `GET /sales/leaderboard`.
 *
 *  Its own file because the row it carries belongs to no module: one row joins
 *  leads, opportunities and contracts, so parking it in any one of those three
 *  data files would make the other two reach across for it.
 *
 *  Gated on the performance permission, not on the three books' own. A person
 *  who can read the desk's performance can read this; asking for all three
 *  book permissions instead would shut out marketing, who holds none of them
 *  and is on the board.
 *
 *  Unscoped on purpose, and the screen has to say so: a leaderboard cut to
 *  "rows you own" is a leaderboard with one row on it. */
export const leaderboardQuery = queryOptions({
  queryKey: ['sales', 'leaderboard'] as const,
  queryFn: ({ signal }) =>
    api.read<SalesLeaderboard>('/sales/leaderboard', {
      need: { branch: 'Sales', permission: 'hiệu-suất.xem' },
      signal,
    }),
  staleTime: 60 * 1000,
})
