import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, Plus, TriangleAlert } from '@pv/ui'
import {
  AppShell,
  Badge,
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import type { MailTemplateRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { masTemplatesQuery } from '@/data/mas'
import { Module1Books } from '@/components/module1-books'
import { MailTemplateDrawer } from './mail-templates-parts'

/** Module 1 · the mail-template book — `sales.mail_template`.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS SCREEN EXISTS
 *  ------------------------------------------------------------------
 *  The table is old and until now had exactly one door, a READ. Copy could only
 *  enter the system through a hand-written SQL migration, so changing one
 *  sentence in an approach letter meant a developer and a deployment — for
 *  content that marketing rewrites weekly.
 *
 *  ------------------------------------------------------------------
 *  NO DELETE BUTTON, AND THAT IS THE TABLE'S RULE
 *  ------------------------------------------------------------------
 *  `campaign.schema.ts` settled it: no delete, only switch off. A batch that
 *  already went out still names the template it used, so removing the row
 *  blinds the one question the row exists to answer — which template works.
 *  Retiring lives inside the edit panel next to the copy rather than as a
 *  button of its own, because it is an edit like any other.
 *
 *  Editing a template rewrites NO letter already sent: `mail_run` snapshots
 *  subject and body when the batch is created. That is why the write door here
 *  asks for the edit permission and not the one that fires mail. */
const NO_ROWS: MailTemplateRow[] = []

const EMPTY_MESSAGE =
  'Chưa có mẫu thư nào. Mẫu là chỗ bắt đầu của một lá thư — người soạn vẫn sửa được trước khi gửi.'

export function MailTemplatesPage() {
  const chrome = useAppChrome()
  const canWrite = useCan('chiến-dịch.sửa')

  /* `error` is read, not dropped: a dead server drawn as "the book is empty",
     with a button inviting the first template, has somebody retyping copy that
     already exists. */
  const { data, isPending, error, refetch } = useQuery(masTemplatesQuery)
  const rows = data?.rows ?? NO_ROWS

  /* Which row the panel shows and whether the panel is up are two pieces of
     state on purpose: `Drawer` keeps its content mounted through the exit
     animation, so clearing the row on close blanks the panel mid-slide. */
  const [editing, setEditing] = useState<MailTemplateRow | null>(null)
  const [open, setOpen] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (row: MailTemplateRow) => {
    setEditing(row)
    setOpen(true)
  }

  const live = rows.filter((row) => row.active).length
  const summary = isPending
    ? 'Đang đọc sổ mẫu thư…'
    : error
      ? 'Chưa đọc được sổ mẫu thư.'
      : `${rows.length} mẫu · ${live} đang dùng`

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Kinh doanh · Module 1"
          title="Sổ mẫu thư"
          description={<span className="tnum">{summary}</span>}
          actions={
            /* HIDDEN, not greyed out — for a read-only role "not yet" never
               arrives. The real gate is in `app/api/client.ts`, not here. */
            canWrite && (
              <Button size="md" onClick={openCreate} className="max-sm:flex-1">
                <Icon icon={Plus} size={16} />
                Thêm mẫu
              </Button>
            )
          }
        />

        <Module1Books />

        {/* A table ALWAYS sits on glass-b — rule 8. */}
        <GlassCard variant="b" className="overflow-hidden">
          <div className="overflow-x-auto p-4 lg:p-5">
            {isPending ? (
              <div className="flex flex-col gap-3">
                {/* `height`, not `h-12`: `Skeleton` writes its height into an
                    inline `style`, which beats the class. */}
                <Skeleton height={48} className="w-full" />
                <Skeleton height={48} className="w-full" />
                <Skeleton height={48} className="w-full" />
              </div>
            ) : error ? (
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ mẫu thư. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              /* `EmptyState` (M-08) always demands a button, so the question is
                 not whether to draw one but which one is true. Offering a
                 read-only role the create button is an invitation straight to a
                 403, so they get the one button that does something: ask again. */
              <EmptyState
                icon={Inbox}
                message={EMPTY_MESSAGE}
                action={
                  canWrite
                    ? { label: 'Thêm mẫu', onClick: openCreate }
                    : { label: 'Tải lại', onClick: () => void refetch() }
                }
                className="py-12"
              />
            ) : (
              <DataTable
                className="min-w-[860px]"
                columns={[
                  { header: 'Mã', width: '1fr' },
                  { header: 'Tên mẫu', width: '1.4fr' },
                  { header: 'Tiêu đề email', width: '1.9fr' },
                  { header: 'Nút', width: '150px' },
                  { header: 'Trạng thái', width: '128px' },
                ]}
                rows={rows.map((row) => ({
                  id: row.code,
                  /* The whole row opens the panel — the house pattern for every
                     book. A read-only role opens nothing: this panel is an EDIT
                     panel, and opening it to eat a 403 on save is making
                     somebody type the whole form to learn they may not. */
                  ...(canWrite ? { onOpen: () => openEdit(row) } : {}),
                  cells: [
                    <span key="c" className="block truncate font-mono text-[11px]" title={row.code}>
                      {row.code}
                    </span>,
                    <span key="n" className="block truncate" title={row.name}>
                      {row.name}
                    </span>,
                    <span
                      key="s"
                      className="text-muted-foreground block truncate"
                      title={row.subject}
                    >
                      {row.subject}
                    </span>,
                    <span key="b" className="block truncate">
                      {row.cta ? row.cta.label : '—'}
                    </span>,
                    <Badge key="t" tone={row.active ? 'success' : 'draft'}>
                      {row.active ? 'Đang dùng' : 'Ngừng dùng'}
                    </Badge>,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {/* One panel, both jobs: `editing === null` adds a template, a row
            edits that row. */}
        <MailTemplateDrawer open={open} onClose={() => setOpen(false)} template={editing} />
      </ScreenLayout>
    </AppShell>
  )
}

export default MailTemplatesPage
