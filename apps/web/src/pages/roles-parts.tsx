import { Badge, Button, Checkbox, DataTable, Kicker } from '@pv/ui'
import type { Permission, RoleId } from '@pv/contracts'
import { ROLE_LABEL } from '@/data/users'
import {
  PERMISSION_GROUPS,
  ROLE_COLUMN_LABEL,
  PERMISSION_LABEL,
  ROLE_IDS,
  SELF_GRANTING_TAG,
  SELF_GRANTING_WHY,
  isSelfGranting,
  type RoleDraft,
} from '@/data/roles'

/** The two faces of One Core · Admin · Roles — the same 27 x 7 matrix, drawn
 *  twice.
 *
 *  Split out of `roles.tsx` the way `users-parts.tsx` was split out of
 *  `users.tsx`: the screen file should read as the shape of the screen, not as
 *  two nested loops. Neither block is reusable beyond this screen, which is
 *  exactly why they are a sibling file and not `@pv/ui` components.
 *
 *  ------------------------------------------------------------------
 *  WHY TWO BLOCKS AND NOT ONE RESPONSIVE GRID
 *  ------------------------------------------------------------------
 *  Seven columns of checkboxes stop being readable well before the tablet
 *  width of rule 3: at 1024px each role column is under 90px, the headings
 *  wrap to three lines, and a finger covers two cells at once. So under `xl`
 *  the screen asks the question the other way round — pick ONE role, then read
 *  its permissions as a list — and every hit area there is at least 48px
 *  (rule 13). The two are swapped in CSS rather than by a media-query hook:
 *  `display:none` takes the hidden half out of the accessibility tree too, so
 *  a screen reader never meets 189 checkboxes twice. */

/** The row heading: what the permission lets somebody do, then the key itself.
 *
 *  Both, and always both. The label is a gloss somebody wrote; the key is what
 *  the server and the audit log actually store. An administrator checking this
 *  screen against a route's `@Need(...)` reads the key, and one who is deciding
 *  whether marketing should have it reads the sentence. */
export function PermissionName({ permission }: { permission: Permission }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{PERMISSION_LABEL[permission]}</span>
        {isSelfGranting(permission) && (
          <Badge tone="warning" className="shrink-0" title={SELF_GRANTING_WHY}>
            {SELF_GRANTING_TAG}
          </Badge>
        )}
      </span>
      <span className="text-muted-foreground truncate font-mono text-[11px]">{permission}</span>
    </span>
  )
}

export type MatrixProps = {
  grants: RoleDraft
  onToggle: (roleId: RoleId, permission: Permission, on: boolean) => void
  /** The role the reader is wearing. Marked in its column heading because the
   *  server refuses to strip a permission off it, and a refusal is easier to
   *  read when the column was labelled before the click. */
  meRoleId?: RoleId
  /** A save is in flight. Ticking during it would be swallowed: the request
   *  carries the draft as it was when the button was pressed, and the draft is
   *  cleared when the last role lands — so a box ticked in between disappears
   *  with nothing to show it ever existed. */
  saving?: boolean
}

/** Desktop · the grid. Rows are permissions grouped by resource, columns are
 *  the seven roles, cells are checkboxes. */
