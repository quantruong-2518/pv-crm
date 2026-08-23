import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Download, FileUp, TriangleAlert, Upload } from 'lucide-react'
import {
  Badge,
  Button,
  Drawer,
  FileDrop,
  GlassCard,
  Icon,
  Kicker,
  Progress,
  SectionTitle,
  Select,
  cn,
} from '@pv/ui'
import { MOTION_BY_INTAKE, type LeadMotion } from '@pv/engines'
import {
  ACCEPT,
  MAX_BYTES,
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
  MOTION_FACE,
  sampleRows,
  trustOf,
  unmappedRequired,
  type BuiltRow,
  type ColumnMapping,
  type ImportReport,
  type ImportSpec,
} from '@/data/intake'

/** Luồng nạp tệp — MỘT component cho cả ba sổ.
 *
 *  ------------------------------------------------------------------
 *  MỘT DÒNG TRÊN MỖI MÀN
 *  ------------------------------------------------------------------
 *  `ImportZone` gói cả ba mảnh của luồng: cái nút, tấm phủ khi kéo tệp vào màn,
 *  và panel ba bước. Màn chỉ phải viết đúng một thẻ. Bày ba mảnh ra cho từng
 *  màn tự lắp thì ba sổ sẽ lắp ba kiểu, và cái sai đầu tiên sẽ là màn quên tấm
 *  phủ — tức người dùng kéo tệp vào rồi ngồi nhìn trình duyệt mở tệp đè lên cả
 *  app.
 *
 *  ------------------------------------------------------------------
 *  BA BƯỚC, VÀ VÌ SAO ĐÚNG BA
 *  ------------------------------------------------------------------
 *   1 · **Chọn tệp** — sáu đường vào của `FileDrop`.
 *   2 · **Khớp cột** — chỗ NGƯỜI phải nhìn. Đây là bước không bỏ được: hệ đoán
 *       được phần lớn cột theo tên, nhưng đoán sai một cột là 400 số điện thoại
 *       chui vào ô mã số thuế, và không ai phát hiện cho tới lúc gọi khách.
 *       Xem trước ba dòng đầu là cách rẻ nhất để thấy chỗ đoán sai.
 *   3 · **Nạp** — thanh tiến độ THẬT (đếm theo dòng, nhường nhịp vẽ), rồi bảng
 *       kết quả bốn con số và tệp lỗi tải về được.
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
 *  "Căn cứ:" và không cần nút xác nhận riêng theo luật 9. Nút "Nạp" ở bước 3 là
 *  nút của NGƯỜI DÙNG, không phải nút gật cho máy. */
/** Những gì màn nhận được khi người dùng bấm nạp.
 *
 *  Kiểu riêng chứ không viết thẳng trong props, vì cả ba màn đều phải khai lại
 *  đúng hình này cho handler của mình — và một bản chép tay ở mỗi màn là ba chỗ
 *  để lệch khi thêm trường thứ năm. */
export type ImportCommit = {
  /** Dòng đã qua kiểm và đã loại trùng. */
  rows: BuiltRow[]
  motion: LeadMotion
  fileName: string
  /** Bốn con số của lần nạp — màn dùng để dựng dòng phụ của toast. */
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
  /** Nạp thật — màn tự đẩy dòng vào sổ của nó và tự bắn toast.
   *
   *  Panel KHÔNG tự ghi vào kho: ba sổ ghi vào ba chỗ khác nhau và dựng dòng
   *  bằng ba hàm khác nhau (`rowsToLeads` · `rowsToOps`). Nhét cả ba vào đây thì
   *  panel phải biết cả ba sổ — đúng thứ nó được tách ra để khỏi phải biết. */
  onCommit: (input: ImportCommit & { scope?: string }) => void
  /** Sau khi nạp xong, đưa người dùng đi đâu. Bỏ trống = toast không có nút. */
  onSeeResult?: () => void
  buttonLabel?: string
  className?: string
}

type Phase = 'pick' | 'map' | 'run' | 'done'

/** Số dòng xem trước ở bước 2. Ba là đủ để thấy cột lệch mà chưa phải cuộn. */
const PREVIEW = 3

