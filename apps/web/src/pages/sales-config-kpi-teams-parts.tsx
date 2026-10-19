import { useEffect, useState } from 'react'
import { Check, Checkbox, Drawer, Input, Select, Trash2 } from '@pv/ui'
import { KpiTeamBody, type KpiTeam, type KpiTeamMember } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { StepFooter } from '@/components/step-footer'
import { useCreateKpiTeam, useDeleteKpiTeam, useUpdateKpiTeam } from '@/data/kpi-team-roster'
import { ROLE_LABEL } from '@/data/users'
import { monthText } from './kpi-model'

/** The two dialogs of the Teams section: add or edit a team, and remove one.
 *  The app's "dialog" is the right-hand `Drawer`, full width on a phone.
 *
 *  The contract's own sentences are the hint: `KpiTeamBody` refuses an empty
 *  name, no member, and a lead outside the members, so the confirm button
 *  waits for it and the footer says which. */

const rolesOf = (m: KpiTeamMember) => m.roleIds.map((r) => ROLE_LABEL[r]).join(', ')

const NONE = ''

export function TeamFormDrawer({
  open,
  team,
  pool,
  editableFrom,
  onClose,
}: {
  open: boolean
  /** The team being edited; `null` = a new one. */
  team: KpiTeam | null
  /** Who can be picked: people in no team, plus this team's own members. */
  pool: readonly KpiTeamMember[]
  editableFrom: string
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [leadId, setLeadId] = useState(NONE)
  const create = useCreateKpiTeam()
  const update = useUpdateKpiTeam()
  const write = team ? update : create

  /* Reopening starts from the team as saved, not from the last cancelled edit. */
  const { reset } = write
  useEffect(() => {
    if (!open) return
    setName(team?.name ?? '')
    setPicked(team?.members.map((m) => m.actorId) ?? [])
    setLeadId(team?.lead.actorId ?? NONE)
    reset()
  }, [open, team, reset])

  const body = KpiTeamBody.safeParse({ name, leadId, memberIds: picked })
  const chosen = pool.filter((m) => picked.includes(m.actorId))
  const toggle = (actorId: string, on: boolean) => {
    setPicked(on ? [...picked, actorId] : picked.filter((id) => id !== actorId))
    if (!on && leadId === actorId) setLeadId(NONE)
  }

  const save = () => {
    if (!body.success) return
    const done = () => {
      toastDone('Đã lưu nhóm')
      onClose()
    }
    if (team) update.mutate({ teamId: team.id, body: body.data }, { onSuccess: done })
    else create.mutate(body.data, { onSuccess: done })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={team ? `Sửa nhóm ${team.name}` : 'Thêm nhóm'}
      subtitle={`Áp dụng từ tháng ${monthText(editableFrom)}.`}
      footer={
        <StepFooter
          error={write.error}
          pending={write.isPending}
          hint={body.success ? '' : (body.error.issues[0]?.message ?? '')}
          onClose={onClose}
          confirm={{ icon: Check, label: 'Lưu nhóm', disabled: !body.success, onClick: save }}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Tên nhóm</span>
          <Input
            value={name}
            maxLength={80}
            placeholder="Miền Nam"
            className="pointer-coarse:h-12"
            onChange={(e) => setName(e.target.value)}
          />
          {/* Every screen and bell prefixes the team word, so typing it doubles it. */}
          <span className="text-muted-foreground text-[11px]">Không cần ghi chữ "Nhóm".</span>
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">Thành viên</span>
          {pool.length === 0 ? (
            <p className="text-muted-foreground text-[12px]">Mọi người đã có nhóm.</p>
          ) : (
            pool.map((m) => (
              <Checkbox
                key={m.actorId}
                className="pointer-coarse:min-h-12"
                checked={picked.includes(m.actorId)}
                onChange={(on) => toggle(m.actorId, on)}
                label={m.name}
                hint={rolesOf(m)}
              />
            ))
          )}
        </div>

        <Select
          label="Trưởng nhóm"
          size="lg"
          value={leadId}
          onChange={setLeadId}
          options={[
            { value: NONE, label: 'Chọn trưởng nhóm' },
            ...chosen.map((m) => ({ value: m.actorId, label: m.name })),
          ]}
        />
      </div>
    </Drawer>
  )
}

export function TeamRemoveDrawer({
  team,
  editableFrom,
  onClose,
}: {
  /** `null` = closed. */
  team: KpiTeam | null
  editableFrom: string
  onClose: () => void
}) {
  const remove = useDeleteKpiTeam()
  const { reset } = remove
  const open = team !== null
  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Xoá nhóm ${team?.name ?? ''}`}
      subtitle={`Áp dụng từ tháng ${monthText(editableFrom)}.`}
      footer={
        <StepFooter
          error={remove.error}
          pending={remove.isPending}
          hint="Quản lý chia chỉ tiêu trực tiếp cho từng thành viên."
          onClose={onClose}
          confirm={{
            icon: Trash2,
            label: 'Xoá nhóm',
            disabled: team === null,
            onClick: () =>
              team &&
              remove.mutate(
                { teamId: team.id },
                {
                  onSuccess: () => {
                    toastDone('Đã xoá nhóm')
                    onClose()
                  },
                },
              ),
          }}
        />
      }
    >
      <p className="text-[13px] leading-5">
        {team?.members.length ?? 0} thành viên sẽ không còn thuộc nhóm nào.
      </p>
    </Drawer>
  )
}
