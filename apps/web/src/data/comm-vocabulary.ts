import { queryOptions } from '@tanstack/react-query'
import { CommVocabularyResponse } from '@pv/contracts'
import { api } from '@/app/api'
import { COMM_RECORDS_KEY } from '@/data/comm-record-detail'

/** The confirm form's two lists — `GET /sales/comm-vocabulary` (ADR 0074).
 *
 *  On `comm.view`, not `config.view`: every closer picks from these lists, and
 *  most closers cannot open the config screen. The server already drops
 *  switched-off rows and questions with no live answer, so the form draws the
 *  answer as-is and never filters it a second time.
 *
 *  Keyed under `comm-records` so one invalidation of the module refreshes it. */
export const commVocabularyQuery = queryOptions({
  queryKey: [...COMM_RECORDS_KEY, 'vocabulary'] as const,
  queryFn: ({ signal }) =>
    api.read('/sales/comm-vocabulary', {
      need: { branch: 'Sales', permission: 'comm.view' },
      schema: CommVocabularyResponse,
      signal,
    }),
})
