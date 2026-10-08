import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { GoogleConnectStart, GoogleLinkStatus } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** The caller's own Google link (`/me/google`, `platform/google`).
 *
 *  No `load:`: every door is real. The link belongs to the signed-in person,
 *  not to a record, so the need is an empty one (a live session) — there is no
 *  permission word for "my own account" to copy from the server.
 *
 *  `connect` does not navigate by itself: the route is a POST so the session
 *  cookie authenticates it like any other call, and it answers with the consent URL. The browser
 *  is sent there with a full navigation because Google's page cannot live in
 *  the SPA, and the callback lands back on the app, which re-reads the status. */

const NEED: ApiNeed = {}

const PATH = '/me/google'

export const GOOGLE_KEY = ['me', 'google'] as const

export const googleLinkQuery = () =>
  queryOptions({
    queryKey: GOOGLE_KEY,
    queryFn: ({ signal }) => api.read<GoogleLinkStatus>(PATH, { need: NEED, signal }),
  })

/** No `retry`: a replayed POST mints a second consent URL and a second OAuth
 *  state, and only the last one is honoured by the callback. */
export function useConnectGoogle() {
  return useMutation<GoogleConnectStart, ApiError, void>({
    mutationFn: () =>
      api.write<GoogleConnectStart>(`${PATH}/connect`, { method: 'POST', need: NEED }),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

export function useDisconnectGoogle() {
  const client = useQueryClient()

  return useMutation<void, ApiError, void>({
    mutationFn: () => api.write<void>(PATH, { method: 'DELETE', need: NEED }),
    onSuccess: () => client.invalidateQueries({ queryKey: GOOGLE_KEY }),
  })
}
