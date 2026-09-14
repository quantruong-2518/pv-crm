import type { Actor } from '@pv/engines'

/** The caller, as the guards need to see them: who they are, plus the one
 *  thing about their ACCOUNT that decides whether any door opens.
 *
 *  A wrapper rather than a field on `Actor`, and that is the whole point.
 *  `Actor` is the shape `@pv/engines` takes — E1 to E4 receive it, and the
 *  engines have no concept of a password, let alone of owing a change. Hanging
 *  an auth flag on it would teach the engine a word it must not know and would
 *  ride along into every fixture that builds an actor by hand.
 *
 *  `owesPasswordChange` is carried here rather than re-queried by
 *  `PasswordChangeGuard` because the row it comes from has already been read:
 *  the session lookup loaded it to check `disabled_at`. Asking again would be a
 *  second round trip per request for a column that was in hand a moment ago. */
export type Caller = {
  actor: Actor
  owesPasswordChange: boolean
}
