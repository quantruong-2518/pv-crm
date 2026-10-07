import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileUp,
  GlassCard,
  Icon,
  Kicker,
  Progress,
  SectionTitle,
  SegmentedControl,
  Select,
  TriangleAlert,
  cn,
} from '@pv/ui'
import type { LeadMotion } from '@pv/engines'
import { ACCEPT, downloadCsv, type Sheet } from '@/data/intake-file'
import {
  MOTION_FACE,
  errorRows,
  originTally,
  type BuiltRow,
  type DupRow,
  type ImportReport,
  type ImportSpec,
  type RowError,
} from '@/data/intake'

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

function ResultList({
  kicker,
  head,
  count,
  children,
}: {
  kicker: string
  head: string[]
  count: number
  children: ReactNode
}) {
  if (count === 0) return null

  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <Kicker>
        {kicker} · {count}
      </Kicker>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-[11.5px]">
          <thead>
            <tr className="text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-glass-foreground">{children}</tbody>
        </table>
      </div>
      {count > LIST_CAP && (
        <p className="text-muted-foreground text-[11px] leading-[1.6]">
          Đang hiện {LIST_CAP} dòng đầu trên tổng số {count}.
        </p>
      )}
    </GlassCard>
  )
}

/** Line number, in the file's own numbering. Mono because it is read digit by
 *  digit against the left margin of a spreadsheet, and `text-glass-foreground`
 *  like every other cell — this is the column somebody copies out to go and
 *  find the row, so it is not the one to mute (rule 13). */
function Line({ n }: { n: number }) {
  return <td className="text-glass-foreground w-[92px] px-3 py-2 font-mono">{n}</td>
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
  const head = ['Dòng trong tệp', id?.label ?? '', ...(codes ? ['Mã lead'] : [])]

  return (
    <ResultList kicker="Đã vào sổ" head={head} count={rows.length}>
      {rows.slice(0, LIST_CAP).map((row, i) => (
        <tr key={row.line} className="bg-surface-ink/[3%]">
          <Line n={row.line} />
          <td className="max-w-[280px] truncate px-3 py-2">
            {(id ? row.values[id.key] : undefined) ?? '—'}
          </td>
          {codes && <td className="w-[120px] px-3 py-2 font-mono">{codes[i] ?? '—'}</td>}
        </tr>
      ))}
    </ResultList>
  )
}

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
      return { line: e.line, first: e.first, why: column ? `${column}: ${e.reason}` : e.reason }
    }),
    ...(withBook ?? []).map((d) => ({
      line: d.line,
      first: d.first,
      why: d.code ? `Đã có trong hệ thống (${d.code})` : 'Đã có trong hệ thống',
    })),
    ...(withinFile ?? []).map((d) => ({
      line: d.line,
      first: d.first,
      why: 'Trùng một dòng khác trong tệp',
    })),
  ].sort((a, b) => a.line - b.line)

  return (
    <ResultList
      kicker="Không vào hệ thống"
      head={['Dòng trong tệp', 'Ô đầu dòng', 'Vấn đề']}
      count={rows.length}
    >
      {rows.slice(0, LIST_CAP).map((r) => (
        <tr key={`${r.line}-${r.why}`} className="bg-surface-ink/[3%]">
          <Line n={r.line} />
          <td className="max-w-[200px] truncate px-3 py-2">{r.first || '—'}</td>
          <td className="text-destructive-foreground px-3 py-2 leading-[1.6]">{r.why}</td>
        </tr>
      ))}
    </ResultList>
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
            {attached.length > 0 && <Tally label="Gộp vào lead chung" value={attached.length} />}
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
            head={['Dòng trong tệp', 'Ô đầu dòng', 'Vào lead của dòng']}
            count={attached.length}
          >
            {attached.slice(0, LIST_CAP).map((a) => (
              <tr key={a.line} className="bg-surface-ink/[3%]">
                <Line n={a.line} />
                <td className="max-w-[200px] truncate px-3 py-2">{a.first || '—'}</td>
                <Line n={a.into} />
              </tr>
            ))}
          </ResultList>
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
