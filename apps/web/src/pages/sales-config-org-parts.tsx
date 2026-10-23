import type { ReactNode } from 'react'
import { Avatar, Button, ChevronRight, GlassCard, Icon, cn } from '@pv/ui'
import type { OrgPerson, OrgTreeResponse, OrgUnit } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { useOrgWrite } from '@/data/org-tree'
import {
  HEAD_LABEL,
  KIND_LABEL,
  UNPLACED,
  noHead,
  rolesText,
  unplacedOf,
  type TreeRow,
} from './sales-config-org-model'

/** The two panels of the org section (5.18): the tree, and the unit
 *  picked in it. Level reads by indent and type weight alone, with no glyph
 *  per row (the owner's call on the canvas). Without `kpi.view-all` the units
 *  above the reader's own arrive bare, so their head and count are not printed:
 *  "no head" there would be a statement nobody checked. */

const INDENT = ['pl-4', 'pl-8', 'pl-12'] as const
const NAME_TYPE = {
  company: 'text-[14px] font-bold',
  department: 'text-[13px] font-semibold',
  team: 'text-[13px] font-normal',
} as const
const NOTE = 'text-[11.5px] leading-[1.5]'
const LABEL = 'text-muted-foreground m-0 text-[11.5px] font-semibold'

type Names = ReadonlyMap<string, string>

function UnitLine({
  row,
  names,
  known,
  on,
}: {
  row: TreeRow
  names: Names
  known: boolean
  /** On the accent tint, where muted ink takes its tinted pair. */
  on: boolean
}) {
  const { unit } = row
  const head = unit.headId ? names.get(unit.headId) : undefined
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('break-words', NAME_TYPE[unit.kind])}>{unit.name}</span>
        {known && (
          <span
            className={cn(
              NOTE,
              head
                ? on
                  ? 'text-on-tint-primary-muted'
                  : 'text-muted-foreground'
                : on
                  ? 'text-on-tint-warning'
                  : 'text-warning',
            )}
          >
            {head ?? noHead(unit.kind)}
          </span>
        )}
      </span>
      {known && (
        <span
          className={cn(
            NOTE,
            'tnum font-num shrink-0',
            on ? 'text-on-tint-primary-muted' : 'text-muted-foreground',
          )}
        >
          {unit.memberIds.length} người
        </span>
      )}
    </>
  )
}

const ROW = 'flex min-h-12 w-full items-center gap-3 rounded-md py-2 pr-4 text-left'
const indentOf = (depth: number) => INDENT[Math.min(depth, INDENT.length - 1)]

/** Tablet and desktop: rows pick the unit the right panel shows. */
export function TreePanel({
  rows,
  names,
  seeAll,
  unplaced,
  selected,
  onSelect,
}: {
  rows: TreeRow[]
  names: Names
  seeAll: boolean
  /** People placed nowhere; `null` for a reader who is not sent them. */
  unplaced: number | null
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-1 self-start p-3">
      <ul aria-label="Cây đơn vị" className="m-0 flex flex-col gap-1">
        {rows.map((row) => {
          const on = row.unit.id === selected
          return (
            <li key={row.unit.id}>
              <button
                type="button"
                aria-current={on ? 'true' : undefined}
                onClick={() => onSelect(row.unit.id)}
                className={cn(
                  ROW,
                  'motion-std',
                  indentOf(row.depth),
                  on ? 'bg-accent' : 'hover:bg-surface-ink/8',
                )}
              >
                <UnitLine
                  row={row}
                  names={names}
                  known={seeAll || row.unit.memberIds.length > 0}
                  on={on}
                />
              </button>
            </li>
          )
        })}
      </ul>
      {unplaced !== null && (
        <button
          type="button"
          aria-current={selected === UNPLACED ? 'true' : undefined}
          onClick={() => onSelect(UNPLACED)}
          className={cn(
            ROW,
            'motion-std mt-2 pl-4',
            selected === UNPLACED ? 'bg-accent' : 'bg-surface-ink/5 hover:bg-surface-ink/8',
          )}
        >
          <span className="flex-1 text-[13px] font-semibold">Chưa xếp đơn vị</span>
          <span
            className={cn(
              NOTE,
              'tnum font-num',
              selected === UNPLACED ? 'text-on-tint-warning' : 'text-warning',
            )}
          >
            {unplaced} người
          </span>
        </button>
      )}
    </GlassCard>
  )
}