export function RoleMatrix({ grants, onToggle, meRoleId, saving = false }: MatrixProps) {
  return (
    <DataTable
      className="min-w-[1180px]"
      columns={[
        { header: 'Quyền', width: 'minmax(260px,1.7fr)' },
        /* `ROLE_COLUMN_LABEL`, not `ROLE_LABEL`: a column is 104px and
           `DataTable` renders headers at the inherited 16px, so the longest
           role name wraps to three lines and shoves every row down. The full
           name still shows on the picker, where there is room for it. */
        ...ROLE_IDS.map((id) => ({
          header: id === meRoleId ? `${ROLE_COLUMN_LABEL[id]} · bạn` : ROLE_COLUMN_LABEL[id],
          width: 'minmax(104px,1fr)',
        })),
      ]}
      rows={PERMISSION_GROUPS.flatMap((group) => [
        /* A heading row rather than a heading between two tables: one grid
           means the seven columns stay in the same place from the first group
           to the last, which is the only reason a matrix is readable at all.
           It carries one cell, so the role columns beside it stay empty. */
        {
          id: `group-${group.resource}`,
          cells: [<Kicker key="g">{group.label}</Kicker>],
        },
        ...group.permissions.map((permission) => ({
          id: permission,
          cells: [
            <PermissionName key="p" permission={permission} />,
            ...ROLE_IDS.map((id) => (
              <Checkbox
                key={id}
                checked={grants[id].includes(permission)}
                /* The visible name of this cell is its column heading and its
                   row heading, neither of which a screen reader reaches from
                   inside a `role="cell"`. So the checkbox carries both, out of
                   sight — without it the grid announces 189 unnamed boxes. */
                label={
                  <span className="sr-only">{`${PERMISSION_LABEL[permission]} — ${ROLE_LABEL[id]}`}</span>
                }
                disabled={saving}
                onChange={(on) => onToggle(id, permission, on)}
              />
            )),
          ],
        })),
      ])}
    />
  )
}

export type SheetProps = MatrixProps & {
  /** Which role the list below is about. */
  roleId: RoleId
  onPick: (roleId: RoleId) => void
  /** Roles edited but not yet saved — marked on their button so a person who
   *  switches roles mid-edit can find the unsaved one again. */
  dirty: readonly RoleId[]
}

/** Tablet and phone · one role at a time.
 *
 *  Buttons rather than `Select` or `SegmentedControl` for the picker: both of
 *  those top out at 40px and 32px high, and rule 13 puts the floor at 48. Full
 *  width on a phone, two then three columns as the screen grows, so the
 *  longest role name never has to truncate. */
export function RoleSheet({
  grants,
  roleId,
  onPick,
  onToggle,
  dirty,
  meRoleId,
  saving = false,
}: SheetProps) {
  const row = grants[roleId]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Kicker>Chọn vai</Kicker>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_IDS.map((id) => (
            <Button
              key={id}
              size="lg"
              type="button"
              variant={id === roleId ? 'default' : 'ghost'}
              aria-pressed={id === roleId}
              className="w-full justify-between"
              onClick={() => onPick(id)}
            >
              <span className="min-w-0 truncate">
                {id === meRoleId ? `${ROLE_LABEL[id]} · bạn` : ROLE_LABEL[id]}
              </span>
              {/* Plain text in the button's own foreground, NOT a warning
                  pill. The selected button is solid `--primary`, and amber on
                  that ground measures 2.91:1 — under the 4.5:1 floor of rule
                  13 — on the most ordinary path there is, editing the role you
                  wear. Inheriting `currentColor` clears the floor on both
                  variants, and the header still carries the full list in
                  warning tone. */}
              {dirty.includes(id) && (
                <span className="shrink-0 text-[11px] font-medium opacity-90">chưa lưu</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {PERMISSION_GROUPS.map((group) => (
        <section key={group.resource} className="flex flex-col gap-2">
          <Kicker>{group.label}</Kicker>
          {group.permissions.map((permission) => (
            <Checkbox
              key={permission}
              /* 48px floor for a finger, and the hint is what gets it there:
                 the key sits under every label on the desktop grid too, so the
                 two faces of this screen say the same thing. */
              className="min-h-12"
              checked={row.includes(permission)}
              label={PERMISSION_LABEL[permission]}
              hint={<span className="font-mono">{permission}</span>}
              trailing={
                isSelfGranting(permission) ? (
                  <Badge tone="warning" title={SELF_GRANTING_WHY}>
                    {SELF_GRANTING_TAG}
                  </Badge>
                ) : undefined
              }
              disabled={saving}
              onChange={(on) => onToggle(roleId, permission, on)}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
