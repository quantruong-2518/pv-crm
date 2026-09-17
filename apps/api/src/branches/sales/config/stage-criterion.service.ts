import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ConfigProposalReceipt,
  StageCriterionListResponse,
  type StageCriterionCreate,
  type StageCriterionPatch,
} from '@pv/contracts'
import { conflict, notFound } from '@api/platform/http/problem'
import type { Db } from '@api/platform/db/db.module'
import { SalesConfigGate, type ConfigChange } from './config.approval'
import { StageCriterionRepository } from './stage-criterion.repository'
import type { StageCriterionRowDb } from './stage-criterion.schema'

type CriterionChange = Extract<ConfigChange, { kind: 'criterion-create' | 'criterion-update' }>

/** Stage gate exit criteria — read, propose, and apply once approved.
 *
 *  Split from `SalesConfigService` for size, not for a different rule: writes
 *  propose through the same `SalesConfigGate`, and the applier registered for
 *  `config-change` stays `SalesConfigService`, which hands these two kinds here
 *  inside the transaction that settles the approval. */
@Injectable()
export class StageCriterionService {
  constructor(
    private readonly repo: StageCriterionRepository,
    private readonly gate: SalesConfigGate,
  ) {}

  async list(): Promise<StageCriterionListResponse> {
    const rows = await this.repo.all()
    return StageCriterionListResponse.parse({
      rows: rows.map(({ id, stage, label, ord, active }) => ({ id, stage, label, ord, active })),
    })
  }

  async create(who: Actor, body: StageCriterionCreate): Promise<ConfigProposalReceipt> {
    this.assertLabelFree(await this.repo.all(), body.stage, body.label)
    return this.propose(who, {
      kind: 'criterion-create',
      draft: { stage: body.stage, label: body.label },
    })
  }

  async patch(who: Actor, id: string, body: StageCriterionPatch): Promise<ConfigProposalReceipt> {
    const rows = await this.repo.all()
    const row = rows.find((r) => r.id === id)
    if (!row) throw notFound('tiêu chí', id)
    if (body.label !== undefined) this.assertLabelFree(rows, row.stage, body.label, id)

    return this.propose(who, { kind: 'criterion-update', id, patch: body })
  }

  /** Re-checked against the table as it is now, for the reason
   *  `SalesConfigService.applyChange` gives: the request may have waited days. */
  async apply(tx: Db, change: CriterionChange): Promise<void> {
    const rows = await this.repo.all(tx)

    if (change.kind === 'criterion-create') {
      this.assertLabelFree(rows, change.draft.stage, change.draft.label)
      await this.repo.create(tx, change.draft)
      return
    }

    const row = rows.find((r) => r.id === change.id)
    if (!row) throw notFound('tiêu chí', change.id)
    if (change.patch.label !== undefined) {
      this.assertLabelFree(rows, row.stage, change.patch.label, change.id)
    }
    await this.repo.patch(tx, change.id, change.patch)
  }

  private async propose(who: Actor, change: CriterionChange): Promise<ConfigProposalReceipt> {
    const receipt = await this.gate.propose(who, change)
    return ConfigProposalReceipt.parse({ requestId: receipt.requestId, state: receipt.state })
  }

  /** Mirrors `stage_criterion_stage_label` exactly — case-sensitive, inactive
   *  rows included — so this answer and the table's never disagree. An inactive
   *  clash is named as such: the fix is switching it back on, not a new row. */
  private assertLabelFree(
    rows: StageCriterionRowDb[],
    stage: StageCriterionRowDb['stage'],
    label: string,
    exceptId?: string,
  ): void {
    const clash = rows.find((r) => r.stage === stage && r.label === label && r.id !== exceptId)
    if (!clash) return
    const off = clash.active ? '' : ', đang tắt — bật lại thay vì thêm mới'
    throw conflict(`Chặng này đã có tiêu chí "${clash.label}" (${clash.id}${off}).`, {
      label: ['Tên tiêu chí đã có trong chặng này.'],
    })
  }
}
