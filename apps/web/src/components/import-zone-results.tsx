import { useState, type ReactNode } from 'react'
import {
  Button,
  CircleCheck,
  ColumnFilter,
  ColumnFilterList,
  DataTable,
  Download,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Kicker,
  Progress,
  SearchField,
  SectionTitle,
  TriangleAlert,
  cn,
  type TableColumn,
} from '@pv/ui'
import { message, useI18n, type Message } from '@/app/i18n'
import { downloadCsv } from '@/data/intake-file'
import {
  errorRows,
  originTally,
  type BuiltRow,
  type DupRow,
  type ImportReport,
  type ImportSpec,
  type RowError,
} from '@/data/intake'
import { fuzzyRank } from '@/lib/fuzzy-rank'
import { dealLine } from '@/data/import-held'
import { admissionVerdictText } from '@/data/import-admission-copy'
import { admissionMarkText, hasAdmissionMarks } from '@/data/import-admission'
import { BookCount } from '@/components/book-page'
import { AdmissionMark, AdmissionTally } from '@/components/import-admission'

/** THE RESULT LISTS OF THE IMPORT PANEL — what went in, what stayed out and
 *  why, and the load's progress and tallies.
 *
 *  Split out of `import-zone-bits.tsx` on size alone (`max-lines`).
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
const CLEAR_FILTERS = message('Bỏ hết bộ lọc', 'Clear all filters', '필터 모두 해제')

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
  wide = false,
}: {
  kicker: string
  columns: TableColumn[]
  items: ResultItem[]
  /** Reason kinds for a `ColumnFilter` on the LAST column; absent = search only. */
  kinds?: { value: string; label: string }[]
  /** A fixed-width extra column is present: scroll sooner rather than crush it. */
  wide?: boolean
}) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  if (items.length === 0) return null

  const ofKind = items.filter(
    (item) => picked.length === 0 || (item.kind !== undefined && picked.includes(item.kind)),
  )
  const shown = fuzzyRank(ofKind, q, (item) => [item.haystack])
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
          placeholder={t(
            message(
              'Tìm theo số dòng hoặc nội dung…',
              'Search by row number or content…',
              '행 번호나 내용으로 검색…',
            ),
          )}
          value={q}
          onChange={setQ}
          className="min-w-0 flex-1 sm:max-w-[320px]"
        />
        {dirty && (
          <>
            <BookCount total={shown.length} noun={t(message('dòng', 'rows', '행'))} />
            <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={clear}>
              {t(CLEAR_FILTERS)}
            </Button>
          </>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={t(
            message(
              'Không có dòng khớp bộ lọc.',
              'No rows match the filters.',
              '필터와 일치하는 행이 없습니다.',
            ),
          )}
          action={{ label: t(CLEAR_FILTERS), onClick: clear }}
          className="py-6"
        />
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            className={wide ? 'min-w-[640px]' : 'min-w-[480px]'}
            columns={heads}
            rowHeight="min-h-10 py-2"
            rows={shown.slice(0, LIST_CAP).map((item) => ({ id: item.id, cells: item.cells }))}
          />
        </div>
      )}
      {shown.length > LIST_CAP && (
        <p className="text-muted-foreground text-[11px] leading-[1.6]">
          {t(
            message(
              `Hiện ${LIST_CAP} dòng đầu, trên tổng ${shown.length}.`,
              `Showing the first ${LIST_CAP} rows of ${shown.length}.`,
              `총 ${shown.length}행 중 처음 ${LIST_CAP}행을 표시합니다.`,
            ),
          )}
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

const lineColumn = (t: (copy: Message) => string): TableColumn => ({
  header: t(message('Dòng trong tệp', 'Line in file', '파일 내 행')),
  width: '92px',
  align: 'right',
})
const firstCell = (t: (copy: Message) => string): TableColumn => ({
  header: t(message('Ô đầu dòng', 'First cell', '첫 번째 셀')),
  width: 'minmax(0,1fr)',
})

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
  const { t } = useI18n()
  /* The spec's FIRST field, not a hardcoded `company`: this panel loads three
     books and the opportunity one leads with the deal name. */
  const id = spec.fields[0]
  /* Same rule as the code column: no admission verdicts, no column. */
  const marked = hasAdmissionMarks(rows)

  /* The code column only appears after a real write. On a run that never
     committed there is no code, and an empty column would read as "this row
     went in and lost its code" rather than "nothing was written". */
  const columns: TableColumn[] = [
    lineColumn(t),
    { header: id?.label ?? '', width: 'minmax(0,1fr)' },
    ...(codes ? [{ header: t(message('Mã lead', 'Lead code', '리드 코드')), width: '120px' }] : []),
    ...(marked
      ? [{ header: t(message('Kết quả đối chiếu', 'Match result', '대조 결과')), width: '240px' }]
      : []),
  ]

  return (
    <ResultList
      kicker={t(message('Đã vào sổ', 'Added', '등록됨'))}
      wide={marked}
      columns={columns}
      items={rows.map((row, i) => {
        const first = (id ? row.values[id.key] : undefined) ?? '—'
        const code = codes?.[i] ?? '—'
        return {
          id: String(row.line),
          haystack: `${row.line} ${first} ${codes ? code : ''} ${admissionMarkText(row)}`,
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
            ...(marked ? [<AdmissionMark key="a" row={row} />] : []),
          ],
        }
      })}
    />
  )
}