export function ImportZone({
  spec,
  existingKeys,
  scope,
  scopeLabel,
  scopeOptions,
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

  const reset = () => {
    setPhase('pick')
    setSheet(undefined)
    setMapping({})
    setMotion(spec.defaultMotion)
    setError(undefined)
    setBusy(false)
    setDone(0)
    setReport(undefined)
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
      setMapping(guessMapping(read.headers, spec))
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
      setMapping(guessMapping(read.headers, spec))
      setPhase('map')
    } catch (e) {
      setError(e instanceof SheetError ? e.message : 'Không đọc được phần vừa dán.')
    }
  }

  /** Nguồn thật của lô: cố định thắng chọn, chọn thắng bỏ trống. */
  const effectiveScope = scope ?? (picked === '' ? undefined : picked)

  /* Tấm phủ chỉ nghe khi panel ĐÓNG. Panel mở rồi thì vùng thả nằm trong panel
     lo phần đó, và hai chỗ cùng nghe một cú thả là một tệp bị nhận hai lần. */
  const dragging = useWindowFileDrag(!open, (file) => {
    setOpen(true)
    void take(file)
  })

  /** Chạy thật. */
  const run = async () => {
    if (!sheet) return
    setPhase('run')
    setDone(0)

    const built = await buildRows(sheet, mapping, spec, existingKeys, (n) => setDone(n))
    setReport(built)
    setPhase('done')

    if (built.rows.length > 0) {
      onCommit({
        rows: built.rows,
        motion,
        fileName: sheet.fileName,
        report: built,
        scope: effectiveScope,
      })
    }
  }

  const missing = sheet ? unmappedRequired(mapping, spec) : []
  const motions = spec.motions.filter((m) => MOTION_BY_INTAKE[spec.intake].includes(m))
  const trust = trustOf(spec.intake)

  return (
    <div className={className}>
      <Button size="md" variant="ghost" onClick={() => setOpen(true)}>
        <Icon icon={Upload} size={16} />
        {buttonLabel ?? 'Nạp tệp'}
      </Button>

      <DropOverlay active={dragging} label={spec.title} />

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
                  : trust.blurb}
            </span>
            <div className="flex items-center gap-3">
              <Button size="md" variant="ghost" onClick={close}>
                {phase === 'done' ? 'Đóng' : 'Huỷ'}
              </Button>
              {phase === 'map' && (
                <Button size="md" disabled={missing.length > 0} onClick={() => void run()}>
                  Nạp {sheet?.rows.length ?? 0} dòng
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <StepPick
            spec={spec}
            phase={phase}
            busy={busy}
            error={error}
            fileName={sheet?.fileName}
            onPick={(f) => void take(f)}
            onPasteText={takePaste}
          />

          {sheet && phase !== 'pick' && (
            <StepMap
              spec={spec}
              sheet={sheet}
              mapping={mapping}
              onMap={(key, at) => setMapping((m) => ({ ...m, [key]: at }))}
              motion={motion}
              motions={motions}
              onMotion={setMotion}
              scope={scope}
              scopeOptions={scope ? undefined : scopeOptions}
              picked={picked}
              onPick={setPicked}
              locked={phase !== 'map'}
            />
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
  phase,
  busy,
  error,
  fileName,
  onPick,
  onPasteText,
}: {
  spec: ImportSpec
  phase: Phase
  busy: boolean
  error?: string
  fileName?: string
  onPick: (file: File) => void
  onPasteText: (text: string) => void
}) {
  const required = spec.fields.filter((f) => f.required).map((f) => f.label)

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        size="lg"
        kicker="Bước 1"
        hint={`Cột bắt buộc: ${required.join(' · ')}. Cột khác thiếu thì bỏ qua, không chặn.`}
      >
        Chọn tệp
      </SectionTitle>

      <FileDrop
        accept={ACCEPT}
        maxBytes={MAX_BYTES}
        busy={busy}
        error={error}
        fileName={fileName}
        onPick={onPick}
        /* Đường dán chỉ mở ở bước 1: dán một bảng khác trong lúc đang khớp cột
           sẽ vứt bảng khớp vừa sửa mà không hỏi gì. */
        onPasteText={phase === 'pick' ? onPasteText : undefined}
        hint={
          <button
            type="button"
            onClick={() => downloadCsv(`${spec.sampleStem}.csv`, sampleRows(spec))}
            className="motion-std text-accent-foreground inline-flex items-center gap-2 hover:brightness-125"
          >
            <Icon icon={Download} size={14} />
            Tải tệp mẫu — một dòng tiêu đề, một dòng ví dụ
          </button>
        }
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Bước 2 · Khớp cột
// ---------------------------------------------------------------------------

/** Giá trị "bỏ qua cột này" của ô chọn. `<select>` gốc chỉ chở được chuỗi. */
const SKIP = '-1'

function StepMap({
  spec,
  sheet,
  mapping,
  onMap,
  motion,
  motions,
  onMotion,
  scope,
  scopeOptions,
  picked,
  onPick,
  locked,
}: {
  spec: ImportSpec
  sheet: Sheet
  mapping: ColumnMapping
  onMap: (key: string, at: number) => void
  motion: LeadMotion
  motions: readonly LeadMotion[]
  onMotion: (m: LeadMotion) => void
  scope?: string
  scopeOptions?: { value: string; label: string }[]
  picked: string
  onPick: (value: string) => void
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

  const preview = sheet.rows.slice(0, PREVIEW)
  const shown = spec.fields.filter((f) => (mapping[f.key] ?? -1) >= 0)

  return (
    <section className={cn('flex flex-col gap-4', locked && 'pointer-events-none opacity-55')}>
      <SectionTitle
        size="lg"
        kicker="Bước 2"
        hint={`${sheet.rows.length} dòng trong "${sheet.fileName}". Cột đoán sai thì đổi ở đây — đổi xong xem lại ba dòng bên dưới.`}
      >
        Khớp cột
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        {spec.fields.map((field) => {
          const at = mapping[field.key] ?? -1
          return (
            <Select
              key={field.key}
              label={field.required ? `${field.label} *` : field.label}
              value={String(at)}
              neutralValue={SKIP}
              options={columnOptions}
              onChange={(v) => onMap(field.key, Number(v))}
              className="w-full"
            />
          )
        })}
      </div>

      {/* Gán CẢ LÔ — hai thứ không nằm trong tệp mà vẫn phải có.

          Thế thì tệp không bao giờ mang: không ai xuất một cột "inbound hay
          outbound" từ Apollo. Nguồn thì có mang được, nhưng khi nạp từ trong
          một hồ sơ chiến dịch thì mã của hồ sơ đó thắng — người dùng đang đứng
          trong nó, và để họ chọn lại là mời một lần chọn nhầm. */}
      <GlassCard variant="b" className="flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-[200px] flex-1">
          <Kicker className="mb-2">Gán cho cả lô</Kicker>
          <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
            {MOTION_FACE[motion].blurb}{' '}
            <span className="opacity-70">{MOTION_FACE[motion].example}</span>
          </p>
        </div>
        <Select
          label="Thế"
          value={motion}
          neutralValue={spec.defaultMotion}
          options={motions.map((m) => ({ value: m, label: MOTION_FACE[m].label }))}
          onChange={(v) => onMotion(v as LeadMotion)}
        />
        {scope ? (
          <div className="flex flex-col gap-2">
            <Kicker>Nguồn</Kicker>
            <span className="font-mono text-[12.5px] font-semibold">{scope}</span>
          </div>
        ) : (
          scopeOptions && (
            <Select
              label="Nguồn"
              value={picked}
              neutralValue=""
              options={scopeOptions}
              onChange={onPick}
              /* Tên chiến dịch dài tới 40 ký tự và `<select>` gốc nở theo option
                 dài nhất — không kẹp thì một ô nuốt cả hàng. */
              className="max-w-[240px]"
            />
          )
        )}
      </GlassCard>

      {/* Bảng xem trước nằm trên `.glass-b` — luật 8. */}
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <Kicker>Ba dòng đầu, sau khi khớp</Kicker>
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
                <tr key={i} className="bg-white/[3%]">
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
      <SectionTitle size="lg" kicker="Bước 3">
        {report ? 'Đã nạp xong' : 'Đang nạp'}
      </SectionTitle>

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
                onClick={() => downloadCsv(`${spec.sampleStem}-loi.csv`, errorRows(report.errors))}
              >
                <Icon icon={Download} size={16} />
                Tải tệp lỗi
              </Button>
            </GlassCard>
          )}

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

function Tally({
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
// Tấm phủ khi kéo tệp vào bất kỳ đâu trên màn
// ---------------------------------------------------------------------------

/** Nghe cú kéo tệp trên CẢ CỬA SỔ.
 *
 *  Hai việc, và việc thứ hai quan trọng hơn việc thứ nhất:
 *   1 · nói cho người dùng biết thả được — họ kéo tệp vào rồi mới đi tìm nút;
 *   2 · CHẶN mặc định của trình duyệt. Thả một tệp .csv vào một trang web mà
 *       trang không chặn thì trình duyệt điều hướng sang tệp đó: cả app biến
 *       mất, thay bằng chữ thô của tệp, và mọi thứ chưa lưu đi theo. Đây là lý
 *       do listener này gắn ở `window` chứ không ở một khối nào của màn.
 *
 *  Đếm vào-ra như `FileDrop`, cùng lý do: `dragleave` bắn cả khi con trỏ đi qua
 *  một phần tử con. */
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
      if (e.dataTransfer) e.dataTransfer.dropEffect = enabled ? 'copy' : 'none'
    }

    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }

    const onDrop = (e: DragEvent) => {
      /* Chặn KỂ CẢ khi `enabled` tắt: panel đang mở thì vùng thả trong panel lo
         phần nhận, còn phần rơi ra ngoài panel vẫn phải bị chặn — nếu không thì
         thả trượt một chút là mất cả app. */
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

/** Tấm phủ cả màn, hiện lúc có tệp đang bay trên trang.
 *
 *  `z-[45]`: trên nav (40), dưới panel (50). Thang tầng của app nằm ở docblock
 *  của `Drawer`; thêm một tầng ở đây thì phải kê vào đó, không tự đặt số.
 *
 *  `pointer-events-none`: tấm này KHÔNG nhận cú thả — `window` nhận. Cho nó bắt
 *  chuột thì nó nuốt luôn sự kiện của mọi thứ bên dưới lúc đang kéo. */
function DropOverlay({ active, label }: { active: boolean; label: string }) {
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
