import { useMemo, useState } from 'react'
import { Inbox, TriangleAlert, UserPlus } from '@pv/ui'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Button,
  DataTable,
  EmptyState,
  GlassCard,
  Icon,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import type { UserRow } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { useSession } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { scopeLabel, tallyLine, userTally, usersQuery } from '@/data/users'
import { UserDrawer, UserNameCell, UserRoleCell, UserStatusCell } from './users-parts'

/** One Core · Quản trị · Người dùng — where accounts are opened, roles are
 *  handed out, and people are locked out.
 *
 *  ------------------------------------------------------------------
 *  NO CONTEXTRAIL, AND IT IS THE FIRST DELIBERATE EXCEPTION TO LUẬT 10
 *  ------------------------------------------------------------------
 *  Luật 10 asks for a rail on every screen: a run of mono code chips stringing
 *  together the objects of one story (`HĐ-2607 → SO-0891 → WO-1180`). A person
 *  is not an E1 object. They hold no object code, they sit on no chain, and
 *  `E1.story()` has nothing to build from — so the honest rail here would be
 *  four chips about somebody else's lead hanging over a table of accounts,
 *  which is what the lead book removed its own rail for (see `leads.tsx`).
 *
 *  The difference from the lead book is that there the rail comes back the day
 *  the chain can be built from the selected row. Here it does not come back:
 *  the shortfall is not "no anchor yet", it is that `platform.actor` has no
 *  place in the object graph at all. Do not "fix" this by inventing an actor
 *  code for the rail to print — an id in a chip is an id on a screen, and this
 *  screen already carries the two things worth reading (mailbox, role).
 *
 *  ------------------------------------------------------------------
 *  ONE CORE, NOT A BRANCH — AND WHAT THAT COSTS AT THE DOOR
 *  ------------------------------------------------------------------
 *  `routes.tsx` gives this screen `permission: 'người-dùng.quản-lý'` and NO
 *  `branch`: the people book belongs to no product line, so a licence axis here
 *  would shut it for a company that bought Supply and not Sales. Two gates,
 *  two questions — the `ScreenDef` docblock spells out why they are separate.
 *
 *  One consequence shapes this file: everybody who can see the screen at all
 *  holds the one permission it uses, so there is no `useCan` anywhere below.
 *  A button gate here would ask a question `RequireAccess` has already
 *  answered, and the answer would be "yes" on every render.
 *
 *  ------------------------------------------------------------------
 *  NO DELETE, EVER
 *  ------------------------------------------------------------------
 *  `lead.owner_id` and `platform.audit.actor_id` both point at an actor, so
 *  removing a person erases who held which lead and who did what to it — a
 *  book full of dangling owners and an audit trail full of holes, in exchange
 *  for a tidier list. Locking ends the access, which is the thing actually
 *  being asked for, and keeps every row that points here pointing at somebody.
 *  The panel's only destructive control is the lock, and it is reversible.
 *
 *  ------------------------------------------------------------------
 *  THE ROW THAT IS YOU
 *  ------------------------------------------------------------------
 *  A manager may not lock or demote themselves. The server refuses, and a UI
 *  that offered the button anyway would be offering a click that can only ever
 *  fail. So on your own row the role picker becomes a read-only box and the
 *  lock button is dead, both with the reason written beside them — and the
 *  table marks the row "bạn" so the dead controls are expected rather than
 *  surprising. Everything else on your own row stays editable: renaming
 *  yourself or narrowing your own scope cannot lock anybody out of anything. */

/** How wide the table needs before columns start lying about their content.
 *  Below this the `overflow-x-auto` wrapper scrolls rather than squeezing two
 *  names into one truncated word. */
const TABLE_MIN_WIDTH = 'min-w-[960px]'

/** Shared empty book — a `?? []` written inside the component body mints a NEW
 *  array every render, and every `useMemo` reading it loses its memo. Same
 *  constant, same reason, as `NO_SOURCES` on the lead book. */
const NO_USERS: UserRow[] = []

