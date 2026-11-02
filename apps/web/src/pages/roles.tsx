import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Save, TriangleAlert } from '@pv/ui'
import { Button, EmptyState, GlassCard, Icon, MetaPill, ScreenHeader, Skeleton, cn } from '@pv/ui'
import type { Permission, RoleId } from '@pv/contracts'
import { SettingsShell } from '@/components/settings-shell'
import { useSession } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { kpiRoleText } from '@/data/kpi-i18n'
import {
  FIRST_ROLE,
  dirtyRoles,
  draftOf,
  matrixLine,
  roleMatrixQuery,
  toggleGrant,
  useSaveRoleGrants,
  type RoleDraft,
} from '@/data/roles'
import { RoleMatrix, RoleSheet } from './roles-parts'

/** One Core · Admin · Roles — the matrix that decides what every role may
 *  do, which stopped being a compile-time constant on 14/09.
 *
 *  ------------------------------------------------------------------
 *  NO CONTEXTRAIL — THE SAME EXCEPTION THE PEOPLE BOOK TOOK
 *  ------------------------------------------------------------------
 *  Rule 10 asks for a rail of mono object codes on every screen. A role holds
 *  no object code and sits on no chain, so `E1.story()` has nothing to build
 *  from — see the longer version of this argument in `users.tsx`. Do not fix
 *  it by inventing a code for a role to print.
 *
 *  ------------------------------------------------------------------
 *  ONE DRAFT, SAVED ROW BY ROW
 *  ------------------------------------------------------------------
 *  `PATCH /roles/:roleId` rewrites one role's whole grant set, while the grid
 *  lets somebody tick cells across several roles before saving. So the screen
 *  holds a draft of the whole matrix and, on save, walks the dirty rows one at
 *  a time. A row that goes through is committed even if a later one is
 *  refused: the query refetches, that row stops being dirty, and the rows
 *  still unsaved stay on screen with the server's refusal beside them. The
 *  alternative — throwing away work the server already accepted — would have
 *  the screen lie about what is stored.
 *
 *  ------------------------------------------------------------------
 *  THE TWO REFUSALS ARE THE SERVER'S SENTENCES, WORD FOR WORD
 *  ------------------------------------------------------------------
 *  Nobody strips a permission off the role they are wearing, and the system
 *  never runs out of holders of `user.manage` / `role.manage`. Both come back
 *  as a 409 whose `title` is already a full Vietnamese sentence, and
 *  `userMessage` prints it unchanged. Writing a replacement sentence here
 *  would mean guessing which of the two rules fired. */

/** Shared empty list — a `[]` written inside the component body mints a new
 *  array every render and costs the `dirty` memo its memo. Same constant, same
 *  reason, as `NO_USERS` on the people book. */
const NO_ROLES: RoleId[] = []
const FAILED_INK = 'text-destructive-foreground'

const SAVE_FAILED = message(
  'Không lưu được bảng phân quyền. Thử lại.',
  'Could not save the permission matrix. Try again.',
  '권한 표를 저장하지 못했습니다. 다시 시도하세요.',
)
const savedSome = (saved: number, said: string) =>
  message(
    `Đã lưu ${saved} vai trò. ${said}`,
    `${saved} role(s) saved. ${said}`,
    `역할 ${saved}개를 저장했습니다. ${said}`,
  )
const SAVED_TITLE = message(
  'Đã lưu bảng phân quyền',
  'Permission matrix saved',
  '권한 표를 저장했습니다',
)
const SAVED_DETAIL = message(
  'Quyền mới có hiệu lực từ thao tác tiếp theo.',
  'The new permissions apply from the next action.',
  '새 권한은 다음 작업부터 적용됩니다.',
)
const loadRefused = (said: string | null) =>
  message(
    `Không tải được bảng phân quyền. ${said ?? 'Thử lại.'}`,
    `Could not load the permission matrix. ${said ?? 'Try again.'}`,
    `권한 표를 불러오지 못했습니다. ${said ?? '다시 시도하세요.'}`,
  )
const LOADING = message(
  'Đang tải bảng phân quyền…',
  'Loading the permission matrix…',
  '권한 표를 불러오는 중…',
)
const LOAD_FAILED = message(
  'Không tải được bảng phân quyền.',
  'Could not load the permission matrix.',
  '권한 표를 불러오지 못했습니다.',
)

