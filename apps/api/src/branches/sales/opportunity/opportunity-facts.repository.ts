import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  sql,
  type SQLWrapper,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { OpportunityContactRole, StageKey, ThreadChannel, TouchKind } from '@pv/contracts'
import { link, message, thread } from '@api/platform/comms/comms.schema'
import { DB, type Db } from '@api/platform/db/db.module'
import { emailDelivery } from '@api/platform/mail/mail.schema'
import { configEntry } from '../config/config.schema'
import { contact } from '../contact/contact.schema'
import { nextStep } from '../next-step/next-step.schema'
import { touch } from '../touch/touch.schema'
import { runBefore } from '../workstream/workstream.repository'
import { workstream } from '../workstream/workstream.schema'
import { wonElsewhere } from './opportunity-open.repository'
import { opportunityContact } from './opportunity.schema'

/** SQL behind the row facts every `OpportunityRow` carries beside its columns
 *  (`OpportunityFacts`). Each read takes a whole page of codes and answers in
 *  ONE grouped statement — the book's rule against a query per row, the one
 *  `approvals.pendingOnMany` follows. Decides nothing: no fallback, no grading. */

/** A contact as a deal names it; `role`/`primary` are null/false off the lead. */
export type ContactRead = {
  code: string
  name: string
  title: string | null
  phone: string | null
  email: string | null
  role: OpportunityContactRole | null
  primary: boolean
}

/** The Vietnam calendar day off the database clock — the reading next-step
 *  grades against, so a row and the step card agree on when a day turns. */
const VIETNAM_TODAY = sql<string>`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text`

const CONTACT_COLUMNS = {
  code: contact.code,
  name: contact.name,
  title: contact.title,
  phone: contact.phone,
  email: contact.email,
}

