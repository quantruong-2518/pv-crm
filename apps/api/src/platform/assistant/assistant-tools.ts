import { Inject, Injectable, Logger, type Type } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import type { AssistantRef, AssistantToolOutcome } from '@pv/contracts'
import type { AccessControl, Actor, DenyReason } from '@pv/engines'
import { z, type ZodType } from 'zod'
import { NEED_KEY, PUBLIC_KEY, type RouteNeed } from '../access/need.decorator'
import type { AiToolCall, AiToolDecl } from '../ai/ai-client'
import { ACCESS } from '../engines/tokens'
import { maskContact } from './assistant-contact'
import { PvError } from '../http/problem'

/** A tool is a gate, not a function (ADR 0133 D2).
 *
 *  Axes 1 and 2 live only in `AccessGuard`, and a service fences rows alone:
 *  `ContractService.profile` hands a contract to a role its own route refuses.
 *  So every tool names the door it stands for, the registry reads that door's
 *  `@Need` as it is built, and `call` asks E2 that question before any service.
 *
 *  `run` takes the `Actor` first and calls a door method that does too (the company
 *  profile door does not: debt in `docs/status.md`), and input
 *  schemas are `.strict()` with no id of a person, so identity comes from the
 *  sign-in and never from the model. Platform cannot import a branch: tools come
 *  through `ASSISTANT_TOOLS`, as `COMM_DEBRIEF_HOOK` does. */

export type ToolDoor = readonly [controller: Type<unknown>, handler: string]

/** Typed so a renamed handler fails the build; the registry checks again at boot. */
export const door = <C>(controller: Type<C>, handler: keyof C & string): ToolDoor => [
  controller,
  handler,
]

/** What a door answered, already projected. `data` splits each record into
 *  `trusted` (only values whose zod type is a whitelisted code, enum, id, date or
 *  number, D5) and `untrusted`. `hidden` is the door's own count, null when it
 *  gives none; a tool never derives one. `refs` name the records for the screen
 *  and never reach a model; `steps` counts next steps, which have no code. */
export type ToolRead = {
  data: object
  codes: readonly string[]
  rowCount: number
  hidden: number | null
  refs?: readonly AssistantRef[]
  steps?: number
}

type ToolSpec<I, K extends string> = {
  name: string
  description: string
  input: ZodType<I>
  /** Keyed, because one need is one permission and `get_record` stands for one
   *  door per kind: the need is chosen after `input` has fixed the kind. */
  doors: Readonly<Record<K, ToolDoor>>
  /** Several keys = a call that reads several doors; it runs over those that pass. */
  doorFor: (input: I) => K | readonly K[]
  /** Doors whose refusal at the service (403 or 404) the tool reports in its own
   *  `skipped` instead of refusing the call; the eval oracle reads the list. */
  optional?: readonly K[]
  /** `open` holds only the doors whose need passed: read nothing behind another. */
  run: (who: Actor, input: I, open: ReadonlySet<K>) => Promise<ToolRead>
  recheck?: ToolRecheck
  /** Next steps a stored call read: they have no code, and no column keeps the count. */
  stepsOf?: (input: I, stored: Stored) => number
}

/** How a tool that opens records reads stored codes again as the person is now:
 *  one call per kind and batch, through a door named here and gated like a tool's.
 *  `read` answers the codes still readable. A code it leaves out is read once more
 *  by the tool itself with `one`'s input, since a book can fence tighter than the
 *  door that first opened the record. */
export type ToolRecheck = {
  kindOf: (code: string) => string | null
  doors: Readonly<Record<string, ToolDoor>>
  read: (who: Actor, kind: string, codes: readonly string[]) => Promise<readonly AssistantRef[]>
  one: (code: string) => AiToolCall['input'] | null
}

/** What `assistant_tool_call` keeps of an `ok` call. */
type Stored = { rowCount: number; codes: readonly string[] }

