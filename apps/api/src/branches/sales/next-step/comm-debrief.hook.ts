import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import type {
  CustomerTemperature,
  DebriefAnswerInput,
  DebriefStepTarget,
  DebriefTargetResponse,
  StateAddress,
} from '@pv/contracts'
import {
  unconfirmable,
  type CommDebriefHook,
  type CommDebriefInput,
  type MeetingHeld,
  type MeetingSlot,
  type PreparedDebrief,
} from '@api/platform/comms/comm-debrief.hook'
import type { CommContact } from '@api/platform/comms/comm-record.service'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid } from '@api/platform/http/problem'
import { SalesConfigService } from '../config/config.service'
import { StepFrameService } from '../config/step-frame.service'
import { MeetingService } from '../meeting/meeting.service'
import { OpportunityStepService, type DoerReach } from './next-step-opportunity.service'
import { OpportunityStepRepository } from './next-step-opportunity.repository'
import {
  CustomerTemperatureRepository,
  type CustomerRead,
} from '../after-sale/customer-temperature.repository'
import { NextStepRepository } from './next-step.repository'
import { assertNextDiffers, dealAddress, leadAddress, liveKind } from './next-step.rules'
import { NextStepService } from './next-step.service'

/** Sales' side of a comm record (ADR 0074 §7, 0075 §1): whether its one
 *  subject takes the next step, which run and lead a subject belongs to, the
 *  evaluation and step judged against config, and the step written through
 *  the same `write` both next-step doors use.
 *
 *  `prepare` asks everything that reads on the pool — doer reach, holder,
 *  config — because PGlite has one connection and `apply` runs inside comms'
 *  transaction. What it learns rides on the prepared step (`subject`, `reach`),
 *  so `apply` must be handed the object `prepare` returned. */
