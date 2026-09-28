import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  ChevronDown,
  ChevronRight,
  Chip,
  DataTable,
  FileText,
  GlassCard,
  Icon,
  MetaPill,
  cn,
} from '@pv/ui'
import type { LeadScanResponse, ScanGroup } from '@pv/contracts'
import { useScanReplaces } from '@/data/lead-scan-replace'
import {
  CONFIDENCE_FACE,
  OUTCOME_FACE,
  mergeCount,
  notCreatedPills,
  outcomeText,
  scanRail,
} from './lead-scan-model'
import { FailedFiles, ScanHeader, type CancelProps } from './lead-scan-parts'

/** Step 3 — what the button WILL do, read-only.
 *
 *  No actions on the group rows, on purpose (product decision): which group becomes a
 *  lead, joins one or waits is the server's rule, and the one button below
 *  applies all of it. A row only opens to show where each value came from.
 *  Nothing is written until the button — the page says so in its subtitle. */

const GROUP_COLUMNS = [
  { header: 'Công ty', width: 'minmax(0,1.3fr)' },
  { header: 'Người liên hệ', width: 'minmax(0,1.6fr)' },
  { header: 'Khi bấm tạo', width: 'minmax(0,1.3fr)' },
]

const FIELD_COLUMNS = [
  { header: 'Trường', width: 'minmax(0,1fr)' },
  { header: 'Giá trị', width: 'minmax(0,1.6fr)' },
  { header: 'Nguồn', width: '56px' },
  { header: 'Độ chắc', width: 'minmax(0,.8fr)' },
]

export function PreviewStep({
  batch,
  onCommit,
  cancel,
}: {
  batch: LeadScanResponse
  /** The page owns the write: pressing switches it to the result view at once. */
  onCommit: () => void
  cancel: CancelProps
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState<string | null>(null)
  const preview = batch.preview
  const totals = preview?.totals ?? { accounts: 0, contacts: 0, leadsToCreate: 0 }
  const merges = mergeCount(batch)
  const skipped = notCreatedPills(batch)
  const nothing = totals.leadsToCreate === 0 && merges === 0
  /* A replace in flight is about to reopen the batch; committing now would race it. */
  const replacing = useScanReplaces((s) => batch.files.some((f) => f.id in s.jobs))

  return (
    <>
      <ScanHeader
        title={`Đọc xong ${batch.files.length} tệp`}
        description="Xem trước bên dưới. Chưa có gì được ghi vào sổ cho tới khi bấm tạo."
        rail={scanRail(batch, navigate)}
        cancel={cancel}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Công ty (account)" value={totals.accounts} />
        <Tile label="Người liên hệ (contact)" value={totals.contacts} />
        <Tile label="Lead sẽ tạo" value={totals.leadsToCreate} brand />
      </div>

      {skipped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted-foreground">Không tạo lead mới:</span>
          {skipped.map((text) => (
            <MetaPill key={text} className="tnum">
              {text}
            </MetaPill>
          ))}
        </div>
      )}

      <FailedFiles batch={batch} />

      <GlassCard variant="b" className="overflow-hidden">
        <DataTable
          flush
          columns={GROUP_COLUMNS}
          rowHeight="min-h-16 py-3"
          rows={(preview?.groups ?? []).map((group) => ({
            id: group.key,
            state: open === group.key ? 'selected' : 'default',
            onOpen: () => setOpen((key) => (key === group.key ? null : group.key)),
            cells: [
              <CompanyCell key="co" group={group} open={open === group.key} />,
              <PeopleCell key="people" group={group} />,
              <OutcomeCell key="outcome" group={group} />,
            ],
            details:
              open === group.key ? <FieldTable group={group} files={batch.files} /> : undefined,
          }))}
        />
      </GlassCard>

      <div className="flex flex-col items-start gap-3">
        <Button size="lg" disabled={nothing || replacing} onClick={onCommit} className="tnum">
          {totals.leadsToCreate > 0
            ? `Tạo ${totals.leadsToCreate} lead`
            : `Nhập ${merges} công ty vào lead có sẵn`}
        </Button>
        <p className="text-muted-foreground tnum text-[12.5px]">
          {nothing
            ? 'Lô này không có gì để tạo hay nhập.'
            : merges > 0
              ? `Bấm là tạo và sang màn kết quả, đồng thời nhập ${merges} công ty vào lead có sẵn.`
              : 'Bấm là tạo và sang màn kết quả.'}
        </p>
      </div>
    </>
  )
}

