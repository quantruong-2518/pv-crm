import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Chip,
  ColumnFilter,
  ColumnFilterList,
  DataTable,
  Drawer,
  EmptyState,
  GlassCard,
  Icon,
  Inbox,
  Plus,
  SearchField,
  Skeleton,
  Trash2,
  Users,
} from '@pv/ui'
import type { CampaignMemberRow } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { listField, useClientBookFilter } from '@/app/client-book-filter'
import { toast } from '@/app/toast'
import { fuzzyRank } from '@/lib/fuzzy-rank'
import { ROW_ICON, TableFooter } from '@/components/table-bits'
import { campaignMembersQuery, type useCampaignMembers } from '@/data/campaign-book'
import { AudiencePicker } from './campaign-audience-picker'

/** Module 1 · the campaign AUDIENCE — ONE card holding who the letters go to,
 *  and a `Drawer` that adds more from the lead book.
 *
 *  Locked 28/09: the member list and the candidate picker used to stand as
 *  two stacked blocks, the top one reading empty on a fresh campaign before
 *  anyone had picked a soul — confusing order for the first thing a new
 *  campaign asks of its owner. The add flow now opens over the list instead
 *  of sitting under it, so the card the owner came to read never moves. */

/** THE ADD-RECIPIENTS DRAWER — the only door in this module that writes.
 *
 *  Selection resets to empty every time it opens (`AudienceTab` clears it as
 *  `adding` turns on): a stale tick from three opens ago
 *  reads as the screen having picked something the owner never touched. */
function AudienceDrawer({
  open,
  onClose,
  selected,
  onSetOne,
  onSetMany,
  alreadyIn,
  onSubmit,
  pending,
}: {
  open: boolean
  onClose: () => void
  selected: ReadonlySet<string>
  onSetOne: (code: string, on: boolean) => void
  onSetMany: (codes: string[], on: boolean) => void
  alreadyIn: ReadonlySet<string>
  onSubmit: () => void
  pending: boolean
}) {
  const { t } = useI18n()
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title={t(message('Thêm người nhận', 'Add recipients', '수신자 추가'))}
      subtitle={t(
        message(
          'Chỉ hiển thị những lead chưa có trong danh sách.',
          'Only leads not already on the list are shown.',
          '목록에 아직 없는 리드만 표시됩니다.',
        ),
      )}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="lg" variant="ghost" onClick={onClose} disabled={pending}>
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
          <Button size="lg" onClick={onSubmit} disabled={selected.size === 0 || pending}>
            {pending
              ? t(message('Đang thêm…', 'Adding…', '추가 중…'))
              : t(
                  message(
                    `Thêm ${selected.size} người`,
                    `Add ${selected.size} recipients`,
                    `${selected.size}명 추가`,
                  ),
                )}
          </Button>
        </div>
      }
    >
      <AudiencePicker
        selected={selected}
        onSetOne={onSetOne}
        onSetMany={onSetMany}
        alreadyIn={alreadyIn}
      />
    </Drawer>
  )
}

/** The member list's address keys — module level, as `useClientBookFilter`
 *  asks. `email` holds `present` / `missing`, either or both. */
/** Rows a page of the audience shows — the owner's number (09/10). */
const MEMBER_PAGE = 10

const MEMBER_FILTERS = { email: listField() }
const EMAIL_PRESENT = 'present'
const EMAIL_MISSING = 'missing'

const memberFields = (m: CampaignMemberRow) => [m.leadCode, m.company, m.contactName, m.email]

const TEXT = {
  recipientRemoved: message(
    'Đã gỡ khỏi danh sách người nhận',
    'Recipient removed',
    '수신자를 목록에서 삭제했습니다',
  ),
  couldNotRemoveRecipient: message(
    'Không gỡ được người nhận',
    'Could not remove recipient',
    '수신자를 삭제할 수 없습니다',
  ),
  youCanAddLeadsWithout: message(
    'Bạn vẫn có thể thêm lead chưa có email, nhưng họ sẽ không nhận được thư.',
    'You can add leads without an email address, but they will not receive emails.',
    '이메일 주소가 없는 리드도 추가할 수 있지만 이메일은 받을 수 없습니다.',
  ),
  searchByCompanyContactOr: message(
    'Tìm theo công ty, người liên hệ hoặc mã lead…',
    'Search by company, contact, or lead ID…',
    '회사, 담당자 또는 리드 ID로 검색…',
  ),
  noRecipientsMatchTheseFilters: message(
    'Không có người nhận nào khớp bộ lọc.',
    'No recipients match these filters.',
    '필터와 일치하는 수신자가 없습니다.',
  ),
}

