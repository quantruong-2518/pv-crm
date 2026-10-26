import { useEffect, useMemo, useState } from 'react'
import { read, utils, type WorkBook } from 'xlsx'
import { SegmentedControl, Skeleton } from '@pv/ui'

/* A preview, not an editor: past this many rows the download is the way in. */
const ROW_CAP = 1000

/** Excel through SheetJS — the one reader that takes both .xls and .xlsx.
 *  Cells print as Excel formats them (`raw: false`), so dates and money read
 *  the way the sender saw them. Default export: loaded lazily by the preview. */
export default function SheetView({ blob }: { blob: Blob }) {
  const [book, setBook] = useState<WorkBook | null>(null)
  const [sheet, setSheet] = useState('')

  useEffect(() => {
    let alive = true
    void blob.arrayBuffer().then((data) => {
      if (!alive) return
      const parsed = read(data, { dense: true })
      setBook(parsed)
      setSheet(parsed.SheetNames[0] ?? '')
    })
    return () => {
      alive = false
    }
  }, [blob])

  const rows = useMemo(() => {
    const at = book?.Sheets[sheet]
    return at
      ? utils.sheet_to_json<unknown[]>(at, {
          header: 1,
          raw: false,
          defval: '',
          blankrows: false,
          dateNF: 'dd/mm/yyyy',
        })
      : []
  }, [book, sheet])

  if (!book) return <Skeleton className="h-96 w-full" />
  const width = rows.reduce((most, row) => Math.max(most, row.length), 0)

  return (
    <div className="flex flex-col gap-3">
      {book.SheetNames.length > 1 && (
        <SegmentedControl
          label="Trang tính"
          hideLabel
          size="sm"
          tone="quiet"
          value={sheet}
          options={book.SheetNames.map((name) => ({ value: name, label: name }))}
          onChange={setSheet}
          className="overflow-x-auto"
        />
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground m-0 py-8 text-center text-[13px]">Trang này trống.</p>
      ) : (
        <div className="bg-surface-ink/9 overflow-x-auto rounded-lg">
          <table className="tnum w-max min-w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="text-muted-foreground">
                <th />
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} className="px-3 py-1 text-left font-medium">
                    {utils.encode_col(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, ROW_CAP).map((row, r) => (
                <tr key={r} className="even:bg-surface-ink/[4.5%]">
                  <th className="text-muted-foreground px-2 py-1 text-right font-normal">
                    {r + 1}
                  </th>
                  {Array.from({ length: width }, (_, c) => (
                    <td key={c} className="max-w-80 truncate whitespace-nowrap px-3 py-1">
                      {String(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > ROW_CAP && (
        <p className="text-muted-foreground m-0 text-[12px]">
          Đang hiện {ROW_CAP.toLocaleString('vi-VN')} / {rows.length.toLocaleString('vi-VN')} dòng.
          Tải xuống để xem đủ.
        </p>
      )}
    </div>
  )
}
