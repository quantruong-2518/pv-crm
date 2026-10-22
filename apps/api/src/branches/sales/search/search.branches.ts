import { and, eq, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { TYPO_SCORE_CAP, type SearchKind, type SearchMatchField } from '@pv/contracts'
import { contains } from '@api/platform/db/like'
import { directProbe, folded, fuzzyHit, needle } from '@api/platform/db/fuzzy'
import { campaign } from '../campaign/campaign.schema'
import { contact } from '../contact/contact.schema'
import { contract } from '../contract/contract.schema'
import { leadLive, leadScope } from '../lead/lead-scope'
import { contractReadBy, dealStoodBy } from '../open-deal'
import { opportunity } from '../opportunity/opportunity.schema'
import { account } from '../account/account.schema'
import { lead } from '../lead/lead.schema'
import { partner } from '../partner/partner.schema'

/** The SQL of one search branch per kind, as fragments for `SearchRepository`.
 *
 *  Every branch reads its own table(s) and fences itself: `leadLive` where the
 *  row hangs off a lead, and the kind's scope axis when the caller is `ownOnly`.
 *  A row the fence cuts is absent, never counted. The same branch serves two
 *  modes: SEARCH (match the folded query) and RESOLVE (look up known codes, for
 *  the recent list), so a recent record is re-judged by the rules search uses. */

export type Scope = { id: string; ownOnly: boolean }

/** A match column: `field` is what the UI is told matched, `code` marks the
 *  columns where an exact hit outranks a prefix hit. */
type Col = { field: SearchMatchField; expr: SQLWrapper; code?: boolean }

type Branch = {
  from: SQL
  code: SQLWrapper
  title: SQLWrapper
  subtitle: SQL
  cols: Col[]
  /** Extra OR arm of the WHERE for a match the columns cannot see. */
  also?: SQL
  fence: SQL | undefined
  /** Tie-break when resolving codes (a lead has many contacts, one is shown). */
  resolveOrder?: SQL
}

const lit = (s: string): SQL => sql.raw(`'${s}'::text`)

const anyOf = (parts: SQL[]): SQL => sql`(${sql.join(parts, sql` OR `)})`

function branchOf(kind: SearchKind, who: Scope, q?: string): Branch {
  const liveScoped = and(leadLive, leadScope(who, true))
  const leadJoin = (on: SQLWrapper) => sql`JOIN sales.lead ON ${lead.code} = ${on}`
  switch (kind) {
    case 'lead':
      return {
        from: sql`sales.lead`,
        code: lead.code,
        title: lead.company,
        subtitle: sql`${lead.code}`,
        cols: [
          { field: 'title', expr: lead.company },
          { field: 'title', expr: lead.legalName },
          { field: 'taxCode', expr: lead.taxCode },
          { field: 'code', expr: lead.code, code: true },
        ],
        fence: liveScoped,
      }
    case 'contact':
      return {
        from: sql`sales.contact ${leadJoin(contact.leadCode)}`,
        code: lead.code,
        title: contact.name,
        subtitle: sql`${lead.company}`,
        cols: [
          { field: 'title', expr: contact.name },
          { field: 'email', expr: contact.email },
          { field: 'phone', expr: contact.phone },
        ],
        fence: liveScoped,
        resolveOrder: sql`${contact.isPrimary} DESC, ${contact.createdAt}`,
      }
    case 'account':
      return {
        from: sql`sales.account`,
        code: account.code,
        title: account.name,
        subtitle: sql`NULL::text`,
        cols: [
          { field: 'title', expr: account.name },
          { field: 'title', expr: account.legalName },
          { field: 'taxCode', expr: account.taxCode },
          { field: 'code', expr: account.code, code: true },
        ],
        fence: undefined,
      }
    case 'opportunity':
      return opportunityBranch(who, liveScoped, q)
    case 'campaign':
      return {
        from: sql`sales.campaign`,
        code: campaign.code,
        title: campaign.name,
        subtitle: sql`NULL::text`,
        cols: [
          { field: 'title', expr: campaign.name },
          { field: 'code', expr: campaign.code, code: true },
        ],
        fence: who.ownOnly ? eq(campaign.ownerId, who.id) : undefined,
      }
    case 'partner':
      /* `code` is the ref: it is what people quote, and the web opens the
         partner book filtered by it. Hidden partners stay findable. */
      return {
        from: sql`sales.partner`,
        code: partner.ref,
        title: partner.name,
        subtitle: sql`${partner.code}`,
        cols: [
          { field: 'title', expr: partner.name },
          { field: 'code', expr: partner.ref, code: true },
          { field: 'code', expr: partner.code, code: true },
        ],
        fence: undefined,
      }
    case 'contract':
      return {
        from: sql`sales.contract ${leadJoin(contract.leadCode)}`,
        code: contract.code,
        title: contract.code,
        subtitle: sql`${lead.company}`,
        cols: [
          { field: 'code', expr: contract.code, code: true },
          { field: 'title', expr: lead.company },
        ],
        /* The contract door's own reach (ADR 0110 §2), not the book's owner-only cut. */
        fence: and(
          leadLive,
          who.ownOnly
            ? contractReadBy(
                {
                  ownerId: contract.ownerId,
                  collectorId: contract.collectorId,
                  leadOwnerId: lead.ownerId,
                  opportunityCode: contract.opportunityCode,
                },
                who.id,
              )
            : undefined,
        ),
      }
  }
}

/** A deal also matches through its contacts. `opportunity_contact.contact_code`
 *  may name a contact of a SIBLING lead, so the contact's own lead is joined
 *  (as the unaliased `lead`, shadowing the deal's lead inside the subquery) and
 *  fenced by `leadLive` and the lead scope, or `matched` would leak its name. */
function opportunityBranch(who: Scope, liveScoped: SQL | undefined, q?: string): Branch {
  const viaContact = (select: SQL, tail: SQL) => sql`SELECT ${select}
    FROM sales.opportunity_contact oc
    JOIN sales.contact cc ON cc.code = oc.contact_code
    JOIN sales.lead ON lead.code = cc.lead_code
    WHERE ${q === undefined ? sql`true` : fuzzyHit(sql`cc.name`, q)} AND ${liveScoped ?? sql`true`} ${tail}`
  const byContact = sql`LEFT JOIN LATERAL (${viaContact(
    sql`cc.name AS name`,
    sql`AND oc.opportunity_code = ${opportunity.code} ORDER BY word_similarity(${needle(q ?? '')}, ${folded(sql`cc.name`)}) DESC LIMIT 1`,
  )}) hc ON true`
  return {
    from: sql`sales.opportunity JOIN sales.lead ON ${lead.code} = ${opportunity.leadCode} ${q === undefined ? sql`` : byContact}`,
    code: opportunity.code,
    title: opportunity.name,
    subtitle: sql`${lead.company}`,
    cols: [
      { field: 'title', expr: opportunity.name },
      { field: 'code', expr: opportunity.code, code: true },
    ],
    also:
      q === undefined
        ? undefined
        : sql`${opportunity.code} IN (${viaContact(sql`oc.opportunity_code`, sql``)})`,
    fence: and(leadLive, who.ownOnly ? dealStoodBy(opportunity.code, who.id) : undefined),
  }
}

const SELECT_HEAD = (kind: SearchKind, b: Branch): SQL =>
  sql`${lit(kind)} AS kind, ${b.code} AS code, ${b.title} AS title, ${b.subtitle} AS subtitle`

/** One kind's matching rows, best first, `limit` of them. */
export function searchBranch(kind: SearchKind, who: Scope, q: string, limit: number): SQL {
  const b = branchOf(kind, who, q)
  const n = needle(q)
  const values = b.cols.map(
    (c) => sql`(${lit(c.field)}, ${c.expr}::text, ${folded(c.expr)}, ${sql.raw(String(!!c.code))})`,
  )
  if (kind === 'opportunity') {
    values.push(sql`('contact'::text, hc.name, ${folded(sql`hc.name`)}, false)`)
  }
  const arms = b.cols.map((c) => fuzzyHit(c.expr, q))
  if (b.also) arms.push(b.also)
  return sql`(SELECT ${SELECT_HEAD(kind, b)}, m.field, m.txt AS text, m.score
    FROM ${b.from}
    CROSS JOIN LATERAL (
      SELECT v.field, v.txt,
        (CASE WHEN v.is_code AND v.f = ${n} THEN 3 WHEN starts_with(v.f, ${n}) THEN 2
              WHEN v.f LIKE sales.fold(${contains(q)}::text) THEN 1
              ELSE least(word_similarity(${n}, v.f), ${sql.raw(String(TYPO_SCORE_CAP))}) END)::float8 AS score
      FROM (VALUES ${sql.join(values, sql`, `)}) AS v(field, txt, f, is_code)
      WHERE v.f LIKE sales.fold(${contains(q)}::text)
        OR (current_setting('pv.search_typos', true) = 'on' AND ${n} <% v.f)
      ORDER BY score DESC LIMIT 1
    ) m
    WHERE ${anyOf(arms)} AND ${b.fence ?? sql`true`}
    ORDER BY m.score DESC, ${b.title}, ${b.code}
    LIMIT ${limit})`
}

/** Does `q` hit this kind's columns directly, inside the branch's fence: a row
 *  the caller cannot see must not switch their typos off. `q` stays off
 *  `branchOf` so the deal's contact lateral is not part of the probe's FROM. */
export function probeBranch(kind: SearchKind, who: Scope, q: string): SQL {
  const b = branchOf(kind, who)
  return directProbe(
    b.from,
    b.fence,
    b.cols.map((c) => c.expr),
    q,
  )
}

/** The rows for known codes, in the same shape and under the same fence. */
export function resolveBranch(kind: SearchKind, who: Scope, codes: string[]): SQL {
  const b = branchOf(kind, who)
  const list = sql.join(
    codes.map((c) => sql`${c}`),
    sql`, `,
  )
  return sql`(SELECT ${SELECT_HEAD(kind, b)}, 'title'::text AS field, ${b.title}::text AS text, 0::float8 AS score
    FROM ${b.from}
    WHERE ${b.code} IN (${list}) AND ${b.fence ?? sql`true`}
    ORDER BY ${b.resolveOrder ?? sql`${b.code}`})`
}
