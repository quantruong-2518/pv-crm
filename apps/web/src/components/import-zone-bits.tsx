import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  CircleCheck,
  ColumnFilter,
  ColumnFilterList,
  DataTable,
  Download,
  EmptyState,
  FileSpreadsheet,
  FileUp,
  GlassCard,
  Icon,
  Inbox,
  Kicker,
  Progress,
  SearchField,
  SectionTitle,
  SegmentedControl,
  Select,
  TriangleAlert,
  cn,
  type TableColumn,
} from '@pv/ui'
import type { LeadMotion } from '@pv/engines'
import { ACCEPT, downloadCsv, type Sheet } from '@/data/intake-file'
import {
  MOTION_FACE,
  errorRows,
  normalise,
  originTally,
  type BuiltRow,
  type DupRow,
  type ImportReport,
  type ImportSpec,
  type RowError,
} from '@/data/intake'
import { BookCount } from '@/components/book-page'

/** THE EDGES OF THE IMPORT PANEL — the file strip and encoding warning above
 *  the mapping, the batch-wide card, the result lists after a load, and the
 *  window-wide drop catcher.
 *
 *  Split out of `import-zone.tsx` on size alone (`max-lines`). Neither half
 *  reads the pick/map state of the panel, so the seam costs no shared state.
 *  Every table here sits on `.glass-b` — law 8. */

/** ------------------------------------------------------------------
 *  WHY THE FOUR TALLIES WERE NOT ENOUGH
 *  ------------------------------------------------------------------
 *  A number answers "how many" and the question the person loading a file
 *  actually has is "which ones". "17 rows could not be loaded" leaves them with
 *  a file of 500 rows and no idea where to look.
 *
 *  Two lists: what went in, and what stayed out with its reason.
 *
 *  Capped, and saying so — a 5.000-row batch is a drawer nobody can scroll.
 *  Each list stops here and prints how many it is not showing. */
const LIST_CAP = 50

/** One row of a result list: its cells, the text the search runs over, and —
 *  on the refused list — the reason kind its column filter picks by. */
type ResultItem = { id: string; cells: ReactNode[]; haystack: string; kind?: string }

/** Search and reason filter on LOCAL state, not the address: the list lives in a
 *  drawer that is not a route, and a closed drawer must not leave `?q=` behind.
 *  Filtering runs before the cap, so a match past row 50 is still reachable. */
function ResultList({
  kicker,
  columns,
  items,
  kinds,
}: {
  kicker: string
  columns: TableColumn[]
  items: ResultItem[]
  /** Reason kinds for a `ColumnFilter` on the LAST column; absent = search only. */
  kinds?: { value: string; label: string }[]
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  if (items.length === 0) return null

  const needle = normalise(q)
  const shown = items.filter(
    (item) =>
      (picked.length === 0 || (item.kind !== undefined && picked.includes(item.kind))) &&
      (!needle || normalise(item.haystack).includes(needle)),
  )
  const dirty = q.trim() !== '' || picked.length > 0
  const clear = () => {
    setQ('')
    setPicked([])
  }
  const last = columns.length - 1
  const heads = kinds
    ? columns.map((col, i) =>
        i !== last
          ? col
          : {
              ...col,
              header: (
                <ColumnFilter label={String(col.header)} active={picked.length > 0}>
                  {(close) => (
                    <ColumnFilterList
                      options={kinds}
                      selected={picked}
                      close={close}
                      searchable={false}
                      onApply={setPicked}
                    />
                  )}
                </ColumnFilter>
              ),
            },
      )
    : columns

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <Kicker>
        {kicker} · {items.length}
      </Kicker>
      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          placeholder="Tìm theo số dòng hoặc nội dung…"
          value={q}
          onChange={setQ}
          className="min-w-0 flex-1 sm:max-w-[320px]"
        />
        {dirty && (
          <>
            <BookCount total={shown.length} noun="dòng" />
            <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={clear}>
              Bỏ hết bộ lọc
            </Button>
          </>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message="Không có dòng nào phù hợp với bộ lọc hiện tại."
          action={{ label: 'Bỏ hết bộ lọc', onClick: clear }}
          className="py-6"
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            className="min-w-[480px]"
            columns={heads}
            rowHeight="min-h-10 py-2"
            rows={shown.slice(0, LIST_CAP).map((item) => ({ id: item.id, cells: item.cells }))}
          />
        </div>
      )}
      {shown.length > LIST_CAP && (
        <p className="text-muted-foreground text-[11px] leading-[1.6]">
          Đang hiện {LIST_CAP} dòng đầu trên tổng số {shown.length}.
        </p>
      )}
    </GlassCard>
  )
}

