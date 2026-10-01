import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import type { DebriefAnswerInput, DebriefStepTarget, DebriefTargetResponse } from '@pv/contracts'
import {
  unconfirmable,
  type CommDebriefHook,
  type CommDebriefInput,
  type PreparedDebrief,
} from '@api/platform/comms/comm-debrief.hook'
import type { CommContact } from '@api/platform/comms/comm-record.service'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid } from '@api/platform/http/problem'
import { SalesConfigService } from '../config/config.service'
import { OpportunityStepService, type DoerReach } from './next-step-opportunity.service'
import { OpportunityStepRepository } from './next-step-opportunity.repository'
import { NextStepRepository } from './next-step.repository'
import { assertNextDiffers, liveKind } from './next-step.rules'
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
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async target(who: Actor, subjectCode: string): Promise<DebriefStepTarget | null> {
    return (await this.targets(who, [subjectCode])).get(subjectCode) ?? null
  }

  async slot(who: Actor, subjectCode: string): Promise<DebriefTargetResponse> {
    const stepTarget = await this.target(who, subjectCode)
    const confirmable = stepTarget !== null || !(await this.steps.isOpenSubject(subjectCode))
    return { stepTarget, confirmable }
  }

  async targets(who: Actor, codes: readonly string[]): Promise<Map<string, DebriefStepTarget>> {
    const found = await this.reachable(who, codes)
    return new Map(found.map(({ code, kind, currentStep }) => [code, { kind, currentStep }]))
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
    const op = {
      closing: step.previousDone,
      next: { text: step.text, due: step.due, doerId: step.doerId, kindId: step.kind.id },
    }
    if (step.subject === 'lead')
      await this.leadSteps.write(tx, who, step.subjectCode, op, step.reach)
    else await this.dealSteps.write(tx, who, step.subjectCode, op, step.reach)
  }

  /** One answer per question of `commVocabulary` — active AND with an active
   *  answer — each a live answer of that question. None = an empty evaluation. */
  private async judgeAnswers(given: readonly DebriefAnswerInput[]) {
    const { criteria } = await this.config.commVocabulary()
    const wrong: string[] = []
    for (const a of given) {
      const question = criteria.find((c) => c.id === a.criterionId)
      if (!question)
        wrong.push(`Câu hỏi ${a.criterionId} không có hoặc đã tắt — tải lại bộ câu hỏi.`)
      else if (!question.answers.some((o) => o.id === a.answerId)) {
        wrong.push(`Câu trả lời ${a.answerId} không thuộc câu hỏi “${question.name}” hoặc đã tắt.`)
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
    const [target] = await this.reachable(who, [input.subjectCode])
    const step = input.step
    if (!target) {
      /* An open lead or deal always owes its step; the predicate `slot` reads. */
      if (await this.steps.isOpenSubject(input.subjectCode)) throw unconfirmable(input.subjectCode)
      if (!step) return null
      throw invalid({
        step: ['Liên hệ này thuộc hợp đồng hoặc lead/cơ hội đã đóng — bỏ việc tiếp theo.'],
      })
    }
    if (!step) {
      throw invalid({ step: [`Chọn việc tiếp theo cho ${target.code}.`] }, 'Thiếu việc tiếp theo.')
    }
    const kind = await liveKind(this.steps, step.kindId, undefined, 'step.kindId')
    if (step.previousDone) assertNextDiffers(step.previousDone, step, 'step')
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
          'step.doerId': [`Lead ${subjectCode} chưa có người giữ — chọn người làm việc tiếp theo.`],
        },
        'Chưa có người làm việc tiếp theo.',
      )
    }
    const reach = await this.leadSteps.reaches(doerId)
    return { ...step, kind, doerId, subjectCode, subject: 'lead', reach }
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
      })),
      ...deals.map((r) => ({
        code: r.code,
        kind: 'opportunity' as const,
        currentStep: stepOf(r),
        holderId: null,
      })),
    ]
  }

  private can(who: Actor, permission: 'lead.edit' | 'opportunity.edit'): boolean {
    return this.access.check(who, { branch: 'Sales', permission }).ok
  }
}

type Target = DebriefStepTarget & { code: string; holderId: string | null }

/** What `prepare` learned on the pool that `apply` cannot re-ask inside the tx. */
type PreparedStep = NonNullable<PreparedDebrief['step']> & { subjectCode: string } & (
    { subject: 'lead'; reach: boolean } | { subject: 'opportunity'; reach: DoerReach | null }
  )
