import { useState, type ReactNode } from 'react'
import { CircleCheck, Download, TriangleAlert, Upload } from '@pv/ui'
import {
  Badge,
  Button,
  Chip,
  Drawer,
  FileDrop,
  GlassCard,
  Icon,
  Kicker,
  Progress,
  SectionTitle,
  Select,
  Stepper,
  cn,
} from '@pv/ui'
import { MOTION_BY_INTAKE, type LeadMotion } from '@pv/engines'
import {
  ACCEPT,
  MAX_BYTES,
  detectMojibakeColumn,
  downloadCsv,
  readSheet,
  sheetFromPaste,
  SheetError,
  type Sheet,
} from '@/data/intake-file'
import {
  buildRows,
  errorRows,
  guessMapping,
  originTally,
  sampleRows,
  trustOf,
  unmappedRequired,
  type BuiltRow,
  type ColumnMapping,
  type ImportField,
  type ImportReport,
  type ImportSpec,
} from '@/data/intake'
import {
  BatchAssign,
  DoneRows,
  DroppedRows,
  FailedRows,
  FileStrip,
  MojibakeNote,
  Tally,
  WindowDropCatcher,
  type BatchExtra,
} from '@/components/import-zone-bits'

/** Luồng nạp tệp — MỘT component cho cả ba sổ.
 *
 *  ------------------------------------------------------------------
 *  MỘT DÒNG TRÊN MỖI MÀN
 *  ------------------------------------------------------------------
 *  `ImportZone` gói cả ba mảnh của luồng: cái nút, tấm phủ khi kéo tệp vào màn,
 *  và panel. Màn chỉ phải viết đúng một thẻ. Bày ba mảnh ra cho từng màn tự lắp
 *  thì ba sổ sẽ lắp ba kiểu, và cái sai đầu tiên sẽ là màn quên tấm phủ — tức
 *  người dùng kéo tệp vào rồi ngồi nhìn trình duyệt mở tệp đè lên cả app.
 *
 *  ------------------------------------------------------------------
 *  HAI BƯỚC TRÊN `Stepper`, BỐN TRẠNG THÁI BÊN TRONG
 *  ------------------------------------------------------------------
 *   1 · **Chọn tệp** — sáu đường vào của `FileDrop`, cộng khối "Tệp cần có".
 *   2 · **Khớp cột và nạp** — chỗ NGƯỜI phải nhìn, và là bước không bỏ được: hệ
 *       đoán được phần lớn cột theo tên, nhưng đoán sai một cột là 400 số điện
 *       thoại chui vào ô mã số thuế mà không ai biết cho tới lúc gọi khách.
 *       Thanh tiến độ và bảng kết quả mọc THÊM dưới bảng khớp cột chứ không
 *       thành bước thứ ba: nạp không phải một quyết định nữa của người dùng, nó
 *       là cái đuôi của quyết định vừa bấm.
 *
 *  Panel KHÔNG tự đóng khi xong: bảng kết quả là thứ đáng đọc nhất của cả
 *  luồng, và đóng nó lại để bắn một cái toast là đổi một bảng bốn con số lấy
 *  một dòng chữ. Toast bắn thêm cho người đã nhìn đi chỗ khác, không thay bảng.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG PHẢI KHỐI AI — LUẬT 9 KHÔNG ÁP VÀO ĐÂY
 *  ------------------------------------------------------------------
 *  Bảng khớp cột đoán bằng so tên cột với một bảng bí danh CỐ ĐỊNH: cùng một
 *  tệp luôn ra cùng một bảng khớp, và mọi ô đều sửa được trước khi bấm. Đó là
 *  một phép tra, không phải một đề xuất của AI — nên nó không mang dòng
 *  "Căn cứ:" và không cần nút xác nhận riêng theo luật 9. Nút "Nạp" ở chân panel
 *  là nút của NGƯỜI DÙNG, không phải nút gật cho máy. */
/** Những gì màn nhận được khi người dùng bấm nạp.
 *
 *  Kiểu riêng chứ không viết thẳng trong props, vì cả ba màn đều phải khai lại
 *  đúng hình này cho handler của mình — và một bản chép tay ở mỗi màn là ba chỗ
 *  để lệch khi thêm trường thứ năm. */
