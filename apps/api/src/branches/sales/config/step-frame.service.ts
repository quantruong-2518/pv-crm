import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ConfigProposalReceipt,
  FREE_ENTRY_DEFAULT,
  StageKey,
  StateAddress,
  StepFrameResponse,
  StepLeadState,
  StepOptionsResponse,
  type NextStepSetBody,
  type StateRulePatch,
  type StepTemplateCreate,
  type StepTemplateOrderPatch,
  type StepTemplatePatch,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { SalesConfigGate } from './config.approval'
import { stateWords, type FrameChange } from './step-frame.approval'
import { StepFrameRepository } from './step-frame.repository'
import type { StepTemplateRowDb } from './step-frame.schema'

/** The closed sets, spelled from the contract: lead states first, then stages. */
const ADDRESSES: StateAddress[] = [
  ...StepLeadState.options.map((state) => ({ kind: 'lead' as const, state })),
  ...StageKey.options.map((state) => ({ kind: 'opportunity' as const, state })),
]

/** `parse`, not a cast: the two columns are plain text to Drizzle, and the
 *  union is what ties a state to its kind. */
const addressOf = (row: { objectKind: string; stateKey: string }): StateAddress =>
  StateAddress.parse({ kind: row.objectKind, state: row.stateKey })

const sameAddress = (row: { objectKind: string; stateKey: string }, a: StateAddress): boolean =>
  row.objectKind === a.kind && row.stateKey === a.state

/** What a step write stores once the frame has judged it. */
export type SettledStep = { text: string; kindId: string | undefined; templateId: string | null }

/** The journey frame (ADR 0080): templates and the free-entry flag per state.
 *
 *  Three callers: the config screen (read, and four propose doors that write
 *  NOTHING until the director approves), `SalesConfigService.apply` (the
 *  approved change, inside the approval's transaction), and the next-step
 *  module (`options` for the picker, `settle` for every step write).
 *
 *  `judge` is one function for propose and apply: the two run against
 *  different snapshots, and one wording per rule is `applyChange`'s habit. */
@Injectable()
export class StepFrameService {
  constructor(
    private readonly repo: StepFrameRepository,
    private readonly gate: SalesConfigGate,
  ) {}

  async frame(): Promise<StepFrameResponse> {
    const [templates, rules] = await Promise.all([this.repo.all(), this.repo.rules()])
    return StepFrameResponse.parse({
      templates: templates.map((t) => ({
        id: t.id,
        address: addressOf(t),
        name: t.name,
        kindId: t.kindId,
        ...(t.dueDays === null ? {} : { dueDays: t.dueDays }),
        ord: t.ord,
        active: t.active,
      })),
      rules: ADDRESSES.map((address) => ({
        address,
        freeEntry: rules.find((r) => sameAddress(r, address))?.freeEntry ?? FREE_ENTRY_DEFAULT,
      })),
    })
  }

  /** The picker's read. `null` = the object stands in no frame state. */
  async options(address: StateAddress | null): Promise<StepOptionsResponse> {
    if (address === null) return { address: null, freeEntry: true, templates: [] }
    const [rows, kinds, rule] = await Promise.all([
      this.repo.ofAddress(address),
      this.repo.stepKinds(),
      this.repo.rule(address),
    ])
    return StepOptionsResponse.parse({
      address,
      freeEntry: rule?.freeEntry ?? FREE_ENTRY_DEFAULT,
      templates: rows
        /* A template whose kind was switched off is not offered: `liveKind`
           would refuse the step the moment it is picked. */
        .filter((t) => t.active && kinds.some((k) => k.active && k.id === t.kindId))
        .map((t) => ({
          id: t.id,
          name: t.name,
          ...(t.dueDays === null ? {} : { dueDays: t.dueDays }),
          kind: { id: t.kindId, name: kinds.find((k) => k.id === t.kindId)?.name },
        })),
    })
  }

  // ── propose · judged now so the typist hears it, written on approval ─────

  proposeCreate(who: Actor, body: StepTemplateCreate): Promise<ConfigProposalReceipt> {
    return this.propose(who, { kind: 'step-template-create', draft: body })
  }

  async proposeOrder(who: Actor, body: StepTemplateOrderPatch): Promise<ConfigProposalReceipt> {
    const rows = await this.repo.ofAddress(body.address)
    /* An id that is not of this state has no name here; `judge` refuses it. */
    const names = body.ids.flatMap((id) => {
      const row = rows.find((r) => r.id === id)
      return row ? [row.active ? row.name : `${row.name} (đang tắt)`] : []
    })
    return this.propose(who, { kind: 'step-template-reorder', ...body, names })
  }

