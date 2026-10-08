import { z } from 'zod'
import { ObjectCode } from './primitives'

/** Server-side pins: `GET /pins` lists the caller's own, `POST /pins` sets or
 *  clears them. A pin belongs to the actor who made it and nobody else reads it,
 *  so no code is an oracle for another person's list. The books read pins through
 *  their own `pinned` filter, not through this list. */
export const PinSubject = z.enum(['lead', 'opportunity'])
export type PinSubject = z.infer<typeof PinSubject>

export const PIN_MAX = 200

export const PinListQuery = z.object({ subject: PinSubject })
export type PinListQuery = z.infer<typeof PinListQuery>

/** The caller's pinned codes, newest pin first. */
export const PinListResponse = z.object({ codes: z.array(ObjectCode) })
export type PinListResponse = z.infer<typeof PinListResponse>

/** Idempotent set: `pinned` is the state asked for, not a toggle. A list so the
 *  selection bar and a single row share one door. */
export const PinSetBody = z.object({
  subject: PinSubject,
  codes: z.array(ObjectCode).min(1).max(PIN_MAX),
  pinned: z.boolean(),
})
export type PinSetBody = z.infer<typeof PinSetBody>

/** Codes actually changed; one already in the asked state is left out. */
export const PinSetResponse = z.object({ changed: z.array(ObjectCode) })
export type PinSetResponse = z.infer<typeof PinSetResponse>
