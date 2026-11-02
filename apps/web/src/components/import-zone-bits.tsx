import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  FileSpreadsheet,
  FileUp,
  GlassCard,
  Icon,
  Kicker,
  SegmentedControl,
  Select,
  TriangleAlert,
} from '@pv/ui'
import type { LeadMotion } from '@pv/engines'
import { message, useI18n } from '@/app/i18n'
import { ACCEPT, type Sheet } from '@/data/intake-file'
import { MOTION_FACE } from '@/data/intake'

/** THE EDGES OF THE IMPORT PANEL — the file strip and encoding warning above
 *  the mapping, the batch-wide card, and the window-wide drop catcher. The
 *  result lists after a load live in `import-zone-results.tsx`.
 *
 *  Split out of `import-zone.tsx` on size alone (`max-lines`). Neither half
 *  reads the pick/map state of the panel, so the seam costs no shared state.
 *  Every table here sits on `.glass-b` — law 8. */

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
  const { t } = useI18n()
  const active = useWindowFileDrag(enabled, onFile)
  if (!active) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[45] flex items-center justify-center bg-[var(--scrim)] p-8">
      <div className="glass-ai animate-scrim-in flex flex-col items-center gap-4 rounded-lg px-12 py-8 text-center">
        <Icon icon={FileUp} size={26} strokeWidth={1.9} className="text-accent-foreground" />
        <p className="font-display text-[18px] font-semibold">
          {t(message('Thả tệp vào đây', 'Drop the file here', '여기에 파일을 놓으세요'))}
        </p>
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
  const { t } = useI18n()
  const tabNote =
    sheet.sheetCount && sheet.sheetCount > 1
      ? t(
          message(
            ` · tệp có ${sheet.sheetCount} tab, đang đọc "${sheet.sheetName}"`,
            ` · the file has ${sheet.sheetCount} tabs, reading "${sheet.sheetName}"`,
            ` · 파일에 시트가 ${sheet.sheetCount}개 있으며 "${sheet.sheetName}"을(를) 읽는 중`,
          ),
        )
      : ''

  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-3 p-4">
      <Icon icon={FileSpreadsheet} size={16} className="text-accent-foreground" />
      <span className="text-[12.5px] font-semibold">{sheet.fileName}</span>
      <span className="text-glass-foreground min-w-[200px] flex-1 text-[11.5px]">
        <span className="font-num tnum">{sheet.rows.length}</span>{' '}
        {t(message('dòng dữ liệu', 'data rows', '개 데이터 행'))}
        {tabNote}
      </span>
      <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onChangeFile}>
        {t(message('Đổi tệp', 'Change file', '파일 변경'))}
      </Button>
    </GlassCard>
  )
}

/** Warns that the file was saved in the wrong encoding. Never repairs it —
 *  see `detectMojibakeColumn`. */
export function MojibakeNote({ column, sample }: { column: string; sample: string }) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-4 p-4">
      <Icon icon={TriangleAlert} size={18} className="text-warning" />
      <p className="text-glass-foreground min-w-[200px] flex-1 text-[11.5px] leading-[1.7]">
        {t(
          message(
            `Tệp lưu sai bảng mã: cột "${column}" hiện "${sample}", mọi cột có dấu đều lỗi. Lưu lại tệp dạng CSV UTF-8 rồi chọn lại, hoặc nạp rồi sửa tay.`,
            `The file was saved in the wrong encoding: column "${column}" shows "${sample}", and every accented column is garbled. Save the file as CSV UTF-8 and pick it again, or import it and fix by hand.`,
            `파일 인코딩이 잘못되었습니다. "${column}" 열이 "${sample}"(으)로 표시되며 악센트가 있는 모든 열이 깨집니다. CSV UTF-8로 다시 저장해 선택하거나, 가져온 뒤 직접 수정하세요.`,
          ),
        )}
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
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-4">
      <Kicker>
        {t(
          message(
            `Áp cho cả ${count} ${noun}`,
            `Applies to all ${count} ${noun}`,
            `${count}개 ${noun} 전체에 적용`,
          ),
        )}
      </Kicker>

      {motions.length > 0 && (
        <div className="flex flex-col gap-2">
          {/* SegmentedControl and not Select: both motions on show can be
              compared, and the definition below follows the active one — a
              popup covers exactly that sentence while it is being read. */}
          <SegmentedControl
            label={t(message('Phương án tiếp cận', 'Approach', '접근 방식'))}
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
          <Kicker>{t(message('Nguồn', 'Source', '출처'))}</Kicker>
          <span className="font-mono text-[12.5px] font-semibold">{scope}</span>
        </div>
      ) : (
        scopeOptions && (
          <div className="flex flex-col gap-2">
            <Select
              label={t(
                message(
                  'Nguồn khi cột Nguồn trống',
                  'Source when the Source column is empty',
                  '출처 열이 비어 있을 때의 출처',
                ),
              )}
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