export type ImportCommit = {
  /** Dòng đã qua kiểm và đã loại trùng, mỗi dòng kèm Ô ĐẦU TIÊN y như trong tệp.
   *
   *  `first` không nằm trên `BuiltRow`: `buildRows` tính nó cho mọi dòng nhưng
   *  chỉ giữ lại ở dòng HỎNG (`RowError.first`). Cửa nạp của máy chủ thì đòi nó
   *  cho MỌI dòng, nên panel đọc lại từ chính tệp — xem `firstCellOf`. */
  rows: (BuiltRow & { first: string })[]
  motion: LeadMotion
  fileName: string
  /** Bốn con số panel tự đếm trong trình duyệt — màn dùng để dựng dòng phụ của
   *  toast, và là báo cáo panel vẽ khi `onCommit` không trả về báo cáo nào. */
  report: ImportReport
}

export type ImportZoneProps = {
  spec: ImportSpec
  /** Khoá chống trùng của sổ đang mở. */
  existingKeys: ReadonlySet<string>
  /** Mã nguồn gán CỐ ĐỊNH cho cả lô — hồ sơ chiến dịch truyền mã của nó vào.
   *  Có nó thì người dùng không chọn lại được, và đó là chủ ý: họ đang đứng
   *  trong chính hồ sơ đó, để chọn lại là mời một lần chọn nhầm. */
  scope?: string
  /** Tên chỗ nạp, in ở dòng phụ của panel. */
  scopeLabel?: string
  /** Danh sách nguồn để người dùng CHỌN, dùng khi nạp từ sổ chứ không từ trong
   *  một hồ sơ. Bỏ qua khi `scope` có giá trị — cố định thắng chọn. */
  scopeOptions?: { value: string; label: string }[]
  /** The batch-wide control the screen owns for the motion on show — the lead
   *  book's origin, campaign or partner pick. Drawn inside the "apply to all"
   *  card; its value never passes through the panel, `onCommit` reads it. */
  batchExtra?: (motion: LeadMotion) => BatchExtra
  /** Nạp thật — màn tự đẩy dòng vào sổ của nó và tự bắn toast.
   *
   *  Panel KHÔNG tự ghi vào kho: ba sổ ghi vào ba chỗ khác nhau và dựng dòng
   *  bằng ba hàm khác nhau (`rowsToLeads` · `rowsToOps`). Nhét cả ba vào đây thì
   *  panel phải biết cả ba sổ — đúng thứ nó được tách ra để khỏi phải biết. Sổ
   *  lead nay ghi lên máy chủ, hai sổ kia còn ghi cục bộ; đó chính là ba chỗ
   *  ghi khác nhau mà cửa này giữ cho panel khỏi phải phân biệt.
   *
   *  TRẢ VỀ MỘT BÁO CÁO = BÁO CÁO CỦA BÊN ĐÃ GHI THẬT, và panel vẽ nó thay cho
   *  bốn con số nó tự đếm. Đây là cửa cho màn ghi qua mạng: trình duyệt và máy
   *  chủ chống trùng bằng hai khoá khác nhau, nên "5 dòng vào sổ" đếm ở đây
   *  trong khi máy chủ ghi 3 là panel nói dối. Màn ghi cục bộ không trả gì và
   *  panel dùng báo cáo cũ — y như trước, không sổ nào phải đổi theo.
   *
   *  KHÔNG ĐƯỢC NÉM. Panel không có chữ nào để nói về một lần ghi hỏng, và nó
   *  cũng không biết dòng nào đã kịp vào sổ. Màn nào gọi mạng thì tự bắt lỗi
   *  của mình và trả về một báo cáo nói đúng những gì đã vào sổ. */
  onCommit: (input: ImportCommit & { scope?: string }) => void | Promise<ImportReport | void>
  /** Sau khi nạp xong, đưa người dùng đi đâu. Bỏ trống = toast không có nút. */
  onSeeResult?: () => void
  buttonLabel?: string
  className?: string
}

type Phase = 'pick' | 'map' | 'run' | 'done'

