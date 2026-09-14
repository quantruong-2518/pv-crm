import { create } from 'zustand'

/** THE SUDO WINDOW, browser side — retype the password before an admin action.
 *
 *  NOT A SECOND SIGN-IN SCREEN. There is no email box, and that absence is what
 *  makes this mean anything: it confirms the person typing is still the owner
 *  of the session that is ALREADY open. Accept another mailbox here and whoever
 *  sits down at an abandoned machine confirms with their own account and then
 *  acts inside the absent person's session — with the absent person's name on
 *  the audit row. `ConfirmPasswordBody` refuses an `email` field at the far end
 *  for the same reason.
 *
 *  The session does NOT change on success: `confirmPassword` answers 204 and
 *  brings back no session window, so there is nothing to write to the store.
 *  The server stamps `reauth_at` on the row and that is the only thing that
 *  moves. A confirmation box that also extended the session by half an hour
 *  would be a renewal nobody asked for — see `AuthRepository.markReauth`.
 *
 *  ONE PROMISE SHARED BY EVERY CALLER, exactly as in `renew.ts`. An admin
 *  screen with the lock button pressed on three rows in a row is three requests
 *  all answered `reauth-required`. Without collapsing them, three boxes stack up
 *  and the user types their password three times for one confirmation. So the
 *  first asker opens the box and everyone after holds the same promise.
 *
 *  Closing the box resolves `false`, and the interceptor reads `false` as "let
 *  the error through" rather than retrying. Abandoning an admin action is a
 *  valid choice, not a fault. */
type PromptState = {
  /** `null` = the box is closed; a function = somebody is waiting on an answer. */
  settle: ((ok: boolean) => void) | null
}

/** Read by `ReauthDialog` in `reauth.tsx`. Exported rather than passed in
 *  because the asker and the box never meet: one is an interceptor, the other a
 *  component mounted somewhere up the tree. */
export const useReauthPrompt = create<PromptState>(() => ({ settle: null }))

let inflight: Promise<boolean> | null = null

/** Open the box and wait. `true` = confirmed, the caller may carry on.
 *
 *  Called from an `AFTER` interceptor in `app/api/client.ts`, never from a
 *  screen: no screen should know which doors demand sudo. That list is held by
 *  `@NeedsReauth()` on the server, and a copy over here is a copy that drifts. */
export function askReauth(): Promise<boolean> {
  if (inflight) return inflight
  inflight = new Promise<boolean>((resolve) => {
    useReauthPrompt.setState({ settle: resolve })
  }).finally(() => {
    inflight = null
    useReauthPrompt.setState({ settle: null })
  })
  return inflight
}
