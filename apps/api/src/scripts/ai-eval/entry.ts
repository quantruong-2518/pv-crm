import {
  assertMemoryUrl,
  forceEnv,
  installTripwire,
  MEMORY_URL,
  probeTripwire,
  VENDOR_HOSTS,
} from './safety'
import { say } from './report'

/** `pnpm ai:eval -- --suite assistant [--live --yes --model <id>...]`.
 *
 *  `report` and `safety` import nothing of the app, and the rest of the
 *  suite is imported only after the overwrite below, so no module of the app is
 *  loaded on a URL this file did not set. `ai-eval.ts`'s own static imports run
 *  before this file, and none of them reads `process.env` at load: the only reads
 *  outside a factory are `PV_ROLE` lines in `main.ts` and `worker.ts`.
 *
 *  Flags are refused rather than ignored: there is no `--prod` here, and a typo in
 *  `--model` must not read as a passed run. */

const refuse = (why: string): void => {
  say(`Refused: ${why}`)
  say('gate 0: OPEN')
  process.exitCode = 1
}

type Parsed = { live: boolean; yes: boolean; models: string[]; fault: string | null }

function parse(args: readonly string[]): Parsed {
  const parsed: Parsed = { live: false, yes: false, models: [], fault: null }
  const rest = args.filter((a) => a !== '--')
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i] as string
    const value = rest[i + 1]
    if (flag === '--live') parsed.live = true
    else if (flag === '--yes') parsed.yes = true
    else if (flag === '--suite') {
      if (value !== 'assistant') parsed.fault = `unknown suite ${value}`
      i += 1
    } else if (flag === '--model') {
      if (value) parsed.models.push(value)
      else parsed.fault = '--model needs an id'
      i += 1
    } else parsed.fault = `unknown flag ${flag}: this suite has no such option`
  }
  return parsed
}

function liveFault(p: Parsed): string | null {
  if (!p.live) return p.models.length > 0 ? '--model needs --live' : null
  if (!p.yes) return '--live costs money: add --yes to mean it'
  if (p.models.length === 0) return '--live needs at least one --model <id>'
  const missing = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY'].filter((k) => !process.env[k])
  /* Both, even for one model: the grader must be a different vendor from the one tested. */
  if (missing.length > 0) return `--live needs ${missing.join(' and ')}; nothing was called`
  return null
}

export async function runSuite(args: readonly string[]): Promise<void> {
  const p = parse(args)
  if (p.fault) return refuse(p.fault)
  const fault = liveFault(p)
  if (fault) return refuse(fault)

  forceEnv(p.live)
  try {
    assertMemoryUrl(process.env.DATABASE_URL)
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error))
  }
  const { blocked } = installTripwire(p.live ? VENDOR_HOSTS : [])
  await probeTripwire(blocked)

  say(`Target: ${MEMORY_URL} · ${p.live ? `live: ${p.models.join(', ')}` : 'scripted, no keys'}`)
  const { runAll } = await import('./suite')
  await runAll({ live: p.live ? { models: p.models } : null, blocked }).catch((error: unknown) => {
    say('gate 0: OPEN')
    throw error
  })
}
