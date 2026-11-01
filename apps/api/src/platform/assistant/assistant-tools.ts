import { Inject, Injectable, Logger, type Type } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import type { AssistantToolOutcome } from '@pv/contracts'
import type { AccessControl, Actor, DenyReason } from '@pv/engines'
import { z, type ZodType } from 'zod'
import { NEED_KEY, PUBLIC_KEY, type RouteNeed } from '../access/need.decorator'
import type { AiToolCall, AiToolDecl } from '../ai/ai-client'
import { ACCESS } from '../engines/tokens'
import { PvError } from '../http/problem'

/** A tool is a gate, not a function (ADR 0133 D2).
 *
 *  Axes 1 and 2 live only in `AccessGuard`, and a service fences rows alone:
 *  `ContractService.profile` hands a contract to a role its own route refuses.
 *  So every tool names the door it stands for, the registry reads that door's
 *  `@Need` as it is built, and `call` asks E2 that question before any service.
 *
 *  `run` takes the `Actor` first and calls a door method that does too, and input
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
 *  gives none; a tool never derives one. */
export type ToolRead = {
  data: object
  codes: readonly string[]
  rowCount: number
  hidden: number | null
}

type ToolSpec<I, K extends string> = {
  name: string
  description: string
  input: ZodType<I>
  /** Keyed, because one need is one permission and `get_record` stands for one
   *  door per kind: the need is chosen after `input` has fixed the kind. */
  doors: Readonly<Record<K, ToolDoor>>
  doorFor: (input: I) => K
  run: (who: Actor, input: I) => Promise<ToolRead>
}

type Prepared =
  | { ok: true; doorKey: string; run: (who: Actor) => Promise<ToolRead> }
  | { ok: false; issues: readonly string[] }

export type AssistantTool = {
  name: string
  description: string
  parameters: object
  doors: Readonly<Record<string, ToolDoor>>
  prepare: (raw: unknown) => Prepared
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
    prepare(raw) {
      const parsed = spec.input.safeParse(raw)
      if (!parsed.success) {
        return { ok: false, issues: parsed.error.issues.map((i) => i.path.join('.') || i.code) }
      }
      return {
        ok: true,
        doorKey: spec.doorFor(parsed.data),
        run: (who) => spec.run(who, parsed.data),
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
 *  refused; the round writes that audit line with its other rows. */
export type ToolVerdict = {
  outcome: AssistantToolOutcome
  output: object
  codes: readonly string[]
  rowCount: number | null
  hidden: number | null
  denied: DenyReason | null
  latencyMs: number | null
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
  latencyMs: null,
})

type Registered = { tool: AssistantTool; needs: Readonly<Record<string, RouteNeed>> }

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
  const needs = Object.fromEntries(doors.map(([key, d]) => [key, needOf(tool.name, d)]))
  return { tool, needs }
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
    /* An unknown key cannot happen by type; if it does, this stays shut. */
    const need = entry.needs[prepared.doorKey]
    const verdict = need
      ? this.access.check(who, need)
      : ({ ok: false, reason: 'permission-denied' } as const)
    if (!verdict.ok) return notRun('refused', { error: 'not-allowed' }, verdict.reason)

    const started = Date.now()
    try {
      const { data, ...counts } = await prepared.run(who)
      /* In the result too: the prompt's hidden-items sentence reads only what reaches it. */
      const output = counts.hidden === null ? data : { ...data, hidden: counts.hidden }
      return { ...notRun('ok', output), ...counts, latencyMs: Date.now() - started }
    } catch (error) {
      return { ...this.failed(call.name, error), rowCount: 0, latencyMs: Date.now() - started }
    }
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
