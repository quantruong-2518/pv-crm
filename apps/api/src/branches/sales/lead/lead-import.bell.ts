import { LEAD_HANDED_OVER, LEAD_RE_ENTERED } from '@pv/engines'
import { NOTIFICATION_DETAIL_COUNT } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import type { NotificationHub } from '@api/platform/notification/notification.hub'

/** One lead a file touched for one person: put in their name, or came back to
 *  a lead they hold. `occurrence` is the touch that dated it. */
export type ImportLine = { to: string; code: string; label: string; occurrence?: string }

/** The bell of one import file, rung once after the batch receipt exists
 *  (ADR 0093 wave 2): per person, one lead keeps the per-lead line it always
 *  had; several collapse into one line on the batch, counted. A file of five
 *  thousand rows must not ring a person five thousand times. */
export async function ringImport(
  tx: Db,
  hub: NotificationHub,
  batch: { id: string; fileName: string; actorId: string },
  lines: { received: readonly ImportLine[]; reentered: readonly ImportLine[] },
): Promise<void> {
  const events = [
    { name: LEAD_HANDED_OVER, audience: 'new-holder', lines: lines.received },
    { name: LEAD_RE_ENTERED, audience: 'holder', lines: lines.reentered },
  ]
  for (const { name, audience, lines: all } of events) {
    for (const [to, mine] of byRecipient(all)) {
      const one = mine.length === 1 ? mine[0] : undefined
      await hub.announce(tx, {
        event: {
          name,
          ref: { code: one ? one.code : batch.id },
          actorId: batch.actorId,
          audiences: { [audience]: [to] },
          occurrence: one?.occurrence,
        },
        subject: one
          ? { kind: 'lead', code: one.code, label: one.label }
          : { kind: 'lead-batch', code: batch.id, label: batch.fileName },
        detail: one ? null : { [NOTIFICATION_DETAIL_COUNT]: mine.length },
      })
    }
  }
}

function byRecipient(lines: readonly ImportLine[]): Map<string, ImportLine[]> {
  const out = new Map<string, ImportLine[]>()
  for (const line of lines) {
    const mine = out.get(line.to)
    if (mine) mine.push(line)
    else out.set(line.to, [line])
  }
  return out
}
