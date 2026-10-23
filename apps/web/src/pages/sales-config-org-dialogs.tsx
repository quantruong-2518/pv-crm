import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  Checkbox,
  Drawer,
  Input,
  Plus,
  SegmentedControl,
  Select,
  Trash2,
  UserPlus,
} from '@pv/ui'
import {
  OrgUnitCreateBody,
  OrgUnitUpdateBody,
  type OrgPerson,
  type OrgTreeResponse,
  type OrgUnit,
} from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { RadioCard } from '@/components/radio-card'
import { StepFooter } from '@/components/step-footer'
import { useOrgWrite } from '@/data/org-tree'
import {
  HEAD_LABEL,
  KIND_LABEL,
  UNPLACED,
  parentsFor,
  splitError,
  unitOf,
} from './sales-config-org-model'

/** The dialogs of the org section (5.18), as the app draws a dialog:
 *  the right-hand `Drawer`, full width on a phone. The month an edit lands on
 *  is said once, on the section's chip, never here. A server refusal goes under
 *  the box it names (`splitError`), else to the footer, which for a 409 prints
 *  the server's own sentence. */

const PROBLEM = 'text-destructive-foreground m-0 text-[11px] leading-[1.5]'
const Problem = ({ text }: { text?: string }) => (text ? <p className={PROBLEM}>{text}</p> : null)

type Kind = 'department' | 'team'