export function UsersPage() {
  /* No `searchPlaceholder` override: the string passed here was character-for-
     character the default in `chrome.tsx`, so it changed nothing — and it was
     Sales vocabulary ("khách hàng, cơ hội, báo giá") sitting on a One Core
     screen. That box is Tìm toàn cục, not a filter for this table; a screen
     that wants its own wording says something true, the way `sales-config.tsx`
     does. */
  const chrome = useAppChrome()
  const me = useSession((s) => s.actor)

  /* `error` is read, not dropped. Without it a dead server renders as "Chưa có
     tài khoản nào" plus a button inviting the manager to open the first one —
     they would sit there creating a person who already exists. "No rows" and
     "could not ask" are different sentences leading to different actions; see
     the two branches where the table is drawn. */
  const { data, isPending, error, refetch } = useQuery(usersQuery)
  const rows = data?.rows ?? NO_USERS

  const tally = useMemo(() => userTally(rows), [rows])

  /* Which row the panel is showing, and whether the panel is up, are two
     separate pieces of state on purpose. `Drawer` keeps its content mounted
     through the exit animation, so clearing the row on close would blank the
     panel mid-slide. Closing sets `open` alone; the next open sets both. */
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [open, setOpen] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (user: UserRow) => {
    setEditing(user)
    setOpen(true)
  }

  /* Three different sentences for three different situations, and none of them
     is a count. Printing `tallyLine` while the book is still in flight would
     say "0 tài khoản" about a company that has seven. */
  const summary = isPending
    ? 'Đang đọc sổ tài khoản…'
    : error
      ? 'Chưa đọc được sổ tài khoản.'
      : tallyLine(tally)

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          /* Mục nav đọc là "Quản trị", màn đọc là "Người dùng" — đây là mục
             duy nhất trong app mà hai chữ đó khác nhau, nên kicker là chỗ nối
             chúng lại. Nó cũng để sẵn chỗ cho màn ghi vết mọc thêm dưới cùng
             một mục mà không phải đổi nhãn nav lần nữa. */
          kicker="One Core · Quản trị"
          title="Người dùng"
          /* `tnum` vì cả ba con số đổi mỗi lần mời hoặc khoá một người, và chữ
             số không đều bề rộng làm cả dòng nhảy ngang sau mỗi lần refetch. */
          description={<span className="tnum">{summary}</span>}
          actions={
            <Button size="md" onClick={openCreate} className="max-sm:flex-1">
              <Icon icon={UserPlus} size={16} />
              Thêm người
            </Button>
          }
        />

        {/* Bảng LUÔN nằm trên glass-b — luật 8. No count strip above it the way
            the lead book has one: the header directly above already carries the
            tally, and a second copy of the same number is a second thing to
            keep true. */}
        <GlassCard variant="b" className="overflow-hidden">
          <div className="overflow-x-auto p-4 lg:p-5">
            {isPending ? (
              <div className="flex flex-col gap-3">
                {/* `height`, not `h-12`: `Skeleton` writes its height into an
                    inline `style`, which beats the class — so `h-12` renders an
                    11px bar standing in for a 48px row. `leads.tsx` and
                    `ops.tsx` both carry that bug; this screen does not copy it. */}
                <Skeleton height={48} className="w-full" />
                <Skeleton height={48} className="w-full" />
                <Skeleton height={48} className="w-full" />
              </div>
            ) : error ? (
              /* Ask again — do not offer to open an account. The book is not
                 what is broken, and a button that fixes the wrong thing costs
                 the user more than no button at all. `userMessage` prints the
                 server's own sentence when it wrote one, so "mất mạng" and
                 "phiên hết hạn" read differently. */
              <EmptyState
                icon={TriangleAlert}
                message={`Không lấy được sổ tài khoản. ${
                  isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Inbox}
                message="Sổ tài khoản đang trống. Mở tài khoản đầu tiên cho người trong phòng — họ tự đặt mật khẩu qua thư mời."
                action={{ label: 'Thêm người', onClick: openCreate }}
                className="py-12"
              />
            ) : (
              <DataTable
                className={TABLE_MIN_WIDTH}
                columns={[
                  { header: 'Người', width: '1.4fr' },
                  { header: 'Email', width: '1.7fr' },
                  { header: 'Vai', width: '1.5fr' },
                  { header: 'Nhánh', width: '1.2fr' },
                  { header: 'Phạm vi', width: '124px' },
                  { header: 'Trạng thái', width: '168px' },
                ]}
                rows={rows.map((user) => ({
                  id: user.id,
                  /* Whole row opens the panel — the house pattern for both
                     sales books. The sketch drew a `⋯` menu per row instead;
                     `@pv/ui` has no menu, and adding one would be a new
                     component with a kit page to match. A clickable row does
                     the same job with what already exists, and the panel it
                     opens holds every action the menu was going to list. */
                  onOpen: () => openEdit(user),
                  cells: [
                    <UserNameCell key="n" name={user.name} isMe={user.id === me?.id} />,
                    /* Mono, like every mailbox in the app: an address is read
                       character by character when somebody is checking it
                       against another system, and a proportional font makes
                       `rn` and `m` the same shape. */
                    <span
                      key="e"
                      className="block truncate font-mono text-[11px]"
                      title={user.email}
                    >
                      {user.email}
                    </span>,
                    <UserRoleCell key="r" label={user.role} roleId={user.roleId} />,
                    /* Branch names stay English — luật 14 fixes them as product
                       names, so there is nothing here to translate. */
                    <span key="b" className="block truncate" title={user.branches.join(' · ')}>
                      {user.branches.join(' · ')}
                    </span>,
                    <span key="s" className="block truncate">
                      {scopeLabel(user.ownOnly)}
                    </span>,
                    <UserStatusCell key="t" user={user} />,
                  ],
                }))}
              />
            )}
          </div>
        </GlassCard>

        {/* One panel, both jobs. `editing === null` is "thêm người"; a row is
            "sửa <tên>". Two panels would be two copies of one form, and the
            second copy is where the branch checkboxes stop matching. */}
        <UserDrawer open={open} onClose={() => setOpen(false)} user={editing} meId={me?.id} />
      </ScreenLayout>
    </AppShell>
  )
}

export default UsersPage