/** Reason kinds of the refused list, in the order its filter offers them. */
const IN_SYSTEM = message('Đã có trong hệ thống', 'Already in the system', '이미 시스템에 있음')
const REJECT_KINDS = [
  { value: 'broken', label: message('Dòng lỗi', 'Rows with errors', '오류가 있는 행') },
  { value: 'book', label: IN_SYSTEM },
  { value: 'file', label: message('Trùng trong tệp', 'Duplicate in file', '파일 내 중복') },
]

/** One refused row; `deals` are the codes a held row can be sent again with and
 *  `codes` the ones drawn in mono inside its reason lines. */
type Rejected = {
  line: number
  first: string
  why: string[]
  kind: string
  deals?: string[]
  codes?: string[]
}

/** A reason line with its codes in mono, as codes are drawn everywhere else. */
function withCodes(line: string, codes: readonly string[] = []): ReactNode {
  if (codes.length === 0) return line
  const escaped = codes.map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return line.split(new RegExp(`(${escaped.join('|')})`)).map((part, i) =>
    codes.includes(part) ? (
      <span key={i} className="font-mono">
        {part}
      </span>
    ) : (
      part
    ),
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
  resending = false,
  onResend,
}: {
  errors: RowError[]
  withBook?: DupRow[]
  withinFile?: DupRow[]
  spec: ImportSpec
  resending?: boolean
  /** Send a held row again naming the deals it listed (ADR 0088 §9). */
  onResend?: (line: number, deals: string[]) => void
}) {
  const { t } = useI18n()
  /* The header the user is looking at, not the wire name `contactName`. */
  const labelOf = (key: string | undefined) =>
    key === undefined ? undefined : (spec.fields.find((f) => f.key === key)?.label ?? key)

  const bookLabel = spec.bookDupLabel ?? t(IN_SYSTEM)
  const rows: Rejected[] = [
    ...errors.map((e) => {
      const column = labelOf(e.field)
      const why = [column ? `${column}: ${e.reason}` : e.reason]
      return { line: e.line, first: e.first, why, kind: 'broken' }
    }),
    ...(withBook ?? []).map((d) => ({
      line: d.line,
      first: d.first,
      why: d.deals
        ? [
            t(
              message(
                `Lead ${d.leadCode} có cơ hội đang chạy`,
                `Lead ${d.leadCode} has an active opportunity`,
                `리드 ${d.leadCode}에 진행 중인 기회가 있습니다`,
              ),
            ),
            ...d.deals.map(dealLine),
          ]
        : [d.code ? `${bookLabel} (${d.code})` : bookLabel],
      kind: 'book',
      deals: d.deals?.map((deal) => deal.code),
      codes: d.deals && [d.leadCode, ...d.deals.map((deal) => deal.code)],
    })),
    ...(withinFile ?? []).map((d) => ({
      line: d.line,
      first: d.first,
      why: [
        t(
          message(
            'Trùng một dòng khác trong tệp',
            'Duplicates another row in the file',
            '파일의 다른 행과 중복됩니다',
          ),
        ),
      ],
      kind: 'file',
    })),
  ].sort((a, b) => a.line - b.line)
  /* Only the kinds this run produced, so the filter never offers an empty pick. */
  const kinds = REJECT_KINDS.filter((k) => rows.some((r) => r.kind === k.value)).map((k) => ({
    value: k.value,
    label: `${k.value === 'book' ? bookLabel : t(k.label)} · ${rows.filter((r) => r.kind === k.value).length}`,
  }))

  return (
    <ResultList
      kicker={t(message('Không vào hệ thống', 'Not loaded', '시스템에 등록되지 않음'))}
      columns={[
        lineColumn(t),
        firstCell(t),
        { header: t(message('Vấn đề', 'Issue', '문제')), width: 'minmax(0,1.6fr)' },
      ]}
      kinds={kinds}
      wide={Boolean(onResend)}
      items={rows.map((r) => ({
        id: `${r.line}-${r.why[0]}`,
        kind: r.kind,
        haystack: `${r.line} ${r.first} ${r.why.join(' ')}`,
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
            {r.why.map((line) => (
              <span key={line} className="block">
                {withCodes(line, r.codes)}
              </span>
            ))}
            {onResend && r.deals && (
              <Button
                size="md"
                variant="ghost"
                className="pointer-coarse:h-12 mt-2"
                disabled={resending}
                onClick={() => onResend(r.line, r.deals ?? [])}
              >
                {t(
                  message(
                    'Vẫn nạp, đây là nhu cầu khác',
                    'Load anyway, this is a different need',
                    '그래도 등록, 다른 요구입니다',
                  ),
                )}
              </Button>
            )}
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
    <div className="glass-b flex h-full flex-col gap-2 rounded-lg p-4">
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

/** Tally grid by how many optional tiles (grouped, joined) are drawn. Six
 *  tiles go three to a row: six across is unreadable inside the drawer. */
const TALLY_COLUMNS = ['lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-3']

function TallyGrid({ report, spec }: { report: ImportReport; spec: ImportSpec }) {
  const { t } = useI18n()
  const attached = report.attached ?? []
  const joined = report.joined ?? []
  const extraTiles = Number(attached.length > 0) + Number(joined.length > 0)
  return (
    <div className={cn('grid grid-cols-2 gap-3', TALLY_COLUMNS[extraTiles])}>
      <Tally
        label={t(message('Vào sổ', 'Added', '등록됨'))}
        value={report.rows.length}
        tone="success"
      />
      <Tally label={spec.bookDupLabel ?? t(IN_SYSTEM)} value={report.duplicates} />
      <Tally
        label={t(message('Trùng trong tệp', 'Duplicate in file', '파일 내 중복'))}
        value={report.dupInFile}
      />
      <Tally
        label={t(message('Không nạp được', 'Not loaded', '등록 불가'))}
        value={report.errors.length}
        tone="danger"
      />
      {attached.length > 0 && (
        <div className={cn(extraTiles === 1 && 'max-lg:col-span-2')}>
          <Tally
            label={t(message('Gộp vào lead chung', 'Merged into shared lead', '공동 리드로 병합'))}
            value={attached.length}
          />
        </div>
      )}
      {joined.length > 0 && (
        <div className={cn(extraTiles === 1 && 'max-lg:col-span-2')}>
          <Tally
            label={t(
              message('Thêm vào lead đang mở', 'Added to open lead', '진행 중인 리드에 추가'),
            )}
            value={joined.length}
          />
        </div>
      )}
    </div>
  )
}

/** The two lists of rows that went in as part of a group: merged into a shared lead, or added to an open one. */
function HeldLists({ report }: { report: ImportReport }) {
  const { t } = useI18n()
  const attached = report.attached ?? []
  const joined = report.joined ?? []
  return (
    <>
      {/* Its own list, not a line of the refusals below: these rows went in. */}
      <ResultList
        kicker={t(
          message('Đã gộp vào lead chung', 'Merged into shared lead', '공동 리드로 병합됨'),
        )}
        columns={[
          lineColumn(t),
          firstCell(t),
          {
            header: t(message('Vào lead của dòng', 'Into the lead of row', '병합된 행')),
            width: '132px',
            align: 'right',
          },
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
      {/* Went in too, as a person on a lead the book already held. */}
      <ResultList
        kicker={admissionVerdictText('new-contact')}
        columns={[
          lineColumn(t),
          firstCell(t),
          { header: t(message('Vào lead', 'Into lead', '리드')), width: '132px' },
        ]}
        items={joined.map((j) => ({
          id: String(j.line),
          haystack: `${j.line} ${j.first} ${j.code}`,
          cells: [
            <Line key="l" n={j.line} />,
            <Text key="f" value={j.first || '—'} />,
            <span key="c" className="font-mono">
              {j.code}
            </span>,
          ],
        }))}
      />
    </>
  )
}

function ErrorCard({ report, spec }: { report: ImportReport; spec: ImportSpec }) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-4 p-4">
      <Icon icon={TriangleAlert} size={18} className="text-destructive-foreground" />
      <p className="text-destructive-foreground min-w-[200px] flex-1 text-[11.5px] leading-[1.7]">
        {t(
          message(
            `${report.errors.length} dòng không nạp được. Tải tệp lỗi, sửa các dòng đó trong tệp gốc rồi nạp lại. Dòng đã vào sổ không bị nạp hai lần.`,
            `${report.errors.length} rows could not be loaded. Download the error file, fix those rows in the original file, then import again. Rows already added are not imported twice.`,
            `${report.errors.length}개 행을 등록하지 못했습니다. 오류 파일을 내려받아 원본 파일에서 해당 행을 수정한 뒤 다시 가져오세요. 이미 등록된 행은 중복 등록되지 않습니다.`,
          ),
        )}
      </p>
      <Button
        size="md"
        variant="ghost"
        onClick={() => downloadCsv(`${spec.sampleStem}-loi.csv`, errorRows(report.errors, spec))}
      >
        <Icon icon={Download} size={16} />
        {t(message('Tải tệp lỗi', 'Download error file', '오류 파일 내려받기'))}
      </Button>
    </GlassCard>
  )
}

export function StepRun({
  done,
  total,
  report,
  spec,
  resending,
  onResend,
  onSeeResult,
  onClose,
}: {
  done: number
  total: number
  report?: ImportReport
  spec: ImportSpec
  resending?: boolean
  onResend?: (line: number, deals: string[]) => void
  onSeeResult?: () => void
  onClose: () => void
}) {
  const { t } = useI18n()

  return (
    <section className="flex flex-col gap-4">
      {/* No 'step 3' kicker: the bar has two steps, and naming a third one here
          would contradict it. */}
      <SectionTitle size="lg">
        {report
          ? t(message('Đã nạp xong', 'Import complete', '가져오기 완료'))
          : t(message('Đang nạp', 'Importing', '가져오는 중'))}
      </SectionTitle>

      {!report && (
        <GlassCard variant="b" className="flex flex-col gap-3 p-4">
          <Progress
            value={total === 0 ? 0 : done / total}
            label={t(message('Đang dựng dòng', 'Building rows', '행 생성 중'))}
          />
          <p className="text-glass-foreground tnum text-[11.5px]">
            {t(message('Dòng', 'Row', '행'))} <span className="font-num">{done}</span>{' '}
            {t(message('trên', 'of', '/'))} <span className="font-num">{total}</span>
          </p>
        </GlassCard>
      )}

      {report && (
        <>
          <TallyGrid report={report} spec={spec} />

          <AdmissionTally rows={report.rows} />

          {report.origins && (
            <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
              {originTally(report.origins)}
            </p>
          )}

          {report.errors.length > 0 && <ErrorCard report={report} spec={spec} />}

          <DoneRows rows={report.rows} codes={report.codes} spec={spec} />
          <HeldLists report={report} />
          <RejectedRows
            errors={report.errors}
            withBook={report.dupWithBook}
            withinFile={report.dupWithinFile}
            spec={spec}
            resending={resending}
            onResend={onResend}
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
                {t(
                  message(
                    `Xem ${report.rows.length} dòng vừa vào sổ`,
                    `View the ${report.rows.length} rows just added`,
                    `방금 등록된 ${report.rows.length}개 행 보기`,
                  ),
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
