import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  NOTIFICATION_KIND_GROUP,
  NOTIFICATION_KIND_POLICY,
  NOTIFICATION_POLICY_PATH,
  NotificationGroup,
  NotificationKind,
  NotificationPolicyResponse,
  NotificationPolicyRow,
  effectiveImportant,
  type NotificationPolicyBody,
  type RoleId,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** One Core · Admin · Notifications — the per-role policy of ADR 0093 §1-§2.
 *
 *  One permission for both doors, like the roles matrix: the policy can only
 *  narrow who hears a kind, so there is no separate read gate. The screen
 *  edits a draft and saves dirty kinds one `PUT` at a time, as roles does. */

const POLICY_NEED: ApiNeed = { permission: 'setting.manage' }

/** Not under `['platform', 'notifications']`, so invalidating the bell never
 *  refetches this grid and the other way round. */
export const POLICY_KEY = ['platform', 'notification-policy'] as const

export const notificationPolicyQuery = queryOptions({
  queryKey: POLICY_KEY,
  queryFn: ({ signal }) =>
    api.read(NOTIFICATION_POLICY_PATH, {
      need: POLICY_NEED,
      schema: NotificationPolicyResponse,
      signal,
    }),
  ...cacheTier.reference,
})

/** What the screen edits per kind: `important` is the effective switch, so
 *  `locked` and the audit stamp stay on the server row. */
export type PolicyDraftEntry = { important: boolean; mutedRoleIds: RoleId[] }

export type PolicyEdit = { kind: NotificationKind } & PolicyDraftEntry

export function useSavePolicy() {
  const client = useQueryClient()

  return useMutation<NotificationPolicyRow, ApiError, PolicyEdit>({
    mutationFn: ({ kind, important, mutedRoleIds }) =>
      api.write(`${NOTIFICATION_POLICY_PATH}/${encodeURIComponent(kind)}`, {
        method: 'PUT',
        /* The default goes as `null`, so the kind keeps following the contract. */
        body: {
          important: important === NOTIFICATION_KIND_POLICY[kind].important ? null : important,
          mutedRoleIds,
        } satisfies NotificationPolicyBody,
        need: POLICY_NEED,
        schema: NotificationPolicyRow,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: POLICY_KEY })
    },
  })
}

export type PolicyDraft = Record<NotificationKind, PolicyDraftEntry>

export type PolicyIndex = Partial<Record<NotificationKind, NotificationPolicyRow>>

export const isLocked = (index: PolicyIndex, kind: NotificationKind): boolean =>
  index[kind]?.locked ?? NOTIFICATION_KIND_POLICY[kind].locked

export const indexOf = (view: NotificationPolicyResponse): PolicyIndex =>
  Object.fromEntries(view.rows.map((row) => [row.kind, row]))

/** A kind the server left out falls back to the contract defaults, which is
 *  what the server stores for it (no row = everyone hears it). A stored mute
 *  on a role that is now not applicable is hidden from the draft; it stays
 *  stored until a save of THAT kind, which then clears it. */
export function draftOf(index: PolicyIndex): PolicyDraft {
  return Object.fromEntries(
    NotificationKind.options.map((kind) => {
      const row = index[kind]
      const out = row?.inapplicableRoleIds ?? []
      return [
        kind,
        {
          important: effectiveImportant(kind, row?.important),
          mutedRoleIds: (row?.mutedRoleIds ?? []).filter((id) => !out.includes(id)),
        },
      ]
    }),
  ) as PolicyDraft
}

/** Switching a cell OFF adds the role to the mute list. */
export function setHears(
  draft: PolicyDraft,
  kind: NotificationKind,
  roleId: RoleId,
  hears: boolean,
): PolicyDraft {
  const muted = draft[kind].mutedRoleIds.filter((id) => id !== roleId)
  return {
    ...draft,
    [kind]: { ...draft[kind], mutedRoleIds: hears ? muted : [...muted, roleId] },
  }
}

export const setImportant = (
  draft: PolicyDraft,
  kind: NotificationKind,
  important: boolean,
): PolicyDraft => ({ ...draft, [kind]: { ...draft[kind], important } })

/** Mute lists compare as sets: the server keeps its own order. */
const sameBody = (a: PolicyDraftEntry, b: PolicyDraftEntry): boolean =>
  a.important === b.important &&
  a.mutedRoleIds.length === b.mutedRoleIds.length &&
  a.mutedRoleIds.every((id) => b.mutedRoleIds.includes(id))

export const dirtyKinds = (server: PolicyDraft, draft: PolicyDraft): NotificationKind[] =>
  NotificationKind.options.filter((kind) => !sameBody(server[kind], draft[kind]))

export type KindGroup = { group: NotificationGroup; kinds: NotificationKind[] }

/** Groups in the bell's chip order, kinds in contract order inside each. */
export const KIND_GROUPS: KindGroup[] = NotificationGroup.options.map((group) => ({
  group,
  kinds: NotificationKind.options.filter((kind) => NOTIFICATION_KIND_GROUP[kind] === group),
}))
