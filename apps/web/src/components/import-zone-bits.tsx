import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, FileSpreadsheet, FileUp, GlassCard, Icon, Kicker, TriangleAlert, cn } from '@pv/ui'
import { ACCEPT, type Sheet } from '@/data/intake-file'
import type { BuiltRow, DupRow, ImportSpec, RowError } from '@/data/intake'

/** THE EDGES OF THE IMPORT PANEL — the file strip and encoding warning above
 *  the mapping, the result lists after a load, and the window-wide drop catcher.
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
 *  Three lists and not one table with a status column: the three outcomes need
 *  different columns and lead to different actions.
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

export function FailedRows({ errors, spec }: { errors: RowError[]; spec: ImportSpec }) {
  /* The header the user is looking at, not the wire name `contactName`. Falls
     back to the key, then a dash — a row can fail as a WHOLE rather than at one
     column, and that is an answer rather than a missing one. */
  const labelOf = (key: string | undefined) =>
    key === undefined ? '—' : (spec.fields.find((f) => f.key === key)?.label ?? key)

  return (
    <ResultList
      kicker="Không nạp được"
      head={['Dòng trong tệp', 'Ô đầu dòng', 'Cột sai', 'Vì sao']}
      count={errors.length}
    >
      {errors.slice(0, LIST_CAP).map((e) => (
        <tr key={e.line} className="bg-surface-ink/[3%]">
          <Line n={e.line} />
          <td className="max-w-[200px] truncate px-3 py-2">{e.first || '—'}</td>
          <td className="text-warning w-[140px] whitespace-nowrap px-3 py-2">{labelOf(e.field)}</td>
          <td className="text-destructive-foreground px-3 py-2 leading-[1.6]">{e.reason}</td>
        </tr>
      ))}
    </ResultList>
  )
}

/** Duplicates are neither done nor broken, so they get their own list.
 *
 *  The two kinds stay apart in one table, via the column naming what each row
 *  collided with, rather than in two tables: a collision with the book is the
 *  ordinary outcome of loading a list twice, a collision inside the file is a
 *  defect in the file, and the reader needs to tell them apart — but they are
 *  one decision, taken in one sitting, over one list.
 *
 *  Absent arrays mean this loader reports duplicates as counts only (the
 *  recipient and opportunity doors still do), and then nothing is drawn — a
 *  list that cannot be filled must not appear as an empty one. */
export function DroppedRows({
  withBook,
  withinFile,
}: {
  withBook?: DupRow[]
  withinFile?: DupRow[]
}) {
  const rows = [
    ...(withBook ?? []).map((d) => ({ ...d, why: d.code ? `Lead ${d.code}` : 'Một lead đã có' })),
    ...(withinFile ?? []).map((d) => ({ ...d, why: 'Một dòng khác trong chính tệp này' })),
  ].sort((a, b) => a.line - b.line)

  return (
    <ResultList
      kicker="Bỏ vì trùng"
      head={['Dòng trong tệp', 'Ô đầu dòng', 'Trùng với']}
      count={rows.length}
    >
      {rows.slice(0, LIST_CAP).map((d) => (
        <tr key={`${d.line}-${d.why}`} className="bg-surface-ink/[3%]">
          <Line n={d.line} />
          <td className="max-w-[240px] truncate px-3 py-2">{d.first || '—'}</td>
          <td className="px-3 py-2">{d.why}</td>
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
      <Button size="md" variant="ghost" onClick={onChangeFile}>
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
