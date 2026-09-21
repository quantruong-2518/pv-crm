/** Which journey a seller should touch first — declared ONCE, here.
 *
 *  The order is business law, not a screen preference: "most overdue first,
 *  then whoever we are keeping waiting, then whoever has gone quiet longest,
 *  then whoever has waited longest to be started". The book's repository
 *  translates this ladder into `ORDER BY` mechanically and the board paints
 *  the order the server returned, so no second ordering exists to drift.
 *
 *  Rungs 2 and 3 have no column to read today: both would have taken a
 *  trigger on a `platform` table, and that boundary was kept (ADR 0062). The
 *  ladder still states them — the law did not change, only what the database
 *  can answer — and a `sort` key the repository cannot honour is refused at
 *  the door rather than answered in the wrong order. No threshold lives here:
 *  a rung's deadline comes from `config_entry`, measured server-side. */

/** One rung of the ladder. `waitingOverdue` is the only derived field: it is
 *  true when someone else has been kept waiting past the promised date. */
export type WorkstreamPriorityRung = {
  key: 'overdueBy' | 'waitingOverdue' | 'lastContactedAt' | 'openedAt'
  dir: 'asc' | 'desc'
  nulls: 'first' | 'last'
}

/** The four rungs, in the order they decide.
 *
 *  `lastContactedAt` sends nulls FIRST on purpose: a journey nobody has ever
 *  contacted is the coldest one in the book, not the warmest. */
export const WORKSTREAM_PRIORITY_LADDER = [
  { key: 'overdueBy', dir: 'desc', nulls: 'last' },
  { key: 'waitingOverdue', dir: 'desc', nulls: 'last' },
  { key: 'lastContactedAt', dir: 'asc', nulls: 'first' },
  { key: 'openedAt', dir: 'asc', nulls: 'last' },
] as const satisfies readonly WorkstreamPriorityRung[]
