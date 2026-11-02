import { useEffect, useState } from 'react'
import { Check, Checkbox, Drawer, Input, Select, Trash2 } from '@pv/ui'
import { KpiTeamBody, type KpiTeam, type KpiTeamMember } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
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
  const { t } = useI18n()
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
      toastDone(t(message('Đã lưu nhóm', 'Team saved', '팀 저장 완료')))
      onClose()
    }
    if (team) update.mutate({ teamId: team.id, body: body.data }, { onSuccess: done })
    else create.mutate(body.data, { onSuccess: done })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        team
          ? t(message(`Sửa nhóm ${team.name}`, `Edit team ${team.name}`, `팀 ${team.name} 수정`))
          : t(message('Thêm nhóm', 'Add team', '팀 추가'))
      }
      subtitle={t(
        message(
          `Áp dụng từ tháng ${monthText(editableFrom)}.`,
          `Applies from ${monthText(editableFrom)}.`,
          `${monthText(editableFrom)}부터 적용됩니다.`,
        ),
      )}
      footer={
        <StepFooter
          error={write.error}
          pending={write.isPending}
          hint={body.success ? '' : (body.error.issues[0]?.message ?? '')}
          onClose={onClose}
          confirm={{
            icon: Check,
            label: t(message('Lưu nhóm', 'Save team', '팀 저장')),
            disabled: !body.success,
            onClick: save,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {t(message('Tên nhóm', 'Team name', '팀 이름'))}
          </span>
          <Input
            value={name}
            maxLength={80}
            placeholder={t(message('Miền Nam', 'South region', '남부 지역'))}
            className="pointer-coarse:h-12"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[11px]">
            {t(message('Thành viên', 'Members', '구성원'))}
          </span>
          {pool.length === 0 ? (
            <p className="text-muted-foreground text-[12px]">
              {t(
                message(
                  'Mọi người đã có nhóm.',
                  'Everyone is already on a team.',
                  '모든 구성원이 이미 팀에 속해 있습니다.',
                ),
              )}
            </p>
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
          label={t(message('Trưởng nhóm', 'Team lead', '팀장'))}
          size="lg"
          value={leadId}
          onChange={setLeadId}
          options={[
            {
              value: NONE,
              label: t(message('Chọn trưởng nhóm', 'Choose a team lead', '팀장 선택')),
            },
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
  const { t, number } = useI18n()
  const remove = useDeleteKpiTeam()
  const { reset } = remove
  const open = team !== null
  /* The drawer slides out after `team` is already null; keep the last one for its text. */
  const [shown, setShown] = useState(team)
  useEffect(() => {
    if (!team) return
    setShown(team)
    reset()
  }, [team, reset])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(
        message(
          `Xoá nhóm ${shown?.name ?? ''}`,
          `Delete team ${shown?.name ?? ''}`,
          `팀 ${shown?.name ?? ''} 삭제`,
        ),
      )}
      subtitle={t(
        message(
          `Áp dụng từ tháng ${monthText(editableFrom)}.`,
          `Applies from ${monthText(editableFrom)}.`,
          `${monthText(editableFrom)}부터 적용됩니다.`,
        ),
      )}
      footer={
        <StepFooter
          error={remove.error}
          pending={remove.isPending}
          hint={t(
            message(
              'Quản lý chia chỉ tiêu trực tiếp cho từng thành viên.',
              'Managers allocate targets directly to each member.',
              '관리자가 각 구성원의 목표를 직접 배분합니다.',
            ),
          )}
          onClose={onClose}
          confirm={{
            icon: Trash2,
            label: t(message('Xoá nhóm', 'Delete team', '팀 삭제')),
            disabled: team === null,
            onClick: () =>
              team &&
              remove.mutate(
                { teamId: team.id },
                {
                  onSuccess: () => {
                    toastDone(t(message('Đã xoá nhóm', 'Team deleted', '팀 삭제 완료')))
                    onClose()
                  },
                },
              ),
          }}
        />
      }
    >
      <p className="text-[13px] leading-5">
        {t(
          message(
            `${number(shown?.members.length ?? 0)} thành viên sẽ không còn thuộc nhóm nào.`,
            `${number(shown?.members.length ?? 0)} members will no longer belong to a team.`,
            `${number(shown?.members.length ?? 0)}명이 더 이상 팀에 소속되지 않습니다.`,
          ),
        )}
      </p>
    </Drawer>
  )
}