/** The email column's filter header. Tallies count the page already loaded. */
function EmailFilter({
  selected,
  withEmail,
  withoutEmail,
  onApply,
}: {
  selected: string[]
  withEmail: number
  withoutEmail: number
  onApply: (email: string[]) => void
}) {
  const { t } = useI18n()
  return (
    <ColumnFilter label="Email" active={selected.length > 0}>
      {(close) => (
        <ColumnFilterList
          searchable={false}
          options={[
            {
              value: EMAIL_PRESENT,
              label: t(
                message(
                  `Có email · ${withEmail}`,
                  `Has email · ${withEmail}`,
                  `이메일 있음 · ${withEmail}`,
                ),
              ),
            },
            {
              value: EMAIL_MISSING,
              label: t(
                message(
                  `Chưa có email · ${withoutEmail}`,
                  `No email · ${withoutEmail}`,
                  `이메일 없음 · ${withoutEmail}`,
                ),
              ),
            },
          ]}
          selected={selected}
          close={close}
          onApply={onApply}
        />
      )}
    </ColumnFilter>
  )
}

/** WHO IS ALREADY IN — one `.glass-b` card: a toolbar, the table, and the door
 *  to take somebody out. Search and the email filter run on the rows already
 *  loaded here (cheap: this door loads the whole audience up to
 *  `MAS_MAX_RECIPIENTS` in one page) and live in the address, unlike the
 *  drawer's: this card IS the tab, so F5 and a shared link keep the narrowing.
 *  No industry or tier filter: `CampaignMemberRow` carries neither field.
 *
 *  It no longer counts missing addresses as a warning: `WavePreflight` in the
 *  fire dialog says it once for the WHOLE audience, read unscoped the way the
 *  send does. The filter's tallies count this loaded page and say nothing more. */
