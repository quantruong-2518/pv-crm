import {
  LEAD_STATE_LABEL,
  LeadState,
  OPPORTUNITY_STAGE_LABEL,
  StageKey,
  type StateAddress,
} from '@pv/contracts'
import type { ObjectKind } from '@pv/engines'
import type { CommReportContext } from '@api/platform/comms/comm-debrief.hook'
import type { SalesConfigService } from '../config/config.service'
import type { StepFrameService } from '../config/step-frame.service'
import type { MeetingService } from '../meeting/meeting.service'
import type { NextStepRepository } from './next-step.repository'

/** Sales' half of a comm's AI report (ADR 0132): the facts the model reads and
 *  the lists the server then checks it against. Plain functions, because the
 *  hook already holds every reader and resolves the step target itself.
 *
 *  Options are read only for a target: `StepFrameService.options(null)` answers
 *  free entry for "no frame state", which on a contract or a closed subject
 *  would let a typed step through where the close door takes none. */

type Readers = {
  steps: NextStepRepository
  config: SalesConfigService
  frame: StepFrameService
  meetings: MeetingService
}

type ReportInput = {
  subjectCode: string
  meetingId: string | null
  /** Where `judgeStep` would judge a step; absent = no step is offered. */
  target: { address: StateAddress | null } | undefined
  openStep: string | null
}

export async function readReportContext(
  readers: Readers,
  input: ReportInput,
): Promise<CommReportContext> {
  const { steps, config, frame, meetings } = readers
  const { subjectCode, meetingId, target, openStep } = input
  const [subject, vocabulary, options, meeting] = await Promise.all([
    steps.subjectOf(subjectCode),
    config.commVocabulary(),
    target ? frame.options(target.address) : null,
    meetingId ? meetingOf(meetings, subjectCode, meetingId) : null,
  ])
  /* `debrief.subject_code` is a real key into the mirror. */
  if (!subject) throw new Error(`sales: comm subject ${subjectCode} has no mirror row`)
  return {
    subject: {
      kind: subject.kind,
      label: subject.label,
      stateLabel: stateLabelOf(subject.kind, subject.state),
    },
    vocabulary,
    step: options && { freeEntry: options.freeEntry, templates: options.templates },
    openStep,
    meeting,
  }
}

async function meetingOf(
  meetings: MeetingService,
  subjectCode: string,
  id: string,
): Promise<CommReportContext['meeting']> {
  const { rows } = await meetings.timeline(subjectCode)
  const row = rows.find((r) => r.id === id)
  if (!row) return null
  return {
    title: row.title,
    at: new Date(row.at),
    goal: row.goal ?? null,
    hosts: row.hosts.map((h) => h.name),
    guests: row.guests.map((g) => g.name),
  }
}

/** By kind: the mirror holds a lead's state key or a deal's stage key, and the
 *  two sets share `new` and `assigned`. A contract keeps none. */
function stateLabelOf(kind: ObjectKind, state: string | null): string | null {
  if (kind === 'LD') {
    const lead = LeadState.safeParse(state)
    return lead.success ? LEAD_STATE_LABEL[lead.data] : null
  }
  const stage = StageKey.safeParse(state)
  return kind === 'OP' && stage.success ? OPPORTUNITY_STAGE_LABEL[stage.data] : null
}
