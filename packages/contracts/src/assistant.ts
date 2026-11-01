import { z } from 'zod'
import { Moment } from './primitives'
import { SearchKind } from './sales/search'
import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from './search-text'

/** CRM assistant — rows in `platform.assistant_session|message|tool_call` and the
 *  events a turn emits. No HTTP route yet; wave 0 ships shapes only.
 *
 *  An assistant message row IS the turn (its id is the turn id). Tool output is
 *  never persisted: `AssistantToolResult` carries counts only. Tool inputs are
 *  `.strict()` and have no actor or owner field, so identity can only come from
 *  the signed-in user, never from model output. ADR 0133 D2 and D8. */

/** Values mirror the CHECK constraints in migration 0159; widen both together. */
export const AssistantRole = z.enum(['user', 'assistant'])
export type AssistantRole = z.infer<typeof AssistantRole>

export const AssistantMessageState = z.enum(['running', 'done', 'failed', 'stopped'])
export type AssistantMessageState = z.infer<typeof AssistantMessageState>

export const AssistantEndedBy = z.enum([
  'answer',
  'cap-rounds',
  'cap-time',
  'cap-tokens',
  'vendor',
  'disabled',
  'stopped',
  'crash',
])
export type AssistantEndedBy = z.infer<typeof AssistantEndedBy>

export const AssistantToolOutcome = z.enum([
  'ok',
  'error',
  'refused',
  'over-cap',
  'bad-input',
  'unknown-tool',
])
export type AssistantToolOutcome = z.infer<typeof AssistantToolOutcome>

/** Only the kinds a wave 0 tool can open; taken from the global search kinds so a code means the same everywhere. */
export const AssistantRecordKind = SearchKind.extract(['lead', 'opportunity', 'contract'])
export type AssistantRecordKind = z.infer<typeof AssistantRecordKind>

const RecordCode = z.string().trim().min(1).max(64)
/** Same shape as the `assistant_tool_call.name` CHECK. */
const ToolName = z.string().regex(/^[a-z_]+$/)

export const AssistantSession = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  /** Both set or both null, like the table CHECK. */
  subject: z.object({ kind: AssistantRecordKind, code: RecordCode }).nullable(),
  pinned: z.boolean(),
  lastOpenedAt: Moment,
  createdAt: Moment,
})
export type AssistantSession = z.infer<typeof AssistantSession>

export const AssistantMessage = z.object({
  id: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  role: AssistantRole,
  body: z.string(),
  state: AssistantMessageState,
  /** `null` while running and on user rows. */
  endedBy: AssistantEndedBy.nullable(),
  createdAt: Moment,
  finishedAt: Moment.nullable(),
})
export type AssistantMessage = z.infer<typeof AssistantMessage>

export const AssistantSessionList = z.object({ sessions: z.array(AssistantSession) })
export type AssistantSessionList = z.infer<typeof AssistantSessionList>

export const AssistantSessionDetail = z.object({
  session: AssistantSession,
  messages: z.array(AssistantMessage),
})
export type AssistantSessionDetail = z.infer<typeof AssistantSessionDetail>

/** Counts only: a result's content must not reach the client except through resolved placeholders (D3). */
export const AssistantToolResult = z.object({
  tool: ToolName,
  outcome: AssistantToolOutcome,
  rowCount: z.number().int().nonnegative().nullable(),
  hidden: z.number().int().nonnegative().nullable(),
  truncated: z.boolean(),
})
export type AssistantToolResult = z.infer<typeof AssistantToolResult>

export const AssistantEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('step'),
    round: z.number().int().min(1).max(8),
    tool: ToolName.optional(),
  }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('tool-result'), result: AssistantToolResult }),
  z.object({ type: z.literal('done'), messageId: z.string().uuid(), endedBy: AssistantEndedBy }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type AssistantEvent = z.infer<typeof AssistantEvent>

/** `.strict()` so a model-supplied `actorId` or `ownerId` fails parsing instead of being ignored. */
export const SearchRecordsInput = z
  .object({
    query: z.string().trim().min(SEARCH_MIN_CHARS).max(SEARCH_MAX_CHARS),
    kinds: z.array(AssistantRecordKind).min(1).max(3).optional(),
  })
  .strict()
export type SearchRecordsInput = z.infer<typeof SearchRecordsInput>

export const GetRecordInput = z.object({ kind: AssistantRecordKind, code: RecordCode }).strict()
export type GetRecordInput = z.infer<typeof GetRecordInput>
