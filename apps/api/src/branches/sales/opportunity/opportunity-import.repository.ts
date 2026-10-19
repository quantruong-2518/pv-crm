import { isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor, audit } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { LEAD_GONE_STATES } from '../lead/lead-state'
import type { ActorLite } from './opportunity-import.check'
import type { OpportunityValues } from './opportunity.mapper'
import type { OpportunityStageEventInsert } from './opportunity.repository'
import { opportunity, opportunityStageEvent, type OpportunityRowDb } from './opportunity.schema'
import { seqCodes } from '../code-seq'

const GONE: ReadonlySet<string> = new Set(LEAD_GONE_STATES)

/** SQL of the file import (`OpportunityImport`), apart from `OpportunityRepository`
 *  for its line ceiling. Batch-shaped on purpose: a file carries up to two thousand
 *  rows, and a round trip per row is two thousand trips to Neon. */
@Injectable()
export class OpportunityImportRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** `n` codes in one statement, outside the transaction (same reason as
   *  `OpportunityRepository.nextCode`). A rolled-back batch burns its numbers;
   *  gaps in the sequence are fine, duplicate codes are not. */
  async nextCodes(n: number): Promise<string[]> {
    if (n <= 0) return []
    const r = (await this.db.execute(seqCodes('OP-', 'sales.opportunity_code_seq', n))) as {
      rows: { code: string }[]
    }

    if (r.rows.length !== n) {
      throw new Error(`sales.opportunity_code_seq cấp ${r.rows.length}/${n} mã`)
    }
    return r.rows.map((x) => x.code)
  }

  /** The whole staff book in one read: the file names people, the batch needs ids. */
  async staff(tx: Db): Promise<ActorLite[]> {
    return tx
      .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
      .from(actor)
      .where(isNull(actor.disabledAt))
  }

  /** Company name → lead code, for the file's "Account" column.
   *
   *  Names are folded in Postgres (`lower`) so both ends agree on case; the
   *  whitespace collapse is done in Node. Only leads not exited enter `byCompany`
   *  (the condition `lead_email_live_idx` carries); exited ones go to `exited` so
   *  their row is refused with its own sentence. `ownerByLead` holds exited leads
   *  too: scope is judged before liveness. Ambiguous names (two leads, one
   *  company) are returned whole, never resolved to the first row: a guess would
   *  put a deal on the wrong profile. */
  async leadsByCompany(tx: Db): Promise<{
    byCompany: Map<string, string>
    ambiguous: Set<string>
    workstreamByLead: Map<string, string | null>
    exited: Map<string, string>
    exitedCodes: Set<string>
    ownerByLead: Map<string, string | null>
  }> {
    const rows = await tx
      .select({
        code: lead.code,
        folded: sql<string>`lower(${lead.company})`,
        workstreamCode: lead.workstreamCode,
        state: lead.state,
        ownerId: lead.ownerId,
      })
      .from(lead)
      .where(leadLive)

    const byCompany = new Map<string, string>()
    const ambiguous = new Set<string>()
    const workstreamByLead = new Map<string, string | null>()
    const exited = new Map<string, string>()
    const exitedCodes = new Set<string>()
    const ownerByLead = new Map<string, string | null>()

    for (const r of rows) {
      const key = r.folded.trim().replace(/\s+/g, ' ')
      ownerByLead.set(r.code, r.ownerId)
      if (GONE.has(r.state)) {
        if (!exited.has(key)) exited.set(key, r.code)
        exitedCodes.add(r.code)
        continue
      }
      workstreamByLead.set(r.code, r.workstreamCode)
      if (byCompany.has(key)) ambiguous.add(key)
      else byCompany.set(key, r.code)
    }

    return { byCompany, ambiguous, workstreamByLead, exited, exitedCodes, ownerByLead }
  }

  /** The batch, in chunks: `CHUNK` keeps one INSERT under Postgres' 65,535 bind
   *  parameters (divided by the column count, rounded down). Chunking is not
   *  partial commit — the caller's one transaction still covers all of them. */
  async insertMany(
    tx: Db,
    rows: readonly (OpportunityValues & { code: string })[],
  ): Promise<OpportunityRowDb[]> {
    const CHUNK = 500
    const written: OpportunityRowDb[] = []

    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      if (slice.length === 0) continue
      written.push(...(await tx.insert(opportunity).values(slice).returning()))
    }

    return written
  }

  /** One statement per import chunk (the caller already slices at 500, so this
   *  does not). Empty is real — a batch whose every row was refused — and runs nothing. */
  async insertStageEvents(tx: Db, rows: readonly OpportunityStageEventInsert[]): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(opportunityStageEvent).values([...rows])
  }

  /** The `platform.audit` row that is the batch's receipt: its id IS the batch id,
   *  and `sales.opportunity` has no `batch_id` column to carry it. Written on the
   *  batch's `tx`, which `AuditRepository.write` (pool-bound) cannot join. */
  async writeBatchNote(
    tx: Db,
    entry: { actorId: string; note: string },
  ): Promise<{ id: string; at: Date }> {
    const [row] = await tx
      .insert(audit)
      .values({ actorId: entry.actorId, action: 'edit', note: entry.note })
      .returning({ id: audit.id, at: audit.at })

    if (!row) throw new Error('platform.audit: INSERT không trả về dòng nào')
    return row
  }
}
