import { queryOptions } from '@tanstack/react-query'
import { CommVocabularyResponse } from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** The confirm form's two lists — `GET /sales/comm-vocabulary` (ADR 0074).
 *
 *  On `comm.view`, not `config.view`: every closer picks from these lists, and
 *  most closers cannot open the config screen. The server already drops
 *  switched-off rows and questions with no live answer, so the form draws the
 *  answer as-is and never filters it a second time.
 *
 *  Under `['sales']`, not `comm-records`: it changes through a config approval
 *  (which sweeps `['sales']`), not through a comm or meeting write. */
export const commVocabularyQuery = queryOptions({
  queryKey: ['sales', 'comm-vocabulary'] as const,
  queryFn: ({ signal }) =>
    api.read('/sales/comm-vocabulary', {
      need: { branch: 'Sales', permission: 'comm.view' },
      schema: CommVocabularyResponse,
      signal,
    }),
  ...cacheTier.reference,
})
