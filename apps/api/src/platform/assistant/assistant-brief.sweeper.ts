import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  AssistantBriefModelOutput,
  NOTIFICATION_DETAIL_FLOOR,
  NOTIFICATION_DETAIL_SUMMARY,
  type MyWorkSection,
} from '@pv/contracts'
import { ASSISTANT_BRIEF, type Actor, type Permission } from '@pv/engines'
import { AiGateway } from '../ai/ai-gateway'
import { ASSISTANT_BRIEF_PROMPT } from '../ai/prompts/assistant-brief.prompts'
import { renderPrompt } from '../ai/prompts/prompt-spec'
import { cutOf, isWeekend, vietnamDay, vietnamHour } from '../clock/vietnam-clock'
import { DB, type Db } from '../db/db.module'
import { NotificationHub } from '../notification/notification.hub'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import { ActorRepository } from '../session/actor.repository'
import { AssistantBriefMailer } from './assistant-brief.mailer'
import { fenced, newFence } from './assistant-context'
import { ASSISTANT_NEED } from './assistant-turns'
import { briefEventKey, MyWorkService, type MyWorkRead } from './my-work.service'

const RETRY_MS = 5 * 60_000
const FROM_HOUR = 8
/** A deploy or restart later in the day must not send a "morning" brief. */
const UNTIL_HOUR = 11
const DAY_MS = 24 * 60 * 60_000
/** Every object code holds a digit, so this one test also keeps codes out of the lines. */
const DIGIT = /\d/

type Counts = Partial<Record<MyWorkSection, number>>

/** A person whose section threw is failed, not briefed short: the retry builds it whole. */
class UnreadSection extends Error {
  override name = 'UnreadSection'
}

/** The morning brief (ADR 0154 §3): one bell line and one letter per person with work
 *  today, Monday to Friday, holidays included (ADR 0134), only from 08:00 to 11:00 Vietnam.
 *  Rides the worker tick like the KPI digest sweeper and sleeps until tomorrow's cut.
 *
 *  The bell row is the state across restarts: a person holding today's row is skipped before
 *  any AI call, and the letter follows the row, so a muted bell sends no letter. In memory,
 *  `handled` keeps the people done today, so a retry pass re-reads only the ones that failed.
 *  A failed person is logged and retried in 5 minutes while the window is open. People are
 *  handled one at a time, never in parallel. */
@Injectable()
export class AssistantBriefSweeper {
  private readonly log = new Logger('AssistantBrief')
  private notBefore = 0
  private running = false
  private handled = { day: '', ids: new Set<string>() }

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly hub: NotificationHub,
    private readonly roles: RolePermissionRepository,
    private readonly actors: ActorRepository,
    private readonly work: MyWorkService,
    private readonly ai: AiGateway,
    private readonly mailer: AssistantBriefMailer,
  ) {}

  /** Called on every worker tick. `null` = this tick was not a pass. */
  async sweep(now = Date.now()): Promise<number | null> {
    const day = vietnamDay(now)
    const hour = vietnamHour(now)
    if (this.running || now < this.notBefore || hour < FROM_HOUR || hour >= UNTIL_HOUR) return null
    this.running = true
    try {
      if (isWeekend(day)) {
        this.notBefore = cutOf(day, FROM_HOUR) + DAY_MS
        return null
      }
      const { told, failed } = await this.pass(day)
      this.notBefore = failed > 0 ? this.retryAt(now, day) : cutOf(day, FROM_HOUR) + DAY_MS
      return told
    } catch (error: unknown) {
      /* Only the audience read throws: no one was reached, so the whole pass retries. */
      this.notBefore = this.retryAt(now, day)
      throw error
    } finally {
      this.running = false
    }
  }

  /** In 5 minutes while the window is still open, else tomorrow's cut. */
  private retryAt(now: number, day: string): number {
    const at = now + RETRY_MS
    return at < cutOf(day, UNTIL_HOUR) ? at : cutOf(day, FROM_HOUR) + DAY_MS
  }

  private async pass(day: string): Promise<{ told: number; failed: number }> {
    if (this.handled.day !== day) this.handled = { day, ids: new Set() }
    const { permission, branch } = ASSISTANT_NEED
    const held = await this.roles.rolesHolding(permission as Permission)
    /* Not `hub.holding`: it leaves out own-only people, whose own work is the whole point. */
    const ids = await this.hub.inRolesOrFail(this.db, held, branch ?? undefined)
    let told = 0
    let failed = 0
    for (const id of ids) {
      if (this.handled.ids.has(id)) continue
      try {
        if (await this.brief(id, day)) told += 1
        this.handled.ids.add(id)
      } catch (error: unknown) {
        failed += 1
        this.log.error(`Brief for ${id} failed: ${error instanceof Error ? error.name : 'unknown'}`)
      }
    }
    if (told > 0) this.log.log(`Announced ${told} morning briefs.`)
    return { told, failed }
  }

  /** True when the bell line was written for this person today. */
  private async brief(id: string, day: string): Promise<boolean> {
    const key = briefEventKey(id, day)
    if (await this.hub.lineExists(this.db, id, key)) return false
    const caller = await this.actors.byId(id)
    if (!caller) return false
    const read = await this.work.gather(caller.actor)
    if (read.response.sections.some((s) => s.skipped)) throw new UnreadSection('a section threw')
    const counts: Counts = {}
    for (const s of read.response.sections) if (s.count > 0) counts[s.section] = s.count
    if (Object.keys(counts).length === 0) return false

    const atLeast = read.response.sections.some((s) => s.more)
    const summary = await this.lines(caller.actor, counts, read)
    const written = await this.db.transaction(async (tx) => {
      await this.hub.announce(tx, {
        event: {
          name: ASSISTANT_BRIEF,
          ref: { code: id },
          occurrence: day,
          audiences: { recipient: [id] },
        },
        subject: { kind: 'user', code: id, label: null },
        detail: {
          ...counts,
          ...(atLeast ? { [NOTIFICATION_DETAIL_FLOOR]: 1 } : {}),
          ...(summary ? { [NOTIFICATION_DETAIL_SUMMARY]: summary } : {}),
        },
      })
      return this.hub.lineExists(tx, id, key)
    })
    if (written) await this.mailer.send({ to: caller.actor.email, counts, atLeast, key })
    return written
  }

  /** The AI lines joined, or null: any failure costs the person the lines, never the brief. */
  private async lines(who: Actor, counts: Counts, read: MyWorkRead): Promise<string | null> {
    try {
      const text = fenced(newFence(), { counts, sections: read.trusted })
      const request = {
        ...renderPrompt(ASSISTANT_BRIEF_PROMPT),
        parts: [{ text }],
        effort: 'low' as const,
      }
      /* The route's per-user cap is a rolling 24 h from the vendor's answer, so a daily 08:00 pass
         would be refused every other day; the bell row already limits it to once a day. `check`
         with no actor keeps the route-on, key and token-budget tests and leaves that cap out. */
      await this.ai.check('assistant-brief', null)
      const { value } = await this.ai.run('assistant-brief', request, AssistantBriefModelOutput, {
        actorId: who.id,
        subjectCode: null,
        admitted: true,
      })
      if (value.lines.some((line) => DIGIT.test(line))) {
        this.log.warn(`Brief lines for ${who.id} dropped: a line held a digit.`)
        return null
      }
      return value.lines.join(' ')
    } catch (error: unknown) {
      this.log.warn(
        `Brief lines for ${who.id} skipped: ${error instanceof Error ? error.name : 'unknown'}`,
      )
      return null
    }
  }
}
