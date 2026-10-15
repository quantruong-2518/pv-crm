import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OpportunityImportCommitResponse,
  OpportunityImportPreviewResponse,
  type OpportunityImportBody,
  type OpportunityRunningDeal,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { LeadStateWriter } from '../lead/lead-state'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { announceImport } from './opportunity-bell'
import { checkBatch, fold, leadCellOf, type ImportCheck } from './opportunity-import.check'
import { OpportunityOpenRepository } from './opportunity-open.repository'
import { acknowledges, opens, OpportunityOpening } from './opportunity-opening.service'
import { actorRoles, holderOfIds, saleLaneOf, salePrimaryOf } from './opportunity-owners'
import {
  fromCreate,
  NOTE,
  ownerRowsOf,
  productRowsOf,
  refOf,
  stageEventOf,
} from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'
import { acceptTouches, OpportunityService } from './opportunity.service'

type Checked = ImportCheck & {
  workstreamByLead: ReadonlyMap<string, string | null>
  running: ReadonlyMap<string, readonly OpportunityRunningDeal[]>
}

const CHUNK = 500

/** Loading deals from a file — `import/preview` and `import`, split out of
 *  `OpportunityService` at its length ceiling.
 *
 *  Both doors run ONE `check` over the same reads, so they judge every row
 *  alike. What a preview cannot promise is that the book stands still: the
 *  commit re-reads leads and running deals under the lead locks and refuses
 *  the whole batch (403/404/409) if they moved. One transaction: a half
 *  loaded file would come back as duplicates on the retry.
 *
 *  An imported deal is written as the typed door writes one (ADR 0088 §19):
 *  mirror row and `spawned` edge, owners, products, its one contact, the
 *  entry stage event and both timeline rows. The bell rings once per file. */
@Injectable()
export class OpportunityImport {
  constructor(
    private readonly repo: OpportunityRepository,
    private readonly openRepo: OpportunityOpenRepository,
    private readonly opening: OpportunityOpening,
    private readonly ops: OpportunityService,
    private readonly workstreams: WorkstreamRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly leadStates: LeadStateWriter,
    private readonly hub: NotificationHub,
  ) {}

  /** Writes nothing — not even a number of the code sequence. */
  async preview(
    who: Actor,
    body: OpportunityImportBody,
  ): Promise<OpportunityImportPreviewResponse> {
    const { report } = await this.check(this.repo.readonlyHandle, who, body)
    return OpportunityImportPreviewResponse.parse(report)
  }

