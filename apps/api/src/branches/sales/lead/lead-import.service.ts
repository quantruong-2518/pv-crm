import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor, Edge } from '@pv/engines'
import {
  LeadImportCommitResponse,
  LeadImportPreviewResponse,
  originKey,
  type LeadImportBody,
  type LeadOriginPick,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, invalid } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import type { Db } from '@api/platform/db/db.module'
import { AccountService } from '../account/account.service'
import { identityOfLead } from '../account/account.mapper'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { ContactService } from '../contact/contact.service'
import { CampaignService } from '../campaign/campaign.service'
import { LeadOriginService, type OriginIndex } from '../lead-origin/lead-origin.service'
import { PartnerService } from '../partner/partner.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { checkBatch, type ImportCheck } from './lead-import.check'
import { ringImport, type ImportLine } from './lead-import.bell'
import { incomingOfImport, planImport, type ImportPlan } from './lead-admission.import'
import { LEAD_NOTE, marketingCredit, refOf } from './lead-write.mapper'
import { referrerOf, refuseByAsks } from './lead-motion-asks'
import { LeadAdmissionService } from './lead-admission.service'
import { LeadStateWriter } from './lead-state'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'
import { LeadWriteService, mirrorOf } from './lead-write.service'

/** The file door of the lead book: `POST /sales/leads/import[/preview]`.
 *  Split off `LeadWriteService` for its line ceiling; the three-doors
 *  invariants written there (mirror row first, one transaction, codes minted
 *  before it opens) hold here unchanged. */
