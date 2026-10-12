import type { NotificationWithActor } from './notification.repository'

/** Table to wire. Returns the plain shape and leaves the typing to
 *  `NotificationListResponse.parse` in the service: `detail` is `jsonb`, and
 *  only the contract may say whether what was stored is still displayable. */
export function toContract({ row, actorName }: NotificationWithActor) {
  return {
    id: row.id,
    kind: row.kind,
    subject: { kind: row.subjectKind, code: row.subjectCode, label: row.subjectLabel },
    /* `actor_id` is SET NULL on delete, so id and name are present together. */
    actor: row.actorId && actorName ? { id: row.actorId, name: actorName } : null,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  }
}