@Injectable()
export class OpportunityFactsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async touchCounts(codes: readonly string[], kinds: readonly TouchKind[]) {
    if (codes.length === 0) return []
    return this.db
      .select({ code: touch.subjectCode, kind: touch.kind, n: count() })
      .from(touch)
      .where(and(inArray(touch.subjectCode, [...codes]), inArray(touch.kind, [...kinds])))
      .groupBy(touch.subjectCode, touch.kind)
  }

  /** Latest moment per deal across three books, ONE statement: its touches of
   *  `kinds`, turns on threads linked to it over `channels`, and letters of a
   *  mail run to its customer the provider accepted (internal notices carry no
   *  run). A deal with none is absent from the map. */
  async lastActivity(
    codes: readonly string[],
    kinds: readonly TouchKind[],
    channels: readonly ThreadChannel[],
  ): Promise<Map<string, Date>> {
    if (codes.length === 0) return new Map()
    const list = [...codes]
    const latest = (at: SQLWrapper) => sql<Date>`max(${at})`.as('at')
    const touches = this.db
      .select({ code: touch.subjectCode, at: latest(touch.at) })
      .from(touch)
      .where(and(inArray(touch.subjectCode, list), inArray(touch.kind, [...kinds])))
      .groupBy(touch.subjectCode)
    const turns = this.db
      .select({ code: link.objectCode, at: latest(message.at) })
      .from(link)
      .innerJoin(thread, eq(thread.id, link.threadId))
      .innerJoin(message, eq(message.threadId, link.threadId))
      .where(and(inArray(link.objectCode, list), inArray(thread.channel, [...channels])))
      .groupBy(link.objectCode)
    const mails = this.db
      .select({ code: emailDelivery.aggregateId, at: latest(emailDelivery.acceptedAt) })
      .from(emailDelivery)
      .where(
        and(
          eq(emailDelivery.aggregateType, 'opportunity'),
          eq(emailDelivery.role, 'recipient'),
          isNotNull(emailDelivery.mailRunId),
          isNotNull(emailDelivery.acceptedAt),
          inArray(emailDelivery.aggregateId, list),
        ),
      )
      .groupBy(emailDelivery.aggregateId)
    const all = touches.unionAll(turns).unionAll(mails).as('activity')
    const rows = await this.db
      .select({ code: all.code, at: sql`max(${all.at})`.mapWith(touch.at) })
      .from(all)
      .groupBy(all.code)
    return new Map(rows.map((r) => [r.code, r.at]))
  }

  async nextSteps(codes: readonly string[]) {
    if (codes.length === 0) return []
    return this.db
      .select({
        code: nextStep.subjectCode,
        text: nextStep.text,
        due: nextStep.due,
        today: VIETNAM_TODAY,
      })
      .from(nextStep)
      .where(inArray(nextStep.subjectCode, [...codes]))
  }

  /** `sales.opportunity_contact` per deal, primary first, then by name. */
  async dealContacts(
    codes: readonly string[],
    primaryOnly: boolean,
  ): Promise<(ContactRead & { deal: string })[]> {
    if (codes.length === 0) return []
    return this.db
      .select({
        deal: opportunityContact.opportunityCode,
        ...CONTACT_COLUMNS,
        role: opportunityContact.role,
        primary: opportunityContact.isPrimary,
      })
      .from(opportunityContact)
      .innerJoin(contact, eq(contact.code, opportunityContact.contactCode))
      .where(
        and(
          inArray(opportunityContact.opportunityCode, [...codes]),
          primaryOnly ? eq(opportunityContact.isPrimary, true) : undefined,
        ),
      )
      .orderBy(desc(opportunityContact.isPrimary), asc(contact.name), asc(contact.code))
      .then((rows) => rows.map((r) => ({ ...r, role: r.role ?? null })))
  }

  /** The ONE contact each lead names first — its primary, else the first by
   *  name. What a deal opened before ADR 0073 (no contact rows) falls back to. */
  async leadContacts(leadCodes: readonly string[]) {
    if (leadCodes.length === 0) return []
    return this.db
      .selectDistinctOn([contact.leadCode], { lead: contact.leadCode, ...CONTACT_COLUMNS })
      .from(contact)
      .where(inArray(contact.leadCode, [...leadCodes]))
      .orderBy(contact.leadCode, desc(contact.isPrimary), asc(contact.name), asc(contact.code))
  }

  /** Each run with its place among its account's runs (`runBefore`, the
   *  `ordinalOf` rule; a run with no account its own first) and whether the
   *  account had won another run opened before this one (`wonElsewhere`). */
  async runs(codes: readonly string[]) {
    if (codes.length === 0) return []
    const other = alias(workstream, 'other_run')
    const before = this.db
      .select({ n: count() })
      .from(other)
      .where(runBefore(other, workstream, true))
    const won = this.db
      .select({ one: sql`1` })
      .from(other)
      .where(wonElsewhere(other, workstream.accountCode, workstream.code, workstream))
    return this.db
      .select({
        code: workstream.code,
        accountCode: workstream.accountCode,
        ordinal: sql<number>`CASE WHEN ${workstream.accountCode} IS NULL THEN 1 ELSE (${before})::int END`,
        wonBefore: sql<boolean>`${exists(won)}`,
      })
      .from(workstream)
      .where(inArray(workstream.code, [...codes]))
  }

  /** `LOSS_REASON` label and `doNotContact` by key, retired rows included: a
   *  deal stopped under a reason since switched off still says why. */
  async lossReasons(
    keys: readonly string[],
  ): Promise<Map<string, { name: string; doNotContact: boolean }>> {
    if (keys.length === 0) return new Map()
    const rows = await this.db
      .select({
        id: configEntry.id,
        name: configEntry.name,
        doNotContact: configEntry.doNotContact,
      })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'LOSS_REASON'), inArray(configEntry.id, [...keys])))
    return new Map(rows.map((r) => [r.id, r]))
  }

  /** The live `LOSS_REASON` catalogue in desk order, for the stop drawer. */
  stopReasons(): Promise<
    { id: string; name: string; stage: StageKey | null; doNotContact: boolean }[]
  > {
    return this.db
      .select({
        id: configEntry.id,
        name: configEntry.name,
        stage: configEntry.stage,
        doNotContact: configEntry.doNotContact,
      })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'LOSS_REASON'), eq(configEntry.active, true)))
      .orderBy(asc(configEntry.ord), asc(configEntry.id))
  }
}