type Prepared =
  | {
      ok: true
      doorKeys: readonly string[]
      run: (who: Actor, open: ReadonlySet<string>) => Promise<ToolRead>
    }
  | { ok: false; issues: readonly string[] }

export type AssistantTool = {
  name: string
  description: string
  parameters: object
  doors: Readonly<Record<string, ToolDoor>>
  optional: readonly string[]
  prepare: (raw: unknown) => Prepared
  recheck?: ToolRecheck
  stepsOf?: (raw: unknown, stored: Stored) => number
}

/** Closes over `I` so the registry holds tools of different inputs in one map. */
export function defineTool<I, K extends string>(spec: ToolSpec<I, K>): AssistantTool {
  return {
    name: spec.name,
    description: spec.description,
    /* `input`: the default output view calls every object closed, strict or not.
       `$schema` is dropped for the gateway's reason: neither vendor lists it. */
    parameters: { ...z.toJSONSchema(spec.input, { io: 'input' }), $schema: undefined },
    doors: spec.doors,
    optional: spec.optional ?? [],
    recheck: spec.recheck,
    stepsOf: (raw, stored) => {
      const parsed = spec.input.safeParse(raw)
      return parsed.success && spec.stepsOf ? spec.stepsOf(parsed.data, stored) : 0
    },
    prepare(raw) {
      const parsed = spec.input.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, issues: parsed.error.issues.map((i) => i.path.join('.') || i.code) }
      }
      return {
        ok: true,
        doorKeys: [spec.doorFor(parsed.data)].flat() as K[],
        run: (who, open) => spec.run(who, parsed.data, open as ReadonlySet<K>),
      }
    },
  }
}

/** Bound by the composition root; with none the module does not boot. */
export const ASSISTANT_TOOLS = Symbol('pv.assistant.tools')
export interface AssistantToolSource {
  tools(): readonly AssistantTool[]
}

/** One call's result as the loop needs it. `denied` is E2's reason when the gate
 *  refused; `skipped` the doors it refused while the call ran on the others. The
 *  round writes a refusal line for each, with its other rows (D4). */
export type ToolVerdict = {
  outcome: AssistantToolOutcome
  output: object
  codes: readonly string[]
  rowCount: number | null
  hidden: number | null
  denied: DenyReason | null
  skipped: readonly { door: string; reason: DenyReason }[]
  latencyMs: number | null
  refs: readonly AssistantRef[]
  steps: number
}

/** A call that read nothing; the loop uses it for the calls its caps turn away. */
export const notRun = (
  outcome: AssistantToolOutcome,
  output: object,
  denied: DenyReason | null = null,
): ToolVerdict => ({
  outcome,
  output,
  codes: [],
  rowCount: null,
  hidden: null,
  denied,
  skipped: [],
  latencyMs: null,
  refs: [],
  steps: 0,
})

type Needs = Readonly<Record<string, RouteNeed>>
type Registered = { tool: AssistantTool; needs: Needs; recheckNeeds: Needs }

const DENIED = { ok: false, reason: 'permission-denied' } as const
/** Codes per re-check call: the largest page a book door serves. */
const RECHECK_BATCH = 200
/** Codes a book left out, read one by one: a few, since a book and its profile door
 *  disagree only at their edges (a co-owner on a signed deal). Each is a door read. */
const RECHECK_SINGLES = 20
const RECHECK_PARALLEL = 4

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown')