/** The two steps of the bar. `run` and `done` get NO step of their own — they
 *  grow under the mapping table, so the bar stays on step 2 while loading. */
const STEPS = [
  { key: 'pick', label: 'Chọn tệp' },
  { key: 'map', label: 'Khớp cột và nạp' },
]

/** Số dòng xem trước ở bước 2. Ba là đủ để thấy cột lệch mà chưa phải cuộn. */
const PREVIEW = 3

/** Ô đầu tiên của một dòng, đọc lại từ chính tệp theo số dòng.
 *
 *  `buildRows` tính đúng ô này cho mọi dòng — `(raw[0] ?? '').trim()` — nhưng
 *  chỉ giữ nó lại ở dòng HỎNG, nên một dòng qua được cửa không mang nó theo.
 *  Cửa nạp của máy chủ lại đòi nó cho mọi dòng: khớp cột xong là thứ tự cột gốc
 *  mất, máy chủ dựng lại không được, và tệp lỗi tải về thiếu cột đó là mất thứ
 *  duy nhất giúp người ta tìm lại dòng trong bảng tính của mình.
 *
 *  `-2` là phép nghịch của `line = i + 2` trong `buildRows` (một cho dòng tiêu
 *  đề, một vì bảng tính đếm từ 1). Đọc lại từ `sheet` chứ KHÔNG lấy tạm
 *  `values.company`: cột company chỉ trùng ô đầu khi bảng khớp cột tình cờ đặt
 *  nó ở cột thứ nhất. */
const firstCellOf = (sheet: Sheet, line: number) => (sheet.rows[line - 2]?.[0] ?? '').trim()

