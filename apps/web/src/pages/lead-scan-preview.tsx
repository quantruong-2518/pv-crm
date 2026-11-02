import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  ChevronDown,
  ChevronRight,
  Chip,
  ColumnFilter,
  ColumnFilterList,
  DataTable,
  EmptyState,
  FileText,
  GlassCard,
  Icon,
  Inbox,
  MetaPill,
  SearchField,
  cn,
} from '@pv/ui'
import { ScanOutcome, type LeadScanResponse, type ScanGroup } from '@pv/contracts'
import { listField, useClientBookFilter } from '@/app/client-book-filter'
import { message, useI18n } from '@/app/i18n'
import { useScanReplaces } from '@/data/lead-scan-replace'
import { BookCount } from '@/components/book-page'
import { ROW_ICON } from '@/components/table-bits'
import {
  CONFIDENCE_FACE,
  OUTCOME_FACE,
  filterGroups,
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
 *  Nothing is written until the button — the page says so in its subtitle.
 *
 *  The search and the outcome filter live in the ADDRESS: this is a routed page
 *  (`/sales/leads/scan/:code`), so F5 and Back keep them. They narrow the view
 *  only; the button below still applies the whole batch. */

/** Module-level: it keys the memo `useClientBookFilter` parses the address with. */
const SCAN_FILTERS = { outcome: listField() }

const FIELD_COLUMNS = [
  { header: message('Trường', 'Field', '항목'), width: 'minmax(0,1fr)' },
  { header: message('Giá trị', 'Value', '값'), width: 'minmax(0,1.6fr)' },
  { header: message('Nguồn', 'Source', '출처'), width: '56px', align: 'center' as const },
  { header: message('Độ chắc', 'Confidence', '확실도'), width: 'minmax(0,.8fr)' },
]

const NOTHING_SAVED = message(
  'Chỉ ghi vào sổ khi bạn bấm tạo.',
  'Nothing is saved until you press create.',
  '생성을 누르기 전에는 아무것도 저장되지 않습니다.',
)
const SEARCH = message(
  'Tìm theo công ty, người liên hệ, email hoặc mã lead…',
  'Search by company, contact, email or lead code…',
  '회사, 연락처, 이메일 또는 리드 코드로 검색…',
)
const NO_MATCH = message(
  'Không có công ty nào khớp bộ lọc.',
  'No companies match these filters.',
  '필터에 맞는 회사가 없습니다.',
)

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
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const preview = batch.preview
  const totals = preview?.totals ?? { accounts: 0, contacts: 0, leadsToCreate: 0 }
  const merges = mergeCount(batch)
  const skipped = notCreatedPills(batch)
  const nothing = totals.leadsToCreate === 0 && merges === 0
  /* A replace in flight is about to reopen the batch; committing now would race it. */
  const replacing = useScanReplaces((s) => batch.files.some((f) => f.id in s.jobs))
  const { filters, text, setText, patch, clear, dirty } = useClientBookFilter(SCAN_FILTERS)
  const groups = preview?.groups ?? []
  const shown = filterGroups(groups, filters)
  /* Only outcomes this batch carries, so the filter never offers an empty pick. */
  const outcomeOptions = ScanOutcome.options
    .map((o) => ({ o, n: groups.filter((g) => g.outcome === o).length }))
    .filter(({ n }) => n > 0)
    .map(({ o, n }) => ({ value: o, label: `${t(OUTCOME_FACE[o].text)} · ${n}` }))
  const columns = [
    { header: t(message('Công ty', 'Company', '회사')), width: 'minmax(0,1.3fr)' },
    { header: t(message('Người liên hệ', 'Contact', '연락처')), width: 'minmax(0,1.6fr)' },
    {
      header: (
        <ColumnFilter
          label={t(message('Khi bấm tạo', 'On create', '생성 시'))}
          active={filters.outcome.length > 0}
        >
          {(close) => (
            <ColumnFilterList
              options={outcomeOptions}
              selected={filters.outcome}
              close={close}
              searchable={false}
              onApply={(outcome) => patch({ outcome })}
            />
          )}
        </ColumnFilter>
      ),
      width: 'minmax(0,1.3fr)',
    },
  ]

  return (
    <>
      <ScanHeader
        title={t(
          message(
            `Đọc xong ${batch.files.length} tệp`,
            `Finished reading ${batch.files.length} ${batch.files.length === 1 ? 'file' : 'files'}`,
            `파일 ${batch.files.length}개 읽기 완료`,
          ),
        )}
        description={t(NOTHING_SAVED)}
        rail={scanRail(batch, navigate)}
        cancel={cancel}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label={t(message('Công ty', 'Companies', '회사'))} value={totals.accounts} />
        <Tile label={t(message('Người liên hệ', 'Contacts', '연락처'))} value={totals.contacts} />
        <Tile
          label={t(message('Lead sẽ tạo', 'Leads to create', '생성할 리드'))}
          value={totals.leadsToCreate}
          brand
        />
      </div>

      {skipped.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted-foreground">
            {t(
              message('Không tạo lead mới:', 'Not creating new leads:', '새 리드를 생성하지 않음:'),
            )}
          </span>
          {skipped.map((pill) => (
            <MetaPill key={pill.vi} className="tnum">
              {t(pill)}
            </MetaPill>
          ))}
        </div>
      )}

      <FailedFiles batch={batch} />

      <GlassCard variant="b" className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
          <SearchField
            placeholder={t(SEARCH)}
            value={text}
            onChange={setText}
            className="min-w-0 flex-1 sm:max-w-[320px]"
          />
          <BookCount total={shown.length} noun={t(message('công ty', 'companies', '회사'))} />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clear} className="pointer-coarse:h-12">
              {t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'))}
            </Button>
          )}
        </div>
        {shown.length === 0 && groups.length > 0 ? (
          <EmptyState
            icon={Inbox}
            message={t(NO_MATCH)}
            action={{
              label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
              onClick: clear,
            }}
            className="px-5 py-8"
          />
        ) : (
          <DataTable
            flush
            columns={columns}
            rowHeight="min-h-16 py-3"
            rows={shown.map((group) => ({
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
        )}
      </GlassCard>

      <CommitBar
        creates={totals.leadsToCreate}
        merges={merges}
        disabled={nothing || replacing}
        onCommit={onCommit}
      />
    </>
  )
}

/** The one button of step 3 and the sentence under it saying what it will do. */
function CommitBar({
  creates,
  merges,
  disabled,
  onCommit,
}: {
  creates: number
  merges: number
  disabled: boolean
  onCommit: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-start gap-3">
      <Button size="lg" disabled={disabled} onClick={onCommit} className="tnum">
        {creates > 0
          ? t(
              message(
                `Tạo ${creates} lead`,
                `Create ${creates} ${creates === 1 ? 'lead' : 'leads'}`,
                `리드 ${creates}개 생성`,
              ),
            )
          : t(
              message(
                `Nhập ${merges} công ty vào lead có sẵn`,
                `Merge ${merges} ${merges === 1 ? 'company' : 'companies'} into existing leads`,
                `회사 ${merges}곳을 기존 리드에 병합`,
              ),
            )}
      </Button>
      <p className="text-muted-foreground tnum text-[12.5px]">
        {creates === 0 && merges === 0
          ? t(
              message(
                'Không có gì để tạo hay nhập.',
                'Nothing to create or merge.',
                '생성하거나 병합할 항목이 없습니다.',
              ),
            )
          : merges > 0
            ? t(
                message(
                  `Bấm để tạo và nhập ${merges} công ty vào lead có sẵn.`,
                  `Press to create leads and merge ${merges} ${merges === 1 ? 'company' : 'companies'} into existing leads.`,
                  `눌러서 리드를 생성하고 회사 ${merges}곳을 기존 리드에 병합합니다.`,
                ),
              )
            : t(message('Bấm để tạo lead.', 'Press to create leads.', '눌러서 리드를 생성합니다.'))}
      </p>
    </div>
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
  const { t } = useI18n()
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge tone={OUTCOME_FACE[group.outcome].tone}>{t(outcomeText(group))}</Badge>
      {group.outcome === 'MERGE_INTO_LEAD' && <Chip>{group.leadCode}</Chip>}
      {group.outcome === 'NEW_LEAD' && group.accountCode && <Chip>{group.accountCode}</Chip>}
    </span>
  )
}

/** The source is a button, not a column of file names: the name lives in its
 *  tooltip, and a click opens the file itself. */
function FieldTable({ group, files }: { group: ScanGroup; files: LeadScanResponse['files'] }) {
  const { t } = useI18n()
  const urlOf = new Map(files.map((file) => [file.name, file.url]))
  return (
    <DataTable
      columns={FIELD_COLUMNS.map((c) => ({ ...c, header: t(c.header) }))}
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
            {f.alt && (
              <span className="text-warning break-words">
                {t(message(`hoặc ${f.alt}`, `or ${f.alt}`, `또는 ${f.alt}`))}
              </span>
            )}
          </span>,
          <SourceButton key="from" name={f.fromFile} url={urlOf.get(f.fromFile)} />,
          <Badge key="c" tone={CONFIDENCE_FACE[f.confidence].tone}>
            {t(CONFIDENCE_FACE[f.confidence].text)}
          </Badge>,
        ],
      }))}
    />
  )
}

function SourceButton({ name, url }: { name: string; url: string | undefined }) {
  const { t } = useI18n()
  /* The book's round icon action (`ROW_ICON`), so a source reads like every other row icon. */
  const face = cn(ROW_ICON, 'inline-flex items-center justify-center')
  if (!url) {
    return (
      <span
        role="img"
        className={cn(face, 'hover:bg-transparent')}
        title={name}
        aria-label={t(message(`Nguồn: ${name}`, `Source: ${name}`, `출처: ${name}`))}
      >
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
      aria-label={t(
        message(`Mở tệp nguồn: ${name}`, `Open source file: ${name}`, `원본 파일 열기: ${name}`),
      )}
      className={cn(face, 'motion-std hover:text-foreground')}
    >
      <Icon icon={FileText} size={16} />
    </a>
  )
}
