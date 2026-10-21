import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  LEAD_SCAN_COMMITTED,
  LEAD_SCAN_FAILED,
  incomingOfScan,
  type AccessControl,
  type ScanPlanGroup,
} from '@pv/engines'
import type { ScanResult } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import type { ScanAttempt } from '@api/platform/queue/scan-jobs'
import { ACCESS } from '@api/platform/engines/tokens'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { ContactService } from '../contact/contact.service'
import { CampaignService } from '../campaign/campaign.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import type { ScanBatchRowDb } from './lead-scan.schema'
import { LeadAdmissionService } from './lead-admission.service'
import { LeadScanRepository, type ScanCreator } from './lead-scan.repository'
import {
  companyValuesOf,
  contactOf,
  leadWriteOf,
  scanActionOf,
  type ScanAction,
} from './lead-scan.mapper'
import { LeadScanService } from './lead-scan.service'
import { UNKNOWN_NAME } from './lead-person-name'
import { LEAD_NOTE, marketingCredit } from './lead-write.mapper'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService } from './lead-write.service'
import { LeadRepository } from './lead.repository'

/** The scan commit job: the plan recomputed fresh, then ONE transaction per
 *  group, in plan order. Each takes the admission gate's lock and asks the
 *  gate again; a group whose fresh verdict no longer supports its planned
 *  outcome is held, never written on a stale answer.
 *
 *  Retry-safe: every group's transaction also saves the running `result`, so
 *  a re-delivered job skips any group whose lead is already in it (a lead
 *  created last attempt now shows up as a merge target in the fresh plan).
 *  No campaign enrolment: membership is a campaign's MAS audience, and a
 *  scanned card is no opt-in (ADR 0041) — the lead keeps the attribution. */

export const COMMIT_FAILED = 'Không tạo xong lead từ lô này. Lead đã tạo vẫn được giữ.'
const CREATOR_REVOKED = 'Người tải lô này không còn quyền tạo lead.'

/** The sweeper failed the batch mid-commit: roll the group back and stop. */
class NoLongerCommitting extends Error {}

type Campaign = { sourceId: string | null; originId: string | null } | null

/** What a group's transaction did; a held group answers null instead. */
type Done = { kind: NonNullable<ScanAction>['kind']; leadCode: string }

@Injectable()
export class LeadScanCommit {
  private readonly log = new Logger('LeadScanCommit')