  async proposePatch(
    who: Actor,
    id: string,
    patch: StepTemplatePatch,
  ): Promise<ConfigProposalReceipt> {
    const row = await this.repo.byId(id)
    if (!row) throw notFound('mẫu việc tiếp theo', id)
    const kindName =
      patch.kindId === undefined
        ? undefined
        : (await this.repo.stepKinds()).find((k) => k.id === patch.kindId)?.name
    return this.propose(who, {
      kind: 'step-template-update',
      id,
      patch,
      was: { name: row.name, address: addressOf(row) },
      ...(kindName === undefined ? {} : { kindName }),
    })
  }

  async proposeRule(who: Actor, body: StateRulePatch): Promise<ConfigProposalReceipt> {
    const rows = await this.repo.ofAddress(body.address)
    const activeTemplates = rows.filter((r) => r.active).length
    return this.propose(who, { kind: 'state-rule', rule: body, activeTemplates })
  }

  private async propose(who: Actor, change: FrameChange): Promise<ConfigProposalReceipt> {
    await this.judge(change)
    const receipt = await this.gate.propose(who, change)
    return ConfigProposalReceipt.parse({ requestId: receipt.requestId, state: receipt.state })
  }

  /** Called by `SalesConfigService.applyChange` with the approval's `tx`. A
   *  refusal rolls the settling UPDATE back, so the request stays waiting. */
  async apply(tx: Db, change: FrameChange): Promise<void> {
    await this.judge(change, tx)
    if (change.kind === 'step-template-create') return this.repo.create(tx, change.draft)
    if (change.kind === 'step-template-reorder') {
      return this.repo.reorder(tx, change.address, change.ids)
    }
    if (change.kind === 'state-rule') return this.repo.putRule(tx, change.rule)
    /* `judge` has just read the row through `tx`; gone here means deleted by hand. */
    if (!(await this.repo.patch(tx, change.id, change.patch))) {
      throw notFound('mẫu việc tiếp theo', change.id)
    }
  }

  /** Everything a typist can fix, asked of the book as `handle` sees it. */
  private async judge(change: FrameChange, handle?: Db): Promise<void> {
    if (change.kind === 'state-rule') {
      /* Listed-only with an empty list would refuse every step written there,
         and with it every comm close-out on that state. */
      const { address, freeEntry } = change.rule
      if (freeEntry || (await this.repo.ofAddress(address, handle)).some((r) => r.active)) return
      throw conflict(
        `Trạng thái ${stateWords(address)} chưa có bước nào đang bật trong danh sách — thêm ít nhất một bước cho trạng thái này trước, rồi mới tắt tự điền.`,
      )
    }
    if (change.kind === 'step-template-create') {
      const { address, name, kindId } = change.draft
      await this.assertKindLive(kindId, handle)
      assertNameFree(await this.repo.ofAddress(address, handle), name, address)
      return
    }
    if (change.kind === 'step-template-reorder') {
      const rows = await this.repo.ofAddress(change.address, handle)
      assertOrderCovers(
        rows.map((r) => r.id),
        change.ids,
      )
      return
    }
    const row = await this.repo.byId(change.id, handle)
    if (!row) throw notFound('mẫu việc tiếp theo', change.id)
    const { patch } = change
    const turnsOn = patch.active === true && !row.active
    if (patch.active === false && row.active) await this.assertNotLastListed(row, handle)
    /* Switching back on re-asks both: the kind may have been switched off and
       the name taken while this row was off (`step_template_name_live`). */
    if (patch.kindId !== undefined || turnsOn) {
      await this.assertKindLive(patch.kindId ?? row.kindId, handle)
    }
    if ((patch.active ?? row.active) && (patch.name !== undefined || turnsOn)) {
      const address = addressOf(row)
      const rows = await this.repo.ofAddress(address, handle)
      assertNameFree(rows, patch.name ?? row.name, address, row.id)
    }
  }

  /** The mirror of the `state-rule` check: the last active template of a
   *  listed-only state may not be switched off, for the same empty-list reason. */
  private async assertNotLastListed(row: StepTemplateRowDb, handle?: Db): Promise<void> {
    const address = addressOf(row)
    const rule = await this.repo.rule(address, handle)
    if (rule?.freeEntry ?? FREE_ENTRY_DEFAULT) return
    const rows = await this.repo.ofAddress(address, handle)
    if (rows.some((r) => r.active && r.id !== row.id)) return
    throw conflict(
      `“${row.name}” là bước cuối cùng đang bật của ${stateWords(address)}, nơi không cho tự điền — bật tự điền hoặc để lại ít nhất một bước.`,
    )
  }