/** Line number, in the file's own numbering: right-aligned under its header
 *  (`LINE_COLUMN`) and mono so digits line up, `text-glass-foreground` like every
 *  other cell — this is the column somebody copies out to find the row (rule 13). */
function Line({ n }: { n: number }) {
  return <span className="text-glass-foreground font-mono">{n}</span>
}

const LINE_COLUMN: TableColumn = { header: 'Dòng trong tệp', width: '92px', align: 'right' }

/** A text cell that truncates and keeps the whole value in its tooltip. */
function Text({ value }: { value: string }) {
  return (
    <span className="block truncate" title={value}>
      {value}
    </span>
  )
}

export function DoneRows({
  rows,
  codes,
  spec,
}: {
  rows: BuiltRow[]
  codes?: string[]
  spec: ImportSpec
}) {
  /* The spec's FIRST field, not a hardcoded `company`: this panel loads three
     books and the opportunity one leads with the deal name. */
  const id = spec.fields[0]

  /* The code column only appears after a real write. On a run that never
     committed there is no code, and an empty column would read as "this row
     went in and lost its code" rather than "nothing was written". */
  const columns: TableColumn[] = [
    LINE_COLUMN,
    { header: id?.label ?? '', width: 'minmax(0,1fr)' },
    ...(codes ? [{ header: 'Mã lead', width: '120px' }] : []),
  ]

  return (
    <ResultList
      kicker="Đã vào sổ"
      columns={columns}
      items={rows.map((row, i) => {
        const first = (id ? row.values[id.key] : undefined) ?? '—'
        const code = codes?.[i] ?? '—'
        return {
          id: String(row.line),
          haystack: `${row.line} ${first} ${codes ? code : ''}`,
          cells: [
            <Line key="l" n={row.line} />,
            <Text key="f" value={first} />,
            ...(codes
              ? [
                  <span key="c" className="font-mono">
                    {code}
                  </span>,
                ]
              : []),
          ],
        }
      })}
    />
  )
}

/** Reason kinds of the refused list, in the order its filter offers them. */
const REJECT_KINDS = [
  { value: 'broken', label: 'Dòng lỗi' },
  { value: 'book', label: 'Đã có trong hệ thống' },
  { value: 'file', label: 'Trùng trong tệp' },
]

/** Every row that stayed out, in ONE table with the reason beside it: broken
 *  cells, rows the system already holds, repeats inside the file. One list
 *  because the person asks one question — "which rows did not go in, and why".
 *
 *  Absent dup arrays mean that loader reports duplicates as counts only (the
 *  recipient and opportunity doors still do); its broken rows are listed alone. */
export function RejectedRows({
  errors,
  withBook,
  withinFile,
  spec,
}: {
  errors: RowError[]
  withBook?: DupRow[]
  withinFile?: DupRow[]
  spec: ImportSpec
}) {
  /* The header the user is looking at, not the wire name `contactName`. */
  const labelOf = (key: string | undefined) =>
    key === undefined ? undefined : (spec.fields.find((f) => f.key === key)?.label ?? key)

  const rows = [
    ...errors.map((e) => {
      const column = labelOf(e.field)
      const why = column ? `${column}: ${e.reason}` : e.reason
      return { line: e.line, first: e.first, why, kind: 'broken' }
    }),
    ...(withBook ?? []).map((d) => ({
      line: d.line,
      first: d.first,
      why: d.code ? `Đã có trong hệ thống (${d.code})` : 'Đã có trong hệ thống',
      kind: 'book',
    })),
    ...(withinFile ?? []).map((d) => ({
      line: d.line,
      first: d.first,
      why: 'Trùng một dòng khác trong tệp',
      kind: 'file',
    })),
  ].sort((a, b) => a.line - b.line)
  /* Only the kinds this run produced, so the filter never offers an empty pick. */
  const kinds = REJECT_KINDS.filter((k) => rows.some((r) => r.kind === k.value)).map((k) => ({
    value: k.value,
    label: `${k.label} · ${rows.filter((r) => r.kind === k.value).length}`,
  }))

  return (
    <ResultList
      kicker="Không vào hệ thống"
      columns={[
        LINE_COLUMN,
        { header: 'Ô đầu dòng', width: 'minmax(0,1fr)' },
        { header: 'Vấn đề', width: 'minmax(0,1.6fr)' },
      ]}
      kinds={kinds}
      items={rows.map((r) => ({
        id: `${r.line}-${r.why}`,
        kind: r.kind,
        haystack: `${r.line} ${r.first} ${r.why}`,
        cells: [
          <Line key="l" n={r.line} />,
          <Text key="f" value={r.first || '—'} />,
          /* Red is for a cell somebody must fix; a duplicate is a neutral fact. */
          <span
            key="w"
            className={cn(
              'block leading-[1.6]',
              r.kind === 'broken' && 'text-destructive-foreground',
            )}
          >
            {r.why}
          </span>,
        ],
      }))}
    />
  )
}