function MemberCard({
  code,
  members,
  canEdit,
  onAdd,
}: {
  code: string
  members: ReturnType<typeof useCampaignMembers>
  canEdit: boolean
  onAdd: () => void
}) {
  const { t, number } = useI18n()
  const { data, isPending } = useQuery(campaignMembersQuery(code))
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const { filters, text, setText, patch, clear, dirty } = useClientBookFilter(MEMBER_FILTERS)

  const searched = fuzzyRank(rows, filters.q, memberFields)
  const withEmail = searched.filter((m) => m.email).length
  const visible =
    filters.email.length === 0
      ? searched
      : searched.filter((m) => filters.email.includes(m.email ? EMAIL_PRESENT : EMAIL_MISSING))

  /* Clamped on read: a search or a removal can leave the page past the end. */
  const [pageWanted, setPage] = useState(0)
  const page = Math.min(pageWanted, Math.max(0, Math.ceil(visible.length / MEMBER_PAGE) - 1))
  const pageRows = visible.slice(page * MEMBER_PAGE, (page + 1) * MEMBER_PAGE)

  const removeOne = (leadCode: string) =>
    members.mutate(
      { remove: [leadCode] },
      {
        onSuccess: (res) =>
          toast(t(TEXT.recipientRemoved), {
            tone: 'success',
            detail: t(
              message(
                `Còn ${number(res.audienceCount)} người nhận.`,
                `${number(res.audienceCount)} recipients remaining.`,
                `남은 수신자 ${number(res.audienceCount)}명.`,
              ),
            ),
          }),
        onError: (err) =>
          toast(t(TEXT.couldNotRemoveRecipient), {
            tone: 'danger',
            detail: isApiError(err)
              ? userMessage(err)
              : t(message('Hãy thử lại.', 'Please try again.', '다시 시도해 주세요.')),
          }),
      },
    )

  const emailFilter = (
    <EmailFilter
      selected={filters.email}
      withEmail={withEmail}
      withoutEmail={searched.length - withEmail}
      onApply={(email) => patch({ email })}
    />
  )

  /* Nothing to search or filter yet, and the act that fills the list is in
     the first card: the empty audience is one quiet panel. */
  if (!isPending && total === 0) {
    return (
      <GlassCard
        aria-label={t(message('Người nhận', 'Recipients', '수신자'))}
        className="flex flex-col items-center gap-2 px-6 py-12 text-center"
      >
        <Icon icon={Users} size={24} className="text-muted-foreground" />
        <h3 className="m-0 text-[14px] font-semibold">
          {t(message('Chưa có người nhận', 'No recipients yet', '아직 수신자가 없습니다'))}
        </h3>
        <p className="text-muted-foreground m-0 max-w-[440px] text-pretty text-[12px] leading-[1.6]">
          {t(TEXT.youCanAddLeadsWithout)}
        </p>
      </GlassCard>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <GlassCard variant="b" className="flex flex-col p-0">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4">
          <SearchField
            placeholder={t(TEXT.searchByCompanyContactOr)}
            value={text}
            onChange={setText}
            className="pointer-coarse:h-12 min-w-0 flex-1 sm:max-w-[320px]"
          />
          {dirty && (
            <Button size="md" variant="ghost" onClick={clear} className="pointer-coarse:h-12">
              {t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기'))}
            </Button>
          )}
          {canEdit && (
            <Button size="md" onClick={onAdd} className="pointer-coarse:h-12 ml-auto">
              <Icon icon={Plus} size={16} />
              {t(message('Thêm người nhận', 'Add recipients', '수신자 추가'))}
            </Button>
          )}
        </div>

        {/* Without it `DataTable` clips (it is `overflow-x-hidden`), and on a
            phone the email column — the whole reason this list exists —
            truncates to nothing. */}
        <div className="overflow-x-auto">
          {isPending ? (
            <div className="flex flex-col gap-3 p-5">
              <Skeleton height={48} />
              <Skeleton height={48} delay={200} />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Inbox}
              message={t(TEXT.noRecipientsMatchTheseFilters)}
              action={{
                label: t(message('Bỏ hết bộ lọc', 'Clear filters', '필터 지우기')),
                onClick: clear,
              }}
              className="py-8"
            />
          ) : (
            <MemberTable
              rows={pageRows}
              emailHeader={emailFilter}
              onRemove={canEdit ? removeOne : undefined}
              removing={members.isPending}
            />
          )}
        </div>
        {visible.length > MEMBER_PAGE && (
          <TableFooter page={page} pageSize={MEMBER_PAGE} total={visible.length} onPage={setPage} />
        )}
      </GlassCard>

      {rows.length < total && (
        <p className="text-muted-foreground text-[12px]">
          {t(
            message(
              `Đang hiện ${number(rows.length)} trên ${number(total)} người.`,
              `Showing ${number(rows.length)} of ${number(total)} recipients.`,
              `${number(total)}명 중 ${number(rows.length)}명 표시 중.`,
            ),
          )}
        </p>
      )}
    </div>
  )
}

/** The member rows. `onRemove` absent = a reader who cannot write, and then
 *  no remove column at all: a column of dashes says nothing. */
function MemberTable({
  rows,
  emailHeader,
  onRemove,
  removing,
}: {
  rows: CampaignMemberRow[]
  emailHeader: ReactNode
  onRemove?: (leadCode: string) => void
  removing: boolean
}) {
  const { t } = useI18n()
  return (
    <DataTable
      flush
      className="min-w-[720px]"
      columns={[
        { header: t(message('Mã', 'ID', 'ID')), width: 'minmax(0,0.8fr)' },
        { header: t(message('Công ty', 'Company', '회사')), width: 'minmax(0,1.7fr)' },
        { header: t(message('Người liên hệ', 'Contact', '담당자')), width: 'minmax(0,1.3fr)' },
        { header: emailHeader, width: 'minmax(0,1.6fr)' },
        ...(onRemove
          ? [
              {
                header: <span className="sr-only">{t(message('Gỡ', 'Remove', '삭제'))}</span>,
                width: '48px',
                align: 'center' as const,
              },
            ]
          : []),
      ]}
      rows={rows.map((m) => ({
        id: m.leadCode,
        cells: [
          <Chip key="c">{m.leadCode}</Chip>,
          <span key="n" className="block truncate" title={m.company}>
            {m.company}
          </span>,
          <span key="ct" className="block truncate">
            {m.contactName}
          </span>,
          m.email ? (
            <span key="e" className="block truncate" title={m.email}>
              {m.email}
            </span>
          ) : (
            <span key="e" className="text-warning">
              {t(message('Chưa có email', 'No email', '이메일 없음'))}
            </span>
          ),
          ...(onRemove
            ? [
                <Button
                  key="rm"
                  size="sm"
                  variant="ghost"
                  aria-label={t(
                    message(
                      `Gỡ ${m.company} khỏi danh sách người nhận`,
                      `Remove ${m.company} from recipients`,
                      `${m.company}을(를) 수신자에서 삭제`,
                    ),
                  )}
                  title={t(
                    message(
                      'Gỡ khỏi danh sách người nhận',
                      'Remove from recipients',
                      '수신자에서 삭제',
                    ),
                  )}
                  className={ROW_ICON}
                  onClick={() => onRemove(m.leadCode)}
                  disabled={removing}
                >
                  <Icon icon={Trash2} size={16} />
                </Button>,
              ]
            : []),
        ],
      }))}
    />
  )
}

export function AudienceTab({
  code,
  members,
  canEdit,
  adding,
  onAdding,
}: {
  code: string
  members: ReturnType<typeof useCampaignMembers>
  canEdit: boolean
  /** The add drawer's open state lives on the page: the todo card opens it too. */
  adding: boolean
  onAdding: (open: boolean) => void
}) {
  const { t, number } = useI18n()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  /* A fresh sheet every time it opens — see `AudienceDrawer`'s docblock for why
     stale ticks from an earlier visit must not survive to this one. */
  const [wasAdding, setWasAdding] = useState(false)
  if (adding !== wasAdding) {
    setWasAdding(adding)
    if (adding) setSelected(new Set())
  }
  /* Stable identity: the Drawer re-focuses its panel whenever `onClose` changes. */
  const closeDrawer = useCallback(() => onAdding(false), [onAdding])

  const setOne = (leadCode: string, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (on) next.add(leadCode)
      else next.delete(leadCode)
      return next
    })
  const setMany = (codes: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      for (const c of codes) {
        if (on) next.add(c)
        else next.delete(c)
      }
      return next
    })

  /* The SAME query `MemberCard` below is drawing — one key, one trip, no second
     definition of "already in" able to disagree with the list on screen. */
  const { data: audience } = useQuery(campaignMembersQuery(code))
  const alreadyIn = useMemo(
    () => new Set((audience?.rows ?? []).map((m) => m.leadCode)),
    [audience],
  )

  const submit = () => {
    if (selected.size === 0) return
    members.mutate(
      { add: [...selected] },
      {
        onSuccess: (res) => {
          toast(
            t(
              message(
                `Đã thêm ${number(res.added)} lead`,
                `${number(res.added)} leads added`,
                `리드 ${number(res.added)}개 추가 완료`,
              ),
            ),
            {
              tone: 'success',
              detail: t(
                message(
                  `Danh sách hiện có ${number(res.audienceCount)} người nhận.`,
                  `The list now has ${number(res.audienceCount)} recipients.`,
                  `목록에 수신자 ${number(res.audienceCount)}명이 있습니다.`,
                ),
              ),
            },
          )
          onAdding(false)
        },
        onError: (err) =>
          toast(
            t(
              message(
                'Không thêm được người nhận',
                'Could not add recipients',
                '수신자를 추가할 수 없습니다',
              ),
            ),
            {
              tone: 'danger',
              detail: isApiError(err)
                ? userMessage(err)
                : t(message('Hãy thử lại.', 'Please try again.', '다시 시도해 주세요.')),
            },
          ),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <MemberCard code={code} members={members} canEdit={canEdit} onAdd={() => onAdding(true)} />

      {/* No drawer at all for a reader who cannot write it — the button that
          opens it is already hidden on the card above, so there is nothing
          left in here for a read-only role to reach. */}
      {canEdit && (
        <AudienceDrawer
          open={adding}
          onClose={closeDrawer}
          selected={selected}
          onSetOne={setOne}
          onSetMany={setMany}
          alreadyIn={alreadyIn}
          onSubmit={submit}
          pending={members.isPending}
        />
      )}
    </div>
  )
}
