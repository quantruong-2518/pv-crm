import { Checkbox, DataTable } from '@pv/ui'
import { type NotificationKind, type RoleId } from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { kpiRoleText } from '@/data/kpi-i18n'
import { ROLE_COLUMN_LABEL, ROLE_IDS } from '@/data/roles'
import { notificationGroupLabel, notificationKindLabel } from '@/data/notification-i18n'
import { message, useI18n } from '@/app/i18n'
import {
  KIND_GROUPS,
  isLocked,
  type PolicyDraft,
  type PolicyIndex,
} from '@/data/notification-policy'

/** The kind x role grid of One Core · Admin · Notifications.
 *
 *  One grid at every width, scrolled sideways inside its card on a tablet,
 *  rather than the roles screen's per-role sheet: here each row also carries
 *  an importance switch that belongs to the kind, not to any one role. */

export type PolicyGridProps = {
  draft: PolicyDraft
  index: PolicyIndex
  onHears: (kind: NotificationKind, roleId: RoleId, hears: boolean) => void
  onImportant: (kind: NotificationKind, important: boolean) => void
  /** A save is in flight; a tick now would be lost when the draft clears. */
  saving: boolean
}

/** 48px on a finger (law 13); the grid's own row is only as tall as needed. */
const CELL = 'pointer-coarse:min-h-12'

/** The kind column stays put while the roles scroll sideways. `overflow-x-clip`
 *  replaces DataTable's `hidden`, which would make the table its own scroller
 *  and pin the column to a box that never moves; no column here sorts, so
 *  nothing overhangs. The cell stretches to the row and fills with the opaque
 *  card colour, so cells passing beneath never show through. */
const STICKY_FIRST = [
  'overflow-x-clip',
  '[&>[role=row]>:first-child]:sticky [&>[role=row]>:first-child]:left-0',
  '[&>[role=row]>:first-child]:z-10 [&>[role=row]>:first-child]:bg-card',
  '[&>[role=row]>:first-child]:flex [&>[role=row]>:first-child]:items-center',
  '[&>[role=row]>:first-child]:self-stretch',
].join(' ')

/** A non-checkbox cell, padded so its word starts where a Checkbox label does. */
function PlainCell({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <span
      className={`${CELL} flex items-center gap-3 px-3 ${muted ? 'text-muted-foreground' : ''}`}
    >
      <span aria-hidden className="size-4 shrink-0" />
      {children}
    </span>
  )
}

function KindName({ kind, index }: { kind: NotificationKind; index: PolicyIndex }) {
  const { lang, t } = useI18n()
  const row = index[kind]
  const notes = [
    isLocked(index, kind)
      ? t(message('Không tắt được.', 'This notification is required.', '이 알림은 끌 수 없습니다.'))
      : null,
    row?.updatedBy && row.updatedAt
      ? t(
          message(
            `Cập nhật lần cuối: ${row.updatedBy.name}, ${dmhm(row.updatedAt)}`,
            `Last updated by ${row.updatedBy.name}, ${dmhm(row.updatedAt)}`,
            `${row.updatedBy.name}님이 마지막으로 수정 · ${dmhm(row.updatedAt)}`,
          ),
        )
      : null,
  ].filter(Boolean)

  return (
    <span className="flex min-w-0 flex-col gap-1 py-2">
      <span className="font-semibold">{notificationKindLabel(kind, lang)}</span>
      {notes.length > 0 && (
        <span className="text-muted-foreground tnum text-[11px]">{notes.join(' · ')}</span>
      )}
    </span>
  )
}

/** The checkbox's visible word plus, out of sight, the row and column it sits
 *  in; a cell inside `role="cell"` is otherwise announced with no context. */
const cellLabel = (word: string, context: string) => (
  <>
    {word}
    <span className="sr-only">{` — ${context}`}</span>
  </>
)

export function PolicyGrid({ draft, index, onHears, onImportant, saving }: PolicyGridProps) {
  const { lang, t } = useI18n()
  return (
    <DataTable
      className={`min-w-[1240px] ${STICKY_FIRST}`}
      rowHeight="min-h-12"
      columns={[
        {
          header: t(message('Loại thông báo', 'Notification', '알림')),
          width: 'minmax(260px,1.7fr)',
        },
        { header: t(message('Quan trọng', 'Important', '중요')), width: 'minmax(112px,0.8fr)' },
        ...ROLE_IDS.map((id) => ({ header: ROLE_COLUMN_LABEL[id], width: 'minmax(104px,1fr)' })),
      ]}
      rows={KIND_GROUPS.flatMap(({ group, kinds }) => [
        {
          id: `group-${group}`,
          cells: [
            <span key="g" className="text-muted-foreground text-[11.5px] font-semibold">
              {notificationGroupLabel(group, lang)}
            </span>,
          ],
        },
        ...kinds.map((kind) => {
          const locked = isLocked(index, kind)
          const out = index[kind]?.inapplicableRoleIds ?? []
          const { important, mutedRoleIds } = draft[kind]
          const name = notificationKindLabel(kind, lang)

          return {
            id: kind,
            cells: [
              <KindName key="k" kind={kind} index={index} />,
              /* Locked only forbids muting; importance stays editable (ADR 0093 §1). */
              <Checkbox
                key="i"
                className={CELL}
                checked={important}
                label={cellLabel(
                  important ? t(message('Có', 'Yes', '예')) : t(message('Không', 'No', '아니요')),
                  `${name} — ${t(message('Quan trọng', 'Important', '중요'))}`,
                )}
                disabled={saving}
                onChange={(on) => onImportant(kind, on)}
              />,
              ...ROLE_IDS.map((id) => {
                const hears = !mutedRoleIds.includes(id)
                /* ADR 0093 §2: this role can open nothing the kind is about. */
                if (out.includes(id)) {
                  return (
                    <PlainCell key={id} muted>
                      {t(message('Không áp dụng', 'Not applicable', '해당 없음'))}
                    </PlainCell>
                  )
                }
                return locked ? (
                  <PlainCell key={id}>{t(message('Nhận', 'On', '받기'))}</PlainCell>
                ) : (
                  <Checkbox
                    key={id}
                    className={CELL}
                    checked={hears}
                    label={cellLabel(
                      hears ? t(message('Nhận', 'On', '받기')) : t(message('Tắt', 'Off', '끄기')),
                      `${name} — ${kpiRoleText(id, lang)}`,
                    )}
                    disabled={saving}
                    onChange={(on) => onHears(kind, id, on)}
                  />
                )
              }),
            ],
          }
        }),
      ])}
    />
  )
}
