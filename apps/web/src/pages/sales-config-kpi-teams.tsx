import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Icon, Pencil, Plus, Skeleton, Trash2, cn } from '@pv/ui'
import type { KpiTeam } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { ROLE_LABEL } from '@/data/users'
import { keyOf } from './home-model'
import { monthPick, monthText } from './kpi-model'
import { TeamFormDrawer, TeamRemoveDrawer } from './sales-config-kpi-teams-parts'
import { Section } from './sales-config-section'

/** The Teams section of the KPI area (ADR 0101): KPI teams, who leads each and
 *  who is in it. Edited directly by a `kpi.set-target` holder, with no approval.
 *
 *  A change lands on `editableFrom`, the month after the last one anything was
 *  sent for, not on the month on screen; so the list shows THAT month's roster.
 *  The running month is read first only to learn which month that is. */

const NOTE = 'text-muted-foreground m-0 text-[11.5px] leading-[1.5]'
const ALERT = 'text-destructive-foreground m-0 text-[11.5px] leading-[1.5]'

const rolesOf = (team: KpiTeam) => [
  ...new Set(team.members.flatMap((m) => m.roleIds.map((r) => ROLE_LABEL[r]))),
]

function TeamLine({
  team,
  canSet,
  onEdit,
  onRemove,
}: {
  team: KpiTeam
  canSet: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-semibold">Nhóm {team.name}</span>
        <span className={cn(NOTE, 'tnum font-num')}>
          Trưởng nhóm {team.lead.name} · {team.members.length} thành viên ·{' '}
          {rolesOf(team).join(', ')}
        </span>
        <span className={NOTE}>{team.members.map((m) => m.name).join(', ')}</span>
      </div>
      {canSet && (
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" className="pointer-coarse:h-12" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            Sửa
          </Button>
          <Button variant="ghost" className="pointer-coarse:h-12" onClick={onRemove}>
            <Icon icon={Trash2} size={16} />
            Xoá
          </Button>
        </div>
      )}
    </li>
  )
}

export function KpiTeamsConfig() {
  const canSet = useCan('kpi.set-target')
  const running = keyOf(monthPick())
  const now = useQuery(kpiTeamRosterQuery(running))
  const from = now.data?.editableFrom
  /* Same month as the running one: the first read already is the editable roster. */
  const later = useQuery({
    ...kpiTeamRosterQuery(from ?? running),
    enabled: from !== undefined && from !== running,
  })
  const roster = from === undefined || from === running ? now.data : later.data
  const error = now.error ?? later.error
  const [form, setForm] = useState<{ team: KpiTeam | null } | null>(null)
  const [removing, setRemoving] = useState<KpiTeam | null>(null)

  const body = () => {
    if (!roster) {
      return error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className={ALERT}>
            Không tải được danh sách nhóm. {isApiError(error) ? userMessage(error) : ''}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => void Promise.all([now.refetch(), later.refetch()])}
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <Skeleton className="h-24 w-full" />
      )
    }
    return roster.teams.length === 0 ? (
      <p className={NOTE}>Chưa có nhóm nào.</p>
    ) : (
      <GlassCard variant="b" className="py-2">
        <ul aria-label="Các nhóm" className="divide-surface-ink/6 flex flex-col divide-y">
          {roster.teams.map((team) => (
            <TeamLine
              key={team.id}
              team={team}
              canSet={canSet}
              onEdit={() => setForm({ team })}
              onRemove={() => setRemoving(team)}
            />
          ))}
        </ul>
      </GlassCard>
    )
  }

  /* People in no team, plus the team's own members when it is being edited. */
  const pool = [...(form?.team?.members ?? []), ...(roster?.unassigned ?? [])]

  return (
    <Section at="kpi-teams" hint="Trưởng nhóm chia phần chỉ tiêu của nhóm cho thành viên.">
      {canSet && roster && (
        <Button className="pointer-coarse:h-12 self-start" onClick={() => setForm({ team: null })}>
          <Icon icon={Plus} size={16} />
          Thêm nhóm
        </Button>
      )}
      {roster && (
        <p className={cn(NOTE, 'tnum font-num')}>
          Thay đổi áp dụng từ tháng {monthText(roster.editableFrom)}.
        </p>
      )}
      {body()}
      {roster && (
        <>
          <TeamFormDrawer
            open={form !== null}
            team={form?.team ?? null}
            pool={pool}
            editableFrom={roster.editableFrom}
            onClose={() => setForm(null)}
          />
          <TeamRemoveDrawer
            team={removing}
            editableFrom={roster.editableFrom}
            onClose={() => setRemoving(null)}
          />
        </>
      )}
    </Section>
  )
}
