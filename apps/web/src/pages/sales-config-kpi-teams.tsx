import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, GlassCard, Icon, Pencil, Plus, Skeleton, Trash2, cn } from '@pv/ui'
import type { KpiTeam } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { useCan, useSession } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { kpiTeamRosterQuery } from '@/data/kpi-team-roster'
import { ROLE_LABEL } from '@/data/users'
import { monthText } from './kpi-model'
import { actingLine } from './kpi-team-model'
import { TeamFormDrawer, TeamRemoveDrawer } from './sales-config-kpi-teams-parts'

/** The old KPI team editor (ADR 0101), drawn inside the org section (5.18) for a
 *  month before the org tree (ADR 0118 §7): KPI teams, who leads each and who
 *  is in it. Edited directly by a `kpi.set-target` holder, with no approval.
 *
 *  It reads the roster of the month picked above it. A change lands on the
 *  roster's `editableFrom`, so the edit buttons show only when that is the
 *  month on screen; the caller draws this only for months before the tree. */

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
  const { t, number } = useI18n()
  const me = useSession((s) => s.actor?.id)
  const acting = actingLine(team, me)
  return (
    <li className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-semibold">
          {t(message(`Nhóm ${team.name}`, `Team ${team.name}`, `팀 ${team.name}`))}
        </span>
        <span className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              `Trưởng nhóm ${team.lead.name} · ${team.members.length} thành viên · ${rolesOf(team).join(', ')}`,
              `Lead: ${team.lead.name} · ${number(team.members.length)} members · ${rolesOf(team).join(', ')}`,
              `팀장 ${team.lead.name} · ${number(team.members.length)}명 · ${rolesOf(team).join(', ')}`,
            ),
          )}{' '}
        </span>
        {acting && <span className={NOTE}>{acting}</span>}
        <span className={NOTE}>{team.members.map((m) => m.name).join(', ')}</span>
      </div>
      {canSet && (
        <div className="flex shrink-0 gap-2 max-sm:hidden">
          <Button variant="secondary" className="pointer-coarse:h-12" onClick={onEdit}>
            <Icon icon={Pencil} size={16} />
            {t(message('Sửa', 'Edit', '수정'))}
          </Button>
          <Button variant="ghost" className="pointer-coarse:h-12" onClick={onRemove}>
            <Icon icon={Trash2} size={16} />
            {t(message('Xoá', 'Delete', '삭제'))}
          </Button>
        </div>
      )}
    </li>
  )
}

export function KpiTeamsConfig({ period }: { period: string }) {
  const { t } = useI18n()
  const { data: roster, error, refetch } = useQuery(kpiTeamRosterQuery(period))
  const canSet = useCan('kpi.set-target') && roster?.editableFrom === period
  const [form, setForm] = useState<{ team: KpiTeam | null } | null>(null)
  const [removing, setRemoving] = useState<KpiTeam | null>(null)

  const body = () => {
    if (!roster) {
      return error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className={ALERT}>
            {t(
              message(
                'Không tải được danh sách nhóm.',
                'Could not load the team list.',
                '팀 목록을 불러오지 못했습니다.',
              ),
            )}{' '}
            {isApiError(error) ? userMessage(error) : ''}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12"
            onClick={() => void refetch()}
          >
            {t(message('Thử lại', 'Try again', '다시 시도'))}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-24 w-full" />
      )
    }
    return roster.teams.length === 0 ? (
      <p className={NOTE}>{t(message('Chưa có nhóm nào.', 'No teams yet.', '팀이 없습니다.'))}</p>
    ) : (
      <GlassCard variant="b" className="py-2">
        <ul
          aria-label={t(message('Các nhóm', 'Teams', '팀'))}
          className="divide-surface-ink/6 flex flex-col divide-y"
        >
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
    <div className="flex flex-col gap-4">
      {/* A read-only month shows the list alone; the phone edits nothing. */}
      {canSet && roster && (
        <>
          <p className={cn(NOTE, 'max-sm:hidden')}>
            {t(
              message(
                'Trưởng nhóm chia phần chỉ tiêu của nhóm cho thành viên.',
                'Team leads allocate the team target across its members.',
                '팀장이 팀 목표를 구성원에게 배분합니다.',
              ),
            )}
          </p>
          <Button
            className="pointer-coarse:h-12 self-start max-sm:hidden"
            onClick={() => setForm({ team: null })}
          >
            <Icon icon={Plus} size={16} />
            {t(message('Thêm nhóm', 'Add team', '팀 추가'))}
          </Button>
          <p className={cn(NOTE, 'tnum font-num max-sm:hidden')}>
            {t(
              message(
                `Thay đổi áp dụng từ tháng ${monthText(roster.editableFrom)}.`,
                `Changes apply from ${monthText(roster.editableFrom)}.`,
                `${monthText(roster.editableFrom)}부터 변경 사항이 적용됩니다.`,
              ),
            )}
          </p>
        </>
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
    </div>
  )
}
