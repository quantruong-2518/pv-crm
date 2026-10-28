/** A prompt as versioned data (slice A-1, decision 1): context, ordered steps,
 *  one spec per returned field, the output format and the global rules. The
 *  renderer is the only place that turns one into text, so every prompt reads
 *  alike and the same spec always renders the same bytes.
 *
 *  `version` goes up on every edit that changes the rendered text; the gateway
 *  writes `id@version` on each `ai_call` row, so a change in fill quality can be
 *  traced to the prompt edit behind it. Data the run supplies (the lead, the
 *  closed lists) goes in the user message, never into the spec. */

/** How the model finds one field. Shared specs live in `company-fields.ts`. */
export type FieldSpec = {
  meaning: string
  /** Priority order: the first source that shows the value wins. */
  sources: readonly string[]
  how: string
  format: string
  /** When the value comes back with `confident: false`. */
  unsureWhen: string
  example: string
}

/** `K` = the output schema's keys, so a field without a spec does not compile. */
export type PromptSpec<K extends string = string> = {
  /** Kebab-case, no spaces: `ai_call_prompt_version_shape` checks `x@y`. */
  id: string
  version: number
  context: string
  steps: readonly string[]
  fields: Readonly<Record<K, FieldSpec>>
  output: string
  rules: readonly string[]
}

/** Spread into an `AiRequest`: the system text and the ledger's prompt tag. */
export type RenderedPrompt = { system: string; prompt: string }

export const promptVersion = (spec: PromptSpec): string => `${spec.id}@${spec.version}`

const numbered = (lines: readonly string[]) => lines.map((l, i) => `${i + 1}. ${l}`)

function renderField(name: string, f: FieldSpec): string[] {
  return [
    `## ${name}`,
    `- What: ${f.meaning}`,
    `- Sources, in priority order: ${f.sources.map((s, i) => `(${i + 1}) ${s}`).join(' ')}`,
    `- How: ${f.how}`,
    `- Format: ${f.format}`,
    `- confident is false when: ${f.unsureWhen}`,
    `- Example: ${f.example}`,
  ]
}

export function renderPrompt(spec: PromptSpec): RenderedPrompt {
  const fields = Object.entries<FieldSpec>(spec.fields).flatMap(([name, f]) => [
    ...renderField(name, f),
    '',
  ])
  const system = [
    '# Task',
    spec.context,
    '',
    '# Steps',
    ...numbered(spec.steps),
    '',
    '# Fields',
    ...fields,
    '# Output',
    spec.output,
    '',
    '# Rules',
    ...spec.rules.map((r) => `- ${r}`),
  ].join('\n')
  return { system, prompt: promptVersion(spec) }
}