@Injectable()
export class LeadImportService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    private readonly accounts: AccountService,
    private readonly runs: WorkstreamRepository,
    private readonly states: LeadStateWriter,
    private readonly contacts: ContactService,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly origins: LeadOriginService,
    private readonly campaigns: CampaignService,
    private readonly partners: PartnerService,
    private readonly hub: NotificationHub,
    private readonly gate: LeadAdmissionService,
    /* The motion's rules and the campaign pick are the create door's, asked once. */
    private readonly write: LeadWriteService,
  ) {}

  // ── door 2 · the dry run ─────────────────────────────────────────────────

  /** `POST /sales/leads/import/preview` — READS ONLY.
   *
   *  Not one byte: no lead, no mirror row, no batch record, and above all no
   *  `nextval` — pressing preview three times must not punch three holes in
   *  the code series. */
  async preview(who: Actor, body: LeadImportBody): Promise<LeadImportPreviewResponse> {
    const handle = this.repo.readonlyHandle
    const { report } = await this.admitted(handle, who, await this.check(handle, body, who), false)
    return LeadImportPreviewResponse.parse(report)
  }

  // ── door 3 · the real load ───────────────────────────────────────────────

  /** `POST /sales/leads/import` — the whole batch, or none of it.
   *
   *  Half a file loaded and then a crash is the state nobody can unwind by
   *  hand: the rows that landed look exactly like rows somebody meant to load,
   *  so the only way back is to know which ones, which is the thing that was
   *  lost. One transaction removes the question.
   *
   *  The batch record is written inside that same transaction, and it is
   *  written even when the batch accepted nothing: the load HAPPENED, somebody
   *  pressed the button on a file, and "that file produced zero rows" is one
   *  of the more useful things a log can say six months later. */
  async commit(who: Actor, body: LeadImportBody): Promise<LeadImportCommitResponse> {
    const handle = this.repo.readonlyHandle
    const checked = await this.check(handle, body, who)
    /* Unlocked, so only a count: how many codes to mint before the transaction. */
    const minted = (await this.admitted(handle, who, checked, false)).writes.length
    const codes = await this.leads.nextCodes(minted)
    const runs = await this.runs.nextCodes(minted)
    const openedAt = new Date()

    const done = await this.repo.run(async (tx) => {
      /* The decision that is written on: every key of the file locked in one
         sorted statement, then the whole file assessed again on this `tx`. */
      const plan = await this.admitted(tx, who, checked, true)
      if (plan.writes.length > minted) {
        throw conflict('Sổ lead vừa thay đổi. Nạp lại tệp này.')
      }
      /* Row and mirror row are built together, from the same draft and the same
         code, so the two can never drift apart by an index. */
      const ready = plan.writes.map((write, i) => ({
        row: { ...write.values, code: codes[i]!, workstreamCode: runs[i]! },
        ref: refOf(codes[i]!, write),
        origin: write.origin,
        extras: write.extras,
        accountCode: write.accountCode,
        company: write.company,
      }))
      /* Batch-wide: drafts the gate grouped as one new company share its account. */
      const seen = new Map<string, string>()
      /* Rung once, after the receipt exists — see `ringImport`. */
      const bell: { received: ImportLine[]; reentered: ImportLine[] } = {
        received: [],
        reentered: [],
      }
      /* Each distinct origin resolved ONCE per batch, before any row needs it. */
      const originIds = new Map<string, string>()
      for (const { origin } of ready) {
        if (!origin || originIds.has(pickKey(origin))) continue
        const found = await this.origins.resolveOrigin(tx, origin, body.motion, who.id)
        originIds.set(pickKey(origin), found.id)
      }

      /* Chunked for the 65,535 bind-parameter ceiling, still one transaction.
         Mirror rows first in every chunk: `lead.code` is a foreign key into them. */
      for (let i = 0; i < ready.length; i += CHUNK) {
        const slice = ready.slice(i, i + CHUNK)
        await this.mirror.putMany(
          tx,
          slice.map((p) => p.ref),
        )

        /* Sequential: `resolveForLead` is read-then-write, so two rows of one
           company in parallel both insert and die on `account_identity_uniq`.
           Memoised by `seen`: a big file is usually a few dozen companies. */
        const rows: (typeof slice)[number]['row'][] = []
        /* Collected here, not re-read off `rows`, whose company code type is optional. */
        const links: Edge[] = []
        const opened: { code: string; accountCode: string; openedAt: Date }[] = []
        for (const p of slice) {
          const key = p.company === null ? identityOfLead(p.row) : `group:${p.company}`
          const known = p.accountCode ?? seen.get(key)
          const accountCode = known ?? (await this.accounts.resolveForLead(tx, p.row, who.id))
          if (!known) seen.set(key, accountCode)
          rows.push({
            ...p.row,
            marketingOwnerId: marketingCredit(who, p.row.marketingOwnerId),
            accountCode,
            originId: p.origin
              ? (originIds.get(pickKey(p.origin)) ?? null)
              : (p.row.originId ?? null),
            originRaw: p.origin && 'name' in p.origin ? p.origin.name : null,
          })
          links.push({ from: p.row.code, to: accountCode, kind: 'belongs-to' })
          opened.push({ code: p.row.workstreamCode, accountCode, openedAt })
        }

        await this.mirror.linkMany(tx, links)
        await this.runs.insertOpened(tx, opened)
        await this.repo.insertLeads(tx, rows, who.id)
        if (body.campaignCode) {
          await this.campaigns.enrol(
            tx,
            body.campaignCode,
            rows.map((r) => r.code),
          )
        }
        await this.contacts.seedPrimaryMany(
          tx,
          rows.map((r) => ({ leadCode: r.code, mirror: mirrorOf(r) })),
          who,
        )
        /* A grouped lead's other people, after its primary so they stay extra. */
        await this.contacts.attachMany(
          tx,
          slice.map((p) => ({ leadCode: p.row.code, people: p.extras })),
          who,
        )
        /* The file name rides in the sentence, not a column: the audit receipt
           already holds the authoritative batch link. */
        const touchIds = await this.touch.record(
          tx,
          slice.map((p): TouchEntry => ({
            subjectCode: p.row.code,
            subjectKind: 'lead',
            kind: 'created',
            /* The owner's name is read off the ref. No `role` on purpose: the
               import resolves owners as `ActorLite`, and absent reads as "not recorded". */
            ...(p.row.ownerId && p.ref.owner
              ? { to: { actorId: p.row.ownerId, name: p.ref.owner } }
              : {}),
            ...byOf(who),
            note: LEAD_NOTE.imported(body.fileName),
          })),
        )
        for (const [j, { row }] of slice.entries()) {
          if (!row.ownerId) continue
          bell.received.push({
            to: row.ownerId,
            code: row.code,
            label: row.company,
            occurrence: touchIds[j],
          })
        }
      }

      /* People the file adds to leads already in the book: no new lead. */
      for (const [leadCode, people] of plan.joins) {
        const held = await this.gate.reenter(tx, leadCode, people, who, 'IMPORT', { quiet: true })
        const line = { code: leadCode, label: held.company, occurrence: held.occurrence }
        if (held.holderId) bell.reentered.push({ ...line, to: held.holderId })
      }
      const used = codes.slice(0, ready.length)
      const batch = await this.repo.writeBatchNote(tx, {
        actorId: who.id,
        note: noteOf(body, used),
      })
      await ringImport(
        tx,
        this.hub,
        { id: batch.id, fileName: body.fileName, actorId: who.id },
        bell,
      )
      /* ONE pool line for the file, keyed by its receipt — not one per lead. */
      const count = ready.filter((p) => !p.row.ownerId).length
      if (count > 0) {
        const subject = { kind: 'lead-pool' as const, code: batch.id, label: body.fileName }
        await this.states.pooled(tx, { subject, actorId: who.id, count })
      }
      return { batch, report: plan.report, codes: used }
    })

    return LeadImportCommitResponse.parse({
      ...done.report,
      batchId: done.batch.id,
      at: done.batch.at.toISOString(),
      intake: 'IMPORT',
      motion: body.motion,
      accepted: done.codes.length,
      codes: done.codes,
    })
  }

  /** Load what the check needs, then run THE check.
   *
   *  Both import doors come through here, which is the whole reason "the
   *  preview said it was clean" and "the commit reported errors" cannot become
   *  two different sentences about one file. The reads are identical too: the
   *  same staff book, the same live mailboxes, the same lookup. */
  private async check(
    handle: Db,
    body: LeadImportBody,
    who: Actor,
  ): Promise<ImportCheck & { origins: OriginIndex }> {
    /* The create door's motion rules, asked here so preview and commit agree.
       Batch-wide: one file is one motion, so one answer for every row. */
    const asks = await this.write.asksOf(handle, body.motion)
    refuseByAsks(asks, {
      origin: body.origin !== undefined,
      campaign: body.campaignCode !== undefined,
      refCode: body.refCode !== undefined,
      originRequired: false,
    })
    const referrer = body.refCode ? await referrerOf(this.partners, handle, body.refCode) : null
    const picked = body.campaignCode ? await this.write.pickable(body.campaignCode) : null
    /* Partner first, then campaign — the same order `create()` derives in. */
    const derived = await this.write.derivedOrigin(
      handle,
      referrer?.originId ?? picked?.originId ?? null,
    )
    /* Manual create's rule: the batch `source` if given, else the picked campaign's. */
    const source = body.source ?? picked?.sourceId ?? undefined

    /* Every campaign code the batch could land on, asked in ONE query, not per row. */
    const campaigns = [
      ...new Set(
        [source, ...body.rows.map((r) => r.values.source)].filter(
          (c): c is string => c !== undefined && c.trim() !== '',
        ),
      ),
    ]

    const [staff, live, origins] = await Promise.all([
      this.repo.staff(handle),
      this.repo.campaignCodes(handle, campaigns),
      this.origins.index(),
    ])
    if (body.origin && 'id' in body.origin && !origins.byId.get(body.origin.id)?.active) {
      throw invalid({ origin: ['Không tìm thấy nguồn này, hoặc nguồn đang tắt. Chọn lại.'] })
    }

    const mayAssign = this.access.allows(who, 'lead.assign')
    const checked = checkBatch({
      rows: body.rows,
      motion: body.motion,
      ...(source === undefined ? {} : { source }),
      ...(body.origin === undefined ? {} : { origin: body.origin }),
      ...(asks === 'ORIGIN'
        ? {}
        : { derived: { originId: derived.id, partnerCode: referrer?.code ?? null } }),
      origins,
      staff,
      ...(mayAssign ? {} : { onlyOwner: who.id }),
      ...(mayAssign || !who.ownOnly ? {} : { blankOwner: { id: who.id, name: who.name } }),
      campaigns: live,
    })
    return { ...checked, origins }
  }

  /** The checked file against the book: the gate asked once for the whole
   *  file, its verdicts applied by `planImport`. `lock` is the commit's, on
   *  its own transaction; the preview and the code count go unlocked. */
  private async admitted(
    handle: Db,
    who: Actor,
    checked: ImportCheck & { origins: OriginIndex },
    lock: boolean,
  ): Promise<ImportPlan> {
    const items = incomingOfImport(checked.writes)
    const assessed = lock
      ? await this.gate.admitAll(handle, who, items)
      : await this.gate.assess(handle, who, items)
    return planImport(checked, assessed, checked.origins)
  }
}

/** One memo key per distinct origin pick — an id, or the typed name's key. */
const pickKey = (p: LeadOriginPick): string =>
  'id' in p ? `id:${p.id}` : `key:${originKey(p.name)}`

/** Rows per statement. See the note at the call site — this is the bind
 *  parameter ceiling, not a durability boundary. */
const CHUNK = 500

/** The batch record's note.
 *
 *  JSON rather than prose because something will have to read it back: the
 *  contract promises that a batch id makes a wrong load undoable, and with no
 *  `batch_id` column on `sales.lead` this line is the only place the batch →
 *  rows link exists at all. Who and when are already columns of
 *  `platform.audit`; this carries the rest. */
function noteOf(body: LeadImportBody, codes: readonly string[]): string {
  return JSON.stringify({
    kind: 'lead-import',
    file: body.fileName,
    intake: 'IMPORT',
    motion: body.motion,
    ...(body.source === undefined ? {} : { source: body.source }),
    accepted: codes.length,
    codes,
  })
}