/** Phone: the same rows to read, nothing to press (the in-pocket device, `docs/design-system/devices.md`). */
export function PhoneTree({
  rows,
  names,
  seeAll,
}: {
  rows: TreeRow[]
  names: Names
  seeAll: boolean
}) {
  return (
    <GlassCard variant="b" className="p-2">
      <ul aria-label="Cây đơn vị" className="m-0 flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.unit.id} className={cn(ROW, indentOf(row.depth))}>
            <UnitLine
              row={row}
              names={names}
              known={seeAll || row.unit.memberIds.length > 0}
              on={false}
            />
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

function Face({ person, trailing }: { person: OrgPerson; trailing?: ReactNode }) {
  return (
    <>
      <Avatar name={person.name} size="md" card={false} className="size-8" />
      <span className="min-w-0 flex-1 break-words text-[13px]">{person.name}</span>
      <span className={cn(NOTE, 'text-muted-foreground')}>{rolesText(person)}</span>
      {trailing}
    </>
  )
}

const PERSON_ROW =
  'flex min-h-12 w-full items-center gap-3 rounded-md bg-surface-ink/5 px-3 py-2 text-left'

/** Members of the open unit, or the people placed nowhere; a row opens the move. */
function People({
  people,
  canEdit,
  onMove,
}: {
  people: OrgPerson[]
  canEdit: boolean
  onMove: (p: OrgPerson) => void
}) {
  return (
    <ul className="m-0 flex flex-col gap-1">
      {people.map((p) => (
        <li key={p.actorId}>
          {canEdit ? (
            <button
              type="button"
              aria-label={`Chuyển ${p.name}`}
              onClick={() => onMove(p)}
              className={cn(PERSON_ROW, 'motion-std hover:bg-surface-ink/8')}
            >
              <Face
                person={p}
                trailing={<Icon icon={ChevronRight} size={16} className="text-muted-foreground" />}
              />
            </button>
          ) : (
            <div className={PERSON_ROW}>
              <Face person={p} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

type PanelActions = {
  onEdit: (u: OrgUnit) => void
  onHead: (u: OrgUnit) => void
  onAdd: (u: OrgUnit) => void
  onMove: (p: OrgPerson) => void
}

/** The open unit: what it is and where, its head, its members. Delete shows
 *  only when the server would take it (no member, no child), so it needs no hint. */
export function UnitPanel({
  tree,
  selected,
  seeAll,
  canEdit,
  actions,
}: {
  tree: OrgTreeResponse
  selected: OrgUnit | typeof UNPLACED
  seeAll: boolean
  canEdit: boolean
  actions: PanelActions
}) {
  const remove = useOrgWrite()
  const byId = new Map(tree.people.map((p) => [p.actorId, p]))
  const peopleOf = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const p = byId.get(id)
      return p ? [p] : []
    })

  if (selected === UNPLACED) {
    const people = unplacedOf(tree)
    return (
      <GlassCard variant="b" className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
        <h3 className="m-0 text-[16px] font-bold">
          Chưa xếp đơn vị · <span className="tnum font-num">{people.length}</span>
        </h3>
        <People people={people} canEdit={canEdit} onMove={actions.onMove} />
      </GlassCard>
    )
  }

  const unit = selected
  const parent = tree.units.find((u) => u.id === unit.parentId)
  const head = unit.headId ? byId.get(unit.headId) : undefined
  const members = peopleOf(unit.memberIds)
  const empty =
    unit.kind !== 'company' &&
    unit.memberIds.length === 0 &&
    !tree.units.some((u) => u.parentId === unit.id)
  const known = seeAll || members.length > 0

  const drop = () =>
    remove.mutate(
      { kind: 'remove', unitId: unit.id },
      { onSuccess: () => toastDone(`Đã xoá ${unit.name}`) },
    )

  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-6 p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cn(NOTE, 'text-muted-foreground')}>
            {KIND_LABEL[unit.kind]}
            {parent && ` · ${parent.name}`}
          </span>
          <h3 className="m-0 break-words text-[16px] font-bold">{unit.name}</h3>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-2">
            {empty && (
              <Button
                variant="destructive"
                className="pointer-coarse:h-12"
                disabled={remove.isPending}
                onClick={drop}
              >
                Xoá
              </Button>
            )}
            <Button
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => actions.onEdit(unit)}
            >
              Sửa
            </Button>
          </div>
        )}
        {remove.error && (
          <p role="alert" className={cn(NOTE, 'text-destructive-foreground m-0 basis-full')}>
            {userMessage(remove.error)}
          </p>
        )}
      </div>

      {known && (
        <section aria-label={HEAD_LABEL[unit.kind]} className="flex flex-col gap-2">
          <h4 className={LABEL}>{HEAD_LABEL[unit.kind]}</h4>
          <div className="bg-surface-ink/5 flex min-h-14 items-center gap-3 rounded-md px-3 py-2">
            {head ? (
              <>
                <Avatar name={head.name} size="md" card={false} className="size-8" />
                <span className="min-w-0 flex-1 break-words text-[13px] font-semibold">
                  {head.name}
                </span>
              </>
            ) : (
              <span className="text-warning flex-1 text-[13px]">{noHead(unit.kind)}</span>
            )}
            {canEdit && members.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="pointer-coarse:h-12"
                onClick={() => actions.onHead(unit)}
              >
                Đổi {HEAD_LABEL[unit.kind].toLowerCase()}
              </Button>
            )}
          </div>
        </section>
      )}

      {known && (
        <section aria-label="Thành viên" className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h4 className={cn(LABEL, 'flex-1')}>
              Thành viên · <span className="tnum font-num">{members.length}</span>
            </h4>
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="pointer-coarse:h-12"
                onClick={() => actions.onAdd(unit)}
              >
                Thêm người
              </Button>
            )}
          </div>
          <People people={members} canEdit={canEdit} onMove={actions.onMove} />
        </section>
      )}
    </GlassCard>
  )
}
