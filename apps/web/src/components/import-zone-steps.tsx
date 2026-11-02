import type { ReactNode } from 'react'
import { Download } from '@pv/ui'
import { Chip, FileDrop, GlassCard, Icon, Kicker, SectionTitle, Select, cn } from '@pv/ui'
import type { LeadMotion } from '@pv/engines'
import { message, translate, useI18n } from '@/app/i18n'
import {
  ACCEPT,
  MAX_BYTES,
  detectMojibakeColumn,
  downloadCsv,
  type Sheet,
} from '@/data/intake-file'
import {
  anyOfLabel,
  sampleRows,
  type ColumnMapping,
  type ImportField,
  type ImportSpec,
} from '@/data/intake'
import { BatchAssign, FileStrip, MojibakeNote } from '@/components/import-zone-bits'

/** The two steps of the import panel that read and map a file: choosing it,
 *  then matching its columns to the book's fields. Split out of
 *  `import-zone.tsx` on size alone (`max-lines`). */

/** Rows previewed in step 2. Three is enough to see a shifted column without scrolling. */
const PREVIEW = 3

// ---------------------------------------------------------------------------
// Step 1 · Choose a file
// ---------------------------------------------------------------------------

export function StepPick({
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
  const { t } = useI18n()
  const required = spec.fields.filter((f) => f.required)

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle size="lg">{t(message('Chọn tệp', 'Choose file', '파일 선택'))}</SectionTitle>

      <FileDrop
        accept={ACCEPT}
        maxBytes={MAX_BYTES}
        busy={busy}
        error={error}
        fileName={fileName}
        onPick={onPick}
        /* Paste is offered on step 1 only: pasting another table mid-mapping
           would throw away the mapping just corrected. */
        onPasteText={onPasteText}
      />

      {/* The file's contract, read BEFORE going to look for the file. A block
          and not a hint line: these are three different answers, and packing all
          three into one grey 11px line is how none of them get read. Law 8. */}
      <GlassCard variant="b" className="flex flex-col gap-3 p-4">
        <Kicker>{t(message('Tệp cần có', 'Required file', '필요한 파일'))}</Kicker>
        <dl className="grid gap-3 sm:grid-cols-[132px_1fr]">
          <dt className="text-muted-foreground text-[11.5px]">
            {t(message('Cột bắt buộc', 'Required columns', '필수 열'))}
          </dt>
          <dd className="flex flex-wrap gap-2">
            {/* `object`, not `source`: azure already belongs to the load button
                in the footer (law 3), and three blue chips only dilute it. */}
            {required.map((f) => (
              <Chip key={f.key}>{f.label}</Chip>
            ))}
            {anyOfLabel(spec) && <Chip>{anyOfLabel(spec)}</Chip>}
          </dd>

          <dt className="text-muted-foreground text-[11.5px]">
            {t(message('Cột khác', 'Other columns', '기타 열'))}
          </dt>
          <dd className="text-glass-foreground text-[11.5px] leading-[1.7]">
            {t(message('Thiếu thì bỏ qua.', 'Skipped when missing.', '없으면 건너뜁니다.'))}
          </dd>

          <dt className="text-muted-foreground text-[11.5px]">
            {t(message('Tệp mẫu', 'Sample file', '샘플 파일'))}
          </dt>
          <dd className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadCsv(`${spec.sampleStem}.csv`, sampleRows(spec))}
              className="motion-std text-accent-foreground inline-flex items-center gap-2 text-[11.5px] hover:brightness-125"
            >
              <Icon icon={Download} size={14} />
              {t(message('Tải tệp mẫu', 'Download sample file', '샘플 파일 내려받기'))}
            </button>
            <span className="text-muted-foreground text-[11.5px]">
              {t(
                message(
                  'Một dòng tiêu đề, một dòng ví dụ',
                  'One header row, one example row',
                  '제목 행 하나, 예시 행 하나',
                ),
              )}
            </span>
          </dd>
        </dl>
      </GlassCard>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Step 2 · Match columns
// ---------------------------------------------------------------------------

/** The select's "skip this column" value; a native `<select>` only carries strings. */
const SKIP = '-1'

/** One line saying how many rows the batch-wide source actually touches.
 *
 *  The source column IN THE FILE wins over this pick (the server decides that),
 *  so the number worth printing is how many rows leave that column EMPTY —
 *  "which source" is a meaningless question for a file that carries its own. */
function sourceNote(spec: ImportSpec, sheet: Sheet, mapping: ColumnMapping): string {
  const n = sheet.rows.length
  const all = message(
    `Cả ${n} dòng lấy nguồn chọn ở đây.`,
    `All ${n} rows take the source picked here.`,
    `${n}개 행 전체가 여기서 선택한 출처를 사용합니다.`,
  )
  if (!spec.fields.some((f) => f.key === 'source')) return translate(all)

  const at = mapping.source ?? -1
  if (at < 0) {
    return translate(
      message(
        `Tệp chưa khớp cột Nguồn. ${all.vi}`,
        `The file has no matched Source column. ${all.en}`,
        `파일에 출처 열이 매칭되지 않았습니다. ${all.ko}`,
      ),
    )
  }

  const blank = sheet.rows.filter((r) => (r[at] ?? '').trim() === '').length
  return translate(
    blank === 0
      ? message(
          `Cả ${n} dòng đã có nguồn trong tệp. Lựa chọn này không áp dụng.`,
          `All ${n} rows already have a source in the file. This choice does not apply.`,
          `${n}개 행 모두 파일에 출처가 있습니다. 이 선택은 적용되지 않습니다.`,
        )
      : message(
          `${blank}/${n} dòng bỏ trống cột Nguồn sẽ lấy nguồn chọn ở đây.`,
          `${blank}/${n} rows with an empty Source column take the source picked here.`,
          `출처 열이 비어 있는 ${blank}/${n}개 행은 여기서 선택한 출처를 사용합니다.`,
        ),
  )
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
            label={field.label}
            required={field.required}
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
 *  Ten selects all reading "skip this column" are ten rows to check before
 *  learning that none of them holds anything; one row of chips answers that at
 *  a glance. "Match more" hands the selects back to whoever knows better. */
function SkippedFields({
  fields,
  onRevealAll,
}: {
  fields: ImportField[]
  onRevealAll: () => void
}) {
  const { t } = useI18n()
  return (
    <GlassCard variant="b" className="flex flex-wrap items-center gap-3 p-4">
      <Kicker className="w-full">
        {t(
          message(
            'Không có cột tương ứng · bỏ qua',
            'No matching column · skipped',
            '일치하는 열 없음 · 건너뜀',
          ),
        )}
      </Kicker>
      {fields.map((f) => (
        <Chip key={f.key}>{f.label}</Chip>
      ))}
      <button
        type="button"
        onClick={onRevealAll}
        className="motion-std text-accent-foreground text-[11.5px] hover:brightness-125"
      >
        {t(message('Khớp thêm', 'Match more', '추가 매칭'))}
      </button>
    </GlassCard>
  )
}

/** The first rows as they will be read after matching. Sits on `.glass-b` (law 8). */
function PreviewTable({
  sheet,
  mapping,
  shown,
  count,
}: {
  sheet: Sheet
  mapping: ColumnMapping
  shown: ImportField[]
  count: number
}) {
  const { t } = useI18n()
  const preview = sheet.rows.slice(0, count)
  return (
    <GlassCard variant="b" className="flex flex-col gap-3 p-4">
      <Kicker>
        {t(
          message(
            `Xem trước ${preview.length}/${sheet.rows.length} dòng, sau khi khớp`,
            `Preview of ${preview.length}/${sheet.rows.length} rows, after matching`,
            `매칭 후 미리보기 ${preview.length}/${sheet.rows.length}행`,
          ),
        )}
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
  )
}

/** The mapping table, in TWO GROUPS rather than one flat grid.
 *
 *  The required group always shows in full, including fields with no column
 *  matched — that list is what disables the load button, and hiding a line of
 *  it hides the very thing to fix. The optional group shows only what was
 *  matched (or touched); the rest drops to the chip row below. */
export function StepMap({
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
  const { t } = useI18n()
  const columnOptions = [
    {
      value: SKIP,
      label: t(message('— bỏ qua cột này —', '— skip this column —', '— 이 열 건너뛰기 —')),
    },
    ...sheet.headers.map((h, i) => ({
      value: String(i),
      /* An empty header must stay pickable: real files often carry an unnamed
         column holding the right data, so its position is printed. */
      label:
        h === ''
          ? t(
              message(
                `(cột ${i + 1}, không tên)`,
                `(column ${i + 1}, unnamed)`,
                `(${i + 1}번 열, 이름 없음)`,
              ),
            )
          : h,
    })),
  ]

  const isMapped = (f: ImportField) => (mapping[f.key] ?? -1) >= 0
  const required = spec.fields.filter((f) => f.required)
  const extra = spec.fields.filter((f) => !f.required && (isMapped(f) || revealed.has(f.key)))
  const skipped = spec.fields.filter((f) => !f.required && !isMapped(f) && !revealed.has(f.key))

  const shown = spec.fields.filter(isMapped)
  const count = Math.min(PREVIEW, sheet.rows.length)
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
        hint={t(
          message(
            `Đã tự khớp ${hit}/${spec.fields.length} trường. Sai thì đổi cột.`,
            `${hit}/${spec.fields.length} fields matched automatically. Change the column if one is wrong.`,
            `${hit}/${spec.fields.length}개 항목이 자동 매칭되었습니다. 틀리면 열을 바꾸세요.`,
          ),
        )}
      >
        {t(message('Khớp cột', 'Match columns', '열 매칭'))}
      </SectionTitle>

      <FieldGrid
        title={t(message('Bắt buộc', 'Required', '필수'))}
        fields={required}
        mapping={mapping}
        columnOptions={columnOptions}
        onMap={onMap}
      />

      {extra.length > 0 && (
        <FieldGrid
          title={t(message('Thông tin thêm', 'Additional information', '추가 정보'))}
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
          noun={spec.rowNoun ?? t(message('dòng', 'rows', '행'))}
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

      <PreviewTable sheet={sheet} mapping={mapping} shown={shown} count={count} />
    </section>
  )
}
