import { check, foreignKey, index, integer, text, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { WorkstreamDocumentStep } from '@pv/contracts'
import { attachment } from '@api/platform/storage/attachment.schema'
import { contract, contractInstallment } from '../contract/contract.schema'
import { quotation } from '../quotation/quotation.schema'
import { sales } from '../sales.schema'

/** Which step of the deal a workstream document belongs to.
 *
 *  A JOIN TABLE ON THE SALES SIDE, not a column on `platform.attachment`: the
 *  shelf is a platform table, and `quotation` / `installment` is sales
 *  vocabulary it must not learn. A file with no row here is simply unlabelled.
 *
 *  Its own file rather than `workstream.schema.ts`: `contract.schema.ts`
 *  imports that one, so declaring this table there would close an import cycle.
 *
 *  Every foreign key CASCADEs, because a label outliving its file or its
 *  target says nothing. That includes the installment: a door that replaces a
 *  payment schedule by delete-and-insert drops the labels of the rows it
 *  deletes, so it must update an installment in place to keep them. */
export const documentStep = sales.table(
  'document_step',
  {
    /** Primary key, so a file carries at most one label. */
    attachmentId: uuid('attachment_id')
      .primaryKey()
      .references(() => attachment.id, { onDelete: 'cascade' }),
    stepKind: text('step_kind').$type<WorkstreamDocumentStep['kind']>().notNull(),

    quotationId: uuid('quotation_id').references(() => quotation.id, { onDelete: 'cascade' }),
    /** Set for `contract` AND `installment` — an installment is named by the
     *  pair, the same key `contract_installment` itself uses. */
    contractCode: text('contract_code').references(() => contract.code, { onDelete: 'cascade' }),
    installmentNo: integer('installment_no'),
  },
  (t) => [
    /** MATCH SIMPLE skips this while `installment_no` is NULL, which is what
     *  lets a `contract` row share the `contract_code` column. */
    foreignKey({
      name: 'document_step_installment_fk',
      columns: [t.contractCode, t.installmentNo],
      foreignColumns: [contractInstallment.contractCode, contractInstallment.no],
    }).onDelete('cascade'),
    /** "The files of this quotation" — the count beside each round. */
    index('document_step_quotation_idx')
      .on(t.quotationId)
      .where(sql`"quotation_id" IS NOT NULL`),
    /** "The files of this contract, by installment" — the signed-documents
     *  list and the installment drawer both read it. */
    index('document_step_contract_idx')
      .on(t.contractCode, t.installmentNo)
      .where(sql`"contract_code" IS NOT NULL`),
    /** Apart from the target check so a refused row names the half it broke. */
    check('document_step_kind_known', sql`"step_kind" IN ('quotation', 'contract', 'installment')`),
    /** Exactly the target its kind names, and nothing else. */
    check(
      'document_step_one_target',
      sql`CASE "step_kind"
            WHEN 'quotation' THEN "quotation_id" IS NOT NULL AND "contract_code" IS NULL
                                  AND "installment_no" IS NULL
            WHEN 'contract' THEN "quotation_id" IS NULL AND "contract_code" IS NOT NULL
                                 AND "installment_no" IS NULL
            WHEN 'installment' THEN "quotation_id" IS NULL AND "contract_code" IS NOT NULL
                                    AND "installment_no" IS NOT NULL
            ELSE true
          END`,
    ),
  ],
)

export type DocumentStepRowDb = typeof documentStep.$inferSelect