export function ImportZone({
  spec,
  existingKeys,
  scope,
  scopeLabel,
  scopeOptions,
  batchExtra,
  onCommit,
  onSeeResult,
  buttonLabel,
  className,
}: ImportZoneProps) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(scopeOptions?.[0]?.value ?? '')
  const [phase, setPhase] = useState<Phase>('pick')
  const [sheet, setSheet] = useState<Sheet>()
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [motion, setMotion] = useState<LeadMotion>(spec.defaultMotion)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [report, setReport] = useState<ImportReport>()
  /** Optional fields shown in the mapping table with no column matched — the
   *  match-more button was pressed, or the user touched that select. Once shown
   *  they stay: a select vanishing on being set back to skip cannot be undone. */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set())

  const reset = () => {
    setPhase('pick')
    setSheet(undefined)
    setMapping({})
    setMotion(spec.defaultMotion)
    setError(undefined)
    setBusy(false)
    setDone(0)
    setReport(undefined)
    setRevealed(new Set())
  }

  const close = () => {
    setOpen(false)
    /* Dọn SAU khi panel trượt xong, không dọn ngay: dọn ngay thì bảng kết quả
       biến mất trong lúc panel còn đang đi ra, và người dùng thấy một panel
       trắng trượt sang phải. 180ms là `--motion-duration`. */
    setTimeout(reset, 180)
  }

  /** Nhận một tệp: đọc, đoán bảng khớp, sang bước 2. */
  const take = async (file: File) => {
    setBusy(true)
    setError(undefined)
    try {
      const read = await readSheet(file)
      setSheet(read)
      /* Dòng dữ liệu đi cùng tiêu đề: khi nhiều cột cùng khớp một trường, bộ
         đoán lấy cột ĐẦY nhất thay vì cột đứng trước. Tệp Apollo là ca mẫu —
         'City' đứng trước 'Company State' mà rỗng ở phần lớn dòng. */
      setMapping(guessMapping(read.headers, spec, read.rows))
      setPhase('map')
    } catch (e) {
      setError(e instanceof SheetError ? e.message : 'Không đọc được tệp này.')
      setPhase('pick')
    } finally {
      setBusy(false)
    }
  }

  /** Nhận một mảng ô dán từ Excel. Cùng đường với tệp từ chỗ này trở đi. */
  const takePaste = (text: string) => {
    setError(undefined)
    try {
      const read = sheetFromPaste(text)
      setSheet(read)
      setMapping(guessMapping(read.headers, spec, read.rows))
      setPhase('map')
    } catch (e) {
      setError(e instanceof SheetError ? e.message : 'Không đọc được phần vừa dán.')
    }
  }

  const extra = batchExtra?.(motion)
  const liveSpec = extra?.hideFields
    ? { ...spec, fields: spec.fields.filter((f) => !extra.hideFields?.includes(f.key)) }
    : spec
  /** Nguồn thật của lô: cố định thắng chọn, chọn thắng bỏ trống. */
  const effectiveScope = scope ?? (picked === '' ? undefined : picked)

  /** Chạy thật. */
  const run = async () => {
    if (!sheet) return
    setPhase('run')
    setDone(0)

    const built = await buildRows(sheet, mapping, liveSpec, existingKeys, (n) => setDone(n))

    /* Khối nạp đứng nguyên ở "Đang nạp" cho tới khi người ghi trả lời. Nhảy sang
       bảng kết quả trước đó là vẽ bốn con số chưa ai xác nhận, rồi sửa chúng
       dưới mắt người đang đọc. */
    let final: ImportReport = built
    if (built.rows.length > 0) {
      try {
        const written = await onCommit({
          rows: built.rows.map((row) => ({ ...row, first: firstCellOf(sheet, row.line) })),
          motion,
          fileName: sheet.fileName,
          report: built,
          scope: effectiveScope,
        })
        /* The server's four numbers win — that is what `onCommit` is for —
           but its error LIST only covers rows it was actually sent. Rows this
           browser refused never left the machine, so replacing the list drops
           them: the panel would report 6 rows refused for a file where 9
           failed, and the three it forgot are the ones whose column is named.
           The two lists are disjoint by construction (a row is either in
           `built.rows` or in `built.errors`), so joining them cannot double
           count. */
        if (written)
          final = {
            ...written,
            errors: [...built.errors, ...written.errors].sort((a, b) => a.line - b.line),
          }
      } catch {
        /* Lưới an toàn cho một màn viết sai hợp đồng "không được ném" ở
           `onCommit` — không có nó thì bước 3 treo ở thanh tiến độ mãi mãi.
           Không dòng nào được tính là đã vào sổ: panel vừa mất người duy nhất
           biết chuyện gì đã xảy ra, nên nó không được đoán hộ. */
        final = { ...built, rows: [] }
      }
    }

    setReport(final)
    setPhase('done')
  }

  const missing = sheet ? unmappedRequired(mapping, liveSpec) : []
  /* Không có `motions` = luồng này không hỏi thế, và bước 2 giấu hẳn ô đó —
     xem docblock của `ImportSpec.motions`. `motion` vẫn giữ `defaultMotion` để
     `onCommit` luôn chở một giá trị; cửa nào không có cột thế thì bỏ nó ở
     đường dịch của mình, không phải ở đây. */
  const motions = (spec.motions ?? []).filter((m) => MOTION_BY_INTAKE[spec.intake].includes(m))
  const trust = trustOf(spec.intake)

  return (
    <div className={className}>
      <Button size="md" variant="ghost" onClick={() => setOpen(true)}>
        <Icon icon={Upload} size={16} />
        {buttonLabel ?? 'Nạp tệp'}
      </Button>

      {/* Tấm phủ chỉ nghe khi panel ĐÓNG. Panel mở rồi thì vùng thả nằm trong
          panel lo phần đó, và hai chỗ cùng nghe một cú thả là nhận hai lần. */}
      <WindowDropCatcher
        enabled={!open}
        label={spec.title}
        onFile={(file) => {
          setOpen(true)
          void take(file)
        }}
      />

      <Drawer
        open={open}
        onClose={close}
        width="lg"
        title={spec.title}
        subtitle={scopeLabel ? `${spec.blurb} · ${scopeLabel}` : spec.blurb}
        meta={<Badge tone={trust.tone}>{trust.label}</Badge>}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground text-[11.5px]">
              {phase === 'done'
                ? 'Nạp xong — đóng panel để về sổ.'
                : missing.length > 0
                  ? `Còn thiếu cột: ${missing.join(' · ')}`
                  : (extra?.missing ?? trust.blurb)}
            </span>
            <div className="flex items-center gap-3">
              <Button size="md" variant="ghost" onClick={close}>
                {phase === 'done' ? 'Đóng' : 'Huỷ'}
              </Button>
              {phase === 'map' && (
                <Button
                  size="md"
                  disabled={missing.length > 0 || extra?.missing !== undefined}
                  onClick={() => void run()}
                >
                  Nạp {sheet?.rows.length ?? 0} dòng
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <Stepper
            steps={STEPS}
            current={phase === 'pick' ? 0 : 1}
            reached={sheet ? 1 : 0}
            /* The bar is frozen while loading and after: stepping back mid-run
               abandons a batch in flight, and once it is over the result table
               is the thing to read. */
            onGo={
              phase === 'run' || phase === 'done'
                ? undefined
                : (i) => setPhase(i === 0 || !sheet ? 'pick' : 'map')
            }
          />

          {phase === 'pick' ? (
            <StepPick
              spec={spec}
              busy={busy}
              error={error}
              fileName={sheet?.fileName}
              onPick={(f) => void take(f)}
              onPasteText={takePaste}
            />
          ) : (
            sheet && (
              <StepMap
                spec={liveSpec}
                sheet={sheet}
                mapping={mapping}
                onMap={(key, at) => {
                  setMapping((m) => ({ ...m, [key]: at }))
                  setRevealed((keys) => new Set(keys).add(key))
                }}
                revealed={revealed}
                onRevealAll={() => setRevealed(new Set(spec.fields.map((f) => f.key)))}
                onChangeFile={() => setPhase('pick')}
                motion={motion}
                motions={motions}
                onMotion={setMotion}
                scope={scope}
                scopeOptions={scope ? undefined : scopeOptions}
                picked={picked}
                onPick={setPicked}
                batchExtra={extra?.node}
                locked={phase !== 'map'}
              />
            )
          )}

          {(phase === 'run' || phase === 'done') && sheet && (
            <StepRun
              done={done}
              total={sheet.rows.length}
              report={report}
              spec={spec}
              onSeeResult={onSeeResult}
              onClose={close}
            />
          )}
        </div>
      </Drawer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bước 1 · Chọn tệp
// ---------------------------------------------------------------------------

function StepPick({
  spec,
  busy,
  error,
  fileName,
  onPick,
  onPasteText,
}: {
  spec: ImportSpec
  busy: boolean
  error?: string
  fileName?: string
  onPick: (file: File) => void
  onPasteText: (text: string) => void
}) {
  const required = spec.fields.filter((f) => f.required)

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle size="lg">Chọn tệp</SectionTitle>

      <FileDrop
        accept={ACCEPT}
        maxBytes={MAX_BYTES}
        busy={busy}
        error={error}
        fileName={fileName}
        onPick={onPick}
        /* Đường dán chỉ mở ở bước 1 — nay là do chính khối này chỉ đứng ở bước
           1: dán một bảng khác lúc đang khớp cột sẽ vứt bảng khớp vừa sửa. */
        onPasteText={onPasteText}
      />

      {/* The file's contract, read BEFORE going to look for the file. A block
          and not a hint line: these are three different answers, and packing all
          three into one grey 11px line is how none of them get read. Law 8. */}
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <Kicker>Tệp cần có</Kicker>
        <dl className="grid gap-3 sm:grid-cols-[132px_1fr]">
          <dt className="text-muted-foreground text-[11.5px]">Cột bắt buộc</dt>
          <dd className="flex flex-wrap gap-2">
            {/* `object`, not `source`: azure already belongs to the load button
                in the footer (law 3), and three blue chips only dilute it. */}
            {required.map((f) => (
              <Chip key={f.key}>{f.label}</Chip>
            ))}
          </dd>

          <dt className="text-muted-foreground text-[11.5px]">Cột khác</dt>
          <dd className="text-glass-foreground text-[11.5px] leading-[1.7]">
            Thiếu thì bỏ qua, không chặn việc nạp.
          </dd>

          <dt className="text-muted-foreground text-[11.5px]">Tệp mẫu</dt>
          <dd className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadCsv(`${spec.sampleStem}.csv`, sampleRows(spec))}
              className="motion-std text-accent-foreground inline-flex items-center gap-2 text-[11.5px] hover:brightness-125"
            >
              <Icon icon={Download} size={14} />
              Tải tệp mẫu
            </button>
            <span className="text-muted-foreground text-[11.5px]">
              Một dòng tiêu đề, một dòng ví dụ
            </span>
          </dd>
        </dl>
      </GlassCard>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Bước 2 · Khớp cột
// ---------------------------------------------------------------------------

/** Giá trị "bỏ qua cột này" của ô chọn. `<select>` gốc chỉ chở được chuỗi. */
const SKIP = '-1'

/** One line saying how many rows the batch-wide source actually touches.
 *
 *  The source column IN THE FILE wins over this pick (the server decides that),
 *  so the number worth printing is how many rows leave that column EMPTY —
 *  "which source" is a meaningless question for a file that carries its own. */
function sourceNote(spec: ImportSpec, sheet: Sheet, mapping: ColumnMapping): string {
  const n = sheet.rows.length
  if (!spec.fields.some((f) => f.key === 'source')) return `Cả ${n} dòng lấy nguồn chọn ở đây.`

  const at = mapping.source ?? -1
  if (at < 0) return `Tệp chưa khớp cột Nguồn — cả ${n} dòng lấy nguồn chọn ở đây.`

  const blank = sheet.rows.filter((r) => (r[at] ?? '').trim() === '').length
  return blank === 0
    ? `Cả ${n} dòng đã có nguồn sẵn trong tệp — lựa chọn này không dùng tới.`
    : `${blank} trên ${n} dòng bỏ trống cột Nguồn, và sẽ lấy lựa chọn này.`
}

/** One group of mapping selects. Two groups and not one flat grid — see `StepMap`. */
function FieldGrid({
  title,
  fields,
  mapping,
  columnOptions,
  onMap,
}: {
  title: string
  fields: ImportField[]
  mapping: ColumnMapping
  columnOptions: { value: string; label: string }[]
  onMap: (key: string, at: number) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <Kicker>{title}</Kicker>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <Select
            key={field.key}
            label={field.required ? `${field.label} *` : field.label}
            value={String(mapping[field.key] ?? -1)}
            neutralValue={SKIP}
            options={columnOptions}
            onChange={(v) => onMap(field.key, Number(v))}
            className="w-full"
          />
        ))}
      </div>
    </div>
  )
}

