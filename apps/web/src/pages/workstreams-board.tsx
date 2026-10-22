import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  TriangleAlert,
  X,
  cn,
} from '@pv/ui'
import type { WorkstreamBookQuery } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { SEARCH_DELAY_MS } from '@/app/book-query'
import {
  DEFAULT_WORKSTREAM_BOOK_QUERY,
  WORKSTREAM_STATUS_LABEL,
  boardColumnId,
  boardStepGroups,
  parseBoardStep,
  parseWorkstreamBookQuery,
  type BoardView,
  withBoardParams,
  workstreamBoardColumnsQuery,
  type BoardStepGroup,
} from '@/data/workstreams'
import { ViewSwitch } from '@/components/book-cards'
import { csvOf } from '@/components/book-columns'
import { BookSearch } from '@/components/book-page'
import { BoardColumn, ColumnSkeleton, LockedColumn, StepRail } from './workstreams-board-parts'
import { VIEW_OPTIONS, WORKSTREAM_SEARCH_HINT } from './workstreams-model'
import { useOwnerName } from './workstreams-filters'

/** The journey book read as a board — `/sales/workstreams?view=kanban`.
 *
 *  Two levels: the six steps of the journey, then the rungs of the ONE step
 *  being read. Which step that is rides on the address, so a board is a link
 *  somebody can paste.
 *
 *  The catalogue door answers what the columns are and how many runs each holds;
 *  every column then pages the book door on its own, which is why one column can
 *  still be loading while the one beside it is drawn.
 *
 *  No ContextRail (law 10) — the same conscious debt the table view records: a
 *  book has no open object to build a chain from. */

/** Three while the catalogue is silent: enough to read as a board, few enough
 *  that the real columns are not a jump. The same reasoning `BookPage` uses for
 *  its three skeleton rows. */
const SKELETON_COLUMNS = [0, 200, 400]

function ColumnRow({ children }: { children: ReactNode }) {
  return <div className="-mx-1 flex items-start gap-3 overflow-x-auto px-1 pb-4">{children}</div>
}

type SetParams = ReturnType<typeof useSearchParams>[1]

/** The search box, written to the address after a pause. Not `useBookQuery`:
 *  that rebuilds the address from the query's own keys and would drop `view`
 *  and `step`, throwing the reader out of the board on the first letter. */
function useBoardSearch(params: URLSearchParams, setParams: SetParams) {
  const urlQ = params.get('q') ?? ''
  const [text, setText] = useState(urlQ)

  /* Follow the address (Back, a link) without eating a trailing space. */
  useEffect(() => setText((now) => (now.trim() === urlQ ? now : urlQ)), [urlQ])

  useEffect(() => {
    const wanted = text.trim()
    if (wanted === urlQ) return
    const timer = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (wanted === '') next.delete('q')
          else next.set('q', wanted)
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, urlQ, setParams])

  return [text, setText] as const
}

/** One active filter, and the button that takes it off — the same ghost button
 *  the table view uses for its account filter. */
function DropFilter({
  label,
  aria,
  mono,
  onDrop,
}: {
  label: string
  aria: string
  mono?: boolean
  onDrop: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="md"
      className={cn('pointer-coarse:h-12', mono && 'font-mono')}
      aria-label={aria}
      onClick={onDrop}
    >
      {label}
      <Icon icon={X} size={16} />
    </Button>
  )
}

export function WorkstreamsBoard() {
  const chrome = useAppChrome({ searchPlaceholder: WORKSTREAM_SEARCH_HINT })
  const [params, setParams] = useSearchParams()
  const base = useMemo(() => parseWorkstreamBookQuery(params), [params])
  const step = parseBoardStep(params)
  const [text, setText] = useBoardSearch(params, setParams)
  const ownerName = useOwnerName()

  const { data, isPending, error, refetch } = useQuery(workstreamBoardColumnsQuery(base))
  const groups = useMemo(() => boardStepGroups(data?.columns), [data])
  const index = groups.findIndex((g) => g.step.key === step)
  const group = groups[index]

  const drop = (name: 'status' | 'accountCode' | 'owner') => {
    const next = new URLSearchParams(params)
    next.delete(name)
    next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          title={<span className="uppercase">Sổ hành trình</span>}
          actions={
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <BookSearch
                value={text}
                onChange={setText}
                placeholder={WORKSTREAM_SEARCH_HINT}
                className="flex-1"
              />
              {/* A filter carried over from the table view must be visible here,
                  or the board is narrowed by something nobody can take off. */}
              {base.status !== DEFAULT_WORKSTREAM_BOOK_QUERY.status && (
                <DropFilter
                  label={WORKSTREAM_STATUS_LABEL[base.status]}
                  aria={`Bỏ lọc trạng thái ${WORKSTREAM_STATUS_LABEL[base.status]}`}
                  onDrop={() => drop('status')}
                />
              )}
              {base.accountCode !== undefined && (
                <DropFilter
                  label={base.accountCode}
                  mono
                  aria={`Bỏ lọc theo công ty ${base.accountCode}`}
                  onDrop={() => drop('accountCode')}
                />
              )}
              {base.owner !== undefined && (
                <DropFilter
                  label={`Người phụ trách: ${csvOf(base.owner).map(ownerName).join(', ')}`}
                  aria="Bỏ lọc theo người phụ trách"
                  onDrop={() => drop('owner')}
                />
              )}
              <ViewSwitch<BoardView>
                value="kanban"
                options={VIEW_OPTIONS}
                onChange={(next) =>
                  setParams(withBoardParams(params, { view: next }), { replace: true })
                }
              />
            </div>
          }
        />

        <StepRail
          groups={groups}
          active={step}
          onSelect={(next) => setParams(withBoardParams(params, { step: next }), { replace: true })}
        />

        {/* Failure, then the wait, then what the catalogue said. The lock can
            only come last now: only the answer knows whether a step is built,
            so the board pays one beat of skeleton before it can say so. */}
        {error ? (
          <GlassCard variant="b">
            <EmptyState
              tone="danger"
              icon={TriangleAlert}
              message={`Không lấy được các cột của sổ hành trình. ${
                isApiError(error) ? userMessage(error) : 'Thử lại.'
              }`}
              action={{ label: 'Thử lại', onClick: () => void refetch() }}
              className="py-12"
            />
          </GlassCard>
        ) : isPending ? (
          <ColumnRow>
            {SKELETON_COLUMNS.map((delay) => (
              <ColumnSkeleton key={delay} delay={delay} />
            ))}
          </ColumnRow>
        ) : (
          <StepColumns group={group} base={base} />
        )}
      </ScreenLayout>
    </AppShell>
  )
}

function StepColumns({
  group,
  base,
}: {
  group: BoardStepGroup | undefined
  base: WorkstreamBookQuery
}) {
  if (!group) return null

  /* The catalogue sent this step nothing, and that absence is the whole flag:
     the screen keeps no list of which blocks are built. */
  if (group.locked) {
    return (
      <ColumnRow>
        <LockedColumn label={group.step.label} />
      </ColumnRow>
    )
  }

  return (
    <ColumnRow>
      {group.columns.map((column) => (
        <BoardColumn key={boardColumnId(column)} base={base} column={column} />
      ))}
    </ColumnRow>
  )
}