/** The last tile is the one the button acts on, so it alone is brand-tinted —
 *  a FLAT tint: the `.glass-ai` gradient belongs to AI blocks only (law 15). */
function Tile({ label, value, brand }: { label: string; value: number; brand?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg p-5', brand ? 'bg-primary/12' : 'glass-a')}>
      <span
        className={cn(
          'tnum font-num text-[30px] font-semibold leading-none tracking-[-1px]',
          brand && 'text-on-tint-primary',
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'text-[12px]',
          brand ? 'text-on-tint-primary-muted' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  )
}

function CompanyCell({ group, open }: { group: ScanGroup; open: boolean }) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon
        icon={open ? ChevronDown : ChevronRight}
        size={16}
        className="text-muted-foreground mt-1"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-semibold" title={group.company}>
          {group.company}
        </span>
        <span className="text-muted-foreground truncate text-[11.5px]">{group.meta}</span>
      </span>
    </span>
  )
}

function PeopleCell({ group }: { group: ScanGroup }) {
  if (group.people.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {group.people.map((person, i) => (
        <span key={i} className="truncate">
          {[person.name, person.title, person.email].filter(Boolean).join(' · ')}
        </span>
      ))}
    </span>
  )
}

function OutcomeCell({ group }: { group: ScanGroup }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge tone={OUTCOME_FACE[group.outcome].tone}>{outcomeText(group)}</Badge>
      {group.outcome === 'MERGE_INTO_LEAD' && <Chip>{group.leadCode}</Chip>}
    </span>
  )
}

/** The source is a button, not a column of file names: the name lives in its
 *  tooltip, and a click opens the file itself. */
function FieldTable({ group, files }: { group: ScanGroup; files: LeadScanResponse['files'] }) {
  const urlOf = new Map(files.map((file) => [file.name, file.url]))
  return (
    <DataTable
      columns={FIELD_COLUMNS}
      rowHeight="min-h-10 py-2"
      className="px-5"
      rows={group.fields.map((f, i) => ({
        id: `${f.field}-${i}`,
        cells: [
          <span key="f" className="text-muted-foreground">
            {f.field}
          </span>,
          <span key="v" className="flex min-w-0 flex-col gap-1">
            <span className="break-words">{f.value}</span>
            {f.alt && <span className="text-warning break-words">hoặc {f.alt}</span>}
          </span>,
          <SourceButton key="from" name={f.fromFile} url={urlOf.get(f.fromFile)} />,
          <Badge key="c" tone={CONFIDENCE_FACE[f.confidence].tone}>
            {CONFIDENCE_FACE[f.confidence].text}
          </Badge>,
        ],
      }))}
    />
  )
}

function SourceButton({ name, url }: { name: string; url: string | undefined }) {
  const face =
    'text-muted-foreground inline-flex size-8 items-center justify-center rounded-sm pointer-coarse:size-12'
  if (!url) {
    return (
      <span className={face} title={name} aria-label={`Nguồn: ${name}`}>
        <Icon icon={FileText} size={16} />
      </span>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={name}
      aria-label={`Mở tệp nguồn: ${name}`}
      className={cn(face, 'motion-std hover:bg-surface-ink/8 hover:text-foreground')}
    >
      <Icon icon={FileText} size={16} />
    </a>
  )
}