@Injectable()
export class NextStepDebriefHook implements CommDebriefHook {
  constructor(
    private readonly leadSteps: NextStepService,
    private readonly dealSteps: OpportunityStepService,
    private readonly steps: NextStepRepository,
    private readonly deals: OpportunityStepRepository,
    private readonly config: SalesConfigService,
    private readonly meetings: MeetingService,
    private readonly frame: StepFrameService,
    private readonly customers: CustomerTemperatureRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async target(who: Actor, subjectCode: string): Promise<DebriefStepTarget | null> {
    return (await this.targets(who, [subjectCode])).get(subjectCode) ?? null
  }

  /** A bought customer's subject (ADR 0121 §3) asks a temperature and a step
   *  on its lead — of a caller who may write that step. Anyone else closes it
   *  as before (0074 §5: no step, no temperature), so no record gets stuck. */
  async slot(who: Actor, subjectCode: string): Promise<DebriefTargetResponse> {
    const found = await this.customers.customerOf(subjectCode)
    if (found && this.writesFor(who, found)) {
      const { leadCode, temperature, carers } = found
      const stepTarget = (await this.customerTargets([found])).get(leadCode) ?? null
      return { stepTarget, confirmable: true, customer: { leadCode, temperature, carers } }
    }
    const stepTarget = await this.target(who, subjectCode)
    const confirmable = stepTarget !== null || !(await this.steps.isOpenSubject(subjectCode))
    return { stepTarget, confirmable, customer: null }
  }

  async targets(who: Actor, codes: readonly string[]): Promise<Map<string, DebriefStepTarget>> {
    const found = await this.reachable(who, codes)
    const map = new Map<string, DebriefStepTarget>(
      found.map(({ code, kind, currentStep }) => [code, { kind, currentStep }]),
    )
    /* Only a code no open lead or deal answered can be a bought customer's. */
    const rest = codes.filter((c) => !map.has(c))
    const customers = [...(await this.customers.customersOf(rest))].filter(([, c]) =>
      this.writesFor(who, c),
    )
    const byLead = await this.customerTargets(customers.map(([, c]) => c))
    for (const [code, c] of customers) {
      const target = byLead.get(c.leadCode)
      if (target) map.set(code, target)
    }
    return map
  }

  subjectsOfRun(workstreamCode: string): Promise<string[]> {
    return this.steps.runSubjects(workstreamCode)
  }

  contactOf(subjectCode: string, contactCode: string | undefined): Promise<CommContact | null> {
    return this.steps.contactOf(subjectCode, contactCode)
  }

  async prepare(who: Actor, input: CommDebriefInput): Promise<PreparedDebrief> {
    return {
      answers: await this.judgeAnswers(input.answers),
      step: await this.judgeStep(who, input),
    }
  }

  /** `write` re-asks scope and liveness on the locked row; the permission is
   *  asked here because no `@Need` stands in front of this path. */
  async apply(tx: Db, who: Actor, prepared: PreparedDebrief): Promise<void> {
    const step = prepared.step as PreparedStep | null
    if (!step) return
    if (!this.can(who, step.subject === 'lead' ? 'lead.edit' : 'opportunity.edit')) {
      throw denied('permission-denied')
    }
    if (step.subject === 'lead' && step.customer) {
      /* The reading is written with the step it chose, where the fact is still known. */
      const { customer } = step
      await this.leadSteps.write(tx, who, step.subjectCode, opOf(step), step.reach, STEP_PATH, {
        temperature: customer.temperature,
        carers: customer.carers,
      })
      await this.customers.insert(tx, {
        workstreamCode: customer.workstreamCode,
        leadCode: step.subjectCode,
        temperature: customer.temperature,
        debriefId: customer.debriefId,
        recordedBy: who.id,
      })
      return
    }
    const op = opOf(step)
    if (step.subject === 'lead')
      await this.leadSteps.write(tx, who, step.subjectCode, op, step.reach, STEP_PATH)
    else await this.dealSteps.write(tx, who, step.subjectCode, op, step.reach, STEP_PATH)
  }

  /** The fence was comms' (`closable`); the meeting book owns the rest. */
  meetingHeld(tx: Db, who: Actor, held: MeetingHeld): Promise<void> {
    return this.meetings.markHeld(tx, who, held)
  }

  meetingSlots(meetingIds: readonly string[]): Promise<Map<string, MeetingSlot>> {
    return this.meetings.slots(meetingIds)
  }

  /** One answer per question of `commVocabulary` — active AND with an active
   *  answer — each a live answer of that question. None = an empty evaluation. */
  private async judgeAnswers(given: readonly DebriefAnswerInput[]) {
    const { criteria } = await this.config.commVocabulary()
    const wrong: string[] = []
    for (const a of given) {
      const question = criteria.find((c) => c.id === a.criterionId)
      if (!question) wrong.push(`Câu hỏi ${a.criterionId} không còn. Tải lại bộ câu hỏi.`)
      else if (!question.answers.some((o) => o.id === a.answerId)) {
        wrong.push(`Câu trả lời ${a.answerId} không dùng được cho câu hỏi “${question.name}”.`)
      }
    }
    for (const c of criteria) {
      if (!given.some((a) => a.criterionId === c.id)) wrong.push(`Chưa trả lời câu “${c.name}”.`)
    }
    if (wrong.length > 0) throw invalid({ answers: wrong }, 'Phần đánh giá chưa hợp lệ.')

    return criteria.map((c) => {
      const answerId = given.find((a) => a.criterionId === c.id)?.answerId ?? ''
      const answerName = c.answers.find((o) => o.id === answerId)?.name ?? ''
      return { criterionId: c.id, criterionName: c.name, answerId, answerName }
    })
  }

  /** Required exactly when the subject takes a step; the doer resolves as the
   *  step doors resolve it (absent = holder). Reach is asked of the RESOLVED
   *  doer: if the holder changes before `apply`, the old one is judged like anyone. */
  private async judgeStep(who: Actor, input: CommDebriefInput): Promise<PreparedStep | null> {
    const customer = await this.customers.customerOf(input.subjectCode)
    if (customer && this.writesFor(who, customer)) {
      return this.judgeCustomerStep(who, input, customer)
    }
    if (input.temperature) {
      throw invalid({ temperature: ['Liên hệ này không cần nhiệt độ. Bỏ nhiệt độ.'] })
    }
    const [target] = await this.reachable(who, [input.subjectCode])
    const step = input.step
    if (!target) {
      /* An open lead or deal always owes its step; the predicate `slot` reads. */
      if (await this.steps.isOpenSubject(input.subjectCode)) throw unconfirmable(input.subjectCode)
      if (!step) return null
      throw invalid({
        step: ['Liên hệ này thuộc hợp đồng hoặc lead/cơ hội đã đóng. Bỏ việc tiếp theo.'],
      })
    }
    if (!step) {
      throw invalid({ step: [`Chọn việc tiếp theo cho ${target.code}.`] }, 'Thiếu việc tiếp theo.')
    }
    const kind = await liveKind(this.steps, step.kindId, undefined, 'step.kindId')
    if (step.previousDone) assertNextDiffers(step.previousDone, step, 'step')
    /* Asked here so the typist hears it on `step.*`; `write` re-asks it under
       the lock, where the state is the one the step lands on (ADR 0080 §2). */
    await this.frame.settle(undefined, target.address, step, STEP_PATH)
    const subjectCode = target.code

    if (target.kind === 'opportunity') {
      const doerId = step.doerId ?? (await this.deals.holderOf(subjectCode)) ?? who.id
      const reach = await this.dealSteps.reaches(doerId)
      return { ...step, kind, doerId, subjectCode, subject: 'opportunity', reach }
    }
    const doerId = step.doerId ?? target.holderId
    if (doerId === null) {
      throw invalid(
        {
          'step.doerId': [
            `Lead ${subjectCode} chưa có người phụ trách. Chọn người làm việc tiếp theo.`,
          ],
        },
        'Chưa có người làm việc tiếp theo.',
      )
    }
    const reach = await this.leadSteps.reaches(doerId)
    return { ...step, kind, doerId, subjectCode, subject: 'lead', reach }
  }

  /** A bought customer's close-out (ADR 0121 §3, §5): temperature and step
   *  both required, the step on the run's lead, its templates the temperature's. */
  private async judgeCustomerStep(
    who: Actor,
    input: CommDebriefInput,
    customer: CustomerRead,
  ): Promise<PreparedStep> {
    const { leadCode } = customer
    const { step, temperature } = input
    if (!temperature || !step) {
      throw invalid(
        {
          ...(temperature ? {} : { temperature: ['Chọn nhiệt độ khách: Nóng, Ấm hoặc Nguội.'] }),
          ...(step ? {} : { step: [`Chọn việc tiếp theo cho ${leadCode}.`] }),
        },
        'Khách đã mua cần nhiệt độ và việc tiếp theo.',
      )
    }
    const kind = await liveKind(this.steps, step.kindId, undefined, 'step.kindId')
    if (step.previousDone) assertNextDiffers(step.previousDone, step, 'step')
    await this.frame.settle(undefined, { kind: 'customer', state: temperature }, step, STEP_PATH)
    const carers = customer.carers.map((c) => c.id)
    /* A carer closing takes the step: a locked or departed holder must never
       fail their close-out. Anyone else hands it to the holder, as on a lead. */
    const doerId =
      step.doerId ?? (carers.includes(who.id) ? who.id : (customer.leadOwnerId ?? who.id))
    const reach = await this.leadSteps.reaches(doerId)
    return {
      ...step,
      kind,
      doerId,
      subjectCode: leadCode,
      subject: 'lead',
      reach,
      customer: {
        temperature,
        carers,
        workstreamCode: customer.workstreamCode,
        debriefId: input.debriefId,
      },
    }
  }

  /** The caller may write a bought customer's step: `lead.edit`, and when
   *  `ownOnly` the lead's holder or one of its carers — `lockCustomer`'s fence. */
  private writesFor(who: Actor, c: CustomerRead): boolean {
    if (!this.can(who, 'lead.edit')) return false
    return !who.ownOnly || c.leadOwnerId === who.id || c.carers.some((p) => p.id === who.id)
  }

  /** Lead code → its step slot, read for all the customers at once. */
  private async customerTargets(
    customers: readonly CustomerRead[],
  ): Promise<Map<string, DebriefStepTarget>> {
    const steps = await this.steps.stepsOf(customers.map((c) => c.leadCode))
    return new Map(
      customers.map((c) => {
        const step = steps.get(c.leadCode)
        const currentStep = step ? { text: step.text, due: step.due } : null
        return [c.leadCode, { kind: 'lead' as const, currentStep }]
      }),
    )
  }

  /** Open leads and open deals among the codes, in the caller's scope, on
   *  which they hold the edit permission. Everything else takes no step. */
  private async reachable(who: Actor, codes: readonly string[]): Promise<Target[]> {
    const [leads, deals] = await Promise.all([
      this.can(who, 'lead.edit') ? this.steps.openLeads(who, codes) : [],
      this.can(who, 'opportunity.edit') ? this.deals.openDeals(who, codes) : [],
    ])
    const stepOf = (r: { text: string | null; due: string | null }) =>
      r.text !== null && r.due !== null ? { text: r.text, due: r.due } : null
    return [
      ...leads.map((r) => ({
        code: r.code,
        kind: 'lead' as const,
        currentStep: stepOf(r),
        holderId: r.ownerId,
        address: leadAddress(r.state),
      })),
      ...deals.map((r) => ({
        code: r.code,
        kind: 'opportunity' as const,
        currentStep: stepOf(r),
        holderId: null,
        address: dealAddress({ open: true, stage: r.stage }),
      })),
    ]
  }

  private can(who: Actor, permission: 'lead.edit' | 'opportunity.edit'): boolean {
    return this.access.check(who, { branch: 'Sales', permission }).ok
  }
}

/** Where the step sits in a close-out body, so a refusal names `step.<field>`
 *  whether `prepare` or the write under the lock finds it. */
const STEP_PATH = 'step.'

type Target = DebriefStepTarget & {
  code: string
  holderId: string | null
  address: StateAddress | null
}

/** A bought customer's reading, carried from `prepare` to `apply`. */
type CustomerPrepared = {
  temperature: CustomerTemperature
  carers: string[]
  workstreamCode: string
  debriefId: string
}

/** What `prepare` learned on the pool that `apply` cannot re-ask inside the tx. */
type PreparedStep = NonNullable<PreparedDebrief['step']> & { subjectCode: string } & (
    | { subject: 'lead'; reach: boolean; customer?: CustomerPrepared }
    | { subject: 'opportunity'; reach: DoerReach | null }
  )

/** The step write both subjects share, from what `prepare` settled. */
const opOf = (step: PreparedStep) => ({
  closing: step.previousDone,
  next: {
    text: step.text,
    due: step.due,
    doerId: step.doerId,
    kindId: step.kind.id,
    templateId: step.templateId,
  },
})
