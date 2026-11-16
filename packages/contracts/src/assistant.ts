import { z } from 'zod'
import { AssistantProposal } from './assistant-proposal'
import { COMM_CONFIRM_WITHIN_HOURS } from './comms/thread'
import { Day, Moment } from './primitives'
import { AfterSaleCareStatus, AfterSaleTemperatureFilter } from './sales/after-sale'
import { KpiPeriodKey } from './sales/kpi'
import { SalesPeriodKey } from './sales/performance'
import { salesGrainOf } from './sales/sales-period'
import { SearchKind } from './sales/search'
import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from './search-text'

/** CRM assistant — rows in `platform.assistant_session|message|tool_call`, the
 *  events a turn streams on `POST /assistant/turns`, and the tool inputs. The
 *  HTTP params and bodies of wave 1 live in `./assistant-http`.
 *
 *  An assistant message row IS the turn (its id is the turn id). Tool output is
 *  never persisted: `AssistantToolResult` carries counts only. Tool inputs are
 *  `.strict()` and have no actor or owner field, so identity can only come from
 *  the signed-in user, never from model output. ADR 0133 D2 and D8, ADR 0134. */

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

/** Only the kinds `get_record` can open; taken from the global search kinds so a code means the same everywhere. */
export const AssistantRecordKind = SearchKind.extract(['lead', 'opportunity', 'contract'])
export type AssistantRecordKind = z.infer<typeof AssistantRecordKind>

/** Kinds the tools can read. Wider than `AssistantRecordKind` on purpose: that one is the session subject,
 *  bound by the `assistant_session.subject_kind` CHECK, and widening it needs a migration and a company-screen entry. */
export const AssistantSearchKind = SearchKind.extract([
  'lead',
  'opportunity',
  'contract',
  'account',
  'contact',
  'campaign',
])
export type AssistantSearchKind = z.infer<typeof AssistantSearchKind>

/** Search kinds plus `workstream`, which the search door cannot find but `get_record` can open by code. */
export const AssistantReadKind = z.enum([...AssistantSearchKind.options, 'workstream'])
export type AssistantReadKind = z.infer<typeof AssistantReadKind>

const RecordCode = z.string().trim().min(1).max(64)
/** Same shape as the `assistant_tool_call.name` CHECK. */
const ToolName = z.string().regex(/^[a-z_]+$/)

/** The record the person is looking at while asking. */
export const AssistantSubject = z.object({ kind: AssistantRecordKind, code: RecordCode })
export type AssistantSubject = z.infer<typeof AssistantSubject>

export const AssistantSession = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  /** Both set or both null, like the table CHECK. */
  subject: AssistantSubject.nullable(),
  pinned: z.boolean(),
  lastOpenedAt: Moment,
  createdAt: Moment,
})
export type AssistantSession = z.infer<typeof AssistantSession>

/** One question as typed or as a suggestion chip sends it; one schema so a chip always passes as a turn. */
export const AssistantQuestion = z.string().trim().min(1).max(2000)

/** A record an answer names. `label` is the chip text on screen and never enters a model request (D5). */
export const AssistantRef = AssistantSubject.extend({
  kind: AssistantReadKind,
  label: z.string().min(1),
})
export type AssistantRef = z.infer<typeof AssistantRef>

/** What the turn read, per kind, and when: the line under an answer ("read 12 leads, 3 contracts · as of 09:42"). */
export const AssistantFooter = z.object({
  read: z.array(
    z.object({
      kind: z.union([
        AssistantReadKind,
        z.literal('next-step'),
        z.literal('approval'),
        z.literal('hold'),
        z.literal('meeting'),
      ]),
      count: z.number().int().positive(),
    }),
  ),
  at: Moment,
})
export type AssistantFooter = z.infer<typeof AssistantFooter>

export const AssistantMessage = z.object({
  id: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  role: AssistantRole,
  /** Empty, with no refs, no proposals and no footer, when `withheld` or `unchecked`. */
  body: z.string(),
  refs: z.array(AssistantRef),
  /** Cards under the answer; empty on user rows. */
  proposals: z.array(AssistantProposal),
  /** It, or an earlier answer of the chat, names a record the person can no longer read. */
  withheld: z.boolean(),
  /** Past the re-check's cap, or its read failed, so not known to be readable. */
  unchecked: z.boolean(),
  state: AssistantMessageState,
  /** `null` while running and on user rows. */
  endedBy: AssistantEndedBy.nullable(),
  /** What the turn read, rebuilt from its tool calls on load; `null` on user rows. */
  footer: AssistantFooter.nullable(),
  createdAt: Moment,
  finishedAt: Moment.nullable(),
})
export type AssistantMessage = z.infer<typeof AssistantMessage>

