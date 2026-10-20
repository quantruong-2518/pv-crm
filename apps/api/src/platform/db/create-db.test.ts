// @vitest-environment node
import { expect, it } from 'vitest'

import { createDb } from './create-db'

it('keeps pg_trgm on the in-memory PGlite database', async () => {
  const handle = await createDb('pglite://memory')
  const res = await handle.db.$client.query("SELECT similarity('abc', 'abc') AS s")
  expect(res.rows[0]).toEqual({ s: 1 })
  await handle.close()
})
