import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, Permission } from '@pv/engines'
import {
  PIN_MAX,
  PinListResponse,
  PinSetResponse,
  type PinListQuery,
  type PinSetBody,
  type PinSubject,
} from '@pv/contracts'
import { ACCESS } from '../engines/tokens'
import { conflict, denied } from '../http/problem'
import { PIN_REACH, type PinReach } from './pin-reach'
import { PinRepository } from './pin.repository'

/** The permission that opens each subject's book — a pin is a mark in it. */
const VIEW: Record<PinSubject, Permission> = { lead: 'lead.view', opportunity: 'opportunity.view' }
const NOUN: Record<PinSubject, string> = { lead: 'lead', opportunity: 'cơ hội' }

/** Pins: E2 judges the subject, `PinReach` judges the rows, the repository
 *  writes only the caller's own. */
@Injectable()
export class PinService {
  constructor(
    private readonly repo: PinRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(PIN_REACH) private readonly reach: PinReach,
  ) {}

  async list(who: Actor, q: PinListQuery): Promise<PinListResponse> {
    this.mayView(who, q.subject)
    return PinListResponse.parse({ codes: await this.repo.list(who.id, q.subject) })
  }

  /** Changed codes in the order asked. Unpinning skips the reach check: it only
   *  deletes the caller's own rows, and a deal handed away must stay unpinnable. */
  async set(who: Actor, body: PinSetBody): Promise<PinSetResponse> {
    this.mayView(who, body.subject)
    const asked = [...new Set(body.codes)]
    const changed = new Set(
      body.pinned
        ? await this.pin(who, body.subject, asked)
        : await this.repo.remove(who.id, body.subject, asked),
    )
    return PinSetResponse.parse({ changed: asked.filter((c) => changed.has(c)) })
  }

  /** `PIN_MAX` is a ceiling on what one person holds, not only on one body:
   *  counted after the insert, under the actor lock, and over it the whole
   *  request rolls back — a half-applied selection is worse than a refusal. */
  private async pin(who: Actor, subject: PinSubject, codes: string[]): Promise<string[]> {
    const seen = await this.reach.visible(who, subject, codes)
    if (seen.length === 0) return []
    return this.repo.run(async (tx) => {
      await this.repo.lockActor(tx, who.id)
      const added = await this.repo.add(tx, who.id, subject, seen)
      if (added.length > 0 && (await this.repo.count(tx, who.id, subject)) > PIN_MAX) {
        throw conflict(
          `Mỗi người ghim tối đa ${PIN_MAX} ${NOUN[subject]}. Bỏ ghim bớt rồi thử lại.`,
        )
      }
      return added
    })
  }

  /** `check`, not `allows`: the route asked only for a session, so the
   *  licence axis is still open here. */
  private mayView(who: Actor, subject: PinSubject): void {
    const v = this.access.check(who, { branch: 'Sales', permission: VIEW[subject] })
    if (!v.ok) throw denied(v.reason, v.note)
  }
}
