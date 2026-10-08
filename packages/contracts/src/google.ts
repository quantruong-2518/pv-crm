import { z } from 'zod'

/** Per-employee Google account link, used to put meetings on the booker's calendar.
 *
 *      GET    /me/google             status of the caller's link
 *      POST   /me/google/connect     returns the consent URL (`GoogleConnectStart`)
 *      GET    /me/google/callback    browser redirect from Google, no body
 *      DELETE /me/google             disconnect
 *
 *  OAuth is per employee, not a shared service account: the event must live on
 *  the booker's own calendar and invite from their address. `connect` is a POST
 *  that returns a URL instead of redirecting, so it passes the same-origin
 *  guard like any write; only the callback is a bare browser navigation.
 *  `configured` lets the UI hide the button when the server has no client id. */
export const GoogleLinkStatus = z.object({
  /** Server holds a Google client id and secret. */
  configured: z.boolean(),
  connected: z.boolean(),
  /** Linked Google account; absent while not connected. */
  email: z.string().optional(),
})

export const GoogleConnectStart = z.object({
  /** Google consent page the browser is sent to. */
  url: z.string().min(1),
})

export type GoogleLinkStatus = z.infer<typeof GoogleLinkStatus>
export type GoogleConnectStart = z.infer<typeof GoogleConnectStart>