export function AddUnitDrawer({
  open,
  tree,
  near,
  onClose,
  onCreated,
}: {
  open: boolean
  tree: OrgTreeResponse
  /** The unit open in the panel: where a new team hangs unless changed. */
  near: OrgUnit | undefined
  onClose: () => void
  onCreated: (unitId: string) => void
}) {
  const write = useOrgWrite()
  const [kind, setKind] = useState<Kind>('team')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const company = tree.units.find((u) => u.kind === 'company')
  const parents = parentsFor(kind, tree.units)

  const { reset } = write
  useEffect(() => {
    if (!open) return
    setKind('team')
    setName('')
    setParentId(near && near.kind !== 'team' ? near.id : (company?.id ?? ''))
    reset()
  }, [open, near, company?.id, reset])

  const parent = parents.some((u) => u.id === parentId) ? parentId : (company?.id ?? '')
  const body = OrgUnitCreateBody.safeParse({ kind, name, parentId: parent })
  const { problems, footer } = splitError(write.error, ['name', 'parentId'])

  const save = () => {
    if (!body.success) return
    const before = new Set(tree.units.map((u) => u.id))
    write.mutate(
      { kind: 'create', body: body.data },
      {
        onSuccess: (fresh) => {
          toastDone(`Đã thêm ${body.data.name}`)
          const added = fresh.units.find((u) => !before.has(u.id))
          if (added) onCreated(added.id)
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Thêm đơn vị"
      footer={
        <StepFooter
          error={footer}
          pending={write.isPending}
          hint=""
          onClose={onClose}
          confirm={{
            icon: Plus,
            label: kind === 'team' ? 'Thêm nhóm' : 'Thêm phòng',
            disabled: !body.success,
            onClick: save,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <SegmentedControl
          label="Loại"
          tone="quiet"
          value={kind}
          onChange={(v) => setKind(v === 'department' ? 'department' : 'team')}
          options={[
            { value: 'department', label: 'Phòng' },
            { value: 'team', label: 'Nhóm' },
          ]}
        />
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Tên</span>
            <Input
              value={name}
              maxLength={80}
              invalid={problems.name !== undefined}
              className="pointer-coarse:h-12"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Problem text={problems.name} />
        </div>
        {parents.length > 1 && (
          <div className="flex flex-col gap-2">
            <Select
              label="Thuộc đơn vị"
              size="lg"
              value={parent}
              onChange={setParentId}
              options={parents.map((u) => ({ value: u.id, label: u.name }))}
            />
            <Problem text={problems.parentId} />
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** Rename and move in one dialog; the company has no parent to move to, and a
 *  department's only parent is the company, so only a team gets the parent box. */
export function EditUnitDrawer({
  unit,
  tree,
  onClose,
}: {
  /** `null` = closed. */
  unit: OrgUnit | null
  tree: OrgTreeResponse
  onClose: () => void
}) {
  const write = useOrgWrite()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  const { reset } = write
  useEffect(() => {
    if (!unit) return
    setName(unit.name)
    setParentId(unit.parentId ?? '')
    reset()
  }, [unit, reset])

  const parents = unit?.kind === 'team' ? parentsFor('team', tree.units) : []
  const typed = OrgUnitCreateBody.shape.name.safeParse(name)
  const body = OrgUnitUpdateBody.safeParse({
    name: typed.success && typed.data !== unit?.name ? typed.data : undefined,
    parentId: parents.length > 1 && parentId !== unit?.parentId ? parentId : undefined,
  })
  const { problems, footer } = splitError(write.error, ['name', 'parentId'])

  const save = () => {
    if (!unit || !body.success) return
    write.mutate(
      { kind: 'update', unitId: unit.id, body: body.data },
      {
        onSuccess: () => {
          toastDone('Đã lưu')
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={unit !== null}
      onClose={onClose}
      title={`Sửa ${unit?.name ?? ''}`}
      footer={
        <StepFooter
          error={footer}
          pending={write.isPending}
          hint=""
          onClose={onClose}
          confirm={{
            icon: Check,
            label: 'Lưu',
            disabled: !typed.success || !body.success,
            onClick: save,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px]">Tên</span>
            <Input
              value={name}
              maxLength={80}
              invalid={problems.name !== undefined}
              className="pointer-coarse:h-12"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Problem text={problems.name} />
        </div>
        {parents.length > 1 && (
          <div className="flex flex-col gap-2">
            <Select
              label="Thuộc đơn vị"
              size="lg"
              value={parentId}
              onChange={setParentId}
              options={parents.map((u) => ({ value: u.id, label: u.name }))}
            />
            <Problem text={problems.parentId} />
          </div>
        )}
      </div>
    </Drawer>
  )
}

/** Delete asks once more, as the old team book did (owner's call, 23/10),
 *  though the panel offers it only for a unit with no member and no child. */
export function RemoveUnitDrawer({
  unit,
  onClose,
}: {
  /** `null` = closed. */
  unit: OrgUnit | null
  onClose: () => void
}) {
  const write = useOrgWrite()
  const { reset } = write
  useEffect(() => {
    if (unit) reset()
  }, [unit, reset])

  const remove = () => {
    if (!unit) return
    write.mutate(
      { kind: 'remove', unitId: unit.id },
      {
        onSuccess: () => {
          toastDone(`Đã xoá ${unit.name}`)
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={unit !== null}
      onClose={onClose}
      title={`Xoá ${unit?.name ?? ''}`}
      footer={
        <StepFooter
          error={write.error}
          pending={write.isPending}
          hint=""
          onClose={onClose}
          confirm={{ icon: Trash2, label: 'Xoá', disabled: unit === null, onClick: remove }}
        />
      }
    >
      <p className="m-0 text-[13px] leading-5">
        {unit ? KIND_LABEL[unit.kind] : ''} này sẽ không còn trên cây.
      </p>
    </Drawer>
  )
}

export function HeadDrawer({
  unit,
  tree,
  onClose,
}: {
  unit: OrgUnit | null
  tree: OrgTreeResponse
  onClose: () => void
}) {
  const write = useOrgWrite()
  const [picked, setPicked] = useState('')

  const { reset } = write
  useEffect(() => {
    if (!unit) return
    setPicked(unit.headId ?? '')
    reset()
  }, [unit, reset])

  const people = new Map(tree.people.map((p) => [p.actorId, p]))
  const { problems, footer } = splitError(write.error, ['headId'])
  const title = unit ? HEAD_LABEL[unit.kind].toLowerCase() : ''

  /* '' is the "no head" choice: the contract clears the head with `null`. */
  const current = unit?.headId ?? ''
  const save = () => {
    if (!unit) return
    write.mutate(
      { kind: 'update', unitId: unit.id, body: { headId: picked === '' ? null : picked } },
      {
        onSuccess: () => {
          toastDone('Đã lưu')
          onClose()
        },
      },
    )
  }

  return (
    <Drawer
      open={unit !== null}
      onClose={onClose}
      title={`Đổi ${title}`}
      subtitle={unit?.name}
      footer={
        <StepFooter
          error={footer}
          pending={write.isPending}
          hint=""
          onClose={onClose}
          confirm={{
            icon: Check,
            label: 'Lưu',
            disabled: picked === current,
            onClick: save,
          }}
        />
      }
    >
      <fieldset className="m-0 flex flex-col gap-2 p-0">
        <legend className="text-muted-foreground pb-2 text-[11px]">Chọn người</legend>
        {[...(unit?.memberIds ?? []), ''].map((id) => (
          <RadioCard
            key={id}
            name="org-head"
            checked={picked === id}
            onSelect={() => setPicked(id)}
            hint={id === current ? 'Hiện tại' : undefined}
          >
            {id === '' ? `Không có ${title}` : (people.get(id)?.name ?? id)}
          </RadioCard>
        ))}
        <Problem text={problems.headId} />
      </fieldset>
    </Drawer>
  )
}

/** Who moves where. Opened from a person, it asks for the unit; opened from a
 *  unit's add-person button, it asks for the person. Either way one PUT, or a DELETE
 *  when the person is sent back to no unit. */
export type PlaceTarget = { person: OrgPerson } | { unit: OrgUnit }

export function PlaceDrawer({
  target,
  tree,
  onClose,
}: {
  target: PlaceTarget | null
  tree: OrgTreeResponse
  onClose: () => void
}) {
  const write = useOrgWrite()
  const [choice, setChoice] = useState('')
  const [head, setHead] = useState(false)

  const { reset } = write
  useEffect(() => {
    if (!target) return
    setChoice('')
    setHead(false)
    reset()
  }, [target, reset])

  const person = target && 'person' in target ? target.person : undefined
  const from = person ? unitOf(tree, person.actorId) : undefined
  const fixedUnit = target && 'unit' in target ? target.unit : undefined
  const toUnit = fixedUnit ?? tree.units.find((u) => u.id === choice)
  const who = person ?? tree.people.find((p) => p.actorId === choice)

  const options = person
    ? [
        ...tree.units.filter((u) => u.id !== from?.id).map((u) => ({ value: u.id, label: u.name })),
        ...(from ? [{ value: UNPLACED, label: 'Chưa xếp đơn vị' }] : []),
      ]
    : tree.people
        .filter((p) => !fixedUnit?.memberIds.includes(p.actorId))
        .map((p) => ({
          value: p.actorId,
          label: `${p.name} · ${unitOf(tree, p.actorId)?.name ?? 'Chưa xếp đơn vị'}`,
        }))
  const { problems, footer } = splitError(write.error, ['unitId', 'actorId', 'head'])

  const save = () => {
    if (!who) return
    const done = () => {
      toastDone(fixedUnit ? `Đã thêm ${who.name}` : `Đã chuyển ${who.name}`)
      onClose()
    }
    if (choice === UNPLACED) {
      write.mutate({ kind: 'unplace', actorId: who.actorId }, { onSuccess: done })
    } else if (toUnit) {
      write.mutate(
        { kind: 'place', actorId: who.actorId, body: { unitId: toUnit.id, head } },
        { onSuccess: done },
      )
    }
  }

  return (
    <Drawer
      open={target !== null}
      onClose={onClose}
      title={person ? `Chuyển ${person.name}` : `Thêm người vào ${fixedUnit?.name ?? ''}`}
      subtitle={person ? (from ? `Đang ở ${from.name}` : 'Chưa xếp đơn vị') : undefined}
      footer={
        <StepFooter
          error={footer}
          pending={write.isPending}
          hint=""
          onClose={onClose}
          confirm={{
            icon: fixedUnit ? UserPlus : ArrowRight,
            label: fixedUnit ? 'Thêm người' : 'Chuyển',
            disabled: choice === '',
            onClick: save,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Select
            label={person ? 'Chuyển sang' : 'Người'}
            size="lg"
            value={choice}
            neutralValue=""
            onChange={setChoice}
            options={[{ value: '', label: person ? 'Chọn đơn vị' : 'Chọn người' }, ...options]}
          />
          <Problem text={problems.unitId ?? problems.actorId} />
        </div>
        {toUnit && choice !== UNPLACED && (
          <div className="flex flex-col gap-2">
            <Checkbox
              className="pointer-coarse:min-h-12"
              checked={head}
              onChange={setHead}
              label={`Làm ${HEAD_LABEL[toUnit.kind].toLowerCase()} mới`}
            />
            <Problem text={problems.head} />
          </div>
        )}
      </div>
    </Drawer>
  )
}