  private async assertKindLive(kindId: string, handle?: Db): Promise<void> {
    const kind = (await this.repo.stepKinds(handle)).find((k) => k.id === kindId)
    if (kind?.active) return
    throw invalid(
      { kindId: ['Loại việc không có trong danh mục hoặc đã tắt — chọn loại việc khác.'] },
      'Loại việc không hợp lệ.',
    )
  }

  // ── enforcement · every next-step write passes through here ──────────────

  /** What may be stored for a step written on `address` NOW (ADR 0080 §2).
   *  Called under the object's row lock with that transaction as `handle`.
   *  `null` address = no frame state, which behaves as free entry on.
   *  `prefix` is the body path of the step for a caller that nests it. */
  async settle(
    handle: Db | undefined,
    address: StateAddress | null,
    body: Pick<NextStepSetBody, 'text' | 'kindId' | 'templateId'>,
    prefix = '',
  ): Promise<SettledStep> {
    const rule = address ? await this.repo.rule(address, handle) : null
    const freeEntry = address === null || (rule?.freeEntry ?? FREE_ENTRY_DEFAULT)

    if (body.templateId === undefined) {
      if (address === null || freeEntry) {
        return { text: body.text, kindId: body.kindId, templateId: null }
      }
      throw invalid(
        {
          [`${prefix}templateId`]: [
            `Ở ${stateWords(address)}, việc tiếp theo phải chọn từ danh sách — chọn một việc trong danh sách.`,
          ],
        },
        'Việc tiếp theo phải chọn từ danh sách.',
      )
    }

    const template = await this.repo.byId(body.templateId, handle)
    if (!template?.active || address === null || !sameAddress(template, address)) {
      throw invalid(
        {
          [`${prefix}templateId`]: [
            'Danh sách việc tiếp theo vừa thay đổi — tải lại và chọn lại việc trong danh sách.',
          ],
        },
        'Việc đã chọn không còn trong danh sách.',
      )
    }
    /* A pick with no kind sent takes the template's, in either mode. A
       rewritten sentence is a typed step: the done-touch must not credit a
       template the step no longer reads like (ADR 0080 §5). */
    if (freeEntry) {
      return {
        text: body.text,
        kindId: body.kindId ?? template.kindId,
        templateId: body.text.trim() === template.name.trim() ? template.id : null,
      }
    }

    /* Refused, not replaced: what the seller typed must never be stored as
       something they did not read. The same holds for a kind they chose. */
    if (body.text !== template.name) {
      throw invalid(
        {
          [`${prefix}text`]: [
            `Ở ${stateWords(address)} không được sửa nội dung việc trong danh sách — giữ nguyên “${template.name}”.`,
          ],
        },
        'Nội dung việc tiếp theo phải giữ nguyên theo danh sách.',
      )
    }
    if (body.kindId !== undefined && body.kindId !== template.kindId) {
      throw invalid(
        {
          [`${prefix}kindId`]: [
            'Loại việc phải theo việc đã chọn trong danh sách — tải lại và chọn lại.',
          ],
        },
        'Loại việc không khớp với việc đã chọn.',
      )
    }
    return { text: template.name, kindId: template.kindId, templateId: template.id }
  }
}

/** Mirrors `step_template_name_live`: unique among ACTIVE rows of one state,
 *  any case. An off row keeps its name without blocking a new one. */
function assertNameFree(
  rows: StepTemplateRowDb[],
  name: string,
  address: StateAddress,
  exceptId?: string,
): void {
  const key = name.toLowerCase()
  const clash = rows.find((r) => r.active && r.id !== exceptId && r.name.toLowerCase() === key)
  if (!clash) return
  throw conflict(
    `Trạng thái ${stateWords(address)} đã có mẫu việc tiếp theo tên "${clash.name}" — đặt tên khác.`,
  )
}

/** The new order names every template of the state — off ones too — and
 *  nothing else; a partial list would leave a row on a stale `ord`. */
function assertOrderCovers(have: string[], given: string[]): void {
  const missing = have.filter((id) => !given.includes(id))
  const strange = given.filter((id) => !have.includes(id))
  if (missing.length === 0 && strange.length === 0) return
  throw invalid(
    {
      ids: [
        ...(missing.length > 0 ? [`Thiếu: ${missing.join(', ')}`] : []),
        ...(strange.length > 0 ? [`Không thuộc trạng thái này: ${strange.join(', ')}`] : []),
      ],
    },
    'Thứ tự mới phải liệt kê đúng và đủ các mẫu việc tiếp theo của trạng thái.',
  )
}