export function Tally({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'success' | 'danger'
}) {
  return (
    <div className="glass-b flex flex-col gap-2 rounded-lg p-4">
      <span
        className={cn(
          'font-num tnum text-[24px] font-semibold leading-none',
          value === 0 && 'text-muted-foreground',
          value > 0 && tone === 'success' && 'text-success',
          value > 0 && tone === 'danger' && 'text-destructive-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-[11.5px]">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The load itself: progress, then the result
// ---------------------------------------------------------------------------

export function StepRun({
  done,
  total,
  report,
  spec,
  onSeeResult,
  onClose,
}: {
  done: number
  total: number
  report?: ImportReport
  spec: ImportSpec
  onSeeResult?: () => void
  onClose: () => void
}) {
  /* An empty list draws nothing: the recipient door gets one from the server
     too, and a zero there would be a tally about a step it never had. */
  const attached = report?.attached ?? []

  return (
    <section className="flex flex-col gap-4">
      {/* No 'step 3' kicker: the bar has two steps, and naming a third one here
          would contradict it. */}
      <SectionTitle size="lg">{report ? 'Đã nạp xong' : 'Đang nạp'}</SectionTitle>

      {!report && (
        <GlassCard variant="b" className="flex flex-col gap-3 p-4">
          <Progress value={total === 0 ? 0 : done / total} label="Đang dựng dòng" />
          <p className="text-glass-foreground tnum text-[11.5px]">
            Dòng <span className="font-num">{done}</span> trên{' '}
            <span className="font-num">{total}</span>
          </p>
        </GlassCard>
      )}

      {report && (
        <>
          <div
            className={`grid grid-cols-2 gap-3 ${attached.length > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
          >
            <Tally label="Vào sổ" value={report.rows.length} tone="success" />
            <Tally label="Đã có trong hệ thống" value={report.duplicates} />
            <Tally label="Trùng trong tệp" value={report.dupInFile} />
            <Tally label="Không nạp được" value={report.errors.length} tone="danger" />
            {attached.length > 0 && (
              <div className="max-lg:col-span-2">
                <Tally label="Gộp vào lead chung" value={attached.length} />
              </div>
            )}
          </div>

          {report.origins && (
            <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
              {originTally(report.origins)}
            </p>
          )}

          {report.errors.length > 0 && (
            <GlassCard variant="b" className="flex flex-wrap items-center gap-4 p-4">
              <Icon icon={TriangleAlert} size={18} className="text-warning" />
              <p className="text-glass-foreground min-w-[200px] flex-1 text-[11.5px] leading-[1.7]">
                {report.errors.length} dòng không nạp được. Tải tệp lỗi về, mở cạnh tệp gốc, sửa
                đúng những dòng đó rồi nạp lại — phần đã vào sổ sẽ bị bắt trùng, không vào hai lần.
              </p>
              <Button
                size="md"
                variant="ghost"
                onClick={() =>
                  downloadCsv(`${spec.sampleStem}-loi.csv`, errorRows(report.errors, spec))
                }
              >
                <Icon icon={Download} size={16} />
                Tải tệp lỗi
              </Button>
            </GlassCard>
          )}

          <DoneRows rows={report.rows} codes={report.codes} spec={spec} />
          {/* Its own list, not a line of the refusals below: these rows went in. */}
          <ResultList
            kicker="Đã gộp vào lead chung"
            columns={[
              LINE_COLUMN,
              { header: 'Ô đầu dòng', width: 'minmax(0,1fr)' },
              { header: 'Vào lead của dòng', width: '132px', align: 'right' },
            ]}
            items={attached.map((a) => ({
              id: String(a.line),
              haystack: `${a.line} ${a.first} ${a.into}`,
              cells: [
                <Line key="l" n={a.line} />,
                <Text key="f" value={a.first || '—'} />,
                <Line key="i" n={a.into} />,
              ],
            }))}
          />
          <RejectedRows
            errors={report.errors}
            withBook={report.dupWithBook}
            withinFile={report.dupWithinFile}
            spec={spec}
          />

          {report.rows.length > 0 && onSeeResult && (
            <div>
              <Button
                size="md"
                onClick={() => {
                  onClose()
                  onSeeResult()
                }}
              >
                <Icon icon={CircleCheck} size={16} />
                Xem {report.rows.length} dòng vừa vào sổ
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// The overlay for a file dragged anywhere on the screen
// ---------------------------------------------------------------------------

/** Listens for a dragged file across the WHOLE WINDOW.
 *
 *  Two jobs, and the second one matters more than the first:
 *   1 · tell the user they can drop — they drag the file in, then go hunting
 *       for a button;
 *   2 · BLOCK the browser default. Drop a .csv on a page that does not block
 *       it and the browser navigates to that file: the app is gone, replaced
 *       by the raw text, and anything unsaved goes with it. That is why this
 *       listener sits on `window` and not on a block of the screen.
 *
 *  Counts enter/leave like `FileDrop` does, for the same reason: `dragleave`
 *  also fires when the cursor crosses a child element. */
function useWindowFileDrag(enabled: boolean, onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  const latest = useRef(onFile)
  latest.current = onFile

  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      if (enabled) setDragging(true)
    }

    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      /* Only claim the drop while this catcher is the one that will handle it:
         this listener runs LAST, so writing 'none' here once overrode the open
         panel's own drop zone and no `drop` event ever reached it. */
      if (enabled && e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }

    const onDrop = (e: DragEvent) => {
      /* Blocked EVEN WHEN `enabled` is off: with the panel open its own drop
         zone takes the file, but a drop landing outside the panel still has to
         be stopped — a slightly missed drop would otherwise cost the app. */
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragging(false)
      if (!enabled) return

      const file = e.dataTransfer?.files[0]
      if (file) latest.current(file)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [enabled])

  return dragging && enabled
}

/** The catcher and the sheet it raises, as ONE export.
 *
 *  They are split in two inside — a hook and a sheet — but the panel only ever
 *  wants both at once, and a file exporting a hook next to components loses
 *  fast refresh for the whole file (`react-refresh/only-export-components`).
 *
 *  `z-[45]`: above the nav (40), below the panel (50). The app's layer ladder
 *  lives in the docblock of `Drawer`; a new layer goes in there, not invented.
 *
 *  `pointer-events-none`: this sheet does NOT take the drop — `window` does.
 *  Letting it catch the mouse swallows the events of everything underneath. */
export function WindowDropCatcher({
  enabled,
  label,
  onFile,
}: {
  enabled: boolean
  label: string
  onFile: (file: File) => void
}) {
  const active = useWindowFileDrag(enabled, onFile)
  if (!active) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[45] flex items-center justify-center bg-[var(--scrim)] p-8">
      <div className="glass-ai animate-scrim-in flex flex-col items-center gap-4 rounded-lg px-12 py-8 text-center">
        <Icon icon={FileUp} size={26} strokeWidth={1.9} className="text-accent-foreground" />
        <p className="font-display text-[18px] font-semibold">Thả tệp ra là nhận</p>
        <p className="text-glass-foreground text-[11.5px]">
          {label} · {ACCEPT.join(' · ')}
        </p>
      </div>
    </div>
  )
}

/** The file being mapped: name, row count, and the way back to step 1.
 *
 *  The multi-tab note sits here rather than after the load, because this is
 *  while the user can still swap files — said afterwards the other tab has
 *  already been dropped. Only spoken above ONE tab; CSV and paste have none. */
export function FileStrip({ sheet, onChangeFile }: { sheet: Sheet; onChangeFile: () => void }) {
  const tabNote =
    sheet.sheetCount && sheet.sheetCount > 1
      ? ` · tệp có ${sheet.sheetCount} tab, đang đọc "${sheet.sheetName}"`
      : ''

  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-3 p-4">
      <Icon icon={FileSpreadsheet} size={16} className="text-accent-foreground" />
      <span className="text-[12.5px] font-semibold">{sheet.fileName}</span>
      <span className="text-glass-foreground min-w-[200px] flex-1 text-[11.5px]">
        <span className="font-num tnum">{sheet.rows.length}</span> dòng dữ liệu{tabNote}
      </span>
      <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onChangeFile}>
        Đổi tệp
      </Button>
    </GlassCard>
  )
}

/** Warns that the file was saved in the wrong encoding. Never repairs it —
 *  see `detectMojibakeColumn`. */
export function MojibakeNote({ column, sample }: { column: string; sample: string }) {
  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-4 p-4">
      <Icon icon={TriangleAlert} size={18} className="text-warning" />
      <p className="text-glass-foreground min-w-[200px] flex-1 text-[11.5px] leading-[1.7]">
        Tệp lưu sai bảng mã — ví dụ cột &quot;{column}&quot; đang ra &quot;{sample}&quot;. Mọi cột
        có dấu đều đang hỏng, không riêng cột này: lưu lại tệp dạng CSV UTF-8 rồi chọn lại, hoặc vẫn
        nạp rồi sửa tay sau.
      </p>
    </GlassCard>
  )
}

/** What a screen adds batch-wide for the motion on show — see
 *  `ImportZoneProps.batchExtra`. */
export type BatchExtra = {
  node: ReactNode
  /** Why the load button stays shut; absent = nothing is missing. */
  missing?: string
  /** Mapping fields this motion does not ask for — out of the grid and the rows. */
  hideFields?: readonly string[]
}

/** Assigned to the WHOLE BATCH — two things no file carries but every row needs.
 *
 *  The motion a file never carries: nobody exports an "inbound or outbound"
 *  column out of Apollo. A source can be carried, but loading from inside a
 *  campaign means that campaign's code wins — the user is standing in it, and
 *  letting them pick again is inviting one wrong pick.
 *
 *  The whole card DISAPPEARS when a door assigns nothing batch-wide (see
 *  `assigns` in `StepMap`): a card down to its title is a blank to decipher. */
export function BatchAssign({
  count,
  noun,
  motion,
  motions,
  onMotion,
  scope,
  scopeOptions,
  picked,
  onPick,
  sourceHint,
  extra,
}: {
  count: number
  noun: string
  motion: LeadMotion
  motions: readonly LeadMotion[]
  onMotion: (m: LeadMotion) => void
  scope?: string
  scopeOptions?: { value: string; label: string }[]
  picked: string
  onPick: (value: string) => void
  sourceHint: string
  extra?: ReactNode
}) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <Kicker>
        Áp cho cả {count} {noun}
      </Kicker>

      {motions.length > 0 && (
        <div className="flex flex-col gap-2">
          {/* SegmentedControl and not Select: both motions on show can be
              compared, and the definition below follows the active one — a
              popup covers exactly that sentence while it is being read. */}
          <SegmentedControl
            label="Phương án tiếp cận"
            value={motion}
            options={motions.map((m) => ({ value: m, label: MOTION_FACE[m].label }))}
            onChange={(v) => onMotion(v as LeadMotion)}
          />
          <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
            {MOTION_FACE[motion].blurb}
          </p>
        </div>
      )}

      {scope ? (
        <div className="flex flex-col gap-2">
          <Kicker>Nguồn</Kicker>
          <span className="font-mono text-[12.5px] font-semibold">{scope}</span>
        </div>
      ) : (
        scopeOptions && (
          <div className="flex flex-col gap-2">
            <Select
              label="Nguồn khi cột Nguồn trống"
              value={picked}
              neutralValue=""
              options={scopeOptions}
              onChange={onPick}
              /* Campaign names run to 40 characters and the box grows to its
                 longest option — unclamped, one box swallows the whole row. */
              className="max-w-[240px]"
            />
            <p className="text-glass-foreground text-[11.5px] leading-[1.7]">{sourceHint}</p>
          </div>
        )
      )}

      {extra}
    </GlassCard>
  )
}
