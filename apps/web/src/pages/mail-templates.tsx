import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from '@pv/ui'
import { Badge, Button, Icon, cn } from '@pv/ui'
import type { MailTemplateRow } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, translate, useI18n } from '@/app/i18n'
import { mailDoorLabel } from '@/data/mail-door-copy'
import { isApiError, userMessage } from '@/app/api'
import { masTemplatesQuery } from '@/data/mas'
import { BookPage } from '@/components/book-page'
import { SettingsShell } from '@/components/settings-shell'
import { MilestonePill } from './mail-templates-doors'
import { MailTemplateDrawer } from './mail-templates-parts'

/** Module 6 · the mail-template book — `sales.mail_template`. Moved here
 *  (22/09) from Module 1: this table has no instance ID the way a campaign or
 *  a mail run does — it is shared configuration, not the record of one send.
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

const EMPTY_MESSAGE = message(
  'Chưa có mẫu thư nào.',
  'No email templates yet.',
  '이메일 템플릿이 아직 없습니다.',
)

/** Where a template is listed (G4), a default door marked on its own tag —
 *  the one fact the book must show, since only one template holds each door.
 *  A milestone pill trails the doors when the template records one. */
function DoorTags({ row }: { row: MailTemplateRow }) {
  const { t, lang } = useI18n()
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {row.doors.map((door) =>
        row.defaultFor.includes(door) ? (
          <Badge key={door} tone="running">
            {t(
              message(
                `${mailDoorLabel(door, 'vi')} · mặc định`,
                `${mailDoorLabel(door, 'en')} · default`,
                `${mailDoorLabel(door, 'ko')} · 기본`,
              ),
            )}
          </Badge>
        ) : (
          <Badge key={door} tone="draft">
            {mailDoorLabel(door, lang)}
          </Badge>
        ),
      )}
      {row.milestone && <MilestonePill milestone={row.milestone} />}
    </span>
  )
}

export function MailTemplatesPage() {
  const { t, lang } = useI18n()
  const canWrite = useCan('campaign.edit')

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
    ? t(
        message(
          'Đang tải danh sách mẫu thư…',
          'Loading email templates…',
          '이메일 템플릿을 불러오는 중…',
        ),
      )
    : error
      ? t(
          message(
            'Không tải được danh sách mẫu thư.',
            'Could not load the email templates.',
            '이메일 템플릿을 불러오지 못했습니다.',
          ),
        )
      : t(
          message(
            `${rows.length} mẫu · ${live} đang dùng`,
            `${rows.length} templates · ${live} in use`,
            `템플릿 ${rows.length}개 · ${live}개 사용 중`,
          ),
        )

  return (
    <SettingsShell>
      <BookPage
        title={t(message('Sổ mẫu thư', 'Email templates', '이메일 템플릿'))}
        actions={
          /* HIDDEN, not greyed out — for a read-only role "not yet" never
             arrives. The real gate is in `app/api/client.ts`, not here. */
          canWrite ? (
            <Button size="md" onClick={openCreate} className="pointer-coarse:h-12 max-sm:flex-1">
              <Icon icon={Plus} size={16} />
              {t(message('Thêm mẫu thư', 'Add email template', '이메일 템플릿 추가'))}
            </Button>
          ) : undefined
        }
        /* `tnum` because both numbers change whenever a template is added or
           retired, and uneven digit widths make the line jump sideways. */
        count={
          <span
            className={cn(
              'tnum text-[11.5px]',
              error ? 'text-destructive-foreground' : 'text-muted-foreground',
            )}
          >
            {summary}
          </span>
        }
        pending={isPending}
        failure={
          error
            ? {
                message: `${t(
                  message(
                    'Không tải được danh sách mẫu thư.',
                    'Could not load the email templates.',
                    '이메일 템플릿을 불러오지 못했습니다.',
                  ),
                )} ${isApiError(error) ? userMessage(error) : t(message('Thử lại.', 'Try again.', '다시 시도해 주세요.'))}`,
                onRetry: () => void refetch(),
              }
            : undefined
        }
        empty={
          /* `EmptyState` (M-08) always demands a button, so the question is
             not whether to draw one but which one is true. Offering a
             read-only role the create button is an invitation straight to a
             403, so they get the one button that does something: ask again. */
          rows.length === 0
            ? {
                message: translate(EMPTY_MESSAGE, lang),
                action: canWrite
                  ? {
                      label: t(message('Thêm mẫu thư', 'Add email template', '이메일 템플릿 추가')),
                      onClick: openCreate,
                    }
                  : {
                      label: t(message('Tải lại', 'Reload', '새로고침')),
                      onClick: () => void refetch(),
                    },
              }
            : undefined
        }
        table={{
          minWidth: 'min-w-[1120px]',
          columns: [
            { header: t(message('Mã', 'Code', '코드')), width: '1fr' },
            { header: t(message('Tên mẫu', 'Template name', '템플릿 이름')), width: '1.4fr' },
            { header: t(message('Tiêu đề email', 'Email subject', '이메일 제목')), width: '1.9fr' },
            {
              header: t(message('Nút trong email', 'Email button', '이메일 버튼')),
              width: '160px',
            },
            { header: t(message('Dùng khi', 'Used when', '사용 시점')), width: '1.4fr' },
            { header: t(message('Trạng thái', 'Status', '상태')), width: '128px' },
          ],
          rows: rows.map((row) => ({
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
              <span key="s" className="text-muted-foreground block truncate" title={row.subject}>
                {row.subject}
              </span>,
              /* The CTA only: a legacy booking link no longer reaches a
                 letter (Calendly retired), so it is not a button here. */
              <span key="b" className="block truncate" title={row.cta?.label}>
                {row.cta?.label ?? '—'}
              </span>,
              <DoorTags key="d" row={row} />,
              <Badge key="t" tone={row.active ? 'success' : 'draft'}>
                {row.active
                  ? t(message('Đang dùng', 'In use', '사용 중'))
                  : t(message('Ngừng dùng', 'Not in use', '사용 중지'))}
              </Badge>,
            ],
          })),
        }}
      />

      {/* One panel, both jobs: `editing === null` adds a template, a row
          edits that row. */}
      <MailTemplateDrawer open={open} onClose={() => setOpen(false)} template={editing} />
    </SettingsShell>
  )
}

export default MailTemplatesPage