/** Pinned first, then last opened. `nextBefore` goes back as `before` for the next
 *  page, as it came; `null` = no more. */
export const AssistantSessionList = z.object({
  sessions: z.array(AssistantSession),
  nextBefore: z.string().nullable(),
})
export type AssistantSessionList = z.infer<typeof AssistantSessionList>

/** A chip's template; the screen writes its label and question in the viewer's
 *  language. `params.code`, when present, is the record the chip asks about. */
export const AssistantSuggestionKey = z.enum([
  'overdue-steps',
  'stale-leads',
  'closing-deals',
  'lead-converted',
  'deal-contract',
  'contract-collected',
  'open-first-hit',
])
export type AssistantSuggestionKey = z.infer<typeof AssistantSuggestionKey>

export const AssistantSuggestion = z.object({
  key: AssistantSuggestionKey,
  params: z.object({ code: RecordCode.optional() }).strict(),
})
export type AssistantSuggestion = z.infer<typeof AssistantSuggestion>

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

export const AssistantErrorCode = z.enum(['off', 'busy', 'limit', 'interrupted', 'failed'])
export type AssistantErrorCode = z.infer<typeof AssistantErrorCode>

/** `session` opens every turn; `heartbeat` keeps the stream alive every 25 s. */
export const AssistantEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session'),
    sessionId: z.string().uuid(),
    /** The turn's own id, so the stop button can name it before `done`. */
    messageId: z.string().uuid(),
    title: z.string().nullable(),
  }),
  z.object({
    type: z.literal('step'),
    round: z.number().int().min(1).max(8),
    tool: ToolName.optional(),
  }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({ type: z.literal('tool-result'), result: AssistantToolResult }),
  z.object({ type: z.literal('refs'), refs: z.array(AssistantRef) }),
  z.object({ type: z.literal('proposal'), proposal: AssistantProposal }),
  /** Template keys from the server, so no tool prose or model text reaches a chip (D5). */
  z.object({ type: z.literal('suggestions'), items: z.array(AssistantSuggestion).max(3) }),
  z.object({
    type: z.literal('done'),
    messageId: z.string().uuid(),
    endedBy: AssistantEndedBy,
    footer: AssistantFooter,
  }),
  z.object({ type: z.literal('heartbeat') }),
  /** `message` is plain Vietnamese for the screen; `code` is what the screen branches on. */
  z.object({ type: z.literal('error'), code: AssistantErrorCode, message: z.string() }),
])
export type AssistantEvent = z.infer<typeof AssistantEvent>

/** `.strict()` so a model-supplied `actorId` or `ownerId` fails parsing instead of being ignored. */
export const SearchRecordsInput = z
  .object({
    query: z.string().trim().min(SEARCH_MIN_CHARS).max(SEARCH_MAX_CHARS),
    kinds: z.array(AssistantSearchKind).min(1).max(6).optional(),
  })
  .strict()
export type SearchRecordsInput = z.infer<typeof SearchRecordsInput>

export const GetRecordInput = z.object({ kind: AssistantReadKind, code: RecordCode }).strict()
export type GetRecordInput = z.infer<typeof GetRecordInput>

/** History is read per lead or per deal: only their doors serve a timeline (touches, meetings, debriefs); a contract has none yet. */
export const AssistantHistoryKind = AssistantRecordKind.extract(['lead', 'opportunity'])
export type AssistantHistoryKind = z.infer<typeof AssistantHistoryKind>

export const GetHistoryInput = z.object({ kind: AssistantHistoryKind, code: RecordCode }).strict()
export type GetHistoryInput = z.infer<typeof GetHistoryInput>

/** Always the asker's own work: there is no field to name anyone else.
 *  Absent `kind` reads the desk only (lead, opportunity, next-step); `approval`, `parked` and
 *  `meeting` are read only when named, so a stored call's counts can be rebuilt from its kind
 *  and row count (no column keeps them). `parked` = the asker's own holds: nurturing leads are
 *  a shared pool with no holder and deals have no nurturing state, so neither is "mine". */