/** Fields the file has no column for — names only, no selects.
 *
 *  Ten selects all reading '— bỏ qua cột này —' are ten rows to check before
 *  learning that none of them holds anything; one row of chips answers that at
 *  a glance. 'Khớp thêm' hands the selects back to whoever knows better. */
function SkippedFields({
  fields,
  onRevealAll,
}: {
  fields: ImportField[]
  onRevealAll: () => void
}) {
  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-3 p-4">
      <Kicker className="w-full">Không có cột tương ứng · bỏ qua</Kicker>
      {fields.map((f) => (
        <Chip key={f.key}>{f.label}</Chip>
      ))}
      <button
        type="button"
        onClick={onRevealAll}
        className="motion-std text-accent-foreground text-[11.5px] hover:brightness-125"
      >
        Khớp thêm
      </button>
    </GlassCard>
  )
}

/** The mapping table, in TWO GROUPS rather than one flat grid.
 *
 *  The required group always shows in full, including fields with no column
 *  matched — that list is what disables the load button, and hiding a line of
 *  it hides the very thing to fix. The optional group shows only what was
 *  matched (or touched); the rest drops to the chip row below. */
function StepMap({
  spec,
  sheet,
  mapping,
  onMap,
  revealed,
  onRevealAll,
  onChangeFile,
  motion,
  motions,
  onMotion,
  scope,
  scopeOptions,
  picked,
  onPick,
  batchExtra,
  locked,
}: {
  spec: ImportSpec
  sheet: Sheet
  mapping: ColumnMapping
  onMap: (key: string, at: number) => void
  revealed: ReadonlySet<string>
  onRevealAll: () => void
  onChangeFile: () => void
  motion: LeadMotion
  motions: readonly LeadMotion[]
  onMotion: (m: LeadMotion) => void
  scope?: string
  scopeOptions?: { value: string; label: string }[]
  picked: string
  onPick: (value: string) => void
  batchExtra?: ReactNode
  locked: boolean
}) {
  const columnOptions = [
    { value: SKIP, label: '— bỏ qua cột này —' },
    ...sheet.headers.map((h, i) => ({
      value: String(i),
      /* Tiêu đề rỗng vẫn phải chọn được: tệp thật hay có cột không tên mà lại
         chứa đúng dữ liệu cần. In vị trí cột để người dùng tìm được nó. */
      label: h === '' ? `(cột ${i + 1}, không tên)` : h,
    })),
  ]

  const isMapped = (f: ImportField) => (mapping[f.key] ?? -1) >= 0
  const required = spec.fields.filter((f) => f.required)
  const extra = spec.fields.filter((f) => !f.required && (isMapped(f) || revealed.has(f.key)))
  const skipped = spec.fields.filter((f) => !f.required && !isMapped(f) && !revealed.has(f.key))

  const shown = spec.fields.filter(isMapped)
  const preview = sheet.rows.slice(0, PREVIEW)
  const hit = [...required, ...extra].filter(isMapped).length
  const mojibake = detectMojibakeColumn(sheet.headers, sheet.rows)

  /** Anything to assign batch-wide at all — a motion, or a source. */
  const assigns =
    motions.length > 0 ||
    scope !== undefined ||
    scopeOptions !== undefined ||
    batchExtra !== undefined

  return (
    <section className={cn('flex flex-col gap-4', locked && 'pointer-events-none opacity-55')}>
      <FileStrip sheet={sheet} onChangeFile={onChangeFile} />

      {mojibake && <MojibakeNote column={mojibake.column} sample={mojibake.sample} />}

      <SectionTitle
        size="lg"
        hint={`Đã tự khớp ${hit}/${spec.fields.length} trường · đoán sai thì đổi cột`}
      >
        Khớp cột
      </SectionTitle>

      <FieldGrid
        title="Bắt buộc"
        fields={required}
        mapping={mapping}
        columnOptions={columnOptions}
        onMap={onMap}
      />

      {extra.length > 0 && (
        <FieldGrid
          title="Thông tin thêm"
          fields={extra}
          mapping={mapping}
          columnOptions={columnOptions}
          onMap={onMap}
        />
      )}

      {skipped.length > 0 && <SkippedFields fields={skipped} onRevealAll={onRevealAll} />}

      {assigns && (
        <BatchAssign
          count={sheet.rows.length}
          noun={spec.rowNoun ?? 'dòng'}
          motion={motion}
          motions={motions}
          onMotion={onMotion}
          scope={scope}
          scopeOptions={scopeOptions}
          picked={picked}
          onPick={onPick}
          sourceHint={sourceNote(spec, sheet, mapping)}
          extra={batchExtra}
        />
      )}

      {/* Bảng xem trước nằm trên `.glass-b` — luật 8. */}
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <Kicker>
          Xem trước {preview.length}/{sheet.rows.length} dòng, sau khi khớp
        </Kicker>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[11.5px]">
            <thead>
              <tr className="text-muted-foreground">
                {shown.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-2 font-semibold">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-glass-foreground">
              {preview.map((row, i) => (
                <tr key={i} className="bg-surface-ink/[3%]">
                  {shown.map((f) => (
                    <td key={f.key} className="max-w-[220px] truncate px-3 py-2">
                      {row[mapping[f.key] ?? -1] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Bước 3 · Nạp
// ---------------------------------------------------------------------------

function StepRun({
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
  return (
    <section className="flex flex-col gap-4">
      {/* No 'Bước 3' kicker: the bar has two steps, and naming a third one here
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tally label="Vào sổ" value={report.rows.length} tone="success" />
            <Tally label="Trùng dòng đã có" value={report.duplicates} />
            <Tally label="Trùng trong tệp" value={report.dupInFile} />
            <Tally label="Không nạp được" value={report.errors.length} tone="danger" />
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
          <FailedRows errors={report.errors} spec={spec} />
          <DroppedRows withBook={report.dupWithBook} withinFile={report.dupWithinFile} />

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
