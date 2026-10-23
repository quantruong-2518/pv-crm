import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Icon, MetaPill, Plus, Select, Skeleton } from '@pv/ui'
import type { OrgPerson, OrgTreeResponse, OrgUnit } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { orgTreeQuery } from '@/data/org-tree'
import { keyOf } from './home-model'
import { monthPick, monthText } from './kpi-model'
import { KpiTeamsConfig } from './sales-config-kpi-teams'
import {
  AddUnitDrawer,
  EditUnitDrawer,
  HeadDrawer,
  PlaceDrawer,
  type PlaceTarget,
} from './sales-config-org-dialogs'
import {
  UNPLACED,
  isBeforeTree,
  monthOptions,
  treeRows,
  unplacedOf,
} from './sales-config-org-model'
import { PhoneTree, TreePanel, UnitPanel } from './sales-config-org-parts'
import { Section } from './sales-config-section'

/** Section 5.18 (ADR 0118): the org tree of one month, edited in place by
 *  a target setter (`kpi.set-target` and `kpi.view-all`, both checked by the
 *  server). An edit lands on `editableFrom`, so the section opens on that
 *  month and edits only there; other months read. The running month is read
 *  first only to learn which month that is.
 *
 *  A month before the tree goes to the old team editor, at that month, through
 *  its own doors. The phone reads the tree and edits nothing. */

const ALERT = 'text-destructive-foreground m-0 text-[11.5px] leading-[1.5]'

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; unit: OrgUnit }
  | { kind: 'head'; unit: OrgUnit }
  | { kind: 'place'; target: PlaceTarget }

function TreeBody({
  tree,
  seeAll,
  editable,
  selectedId,
  onSelect,
  onDialog,
}: {
  tree: OrgTreeResponse
  seeAll: boolean
  editable: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onDialog: (d: Dialog) => void
}) {
  const me = useSession((s) => s.actor?.id)
  const rows = treeRows(tree.units)
  const names = new Map(tree.people.map((p) => [p.actorId, p.name]))
  const unplaced = editable ? unplacedOf(tree).length : 0
  const showUnplaced = unplaced > 0
  /* Without view-all, someone placed nowhere is sent the company alone, bare. */
  if (!seeAll && !tree.units.some((u) => me !== undefined && u.memberIds.includes(me)))
    return <p className="text-muted-foreground m-0 text-[11.5px]">Bạn chưa thuộc đơn vị nào.</p>
  const selected =
    selectedId === UNPLACED && showUnplaced
      ? UNPLACED
      : (tree.units.find((u) => u.id === selectedId) ??
        (seeAll
          ? undefined
          : tree.units.find((u) => me !== undefined && u.memberIds.includes(me))) ??
        rows[0]?.unit)
  if (!selected)
    return <p className="text-muted-foreground m-0 text-[11.5px]">Chưa có đơn vị nào.</p>

  return (
    <>
      <div className="sm:hidden">
        <PhoneTree rows={rows} names={names} seeAll={seeAll} />
      </div>
      <div className="hidden gap-4 sm:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <TreePanel
          rows={rows}
          names={names}
          seeAll={seeAll}
          unplaced={showUnplaced ? unplaced : null}
          selected={selected === UNPLACED ? UNPLACED : selected.id}
          onSelect={onSelect}
        />
        <UnitPanel
          key={selected === UNPLACED ? UNPLACED : selected.id}
          tree={tree}
          selected={selected}
          seeAll={seeAll}
          canEdit={editable}
          actions={{
            onEdit: (unit) => onDialog({ kind: 'edit', unit }),
            onHead: (unit) => onDialog({ kind: 'head', unit }),
            onAdd: (unit) => onDialog({ kind: 'place', target: { unit } }),
            onMove: (person: OrgPerson) => onDialog({ kind: 'place', target: { person } }),
          }}
        />
      </div>
    </>
  )
}

export function OrgSection() {
  const seeAll = useCan('kpi.view-all')
  const canEdit = useCan('kpi.set-target') && seeAll
  const running = keyOf(monthPick())
  const first = useQuery(orgTreeQuery(running))
  const [picked, setPicked] = useState<string | null>(null)
  const from = first.data?.editableFrom
  const start = first.data?.firstPeriod
  const earliest = start && start < running ? start : running
  const period = picked ?? from ?? running
  const shown = useQuery({ ...orgTreeQuery(period), enabled: from !== undefined })
  const tree = from === undefined ? undefined : shown.data
  const error = first.error ?? shown.error
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const legacy = tree !== undefined && isBeforeTree(tree)
  const editable = canEdit && tree !== undefined && !legacy && period === tree.editableFrom
  const close = () => setDialog(null)

  return (
    <Section at="kpi-teams">
      {from !== undefined && (
        <div className="flex flex-wrap items-end gap-3">
          {canEdit && !legacy && (
            <MetaPill tone="accent" className="tnum font-num self-center max-sm:hidden">
              Áp dụng từ tháng {monthText(from)}
            </MetaPill>
          )}
          <div className="flex-1" />
          <Select
            label="Xem tháng"
            size="md"
            className="pointer-coarse:[&>button]:h-12"
            value={period}
            neutralValue={from}
            onChange={setPicked}
            options={monthOptions(earliest, from).map((m) => ({ value: m, label: monthText(m) }))}
          />
          {editable && (
            <Button
              className="pointer-coarse:h-12 max-sm:hidden"
              onClick={() => setDialog({ kind: 'add' })}
            >
              <Icon icon={Plus} size={16} />
              Thêm đơn vị
            </Button>
          )}
        </div>
      )}

      {!tree ? (
        error ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className={ALERT}>
              Không tải được phòng ban và nhóm. {isApiError(error) ? userMessage(error) : ''}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="pointer-coarse:h-12"
              onClick={() => void Promise.all([first.refetch(), shown.refetch()])}
            >
              Thử lại
            </Button>
          </div>
        ) : (
          <Skeleton className="h-48 w-full" />
        )
      ) : legacy ? (
        <KpiTeamsConfig period={period} />
      ) : (
        <TreeBody
          tree={tree}
          seeAll={seeAll}
          editable={editable}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDialog={setDialog}
        />
      )}

      {tree && editable && (
        <>
          <AddUnitDrawer
            open={dialog?.kind === 'add'}
            tree={tree}
            near={tree.units.find((u) => u.id === selectedId)}
            onClose={close}
            onCreated={setSelectedId}
          />
          <EditUnitDrawer
            unit={dialog?.kind === 'edit' ? dialog.unit : null}
            tree={tree}
            onClose={close}
          />
          <HeadDrawer
            unit={dialog?.kind === 'head' ? dialog.unit : null}
            tree={tree}
            onClose={close}
          />
          <PlaceDrawer
            target={dialog?.kind === 'place' ? dialog.target : null}
            tree={tree}
            onClose={close}
          />
        </>
      )}
    </Section>
  )
}
