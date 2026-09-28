import { Inject, Injectable, Logger } from '@nestjs/common'
import { normaliseEmail, taxRoot, type AccessControl, type ScanPlanGroup } from '@pv/engines'
import type { LeadState, ScanResult } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import type { ScanAttempt } from '@api/platform/queue/scan-jobs'
import { ACCESS } from '@api/platform/engines/tokens'
import { ActorRepository } from '@api/platform/session/actor.repository'
import { byOf, TouchService } from '../touch/touch.service'
import { ContactService } from '../contact/contact.service'
import { CampaignService } from '../campaign/campaign.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import type { ScanBatchRowDb } from './lead-scan.schema'
import { LeadScanRepository, type ScanCreator } from './lead-scan.repository'
import { companyValuesOf, contactOf, leadWriteOf, UNKNOWN_NAME } from './lead-scan.mapper'
import { LeadScanService } from './lead-scan.service'
import { LEAD_NOTE } from './lead-write.mapper'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService } from './lead-write.service'
import { LeadRepository } from './lead.repository'
import { LEAD_GONE_STATES } from './lead-state'

/** The scan commit job: the plan recomputed fresh, then ONE transaction per
 *  group, in plan order, each re-asking the book inside itself — the import
 *  door checks outside its transaction and races; this one cannot.
 *
 *  Retry-safe: every group's transaction also saves the running `result`, so
 *  a re-delivered job skips any group whose lead is already in it (a lead
 *  created last attempt now shows up as a merge target in the fresh plan).
 *  No campaign enrolment: membership is a campaign's MAS audience, and a
 *  scanned card is no opt-in (ADR 0041) — the lead keeps the attribution. */

export const COMMIT_FAILED = 'Không tạo xong lead từ lô này — lead đã tạo vẫn giữ nguyên.'
const CREATOR_REVOKED = 'Người tải lô này không còn quyền tạo lead — lô không ghi gì.'

/** The sweeper failed the batch mid-commit: roll the group back and stop. */
class NoLongerCommitting extends Error {}

type Campaign = { sourceId: string | null; originId: string | null } | null

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
    private readonly touch: TouchService,
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
      await this.repo.failBatch(this.repo.pool, code, ['COMMITTING'], COMMIT_FAILED)
    }
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
      await this.repo.failBatch(this.repo.pool, code, ['COMMITTING'], CREATOR_REVOKED)
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
        const lead = target
          ? await this.merge(batch, creator, group, target, result)
          : await this.create(batch, creator, group, campaign, result)
        if (lead === null) result.held += 1
        else (target ? result.mergedInto : result.created).push(lead)
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
      await this.writeRepo.writeBatchNote(tx, {
        actorId: creator.id,
        note: JSON.stringify({ kind: 'lead-scan', batch: code }),
      })
    })
  }

  /** Null = the book changed since the plan and now holds this company. */
  private async create(
    batch: ScanBatchRowDb,
    creator: ScanCreator,
    group: ScanPlanGroup,
    campaign: Campaign,
    result: ScanResult,
  ): Promise<string | null> {
    const { write, primary } = leadWriteOf(group, batch, creator)
    const code = await this.leads.nextCode()
    const run = await this.runs.nextCode()
    return this.repo.run(async (tx) => {
      if ((await this.bookHits(tx, creator, group)) > 0) return null
      const origin = await this.write.derivedOrigin(tx, campaign?.originId ?? null)
      await this.write.bear(tx, {
        code,
        run,
        write,
        extra: {
          campaignId: campaign?.sourceId ?? null,
          originId: origin.id,
          originRaw: null,
          partnerCode: null,
        },
        who: creator,
        owner: creator,
        note: LEAD_NOTE.scanned(batch.code),
      })
      const others = group.people.filter((p) => p !== primary).map(contactOf)
      await this.contacts.seedExtra(tx, code, others, creator, UNKNOWN_NAME)
      await this.repo.linkAttachments(tx, group.fileIds, code)
      await this.progress(tx, batch.code, result, { created: [...result.created, code] })
      return code
    })
  }

  /** Fill-empty-only. Null = the lead left the book or the uploader's scope. */
  private async merge(
    batch: ScanBatchRowDb,
    creator: ScanCreator,
    group: ScanPlanGroup,
    leadCode: string,
    result: ScanResult,
  ): Promise<string | null> {
    return this.repo.run(async (tx) => {
      const found = await this.writeRepo.lockForOwnerChange(tx, leadCode)
      const gone = !found || (LEAD_GONE_STATES as readonly LeadState[]).includes(found.state)
      if (gone || (creator.ownOnly && found.ownerId !== creator.id)) return null
      const filled = await this.writeRepo.fillEmpty(tx, leadCode, companyValuesOf(group))
      const people = group.people.map(contactOf)
      const added = await this.contacts.seedExtra(tx, leadCode, people, creator, UNKNOWN_NAME)
      await this.repo.linkAttachments(tx, group.fileIds, leadCode)
      /* A timeline row only for a real change — linking files alone is none. */
      if (filled || added > 0) {
        await this.touch.record(tx, [
          {
            subjectCode: leadCode,
            subjectKind: 'lead',
            kind: 'field-filled',
            ...byOf(creator),
            note: LEAD_NOTE.scanMerged(batch.code, group.fileIds.length),
          },
        ])
      }
      await this.progress(tx, batch.code, result, {
        mergedInto: [...result.mergedInto, leadCode],
      })
      return leadCode
    })
  }

  /** The plan's own book question, re-asked on the group's transaction. */
  private async bookHits(tx: Db, creator: ScanCreator, group: ScanPlanGroup): Promise<number> {
    const emails = group.people.map((p) => p.email && normaliseEmail(p.email))
    const tax = group.fields.find((f) => f.field === 'taxCode')?.value
    const hits = await this.leads.scanBook(
      creator,
      emails.filter((e): e is string => !!e),
      tax && taxRoot(tax) ? [taxRoot(tax)!] : [],
      tx,
    )
    return hits.length
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