/** `size` workers over `items`; answers keep the order of the calls. */
export async function inPool<T, R>(
  items: readonly T[],
  size: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const answers: R[] = []
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      answers[index] = await work(items[index] as T, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return answers
}

const reflector = new Reflector()

/** `RouteAudit`'s question about one door, asked of a tool: the same fallback to
 *  the class, and a plain controller method is no door. */
function needOf(tool: string, [controller, handler]: ToolDoor): RouteNeed {
  const door = `assistant tool ${tool}: ${controller.name}.${handler}`
  const method = (controller.prototype as Record<string, unknown>)[handler]
  if (typeof method !== 'function' || Reflect.getMetadata(PATH_METADATA, method) === undefined) {
    throw new Error(`${door} is no route handler`)
  }
  const targets = [method, controller]
  if (reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
    throw new Error(`${door} is public, so nothing gates the tool`)
  }
  const need = reflector.getAllAndOverride<RouteNeed | undefined>(NEED_KEY, targets)
  if (!need) throw new Error(`${door} declares no @Need`)
  return need
}

function register(tool: AssistantTool): Registered {
  /* The `assistant_tool_call.name` CHECK; a strict schema is what fails `actorId`. */
  if (!/^[a-z_]+$/.test(tool.name)) throw new Error(`assistant tool ${tool.name}: bad name`)
  if ((tool.parameters as { additionalProperties?: unknown }).additionalProperties !== false) {
    throw new Error(`assistant tool ${tool.name}: input schema is not strict`)
  }
  const doors = Object.entries(tool.doors)
  if (doors.length === 0) throw new Error(`assistant tool ${tool.name}: names no door`)
  const stray = tool.optional.find((key) => !(key in tool.doors))
  if (stray) throw new Error(`assistant tool ${tool.name}: optional door ${stray} is no door`)
  const needsOf = (named: Readonly<Record<string, ToolDoor>>): Needs =>
    Object.fromEntries(Object.entries(named).map(([key, d]) => [key, needOf(tool.name, d)]))
  return { tool, needs: needsOf(tool.doors), recheckNeeds: needsOf(tool.recheck?.doors ?? {}) }
}

/** Throws from its constructor, so a tool with no need stops the boot: a door that
 *  fails closed would stay silent until a person asked. */
@Injectable()
export class AssistantToolGate {
  private readonly log = new Logger('AssistantTools')
  private readonly registered = new Map<string, Registered>()

  constructor(
    @Inject(ASSISTANT_TOOLS) source: AssistantToolSource,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {
    for (const tool of source.tools()) {
      if (this.registered.has(tool.name)) throw new Error(`assistant tool ${tool.name}: twice`)
      this.registered.set(tool.name, register(tool))
    }
  }

  /** Stored answer text as this reader may see it now: a contact the answer once
   *  carried is cut once the reader no longer holds `data.export` (0136 §3). */
  contactText(who: Actor, text: string): string {
    return this.access.allows(who, 'data.export') ? text : (maskContact(text) as string)
  }

  declarations(): AiToolDecl[] {
    return [...this.registered.values()].map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
  }

  /** Parse, gate, run, in that order: the need depends on the parsed input. */
  async call(who: Actor, call: AiToolCall): Promise<ToolVerdict> {
    const entry = this.registered.get(call.name)
    if (!entry) return notRun('unknown-tool', { error: 'unknown-tool' })
    const prepared = entry.tool.prepare(call.input)
    if (!prepared.ok) return notRun('bad-input', { error: 'bad-input', fields: prepared.issues })
    const verdicts = prepared.doorKeys.map((key) => {
      const need = entry.needs[key]
      /* An unknown key cannot happen by type; if it does, this stays shut. */
      return [key, need ? this.access.check(who, need) : DENIED] as const
    })
    const open = new Set(verdicts.flatMap(([key, v]) => (v.ok ? [key] : [])))
    const skipped = verdicts.flatMap(([door, v]) => (v.ok ? [] : [{ door, reason: v.reason }]))
    if (open.size === 0 && skipped[0]) {
      return notRun('refused', { error: 'not-allowed' }, skipped[0].reason)
    }

    const started = Date.now()
    try {
      const { data, ...counts } = await prepared.run(who, open)
      /* In the result too: the prompt's hidden-items sentence reads only what reaches it. */
      const output = counts.hidden === null ? data : { ...data, hidden: counts.hidden }
      return { ...notRun('ok', output), ...counts, skipped, latencyMs: Date.now() - started }
    } catch (error) {
      return { ...this.failed(call.name, error), rowCount: 0, latencyMs: Date.now() - started }
    }
  }

  /** Stored codes read again as `who` is now, through the door each kind's re-check
   *  names: E2 on its need, then one read per kind and batch. A code read back maps
   *  to its ref, one refused or not found to null; a code whose read failed is left
   *  out, so the caller can tell "not readable" from "not checked". No audit line:
   *  nothing here reaches a model. */
  async recheck(who: Actor, codes: readonly string[]): Promise<Map<string, AssistantRef | null>> {
    const found = new Map<string, AssistantRef | null>()
    const entry = [...this.registered.values()].find((r) => r.tool.recheck)
    const spec = entry?.tool.recheck
    const byKind = new Map<string | null, string[]>()
    for (const code of new Set(codes)) {
      const kind = spec?.kindOf(code) ?? null
      byKind.set(kind, [...(byKind.get(kind) ?? []), code])
    }
    const omitted: string[] = []
    for (const [kind, list] of byKind) {
      const need = kind === null ? undefined : entry?.recheckNeeds[kind]
      if (!spec || kind === null || !need || !this.access.check(who, need).ok) {
        for (const code of list) found.set(code, null)
        continue
      }
      for (let at = 0; at < list.length; at += RECHECK_BATCH) {
        const batch = list.slice(at, at + RECHECK_BATCH)
        const read = await spec.read(who, kind, batch).catch((error: unknown) => {
          this.log.error(`recheck ${kind} failed: ${errorName(error)}`)
          return null
        })
        if (!read) continue
        const back = new Map(read.map((ref) => [ref.code, ref]))
        for (const code of batch) found.set(code, back.get(code) ?? null)
        omitted.push(...batch.filter((code) => !back.has(code)))
      }
    }
    if (entry && spec) await this.recheckOne(who, entry.tool.name, spec, omitted, found)
    return found
  }

  /** The book's misses, each through the tool's own door; past the cap, unchecked. */
  private async recheckOne(
    who: Actor,
    name: string,
    spec: ToolRecheck,
    codes: readonly string[],
    found: Map<string, AssistantRef | null>,
  ): Promise<void> {
    await inPool(codes.slice(0, RECHECK_SINGLES), RECHECK_PARALLEL, async (code) => {
      const input = spec.one(code)
      const verdict = input ? await this.call(who, { id: 'recheck', name, input }) : null
      if (verdict?.outcome === 'error') found.delete(code)
      else found.set(code, verdict?.refs.find((r) => r.code === code) ?? null)
    })
    for (const code of codes.slice(RECHECK_SINGLES)) found.delete(code)
  }

  /** Next steps an `ok` stored call read, as its tool counts them; 0 for any other. */
  stepsOf(call: {
    name: string
    input: unknown
    outcome: string
    rowCount: number | null
    codes: readonly string[]
  }): number {
    const { outcome, rowCount, codes } = call
    if (outcome !== 'ok' || rowCount === null) return 0
    return this.registered.get(call.name)?.tool.stepsOf?.(call.input, { rowCount, codes }) ?? 0
  }

  /** 403 and 404 read the same to the model: the lead door tells them apart, the
   *  other two merge them, and a difference here would let a code be probed. */
  private failed(name: string, error: unknown): ToolVerdict {
    const status = error instanceof PvError ? error.getStatus() : null
    if (status === 400) return notRun('bad-input', { error: 'bad-input' })
    if (status === 403 || status === 404) {
      return notRun('refused', { error: 'not-found-or-not-allowed' })
    }
    /* The class only: a driver error's message can carry the query's parameters. */
    this.log.error(`${name} failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return notRun('error', { error: 'tool-failed' })
  }
}