  constructor(
    private readonly repo: LeadScanRepository,
    private readonly scans: LeadScanService,
    private readonly write: LeadWriteService,
    private readonly writeRepo: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly runs: WorkstreamRepository,
    private readonly contacts: ContactService,
    private readonly campaigns: CampaignService,
    private readonly gate: LeadAdmissionService,
    private readonly actors: ActorRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** On the last delivery a failure parks the batch FAILED, keeping the
   *  `result` its committed groups already saved; before that it throws to
   *  retry. Thrown text names the error class only — it lands in pg-boss. */
  async commitBatch(code: string, attempt: ScanAttempt): Promise<void> {
    try {
      await this.commitOnce(code)
    } catch (error) {
      const kind = error instanceof Error ? error.name : 'unknown'
      this.log.error(`scan ${code}: commit failed (${kind}) — ${String(error)}`)
      if (!attempt.final) throw new Error(`scan ${code}: transient commit failure (${kind})`)
      await this.fail(code, COMMIT_FAILED)
    }
  }

  /** FAILED and its bell line in one transaction, so the uploader is told
   *  exactly when the batch really turned (ADR 0085). */
  private async fail(code: string, error: string): Promise<void> {
    await this.repo.run(async (tx) => {
      const uploader = await this.repo.failBatch(tx, code, ['COMMITTING'], error)
      if (uploader) await this.scans.tell(tx, LEAD_SCAN_FAILED, code, uploader)
    })
  }

  private async commitOnce(code: string): Promise<void> {
    const batch = await this.repo.batch(code)
    if (batch?.state !== 'COMMITTING') return
    /* The route's own E2 question, re-asked now: the commit runs later, in
       the creator's name, and a revoked or disabled creator writes nothing. */
    const creator = await this.repo.creator(batch.createdBy)
    const caller = await this.actors.byId(batch.createdBy)
    const need = { branch: 'Sales', permission: 'lead.edit' } as const
    if (!creator || creator.disabledAt || !caller || !this.access.check(caller.actor, need).ok) {
      await this.fail(code, CREATOR_REVOKED)
      return
    }
    const plan = await this.scans.planOf(creator, await this.repo.files(code))
    /* A campaign closed since upload loses the attribution, not the batch. */
    const campaign = batch.campaignCode
      ? await this.campaigns.pickableOne(batch.campaignCode)
      : null

    const prior = batch.result ?? { created: [], mergedInto: [], held: 0 }
    const already = new Set([...prior.created, ...prior.mergedInto])
    const result: ScanResult = {
      created: [...prior.created],
      mergedInto: [...prior.mergedInto],
      held: 0,
    }
    for (const group of plan.groups) {
      const target = group.outcome === 'MERGE_INTO_LEAD' ? group.leadCode : null
      if (target && already.has(target)) continue
      if (!target && group.outcome !== 'NEW_LEAD') {
        result.held += 1
        continue
      }
      try {
        const done = target
          ? await this.merge(batch, creator, group, result)
          : await this.create(batch, creator, group, campaign, result)
        /* A join lists nothing: its lead is in `created` since its first group. */
        if (done === null) result.held += 1
        else if (done.kind === 'merge') result.mergedInto.push(done.leadCode)
        else if (done.kind === 'create') result.created.push(done.leadCode)
      } catch (error) {
        if (error instanceof NoLongerCommitting) {
          this.log.warn(`scan ${code}: batch left COMMITTING mid-commit; stopping`)
          return
        }
        this.log.error(`scan ${code}: group ${group.key} failed — ${String(error)}`)
        result.held += 1
      }
    }

    /* The codes live in `scan_batch.result`; the note only points at it. */
    await this.repo.run(async (tx) => {
      if (!(await this.repo.saveResult(tx, code, result, true))) return
      const made = result.created.length
      await this.scans.tell(tx, LEAD_SCAN_COMMITTED, code, batch.createdBy, made)
      await this.writeRepo.writeBatchNote(tx, {
        actorId: creator.id,
        note: JSON.stringify({ kind: 'lead-scan', batch: code }),
      })
    })
  }

  /** The only decision a group is written on: the gate's lock, then the gate
   *  again, on the group's own transaction. */
  private async decide(tx: Db, creator: ScanCreator, group: ScanPlanGroup, result: ScanResult) {
    const fresh = await this.gate.admit(tx, creator, incomingOfScan(group))
    return { fresh, action: scanActionOf(group, fresh, result.created) }
  }

  /** Null = the book changed since the plan. A `join` wrote no lead: the
   *  group's people went onto the lead an earlier group of this batch opened. */
  private async create(
    batch: ScanBatchRowDb,
    creator: ScanCreator,
    group: ScanPlanGroup,
    campaign: Campaign,
    result: ScanResult,
  ): Promise<Done | null> {
    const { write, primary } = leadWriteOf(group, batch, creator)
    const code = await this.leads.nextCode()
    const run = await this.runs.nextCode()
    return this.repo.run(async (tx) => {
      const { action } = await this.decide(tx, creator, group, result)
      if (action?.kind === 'join') {
        const people = group.people.map(contactOf)
        await this.contacts.seedExtra(tx, action.leadCode, people, creator, UNKNOWN_NAME)
        await this.repo.linkAttachments(tx, group.fileIds, action.leadCode)
        await this.progress(tx, batch.code, result, {})
        return action
      }
      if (action?.kind !== 'create') return null
      const origin = await this.write.derivedOrigin(tx, campaign?.originId ?? null)
      await this.write.bear(tx, {
        code,
        run,
        write: {
          ...write,
          values: {
            ...write.values,
            marketingOwnerId: marketingCredit(creator, write.values.marketingOwnerId),
          },
        },
        extra: {
          campaignId: campaign?.sourceId ?? null,
          originId: origin.id,
          originRaw: null,
          partnerCode: null,
        },
        who: creator,
        owner: creator,
        note: LEAD_NOTE.scanned(batch.code),
        accountCode: action.accountCode,
      })
      const others = group.people.filter((p) => p !== primary).map(contactOf)
      await this.contacts.seedExtra(tx, code, others, creator, UNKNOWN_NAME)
      await this.repo.linkAttachments(tx, group.fileIds, code)
      await this.progress(tx, batch.code, result, { created: [...result.created, code] })
      return { kind: 'create', leadCode: code }
    })
  }

  /** Fill-empty-only, then the gate's re-entry: the people the lead lacks and
   *  one `re-entered` touch. Null = the lead left the book, the uploader's
   *  scope, or the verdict that pointed at it. */
  private async merge(
    batch: ScanBatchRowDb,
    creator: ScanCreator,
    group: ScanPlanGroup,
    result: ScanResult,
  ): Promise<Done | null> {
    return this.repo.run(async (tx) => {
      const { fresh, action } = await this.decide(tx, creator, group, result)
      if (action?.kind !== 'merge') return null
      const { leadCode } = action
      const found = await this.writeRepo.lockForOwnerChange(tx, leadCode)
      const pool = found?.state === 'nurturing'
      if (!found || (creator.ownOnly && found.ownerId !== creator.id && !pool)) return null
      await this.writeRepo.fillEmpty(tx, leadCode, companyValuesOf(group))
      const people = fresh.newPeople.map((n) => {
        const person = contactOf(group.people[n]!)
        return { ...person, name: person.name ?? UNKNOWN_NAME }
      })
      await this.gate.reenter(tx, leadCode, people, creator, 'SCAN')
      await this.repo.linkAttachments(tx, group.fileIds, leadCode)
      await this.progress(tx, batch.code, result, {
        mergedInto: [...result.mergedInto, leadCode],
      })
      return action
    })
  }

  /** Saved inside the group's own transaction; the caller mirrors it in
   *  memory only once that transaction has committed. */
  private async progress(
    tx: Db,
    code: string,
    result: ScanResult,
    next: Partial<ScanResult>,
  ): Promise<void> {
    if (!(await this.repo.saveResult(tx, code, { ...result, ...next }, false))) {
      throw new NoLongerCommitting()
    }
  }
}