export function RolesPage() {
  const { t, lang } = useI18n()
  const me = useSession((s) => s.actor)

  const { data, isPending, error, refetch } = useQuery(roleMatrixQuery)
  const save = useSaveRoleGrants()

  /* What the server last said, as a draft, so the edited copy and the stored
     copy are the same shape and comparable field by field. */
  const server = useMemo(() => (data ? draftOf(data) : null), [data])

  /* `null` means "nothing edited yet" rather than a copy of `server`, so a
     refetch after a save flows straight through to the screen. Clearing it is
     therefore both what the undo button does and what a completed save does. */
  const [edited, setEdited] = useState<RoleDraft | null>(null)
  const grants = edited ?? server

  const dirty = useMemo(
    () => (server && grants ? dirtyRoles(server, grants) : NO_ROLES),
    [server, grants],
  )

  /* Which role the tablet sheet is showing. Defaults to the reader's own —
     the row they are most likely to be here about, and the one the server
     will refuse to let them narrow. */
  const [picked, setPicked] = useState<RoleId | null>(null)
  const shown = picked ?? me?.roleIds[0] ?? FIRST_ROLE

  const [failure, setFailure] = useState('')

  const toggle = (roleId: RoleId, permission: Permission, on: boolean) => {
    if (!grants) return
    setFailure('')
    setEdited(toggleGrant(grants, roleId, permission, on))
  }

  const saveDirty = async () => {
    if (!grants || save.isPending) return
    setFailure('')

    let saved = 0
    for (const roleId of dirty) {
      try {
        await save.mutateAsync({ roleId, permissions: grants[roleId] })
        saved++
      } catch (refusal) {
        /* The server's own sentence, not a replacement: a 409 here says either
           "you cannot take this off your own role" or "somebody has to keep
           this permission", and only the server knows which.

           Prefixed by what DID land. The loop commits role by role, so a
           refusal on the third one leaves the first two stored; a message
           carrying only the refusal reads as "nothing was saved", and the next
           thing the reader does is redo work the server already accepted. */
        const said = isApiError(refusal) ? userMessage(refusal) : t(SAVE_FAILED)
        setFailure(saved > 0 ? t(savedSome(saved, said)) : said)
        return
      }
    }

    setEdited(null)
    toastDone(t(SAVED_TITLE), t(SAVED_DETAIL))
  }

  const unread = !isPending && (error || !grants)
  const summary = isPending ? t(LOADING) : error || !grants ? t(LOAD_FAILED) : matrixLine(grants)

  return (
    <SettingsShell>
      <ScreenHeader
        title={t(message('Vai trò', 'Roles', '역할'))}
        description={<span className={cn('tnum', unread && FAILED_INK)}>{summary}</span>}
        /* BOTH, never one instead of the other. A refusal that replaced the
             unsaved list left the reader with a sentence about one role and no
             sign that the others are still pending — the docblock above
             promised "beside", and a ternary delivered "instead". */
        meta={
          failure || dirty.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {failure ? (
                <span
                  role="alert"
                  className="text-destructive-foreground text-[11.5px] leading-[1.5]"
                >
                  {failure}
                </span>
              ) : null}
              {dirty.length > 0 ? (
                <MetaPill tone="warning">
                  {t(message('Chưa lưu thay đổi cho', 'Unsaved changes for', '저장되지 않은 변경'))}
                  : {dirty.map((id) => kpiRoleText(id, lang)).join(' · ')}
                </MetaPill>
              ) : null}
            </span>
          ) : undefined
        }
        actions={
          <>
            {/* `lg` (48px) and not `md`, at every width: rule 13 puts the
                  touch floor at 48px on tablet, and these two are the actions
                  the screen exists for. The role picker already made this
                  choice for the same reason. */}
            <Button
              size="lg"
              variant="ghost"
              type="button"
              disabled={dirty.length === 0 || save.isPending}
              onClick={() => {
                setEdited(null)
                setFailure('')
              }}
            >
              <Icon icon={RotateCcw} size={16} />
              {t(message('Hoàn tác', 'Undo', '되돌리기'))}
            </Button>
            <Button
              size="lg"
              type="button"
              disabled={dirty.length === 0 || save.isPending}
              onClick={() => void saveDirty()}
            >
              <Icon icon={Save} size={16} />
              {save.isPending
                ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
                : t(message('Lưu thay đổi', 'Save changes', '변경 사항 저장'))}
            </Button>
          </>
        }
      />

      {/* Rule 8 — the grid is a long table, so it sits on glass-b and the
            card draws the surface the table refuses to draw for itself. */}
      <GlassCard variant="b" className="overflow-hidden">
        <div className="p-4 lg:p-5">
          {isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton height={48} className="w-full" />
              <Skeleton height={48} className="w-full" />
              <Skeleton height={48} className="w-full" />
            </div>
          ) : error || !grants ? (
            /* Ask again — there is nothing on this screen to create. The
                 matrix is seeded by the server, so an empty answer is still an
                 answer and only a failed read lands here. */
            <EmptyState
              tone="danger"
              icon={TriangleAlert}
              message={t(loadRefused(isApiError(error) ? userMessage(error) : null))}
              action={{
                label: t(message('Thử lại', 'Try again', '다시 시도')),
                onClick: () => void refetch(),
              }}
              className="py-12"
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto xl:block">
                <RoleMatrix
                  grants={grants}
                  onToggle={toggle}
                  meRoleIds={me?.roleIds}
                  saving={save.isPending}
                />
              </div>
              <div className="xl:hidden">
                <RoleSheet
                  grants={grants}
                  roleId={shown}
                  dirty={dirty}
                  onPick={setPicked}
                  onToggle={toggle}
                  meRoleIds={me?.roleIds}
                  saving={save.isPending}
                />
              </div>
            </>
          )}
        </div>
      </GlassCard>
    </SettingsShell>
  )
}

export default RolesPage
