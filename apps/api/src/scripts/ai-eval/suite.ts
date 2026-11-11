import { AnthropicClient } from '@api/platform/ai/anthropic.client'
import { GeminiClient } from '@api/platform/ai/gemini.client'
import { caseSetFaults, loadCases, type EvalCase } from './cases'
import { scriptedCases } from './cases-run'
import { hostileModel } from './hostile'
import { liveRun, type LiveClients } from './live'
import { gateLine, printProof, say, Tally, type LiveResult } from './report'
import { runnerAudit } from './runner-audit'
import { runnerBind } from './runner-bind'
import { runnerCaps } from './runner-caps'
import { runnerGateway } from './runner-gateway'
import { runnerSummary } from './runner-summary'
import { customerMatrix } from './scope-customers'
import { scopeMatrix } from './scope-matrix'
import { businessChecksum, moved, openWorld, type World } from './world'

/** The scripted run, and the optional live run after it. A business table that
 *  moves at any point of the scripted run fails it, whichever section did it. */

/** `clients` is left out on a real run; a stand-in goes here to test the scoring. */
export type Options = {
  live: { models: readonly string[]; clients?: LiveClients } | null
  blocked: string[]
}

const vendorClients = (): LiveClients => ({
  gemini: new GeminiClient(process.env.GEMINI_API_KEY ?? ''),
  anthropic: new AnthropicClient(process.env.ANTHROPIC_API_KEY ?? ''),
})

async function scripted(
  world: World,
  tally: Tally,
  cases: readonly EvalCase[],
  options: Options,
): Promise<void> {
  const before = await businessChecksum(world.db)
  await scopeMatrix(world, tally)
  await customerMatrix(world, tally)
  await hostileModel(world, tally)
  await runnerCaps(world, tally)
  await runnerGateway(world, tally)
  await runnerAudit(world, tally)
  await runnerSummary(world, tally)
  await runnerBind(world, tally)
  await scriptedCases(world, tally, cases)
  await tally.run('no-write', 'no business table moved in the scripted run', async (c) => {
    c.eq(moved(before, await businessChecksum(world.db)), [], 'tables that moved')
  })
  await tally.run('no-network', 'the tripwire stayed quiet', async (c) => {
    c.eq(options.blocked, [], 'blocked attempts')
  })
}

export async function runAll(options: Options): Promise<void> {
  const cases = loadCases()
  const tally = new Tally()
  await tally.run('cases', 'the set is 20, 15, 10, 5, 13, 6 and 5', async (c) => {
    c.eq(caseSetFaults(cases), [], 'faults of the set')
  })
  const world = await openWorld()
  let clean = false
  let results: LiveResult[] = []
  try {
    await scripted(world, tally, cases, options)
    clean = tally.failures.length === 0
    /* Money only on a clean run: a broken gate makes a real model's answers meaningless. */
    if (options.live && clean) {
      const clients = options.live.clients ?? vendorClients()
      results = await liveRun(world, tally, options.live.models, cases, clients)
      await tally.run('no-network', 'the tripwire stayed quiet through the live run', async (c) => {
        c.eq(options.blocked, [], 'blocked attempts')
      })
    } else if (options.live) say('Live run skipped: the scripted run is not clean.')
  } finally {
    await world.close()
  }
  tally.print()
  printProof(clean)
  for (const r of results) {
    say(
      `live ${r.model}: scope ${r.scope.passed}/${r.scope.total}, injection ${r.injection.passed}/${r.injection.total}`,
    )
  }
  say(gateLine(clean && options.blocked.length === 0, results))
  if (tally.failures.length > 0) process.exitCode = 1
}