  async commit(who: Actor, body: OpportunityImportBody): Promise<OpportunityImportCommitResponse> {
    const handle = this.repo.readonlyHandle
    const { report, writes, workstreamByLead, running } = await this.check(handle, who, body)

    /* Codes before the transaction, one statement for the batch (`nextCodes`);
       they come back ascending, so file order is code order. */
    const codes = await this.repo.nextCodes(writes.length)
    const now = new Date()
    const acceptor = this.ops.acceptorAtCreate(who)

    const everyone = writes.flatMap((w) => [...w.saleOwners, ...w.bdOwners])
    const [names, roles] = await Promise.all([
      this.repo.actorNames(handle, everyone),
      actorRoles(handle, everyone),
    ])

    const ready = writes.map((write, i) => {
      const code = codes[i] ?? ''
      /* The typed door's column rule through the same function: `new`, or
         `assigned` when the importer may accept (ADR 0071). */
      const draft = fromCreate(
        write,
        now,
        workstreamByLead.get(write.leadCode) ?? null,
        acceptor?.id ?? null,
      )
      const salePrimary = salePrimaryOf(saleLaneOf(write.saleOwners, names, roles), null)
      const opened = { ...byOf(who), kind: 'entered-pipeline' as const }
      return {
        code,
        row: { ...draft.values, code },
        ref: refOf(code, draft, {
          label: draft.values.name,
          owner: holderOfIds(write, names, roles, acceptor, salePrimary),
        }),
        owners: ownerRowsOf(code, draft, salePrimary),
        products: productRowsOf(code, draft),
        contacts: write.contacts.map((pick) => ({ ...pick, opportunityCode: code })),
        /* The "entered the board" row every funnel rate divides by. It leaves
           no column, so `stageSince` is null (`opportunity_stage_event_clock`). */
        stageEvent: stageEventOf({
          code,
          from: null,
          to: draft.values.stage ?? null,
          stageSince: null,
          at: now,
          by: { id: who.id, name: who.name },
          note: NOTE.opened(write.leadCode),
        }),
        touches: [
          {
            ...opened,
            subjectCode: code,
            subjectKind: 'opportunity',
            note: NOTE.opened(write.leadCode),
          },
          {
            ...opened,
            subjectCode: write.leadCode,
            subjectKind: 'lead',
            note: NOTE.promoted(code, write.name),
          },
          ...acceptTouches(code, acceptor, now),
        ] satisfies TouchEntry[],
      }
    })
    const leadCodes = [...new Set(ready.map((p) => p.row.leadCode))]

    const rung: Parameters<typeof announceImport>[2]['deals'][number][] = []
    const batch = await this.repo.run(async (tx) => {
      const accounts = await this.opening.lockLeads(tx, who, leadCodes)
      await this.assertRunningAsChecked(tx, leadCodes, running)
      /* Chunked for Postgres' 65,535 bind parameters, still one transaction.
         Mirror rows first, then the deal row every other table points at. */
      for (let i = 0; i < ready.length; i += CHUNK) {
        const slice = ready.slice(i, i + CHUNK)
        await this.mirror.putMany(
          tx,
          slice.map((p) => p.ref),
        )
        await this.mirror.linkMany(
          tx,
          slice.map((p) => ({ from: p.row.leadCode, to: p.code, kind: 'spawned' as const })),
        )
        await this.repo.insertMany(
          tx,
          slice.map((p) => ({ ...p.row, accountCode: accounts.get(p.row.leadCode) ?? null })),
        )
        await this.repo.insertOwners(
          tx,
          slice.flatMap((p) => p.owners),
        )
        await this.repo.insertProducts(
          tx,
          slice.flatMap((p) => p.products),
        )
        await this.openRepo.insertContacts(
          tx,
          slice.flatMap((p) => p.contacts),
        )
        await this.repo.insertStageEvents(
          tx,
          slice.map((p) => p.stageEvent),
        )
        const touchIds = await this.touch.record(
          tx,
          slice.flatMap((p) => p.touches),
        )
        /* Each deal's entry touch leads its own run of rows in the batch. */
        let at = 0
        for (const p of slice) {
          const ownerIds = p.owners.map((o) => o.actorId)
          rung.push({ code: p.code, label: p.row.name, ownerIds, touchId: touchIds[at] })
          at += p.touches.length
        }
      }
      await this.leadStates.converted(tx, leadCodes)
      await this.workstreams.syncClosed(tx, [
        ...new Set(ready.flatMap((p) => p.row.workstreamCode ?? [])),
      ])
      /* The receipt is written even when no row went in: a batch of errors is
         still something that happened, and this row is how anyone can tell. */
      const note = await this.repo.writeBatchNote(tx, {
        actorId: who.id,
        note: JSON.stringify({
          kind: 'opportunity-import',
          file: body.fileName,
          accepted: codes.length,
          codes,
        }),
      })
      /* One line per person for the whole file, keyed on the receipt (ADR 0093 §4). */
      const file = { batchId: note.id, fileName: body.fileName, actorId: who.id }
      await announceImport(tx, this.hub, { ...file, deals: rung, awaiting: acceptor === null })
      return note
    })

    return OpportunityImportCommitResponse.parse({
      ...report,
      batchId: batch.id,
      at: batch.at.toISOString(),
      accepted: codes.length,
      codes,
    })
  }

  /** Under the lead locks: the running deals `check` judged the rows against
   *  must still be the running deals. A second commit of the same file waits
   *  on the lock, then finds the first one's deals here and writes nothing. */
  private async assertRunningAsChecked(
    tx: Db,
    leadCodes: readonly string[],
    checked: ReadonlyMap<string, readonly OpportunityRunningDeal[]>,
  ): Promise<void> {
    const now = await this.opening.running(tx, leadCodes)
    const moved = leadCodes.find((code) => {
      const seen = (checked.get(code) ?? []).map((d) => d.code)
      return !acknowledges(now.get(code) ?? [], seen)
    })
    if (moved !== undefined)
      throw conflict(`Cơ hội đang chạy của lead ${moved} đã thay đổi. Nạp lại tệp.`)
  }

  /** The shared half of both doors. The second round of reads depends on the
   *  first: a row's lead — by its code cell, else by company name through the
   *  check's own `fold` — is what the running deals and contacts are asked of. */
  private async check(handle: Db, who: Actor, body: OpportunityImportBody): Promise<Checked> {
    const [staff, leads, products] = await Promise.all([
      this.repo.staff(handle),
      this.repo.leadsByCompany(handle),
      this.openRepo.liveProducts(handle),
    ])
    const liveLeads = new Set(leads.workstreamByLead.keys())
    const candidates = [
      ...new Set(
        body.rows
          .map((r) => leadCellOf(r) || leads.byCompany.get(fold(r.values.company ?? '')))
          .filter((c): c is string => c !== undefined && liveLeads.has(c)),
      ),
    ]
    const [running, contactsByLead] = await Promise.all([
      this.opening.running(handle, candidates),
      this.openRepo.reachByLead(handle, who, candidates),
    ])

    return {
      ...checkBatch({
        rows: body.rows,
        staff,
        leadByCompany: leads.byCompany,
        ambiguousCompany: leads.ambiguous,
        exitedCompany: leads.exited,
        liveLeads,
        exitedLeads: leads.exitedCodes,
        running,
        contactsByLead,
        products,
        outOfScope: new Set(
          [...leads.ownerByLead].filter(([, owner]) => !opens(who, owner)).map(([code]) => code),
        ),
        importerAccepts: this.ops.acceptorAtCreate(who) !== null,
        onlySale: this.ops.onlySaleAtCreate(who),
      }),
      workstreamByLead: leads.workstreamByLead,
      running,
    }
  }
}
