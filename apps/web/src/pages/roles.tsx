import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Save, TriangleAlert } from '@pv/ui'
import {
  AppShell,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import type { Permission, RoleId } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { ROLE_LABEL } from '@/data/users'
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

export function RolesPage() {
  const chrome = useAppChrome()
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
  const shown = picked ?? me?.roleId ?? FIRST_ROLE

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
        const said = isApiError(refusal)
          ? userMessage(refusal)
          : 'Không ghi được bảng quyền. Thử lại.'
        setFailure(saved > 0 ? `Đã lưu ${saved} vai. ${said}` : said)
        return
      }
    }

    setEdited(null)
    toastDone('Đã lưu bảng quyền', 'Người đang đăng nhập nhận quyền mới ở lần gọi kế tiếp.')
  }

  const summary = isPending
    ? 'Đang đọc bảng quyền…'
    : error || !grants
      ? 'Chưa đọc được bảng quyền.'
      : matrixLine(grants)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core · Quản trị"
          title="Vai trò"
          description={<span className="tnum">{summary}</span>}
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
                    Chưa lưu: {dirty.map((id) => ROLE_LABEL[id]).join(' · ')}
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
                Hoàn tác
              </Button>
              <Button
                size="lg"
                type="button"
                disabled={dirty.length === 0 || save.isPending}
                onClick={() => void saveDirty()}
              >
                <Icon icon={Save} size={16} />
                {save.isPending ? 'Đang ghi…' : 'Lưu'}
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
                icon={TriangleAlert}
                message={`Không lấy được bảng quyền. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <RoleMatrix
                    grants={grants}
                    onToggle={toggle}
                    meRoleId={me?.roleId}
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
                    meRoleId={me?.roleId}
                    saving={save.isPending}
                  />
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </ScreenLayout>
    </AppShell>
  )
}

export default RolesPage