export const ListMyWorkInput = z
  .object({
    kind: z
      .enum([
        'lead',
        'opportunity',
        'next-step',
        'approval',
        'parked',
        'meeting',
        'stale-deal',
        'late-debrief',
        'overdue-contract',
      ])
      .optional(),
  })
  .strict()
export type ListMyWorkInput = z.infer<typeof ListMyWorkInput>

/** The kinds of `ListMyWorkInput` that count as today's work (ADR 0154). */
export const MyWorkSection = z.enum([
  'next-step',
  'approval',
  'meeting',
  'parked',
  'stale-deal',
  'late-debrief',
  'overdue-contract',
])
export type MyWorkSection = z.infer<typeof MyWorkSection>

/** One ledger for the section names: the card, the bell and the email all print these. */
export const MY_WORK_SECTION_LABEL: Record<MyWorkSection, string> = {
  'next-step': 'Bước tiếp theo đến hạn',
  approval: 'Chờ bạn duyệt',
  meeting: 'Cuộc họp hôm nay',
  parked: 'Khách tạm hoãn đến hạn liên hệ',
  'stale-deal': 'Cơ hội lâu chưa có hoạt động',
  'late-debrief': `Liên hệ chưa xác nhận quá ${COMM_CONFIRM_WITHIN_HOURS} giờ`,
  'overdue-contract': 'Hợp đồng có đợt thu quá hạn',
}

/** Morning-brief lines; the server rejects any line holding a digit or an object code, so the model names no figures. */
export const AssistantBriefModelOutput = z
  .object({ lines: z.array(z.string().min(1).max(160)).min(1).max(3) })
  .strict()
export type AssistantBriefModelOutput = z.infer<typeof AssistantBriefModelOutput>

/** `.strict()` so a model-supplied `carer` or actor id fails parsing instead of being ignored.
 *  `mine` means the asker: the server fills in their id, and no field can name anyone else. */
export const ListCustomersInput = z
  .object({
    temperature: AfterSaleTemperatureFilter.optional(),
    /** Absent = both `due` and `upcoming`. */
    care: AfterSaleCareStatus.exclude(['all']).optional(),
    /** Substring of the run code or the customer name. */
    query: z.string().trim().min(SEARCH_MIN_CHARS).max(SEARCH_MAX_CHARS).optional(),
    mine: z.boolean().optional(),
  })
  .strict()
export type ListCustomersInput = z.infer<typeof ListCustomersInput>

/** Always the asker's own cards: no field names anyone else, hence `.strict()`.
 *  `at` is a month key (absent = this month); `quarter` reads the quarter containing it. */
export const GetMyKpiInput = z
  .object({ period: z.enum(['month', 'quarter']), at: KpiPeriodKey.optional() })
  .strict()
export type GetMyKpiInput = z.infer<typeof GetMyKpiInput>

/** Month only: no quarter door exists for everyone's cards. `team` is a name as spoken; absent = every person. */
export const GetTeamKpiInput = z
  .object({ at: KpiPeriodKey.optional(), team: z.string().trim().min(1).max(80).optional() })
  .strict()
export type GetTeamKpiInput = z.infer<typeof GetTeamKpiInput>

/** Room-wide figures of one period, as the overview shows them. `at` absent = the current period;
 *  when present it must be of the same grain. Which parts allow which grain is the tool's rule. */
export const GetPerformanceInput = z
  .object({
    part: z.enum(['figures', 'exits', 'money', 'industries']),
    grain: z.enum(['week', 'month', 'quarter', 'year']),
    at: SalesPeriodKey.optional(),
  })
  .strict()
  .refine((v) => v.at === undefined || salesGrainOf(v.at) === v.grain, {
    path: ['at'],
    message: 'Kỳ phải cùng loại với grain.',
  })
export type GetPerformanceInput = z.infer<typeof GetPerformanceInput>

/** Counts over doors that already cut rows to the asker's scope. The range exists only on `lead-sources`. */
export const CountRecordsInput = z
  .object({
    of: z.enum(['leads', 'deals', 'journeys', 'lead-sources']),
    from: Day.optional(),
    to: Day.optional(),
  })
  .strict()
  .refine((v) => v.of === 'lead-sources' || (v.from === undefined && v.to === undefined), {
    path: ['of'],
    message: 'Chỉ nguồn khách có khoảng ngày.',
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.from <= v.to, {
    path: ['to'],
    message: 'Ngày kết thúc phải sau ngày bắt đầu.',
  })
export type CountRecordsInput = z.infer<typeof CountRecordsInput>
